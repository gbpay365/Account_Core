using ComptabiliteAPI.Domain.Entities;
using ComptabiliteAPI.Domain.Interfaces;
using ComptabiliteAPI.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace ComptabiliteAPI.Infrastructure.Services
{
    public class JournalEntryService : IJournalEntryService
    {
        private readonly AppDbContext _context;
        private readonly IFiscalPeriodService _fiscal;
        private readonly IRulesEngineService _rules;
        private readonly IntegrationNotifyService _integration;

        public JournalEntryService(
            AppDbContext context,
            IFiscalPeriodService fiscal,
            IRulesEngineService rules,
            IntegrationNotifyService integration)
        {
            _context = context;
            _fiscal = fiscal;
            _rules = rules;
            _integration = integration;
        }

        public Task<bool> ValidateDoubleEntryAsync(JournalEntry entry)
        {
            if (entry.JournalLines == null || !entry.JournalLines.Any())
                return Task.FromResult(false);

            var totalDebit = entry.JournalLines.Sum(l => l.Debit);
            var totalCredit = entry.JournalLines.Sum(l => l.Credit);

            return Task.FromResult(totalDebit == totalCredit && totalDebit > 0);
        }

        public async Task<JournalEntry> CreateEntryAsync(JournalEntry entry, IReadOnlyList<Guid?>? analyticAccountIdPerLine = null)
        {
            if (!await ValidateDoubleEntryAsync(entry))
                throw new InvalidOperationException("Invalid double entry: debits must equal credits and be greater than zero.");

            await _fiscal.EnsurePeriodUnlockedForDateAsync(entry.CompanyId, entry.EntryDate);

            if (entry.JournalLines == null || !entry.JournalLines.Any())
                throw new InvalidOperationException("Aucune ligne d’écriture.");
            var codes = entry.JournalLines.Select(l => l.AccountCode.Trim()).Distinct().ToList();
            var accRows = await _context.Accounts
                .AsNoTracking()
                .Where(a => a.FiscalYear == null && codes.Contains(a.Code))
                .ToListAsync();
            var byCode = accRows.ToDictionary(a => a.Code, StringComparer.Ordinal);
            foreach (var line in entry.JournalLines)
            {
                var c = (line.AccountCode ?? string.Empty).Trim();
                if (string.IsNullOrEmpty(c))
                    throw new InvalidOperationException("Ligne d’écriture sans compte (AccountCode).");
                if (c.Length != 6 || !c.All(char.IsDigit))
                    throw new InvalidOperationException($"Compte {c} : seuls les comptes OHADA à 6 chiffres postables sont autorisés.");
                if (!byCode.TryGetValue(c, out var a))
                    throw new InvalidOperationException($"Compte inconnu ou inactif : {c} (plan comptable / SYSCOHADA).");
                if (!a.IsActive) throw new InvalidOperationException($"Compte inactif : {c}.");
                if (!a.IsLeaf) throw new InvalidOperationException($"Compte {c} n’est pas un compte de détail (sous-compte) — enregistrez l’écriture sur un compte postable (feuille).");
            }

            entry.Validated = false;
            entry.Status = "Draft";

            var ruleResult = await _rules.EvaluateAsync(entry, "create", entry.CreatedById);
            if (!ruleResult.Passed)
                throw new InvalidOperationException(string.Join(" ", ruleResult.Errors));
            if (ruleResult.RequiresApproval)
                entry.Status = "Pending";

            await _context.JournalEntries.AddAsync(entry);
            await _context.SaveChangesAsync();

            if (analyticAccountIdPerLine != null && entry.JournalLines != null)
            {
                var lines = entry.JournalLines.ToList();
                for (var i = 0; i < lines.Count && i < analyticAccountIdPerLine.Count; i++)
                {
                    var aid = analyticAccountIdPerLine[i];
                    if (!aid.HasValue) continue;
                    var jl = lines[i];
                    var aa = await _context.AnalyticAccounts.FirstOrDefaultAsync(a => a.Id == aid && a.CompanyId == entry.CompanyId);
                    if (aa == null) continue;
                    await _context.JournalLineAnalytics.AddAsync(new JournalLineAnalytic
                    {
                        JournalLineId = jl.Id,
                        AnalyticAccountId = aa.Id
                    });
                }
                await _context.SaveChangesAsync();
            }

            return entry;
        }

        public async Task<List<JournalEntry>> GetEntriesAsync(Guid companyId)
        {
            return await _context.JournalEntries
                .Include(je => je.JournalLines)
                .Where(je => je.CompanyId == companyId)
                .OrderByDescending(je => je.EntryDate)
                .ThenByDescending(je => je.CreatedAt)
                .ThenByDescending(je => je.Id)
                .ToListAsync();
        }

        public async Task<JournalEntry?> GetEntryByIdAsync(Guid id, Guid companyId)
        {
            return await _context.JournalEntries
                .Include(je => je.JournalLines)
                .AsSplitQuery()
                .FirstOrDefaultAsync(je => je.Id == id && je.CompanyId == companyId);
        }

        public async Task<JournalEntry?> ValidateEntryAsync(Guid id)
        {
            var entry = await _context.JournalEntries
                .Include(je => je.JournalLines)
                .FirstOrDefaultAsync(je => je.Id == id);

            if (entry == null) return null;

            if (entry.Voided)
                throw new InvalidOperationException("Cannot validate a voided entry.");

            if (entry.Validated)
                throw new InvalidOperationException("This entry is already validated.");

            await _fiscal.EnsurePeriodUnlockedForDateAsync(entry.CompanyId, entry.EntryDate);

            var totalDebit = entry.JournalLines?.Sum(l => l.Debit) ?? 0;
            var totalCredit = entry.JournalLines?.Sum(l => l.Credit) ?? 0;
            if (Math.Abs(totalDebit - totalCredit) > 0.01m)
                throw new InvalidOperationException("Cannot validate: debits do not equal credits.");

            var ruleResult = await _rules.EvaluateAsync(entry, "validate", entry.CreatedById);
            if (!ruleResult.Passed)
                throw new InvalidOperationException(string.Join(" ", ruleResult.Errors));

            entry.Validated = true;
            entry.Status = "Validated";
            await _context.SaveChangesAsync();
            await _integration.NotifyJournalPostedAsync(entry);
            return entry;
        }

        public async Task<JournalEntry?> SubmitEntryAsync(Guid id)
        {
            var entry = await _context.JournalEntries
                .Include(je => je.JournalLines)
                .FirstOrDefaultAsync(je => je.Id == id);
            if (entry == null) return null;
            if (entry.Voided)
                throw new InvalidOperationException("Cannot submit a voided entry.");
            if (entry.Status is "Validated" or "Pending")
                throw new InvalidOperationException($"Entry is already {entry.Status.ToLowerInvariant()}.");

            if (!await ValidateDoubleEntryAsync(entry))
                throw new InvalidOperationException("Cannot submit: debits must equal credits.");

            var ruleResult = await _rules.EvaluateAsync(entry, "submit", entry.CreatedById);
            if (!ruleResult.Passed)
                throw new InvalidOperationException(string.Join(" ", ruleResult.Errors));

            entry.Status = "Pending";
            entry.RejectionReason = null;
            await _context.SaveChangesAsync();
            return entry;
        }

        public async Task<JournalEntry?> RejectEntryAsync(Guid id, string reason)
        {
            var entry = await _context.JournalEntries.FirstOrDefaultAsync(je => je.Id == id);
            if (entry == null) return null;
            if (entry.Voided)
                throw new InvalidOperationException("Cannot reject a voided entry.");
            if (entry.Status != "Pending")
                throw new InvalidOperationException("Only pending entries can be rejected.");

            entry.Status = "Rejected";
            entry.Validated = false;
            entry.RejectionReason = reason.Trim();
            await _context.SaveChangesAsync();
            return entry;
        }

        public async Task<JournalEntry?> VoidEntryAsync(Guid id, Guid companyId)
        {
            var entry = await _context.JournalEntries
                .FirstOrDefaultAsync(je => je.Id == id);

            if (entry == null) return null;
            if (entry.CompanyId != companyId)
            {
                throw new InvalidOperationException(
                    "Journal entry is not in the active company context. Pass ?companyId= or set your active company to match the entry company.");
            }
            if (entry.Voided)
                throw new InvalidOperationException("This entry is already voided.");
            if (!entry.Validated)
                throw new InvalidOperationException("Only validated journal entries can be voided.");

            await _fiscal.EnsurePeriodUnlockedForDateAsync(entry.CompanyId, entry.EntryDate);
            entry.Voided = true;
            await _context.SaveChangesAsync();
            return entry;
        }

        public async Task<Guid> CreateReversalEntryAsync(
            Guid originalJournalId, DateTime reversalDate, short fiscalYear, short fiscalPeriod,
            Guid userId, IReadOnlyList<Guid?>? analyticAccountIdPerLine = null)
        {
            var original = await _context.JournalEntries
                .Include(je => je.JournalLines)
                .FirstOrDefaultAsync(je => je.Id == originalJournalId);
            if (original == null)
                throw new InvalidOperationException("Original journal entry not found.");
            if (original.Voided)
                throw new InvalidOperationException("Cannot reverse a voided entry.");
            if (!original.Validated)
                throw new InvalidOperationException("Only posted (validated) journal entries can be reversed.");

            await _fiscal.EnsurePeriodUnlockedForDateAsync(original.CompanyId, reversalDate);

            var lines = original.JournalLines?.ToList() ?? new List<JournalLine>();
            var newLines = new List<JournalLine>();
            foreach (var l in lines)
            {
                newLines.Add(new JournalLine
                {
                    AccountCode = l.AccountCode,
                    Debit = l.Credit,
                    Credit = l.Debit,
                    LineDescription = l.LineDescription,
                    CostCentre = l.CostCentre,
                    TaxCode = l.TaxCode,
                    TaxAmount = l.TaxAmount
                });
            }

            var refShort = originalJournalId.ToString("N")[..Math.Min(8, 32)];
            var fy = fiscalYear == 0 ? (short)reversalDate.Year : fiscalYear;
            var fp = fiscalPeriod == 0 ? (short)reversalDate.Month : fiscalPeriod;
            var reversal = new JournalEntry
            {
                EntryDate = reversalDate,
                Description = $"Reversal of {refShort}",
                CompanyId = original.CompanyId,
                CreatedById = userId,
                JournalType = "REV",
                Reference = $"REV-{refShort}",
                FiscalYear = fy,
                FiscalPeriod = fp,
                CurrencyCode = original.CurrencyCode,
                ExchangeRate = original.ExchangeRate,
                JournalLines = newLines
            };

            IReadOnlyList<Guid?>? analytics;
            if (analyticAccountIdPerLine != null && analyticAccountIdPerLine.Count == newLines.Count)
            {
                analytics = analyticAccountIdPerLine;
            }
            else
            {
                var origIds = lines.Select(l => l.Id).ToList();
                if (origIds.Count == 0) analytics = null;
                else
                {
                    var links = await _context.JournalLineAnalytics
                        .AsNoTracking()
                        .Where(x => origIds.Contains(x.JournalLineId))
                        .ToListAsync();
                    var byLine = links.ToDictionary(x => x.JournalLineId, x => (Guid?)x.AnalyticAccountId);
                    analytics = lines.Select(ol => byLine.TryGetValue(ol.Id, out var a) ? a : null).ToList();
                }
            }

            var created = await CreateEntryAsync(reversal, analytics);
            // Sage-style: post reversal immediately
            _ = await ValidateEntryAsync(created.Id);
            return created.Id;
        }
    }
}
