using ComptabiliteAPI.Domain.Entities;
using ComptabiliteAPI.DTOs;
using ComptabiliteAPI.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace ComptabiliteAPI.Infrastructure.Services
{
    public class ReconciliationCandidateService
    {
        private readonly AppDbContext _db;

        public ReconciliationCandidateService(AppDbContext db) => _db = db;

        public async Task<ReconciliationWorkbenchDto> GetWorkbenchAsync(Guid companyId, string type, CancellationToken ct = default)
        {
            var normalized = type.Trim().ToUpperInvariant();
            var matchedSourceIds = await GetMatchedEntityIdsAsync(companyId, normalized, isSource: true, ct);
            var matchedTargetIds = await GetMatchedEntityIdsAsync(companyId, normalized, isSource: false, ct);

            var candidates = normalized == "AR"
                ? await BuildArCandidatesAsync(companyId, matchedSourceIds, matchedTargetIds, ct)
                : await BuildApCandidatesAsync(companyId, matchedSourceIds, matchedTargetIds, ct);

            var invoices = candidates.Where(c => IsInvoiceCandidate(c.EntityType)).ToList();
            var payments = candidates.Where(c => IsPaymentCandidate(c.EntityType)).ToList();

            return new ReconciliationWorkbenchDto
            {
                Type = normalized,
                Candidates = candidates,
                Summary = new ReconciliationSummaryDto
                {
                    OpenInvoiceCount = invoices.Count,
                    OpenPaymentCount = payments.Count,
                    OpenInvoiceTotal = invoices.Sum(i => i.Remaining),
                    OpenPaymentTotal = payments.Sum(p => p.Remaining),
                },
            };
        }

        public async Task ApplyMatchAsync(CreateReconciliationRequest req, CancellationToken ct = default)
        {
            if (req.Type.Equals("AP", StringComparison.OrdinalIgnoreCase))
            {
                if (req.SourceEntityType is "SupplierInvoice" or "SupplierBalance")
                {
                    if (req.SourceEntityType == "SupplierInvoice")
                    {
                        var invoice = await _db.SupplierInvoices.FindAsync(new object[] { req.SourceEntityId }, ct);
                        if (invoice != null)
                        {
                            invoice.PaidAmount = Math.Min(invoice.AmountTtc, invoice.PaidAmount + req.Amount);
                            if (invoice.PaidAmount >= invoice.AmountTtc - 0.01m)
                                invoice.Status = "paid";
                        }
                    }
                    else
                    {
                        var supplier = await _db.Suppliers.FirstOrDefaultAsync(
                            s => s.Id == req.SourceEntityId && s.CompanyId == req.CompanyId, ct);
                        if (supplier != null)
                            supplier.CurrentBalance = Math.Max(0, (supplier.CurrentBalance ?? 0) - req.Amount);
                    }
                }
            }
            else if (req.Type.Equals("AR", StringComparison.OrdinalIgnoreCase)
                     && req.SourceEntityType == "SalesInvoice")
            {
                var invoice = await _db.SalesDocuments.FindAsync(new object[] { req.SourceEntityId }, ct);
                if (invoice != null)
                {
                    invoice.PaidAmount = Math.Min(invoice.TotalTTC, invoice.PaidAmount + req.Amount);
                    if (invoice.PaidAmount >= invoice.TotalTTC - 0.01m)
                        invoice.Status = "paid";
                }
            }
        }

        private static bool IsInvoiceCandidate(string entityType) =>
            entityType.Contains("Invoice", StringComparison.OrdinalIgnoreCase)
            || entityType.Equals("SupplierBalance", StringComparison.OrdinalIgnoreCase);

        private static bool IsPaymentCandidate(string entityType) =>
            entityType.Contains("Payment", StringComparison.OrdinalIgnoreCase)
            || entityType.StartsWith("Journal", StringComparison.OrdinalIgnoreCase);

        private async Task<HashSet<Guid>> GetMatchedEntityIdsAsync(
            Guid companyId, string type, bool isSource, CancellationToken ct)
        {
            var rows = await _db.Reconciliations.AsNoTracking()
                .Where(r => r.CompanyId == companyId && r.Type == type)
                .Select(r => isSource ? r.SourceEntityId : r.TargetEntityId)
                .ToListAsync(ct);
            return rows.ToHashSet();
        }

        private async Task<List<ReconciliationCandidateDto>> BuildArCandidatesAsync(
            Guid companyId,
            HashSet<Guid> matchedInvoices,
            HashSet<Guid> matchedPayments,
            CancellationToken ct)
        {
            var candidates = new List<ReconciliationCandidateDto>();

            var invoices = await _db.SalesDocuments.AsNoTracking()
                .Include(s => s.Customer)
                .Where(s => s.CompanyId == companyId && s.DocumentType == "invoice")
                .OrderByDescending(s => s.IssueDate)
                .ToListAsync(ct);

            foreach (var inv in invoices)
            {
                var remaining = inv.TotalTTC - inv.PaidAmount;
                if (remaining <= 0.01m || matchedInvoices.Contains(inv.Id)) continue;
                candidates.Add(new ReconciliationCandidateDto
                {
                    EntityType = "SalesInvoice",
                    Id = inv.Id,
                    Reference = inv.DocumentNumber,
                    Date = inv.IssueDate,
                    Amount = inv.TotalTTC,
                    Remaining = remaining,
                    PartnerName = inv.Customer?.Name ?? "",
                    Source = "sales",
                });
            }

            var payments = await _db.CustomerPayments.AsNoTracking()
                .Include(p => p.Customer)
                .Where(p => p.Customer != null && p.Customer.CompanyId == companyId)
                .OrderByDescending(p => p.PaymentDate)
                .ToListAsync(ct);

            foreach (var p in payments)
            {
                if (matchedPayments.Contains(p.Id)) continue;
                candidates.Add(new ReconciliationCandidateDto
                {
                    EntityType = "CustomerPayment",
                    Id = p.Id,
                    Reference = string.IsNullOrWhiteSpace(p.Reference) ? $"PAY-{p.Id.ToString()[..8]}" : p.Reference,
                    Date = p.PaymentDate,
                    Amount = p.Amount,
                    Remaining = p.Amount,
                    PartnerName = p.Customer?.Name ?? "",
                    Source = "payment",
                });
            }

            var journalReceipts = await GetJournalCashReceiptsAsync(companyId, ct);
            foreach (var jr in journalReceipts)
            {
                if (matchedPayments.Contains(jr.Id)) continue;
                candidates.Add(jr);
            }

            return candidates;
        }

        private async Task<List<ReconciliationCandidateDto>> BuildApCandidatesAsync(
            Guid companyId,
            HashSet<Guid> matchedInvoices,
            HashSet<Guid> matchedPayments,
            CancellationToken ct)
        {
            var candidates = new List<ReconciliationCandidateDto>();

            var invoices = await _db.SupplierInvoices.AsNoTracking()
                .Include(i => i.Supplier)
                .Where(i => i.Supplier != null && i.Supplier.CompanyId == companyId)
                .OrderByDescending(i => i.IssueDate)
                .ToListAsync(ct);

            foreach (var inv in invoices)
            {
                if (inv.Status is not ("posted" or "paid")) continue;
                var remaining = inv.AmountTtc - inv.PaidAmount;
                if (remaining <= 0.01m || matchedInvoices.Contains(inv.Id)) continue;
                candidates.Add(new ReconciliationCandidateDto
                {
                    EntityType = "SupplierInvoice",
                    Id = inv.Id,
                    Reference = inv.InvoiceNumber,
                    Date = inv.IssueDate,
                    Amount = inv.AmountTtc,
                    Remaining = remaining,
                    PartnerName = inv.Supplier?.Name ?? "",
                    Source = "invoice",
                });
            }

            var suppliersWithOpenInvoices = invoices
                .Where(i => i.Status is "posted" or "paid" && i.AmountTtc - i.PaidAmount > 0.01m)
                .Select(i => i.SupplierId)
                .ToHashSet();

            var suppliers = await _db.Suppliers.AsNoTracking()
                .Where(s => s.CompanyId == companyId && (s.CurrentBalance ?? 0) > 0.01m)
                .OrderByDescending(s => s.CurrentBalance)
                .ToListAsync(ct);

            foreach (var s in suppliers)
            {
                if (matchedInvoices.Contains(s.Id)) continue;
                if (suppliersWithOpenInvoices.Contains(s.Id)) continue;
                var open = s.CurrentBalance ?? 0;
                candidates.Add(new ReconciliationCandidateDto
                {
                    EntityType = "SupplierBalance",
                    Id = s.Id,
                    Reference = s.AccountCode,
                    Date = s.CreatedAt,
                    Amount = open,
                    Remaining = open,
                    PartnerName = s.Name,
                    Source = "supplier_balance",
                });
            }

            var payments = await _db.SupplierPayments.AsNoTracking()
                .Include(p => p.Supplier)
                .Where(p => p.Supplier != null && p.Supplier.CompanyId == companyId)
                .OrderByDescending(p => p.PaymentDate)
                .ToListAsync(ct);

            foreach (var p in payments)
            {
                if (matchedPayments.Contains(p.Id)) continue;
                if (p.Status != "posted") continue;
                var remaining = p.Amount - p.AllocatedAmount;
                if (remaining <= 0.01m) continue;
                candidates.Add(new ReconciliationCandidateDto
                {
                    EntityType = "SupplierPayment",
                    Id = p.Id,
                    Reference = string.IsNullOrWhiteSpace(p.Reference) ? $"PAY-{p.Id.ToString()[..8]}" : p.Reference,
                    Date = p.PaymentDate,
                    Amount = p.Amount,
                    Remaining = remaining,
                    PartnerName = p.Supplier?.Name ?? "",
                    Source = "payment",
                });
            }

            var journalDisbursements = await GetJournalApPaymentsAsync(companyId, ct);
            foreach (var jp in journalDisbursements)
            {
                if (matchedPayments.Contains(jp.Id)) continue;
                candidates.Add(jp);
            }

            return candidates;
        }

        /// <summary>Live cash receipts from posted journals (HMS patient receipts on 5526xx).</summary>
        private async Task<List<ReconciliationCandidateDto>> GetJournalCashReceiptsAsync(
            Guid companyId, CancellationToken ct)
        {
            var entries = await _db.JournalEntries.AsNoTracking()
                .Include(e => e.JournalLines)
                .Where(e => e.CompanyId == companyId && !e.Voided && e.Validated)
                .OrderByDescending(e => e.EntryDate)
                .ToListAsync(ct);

            var result = new List<ReconciliationCandidateDto>();
            foreach (var entry in entries)
            {
                var cash = (entry.JournalLines ?? [])
                    .Where(l => l.AccountCode.StartsWith("5526", StringComparison.Ordinal))
                    .Sum(l => l.Debit - l.Credit);
                if (cash <= 0.01m) continue;

                result.Add(new ReconciliationCandidateDto
                {
                    EntityType = "JournalReceipt",
                    Id = entry.Id,
                    Reference = string.IsNullOrWhiteSpace(entry.Reference)
                        ? entry.Id.ToString()[..8].ToUpperInvariant()
                        : entry.Reference,
                    Date = entry.EntryDate,
                    Amount = cash,
                    Remaining = cash,
                    PartnerName = entry.Description,
                    Source = "journal",
                });
            }
            return result;
        }

        /// <summary>Live supplier payments from posted journals crediting 401xxx.</summary>
        private async Task<List<ReconciliationCandidateDto>> GetJournalApPaymentsAsync(
            Guid companyId, CancellationToken ct)
        {
            var entries = await _db.JournalEntries.AsNoTracking()
                .Include(e => e.JournalLines)
                .Where(e => e.CompanyId == companyId && !e.Voided && e.Validated)
                .OrderByDescending(e => e.EntryDate)
                .ToListAsync(ct);

            var result = new List<ReconciliationCandidateDto>();
            foreach (var entry in entries)
            {
                var apCredit = (entry.JournalLines ?? [])
                    .Where(l => l.AccountCode.StartsWith("401", StringComparison.Ordinal))
                    .Sum(l => l.Credit - l.Debit);
                if (apCredit <= 0.01m) continue;

                result.Add(new ReconciliationCandidateDto
                {
                    EntityType = "JournalDisbursement",
                    Id = entry.Id,
                    Reference = string.IsNullOrWhiteSpace(entry.Reference)
                        ? entry.Id.ToString()[..8].ToUpperInvariant()
                        : entry.Reference,
                    Date = entry.EntryDate,
                    Amount = apCredit,
                    Remaining = apCredit,
                    PartnerName = entry.Description,
                    Source = "journal",
                });
            }
            return result;
        }
    }
}
