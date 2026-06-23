using ComptabiliteAPI.Domain.Entities;
using ComptabiliteAPI.Domain.Interfaces;
using ComptabiliteAPI.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace ComptabiliteAPI.Infrastructure.Services
{
    public class FiscalPeriodService : IFiscalPeriodService
    {
        private readonly AppDbContext _db;
        public FiscalPeriodService(AppDbContext db) => _db = db;

        public async Task EnsurePeriodUnlockedForDateAsync(Guid companyId, DateTime entryDate, CancellationToken cancellationToken = default)
        {
            var y = entryDate.Year;
            var m = entryDate.Month;
            if (await _db.FiscalPeriodLocks.AnyAsync(l => l.CompanyId == companyId && l.FiscalYear == y && l.FiscalMonth == m, cancellationToken))
                throw new InvalidOperationException($"Accounting period {y}-{m:00} is locked for this company.");
        }

        public async Task<IReadOnlyList<FiscalPeriodLock>> GetLocksAsync(Guid companyId, CancellationToken cancellationToken = default)
        {
            return await _db.FiscalPeriodLocks.AsNoTracking()
                .Where(l => l.CompanyId == companyId)
                .OrderByDescending(l => l.FiscalYear).ThenByDescending(l => l.FiscalMonth)
                .ToListAsync(cancellationToken);
        }

        public async Task<FiscalPeriodLock> LockPeriodAsync(Guid companyId, int fiscalYear, int fiscalMonth, Guid userId, string notes, CancellationToken cancellationToken = default)
        {
            if (fiscalMonth is < 1 or > 12) throw new ArgumentOutOfRangeException(nameof(fiscalMonth));
            if (await _db.FiscalPeriodLocks.AnyAsync(l => l.CompanyId == companyId && l.FiscalYear == fiscalYear && l.FiscalMonth == fiscalMonth, cancellationToken))
                throw new InvalidOperationException("Period is already locked.");
            var row = new FiscalPeriodLock
            {
                CompanyId = companyId,
                FiscalYear = fiscalYear,
                FiscalMonth = fiscalMonth,
                LockedByUserId = userId,
                Notes = notes ?? string.Empty
            };
            await _db.FiscalPeriodLocks.AddAsync(row, cancellationToken);
            await _db.SaveChangesAsync(cancellationToken);
            return row;
        }
    }

    public class ImmutableAuditService : IImmutableAuditService
    {
        private readonly AppDbContext _db;
        public ImmutableAuditService(AppDbContext db) => _db = db;

        public async Task LogAsync(Guid userId, Guid? companyId, string action, string entityType, string? entityId, string payloadJson, string ipAddress, CancellationToken cancellationToken = default)
        {
            await _db.AuditLogEntries.AddAsync(new AuditLogEntry
            {
                UserId = userId,
                CompanyId = companyId,
                Action = action,
                EntityType = entityType,
                EntityId = entityId,
                PayloadJson = string.IsNullOrWhiteSpace(payloadJson) ? "{}" : payloadJson,
                IpAddress = ipAddress ?? string.Empty
            }, cancellationToken);
            await _db.SaveChangesAsync(cancellationToken);
        }

        public async Task<IReadOnlyList<AuditLogEntry>> QueryAsync(Guid? companyId, int take, CancellationToken cancellationToken = default)
        {
            var t = Math.Clamp(take, 1, 500);
            var q = _db.AuditLogEntries.AsNoTracking().OrderByDescending(e => e.Timestamp);
            return companyId == null
                ? await q.Take(t).ToListAsync(cancellationToken)
                : await q.Where(e => e.CompanyId == companyId).Take(t).ToListAsync(cancellationToken);
        }
    }

    public class BankTreasuryService : IBankTreasuryService
    {
        private readonly AppDbContext _db;
        public BankTreasuryService(AppDbContext db) => _db = db;

        public async Task<IReadOnlyList<BankAccount>> ListBankAccountsAsync(Guid companyId, CancellationToken cancellationToken = default) =>
            await _db.BankAccounts.AsNoTracking().Where(b => b.CompanyId == companyId).OrderBy(b => b.Code).ToListAsync(cancellationToken);

        public async Task<BankAccount> CreateBankAccountAsync(BankAccount account, CancellationToken cancellationToken = default)
        {
            if (await _db.BankAccounts.AnyAsync(b => b.CompanyId == account.CompanyId && b.Code == account.Code, cancellationToken))
                throw new InvalidOperationException("Bank account code already exists for this company.");
            await _db.BankAccounts.AddAsync(account, cancellationToken);
            await _db.SaveChangesAsync(cancellationToken);
            return account;
        }

        public async Task<BankStatement> ImportStatementAsync(Guid bankAccountId, DateTime statementDate, string reference, decimal openingBalance, decimal closingBalance, IReadOnlyList<(DateTime date, string description, decimal amount)> lines, CancellationToken cancellationToken = default)
        {
            _ = await _db.BankAccounts.FirstOrDefaultAsync(b => b.Id == bankAccountId, cancellationToken)
                ?? throw new InvalidOperationException("Bank account not found.");
            var stmt = new BankStatement
            {
                BankAccountId = bankAccountId,
                StatementDate = statementDate.Date,
                Reference = reference ?? string.Empty,
                OpeningBalance = openingBalance,
                ClosingBalance = closingBalance
            };
            foreach (var (date, description, amount) in lines)
            {
                stmt.Lines.Add(new BankStatementLine
                {
                    LineDate = date,
                    Description = description ?? string.Empty,
                    Amount = amount
                });
            }
            await _db.BankStatements.AddAsync(stmt, cancellationToken);
            await _db.SaveChangesAsync(cancellationToken);
            return stmt;
        }

        public Task<BankStatement> SyncBankTransactionsAsync(Guid bankAccountId, string accessToken, DateTime startDate, DateTime endDate, CancellationToken cancellationToken = default)
        {
            if (string.IsNullOrWhiteSpace(accessToken))
                throw new ArgumentException("Access token is required for bank sync.", nameof(accessToken));
            // No PSD2 / aggregator wired in this build: persist an empty statement for the window so callers get a consistent response.
            return ImportStatementAsync(
                bankAccountId,
                endDate.Date,
                $"SYNC-{startDate:yyyyMMdd}-{endDate:yyyyMMdd}",
                0m,
                0m,
                Array.Empty<(DateTime date, string description, decimal amount)>(),
                cancellationToken);
        }

        public async Task<bool> TryMatchStatementLineAsync(Guid statementLineId, Guid companyId, CancellationToken cancellationToken = default)
        {
            var line = await _db.BankStatementLines
                .Include(l => l.BankStatement).ThenInclude(s => s!.BankAccount)
                .FirstOrDefaultAsync(l => l.Id == statementLineId, cancellationToken);
            if (line?.BankStatement?.BankAccount == null) return false;
            if (line.BankStatement.BankAccount.CompanyId != companyId) return false;
            if (line.IsReconciled) return true;

            var day = line.LineDate.Date;
            var entries = await _db.JournalEntries.AsNoTracking()
                .Include(e => e.JournalLines)
                .Where(e => e.CompanyId == companyId && e.Validated && e.EntryDate.Date == day)
                .ToListAsync(cancellationToken);

            foreach (var je in entries)
            {
                foreach (var jl in je.JournalLines ?? Enumerable.Empty<JournalLine>())
                {
                    if (!jl.AccountCode.StartsWith("5")) continue;
                    var signed = jl.Debit - jl.Credit;
                    if (Math.Abs(signed - line.Amount) < 0.02m)
                    {
                        line.MatchedJournalEntryId = je.Id;
                        line.MatchedJournalLineId = jl.Id;
                        line.IsReconciled = true;
                        await _db.SaveChangesAsync(cancellationToken);
                        return true;
                    }
                }
            }
            return false;
        }
    }

    public class AgingService : IAgingService
    {
        private readonly AppDbContext _db;
        public AgingService(AppDbContext db) => _db = db;

        public async Task<object> GetArAgingAsync(Guid companyId, DateTime asOf, CancellationToken cancellationToken = default)
        {
            var customers = await _db.Customers.AsNoTracking().Where(c => c.CompanyId == companyId).ToListAsync(cancellationToken);
            var custIds = customers.Select(c => c.Id).ToList();
            var invoices = await _db.SalesDocuments.AsNoTracking()
                .Where(d => d.CompanyId == companyId && d.DocumentType == "invoice" && custIds.Contains(d.CustomerId))
                .OrderBy(d => d.IssueDate).ToListAsync(cancellationToken);
            var payments = await _db.CustomerPayments.AsNoTracking()
                .Where(p => custIds.Contains(p.CustomerId))
                .GroupBy(p => p.CustomerId)
                .Select(g => new { CustomerId = g.Key, Paid = g.Sum(x => x.Amount) })
                .ToListAsync(cancellationToken);
            var payDict = payments.ToDictionary(x => x.CustomerId, x => x.Paid);

            var rows = new List<object>();
            foreach (var c in customers)
            {
                payDict.TryGetValue(c.Id, out var paid);
                var invTotal = invoices.Where(i => i.CustomerId == c.Id).Sum(i => i.TotalTTC);
                var open = invTotal - paid;
                if (open <= 0.01m) continue;
                var oldest = invoices.FirstOrDefault(i => i.CustomerId == c.Id);
                var ageDays = oldest == null ? 0 : (asOf.Date - oldest.IssueDate.Date).Days;
                var bucket = ageDays <= 30 ? "0-30" : ageDays <= 60 ? "31-60" : ageDays <= 90 ? "61-90" : "90+";
                rows.Add(new { customerId = c.Id, customerName = c.Name, openBalance = open, oldestInvoiceDays = ageDays, bucket });
            }
            return new { asOf = asOf.Date, rows };
        }

        public async Task<object> GetApAgingAsync(Guid companyId, DateTime asOf, CancellationToken cancellationToken = default)
        {
            var invoices = await _db.SupplierInvoices.AsNoTracking()
                .Include(i => i.Supplier)
                .Where(i => i.Supplier != null && i.Supplier.CompanyId == companyId)
                .OrderBy(i => i.DueDate).ToListAsync(cancellationToken);
            var rows = invoices.Where(i => i.AmountTtc - i.PaidAmount > 0.01m).Select(i =>
            {
                var open = i.AmountTtc - i.PaidAmount;
                var ageDays = (asOf.Date - i.DueDate.Date).Days;
                var bucket = ageDays <= 0 ? "not_due" : ageDays <= 30 ? "1-30" : ageDays <= 60 ? "31-60" : "60+";
                return (object)new { supplierId = i.SupplierId, supplierName = i.Supplier!.Name, invoiceNumber = i.InvoiceNumber, openBalance = open, daysPastDue = Math.Max(0, ageDays), bucket };
            }).ToList();
            return new { asOf = asOf.Date, rows };
        }
    }

    public class AnalyticAccountService : IAnalyticAccountService
    {
        private readonly AppDbContext _db;
        public AnalyticAccountService(AppDbContext db) => _db = db;

        public async Task<IReadOnlyList<AnalyticAccount>> ListAsync(Guid companyId, CancellationToken cancellationToken = default) =>
            await _db.AnalyticAccounts.AsNoTracking().Where(a => a.CompanyId == companyId).OrderBy(a => a.Code).ToListAsync(cancellationToken);

        public async Task<AnalyticAccount> CreateAsync(AnalyticAccount account, CancellationToken cancellationToken = default)
        {
            if (await _db.AnalyticAccounts.AnyAsync(a => a.CompanyId == account.CompanyId && a.Code == account.Code, cancellationToken))
                throw new InvalidOperationException("Analytic code already exists.");
            await _db.AnalyticAccounts.AddAsync(account, cancellationToken);
            await _db.SaveChangesAsync(cancellationToken);
            return account;
        }

        public async Task AttachToJournalLineAsync(Guid journalLineId, Guid analyticAccountId, CancellationToken cancellationToken = default)
        {
            var line = await _db.JournalLines.Include(l => l.Entry).FirstOrDefaultAsync(l => l.Id == journalLineId, cancellationToken)
                       ?? throw new InvalidOperationException("Journal line not found.");
            _ = await _db.AnalyticAccounts.FirstOrDefaultAsync(a => a.Id == analyticAccountId && a.CompanyId == line.Entry!.CompanyId, cancellationToken)
                ?? throw new InvalidOperationException("Analytic account not found.");
            var existing = await _db.JournalLineAnalytics.FirstOrDefaultAsync(x => x.JournalLineId == journalLineId, cancellationToken);
            if (existing != null)
                existing.AnalyticAccountId = analyticAccountId;
            else
                await _db.JournalLineAnalytics.AddAsync(new JournalLineAnalytic { JournalLineId = journalLineId, AnalyticAccountId = analyticAccountId }, cancellationToken);
            await _db.SaveChangesAsync(cancellationToken);
        }

        public async Task<IReadOnlyList<ProjectProfitabilityDto>> GetProjectProfitabilityAsync(Guid companyId, int fiscalYear, CancellationToken cancellationToken = default)
        {
            var costCenters = await _db.CostCenters.AsNoTracking()
                .Where(c => c.CompanyId == companyId && c.IsActive)
                .ToListAsync(cancellationToken);
            var costCenterByCode = costCenters.ToDictionary(c => c.Code, c => c, StringComparer.OrdinalIgnoreCase);

            var journalLines = await _db.JournalLines
                .AsNoTracking()
                .Include(l => l.Entry)
                .Where(l => l.Entry.CompanyId == companyId
                    && l.Entry.EntryDate.Year == fiscalYear
                    && !l.Entry.Voided
                    && l.Entry.Validated
                    && l.CostCentre != null && l.CostCentre != "")
                .ToListAsync(cancellationToken);

            var weightedLines = await _db.JournalLineAnalytics
                .AsNoTracking()
                .Include(a => a.JournalLine)
                .ThenInclude(jl => jl!.Entry)
                .Include(a => a.AnalyticAccount)
                .Where(a => a.JournalLine!.Entry!.CompanyId == companyId
                    && a.JournalLine.Entry.EntryDate.Year == fiscalYear
                    && !a.JournalLine.Entry.Voided
                    && a.JournalLine.Entry.Validated)
                .ToListAsync(cancellationToken);

            var analytics = await _db.AnalyticAccounts.AsNoTracking()
                .Where(a => a.CompanyId == companyId && a.IsActive)
                .ToListAsync(cancellationToken);
            var analyticById = analytics.ToDictionary(a => a.Id);

            var buckets = new Dictionary<string, (Guid ProjectId, string ProjectName, decimal Revenue, decimal Expense)>(
                StringComparer.OrdinalIgnoreCase);

            void Accumulate(string key, Guid projectId, string projectName, decimal revenue, decimal expense)
            {
                if (revenue == 0 && expense == 0) return;
                if (buckets.TryGetValue(key, out var existing))
                    buckets[key] = (existing.ProjectId, existing.ProjectName, existing.Revenue + revenue, existing.Expense + expense);
                else
                    buckets[key] = (projectId, projectName, revenue, expense);
            }

            foreach (var line in journalLines)
            {
                var code = line.CostCentre!.Trim().ToUpperInvariant();
                var cc = costCenterByCode.GetValueOrDefault(code);
                var revenue = IsRevenueAccount(line.AccountCode) ? line.Credit : 0m;
                var expense = IsExpenseAccount(line.AccountCode) ? line.Debit : 0m;
                Accumulate(code, cc?.Id ?? Guid.Empty, cc?.Name ?? code, revenue, expense);
            }

            foreach (var link in weightedLines)
            {
                var line = link.JournalLine!;
                if (!analyticById.TryGetValue(link.AnalyticAccountId, out var analytic)) continue;
                var weight = link.WeightPercent / 100m;
                var revenue = IsRevenueAccount(line.AccountCode) ? line.Credit * weight : 0m;
                var expense = IsExpenseAccount(line.AccountCode) ? line.Debit * weight : 0m;
                Accumulate(analytic.Code, analytic.Id, analytic.Name, revenue, expense);
            }

            return buckets.Values
                .Where(r => r.Revenue != 0 || r.Expense != 0)
                .OrderByDescending(r => r.Revenue)
                .Select(r => new ProjectProfitabilityDto
                {
                    ProjectId = r.ProjectId != Guid.Empty ? r.ProjectId : Guid.NewGuid(),
                    ProjectName = r.ProjectName,
                    TotalRevenue = r.Revenue,
                    TotalExpense = r.Expense
                })
                .ToList();
        }

        private static bool IsRevenueAccount(string accountCode)
        {
            var code = (accountCode ?? string.Empty).TrimStart('0');
            if (code.Length == 0) return false;
            return code[0] == '7' || code.StartsWith("82", StringComparison.Ordinal);
        }

        private static bool IsExpenseAccount(string accountCode)
        {
            var code = (accountCode ?? string.Empty).TrimStart('0');
            if (code.Length == 0) return false;
            return code[0] == '6' || code.StartsWith("81", StringComparison.Ordinal);
        }
    }

    public class TaxRuleCatalogService : ITaxRuleCatalogService
    {
        private readonly AppDbContext _db;
        public TaxRuleCatalogService(AppDbContext db) => _db = db;

        public async Task<IReadOnlyList<TaxRulePack>> ListPacksAsync(CancellationToken cancellationToken = default) =>
            await _db.TaxRulePacks.AsNoTracking().OrderByDescending(p => p.EffectiveFrom).ToListAsync(cancellationToken);

        public async Task<TaxRulePack?> GetActivePackAsync(string code, DateTime asOf, CancellationToken cancellationToken = default) =>
            await _db.TaxRulePacks.AsNoTracking()
                .Where(p => p.Code == code && p.IsActive && p.EffectiveFrom <= asOf && (p.EffectiveTo == null || p.EffectiveTo >= asOf))
                .OrderByDescending(p => p.EffectiveFrom).FirstOrDefaultAsync(cancellationToken);
    }

    public class LegalWormService : ILegalWormService
    {
        private readonly AppDbContext _db;
        public LegalWormService(AppDbContext db) => _db = db;

        public async Task<IReadOnlyList<LegalWormEntry>> ListEntriesAsync(Guid companyId, int take = 100, CancellationToken cancellationToken = default)
        {
            var t = Math.Clamp(take, 1, 500);
            return await _db.LegalWormEntries.AsNoTracking()
                .Where(e => e.CompanyId == companyId)
                .OrderByDescending(e => e.TimestampUtc)
                .Take(t)
                .ToListAsync(cancellationToken);
        }

        public async Task<LegalWormEntry> RegisterEntryAsync(Guid companyId, Guid? actorUserId, string entityType, string entityId, string payloadHash, string payloadCanonicalJson, CancellationToken cancellationToken = default)
        {
            var last = await _db.LegalWormEntries.AsNoTracking()
                .Where(e => e.CompanyId == companyId)
                .OrderByDescending(e => e.ChainIndex)
                .Select(e => new { e.ChainIndex, e.PayloadHash })
                .FirstOrDefaultAsync(cancellationToken);

            var entry = new LegalWormEntry
            {
                CompanyId = companyId,
                ActorUserId = actorUserId,
                ChainIndex = (last?.ChainIndex ?? 0) + 1,
                TimestampUtc = DateTime.UtcNow,
                EntityType = entityType,
                EntityId = entityId,
                Action = "REGISTER",
                PayloadCanonicalJson = string.IsNullOrWhiteSpace(payloadCanonicalJson) ? "{}" : payloadCanonicalJson,
                PayloadHash = payloadHash,
                PrevPayloadHash = last?.PayloadHash ?? string.Empty
            };
            await _db.LegalWormEntries.AddAsync(entry, cancellationToken);
            await _db.SaveChangesAsync(cancellationToken);
            return entry;
        }
    }
}
