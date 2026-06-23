using ComptabiliteAPI.Domain.Entities;
using ComptabiliteAPI.Domain.Interfaces;
using ComptabiliteAPI.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace ComptabiliteAPI.Infrastructure.Services
{
    public class ApService : IApService
    {
        private readonly AppDbContext _db;
        private readonly IJournalEntryService _journal;

        public ApService(AppDbContext db, IJournalEntryService journal)
        {
            _db = db;
            _journal = journal;
        }

        public async Task<IEnumerable<SupplierInvoice>> GetInvoicesAsync(Guid companyId, string? status = null)
        {
            var query = _db.SupplierInvoices
                .AsNoTracking()
                .Include(i => i.Supplier)
                .Where(i => i.Supplier != null && i.Supplier.CompanyId == companyId);

            if (!string.IsNullOrWhiteSpace(status))
                query = query.Where(i => i.Status == status);

            return await query.OrderByDescending(i => i.IssueDate).ToListAsync();
        }

        public async Task<SupplierInvoice> GetInvoiceAsync(Guid invoiceId)
        {
            var invoice = await _db.SupplierInvoices
                .Include(i => i.Supplier)
                .Include(i => i.Lines)
                .FirstOrDefaultAsync(i => i.Id == invoiceId);

            if (invoice == null) throw new InvalidOperationException("Supplier invoice not found.");
            return invoice;
        }

        public async Task<SupplierInvoice> CreateInvoiceAsync(SupplierInvoice invoice)
        {
            if (invoice.SupplierId == Guid.Empty)
                throw new InvalidOperationException("Supplier is required.");

            var supplier = await _db.Suppliers.FindAsync(invoice.SupplierId)
                ?? throw new InvalidOperationException("Supplier not found.");

            invoice.Status = "draft";
            invoice.PaidAmount = 0;
            RecalculateInvoiceTotals(invoice);

            if (string.IsNullOrWhiteSpace(invoice.InvoiceNumber))
                invoice.InvoiceNumber = $"AP-{DateTime.UtcNow:yyyyMMdd}-{Guid.NewGuid().ToString()[..6].ToUpperInvariant()}";

            invoice.InvoiceNumber = invoice.InvoiceNumber.Trim();
            await EnsureUniqueInvoiceNumberAsync(supplier.CompanyId, invoice.SupplierId, invoice.InvoiceNumber);

            await _db.SupplierInvoices.AddAsync(invoice);
            await _db.SaveChangesAsync();
            return await GetInvoiceAsync(invoice.Id);
        }

        public async Task<SupplierInvoice> UpdateInvoiceAsync(SupplierInvoice invoice)
        {
            var existing = await GetInvoiceAsync(invoice.Id);
            if (existing.Status != "draft")
                throw new InvalidOperationException("Only draft invoices can be edited.");

            existing.InvoiceNumber = invoice.InvoiceNumber.Trim();
            existing.IssueDate = invoice.IssueDate;
            existing.DueDate = invoice.DueDate;
            existing.Notes = invoice.Notes ?? string.Empty;

            _db.SupplierInvoiceLines.RemoveRange(existing.Lines);
            existing.Lines = invoice.Lines.Select((l, idx) => new SupplierInvoiceLine
            {
                LineNumber = idx + 1,
                Description = l.Description.Trim(),
                ExpenseAccountCode = string.IsNullOrWhiteSpace(l.ExpenseAccountCode) ? "604700" : l.ExpenseAccountCode.Trim(),
                AmountHt = l.AmountHt,
                VatRate = l.VatRate,
                VatAmount = Math.Round(l.AmountHt * l.VatRate / 100m, 2),
                WithholdingRate = l.WithholdingRate,
                WithholdingAmount = l.WithholdingAmount,
            }).ToList();

            RecalculateInvoiceTotals(existing);
            await _db.SaveChangesAsync();
            return await GetInvoiceAsync(existing.Id);
        }

        public async Task DeleteInvoiceAsync(Guid invoiceId)
        {
            var invoice = await GetInvoiceAsync(invoiceId);
            if (invoice.Status != "draft")
                throw new InvalidOperationException("Only draft invoices can be deleted.");

            _db.SupplierInvoices.Remove(invoice);
            await _db.SaveChangesAsync();
        }

        public async Task<SupplierInvoice> PostInvoiceAsync(Guid invoiceId, Guid performedByUserId)
        {
            if (performedByUserId == Guid.Empty)
                throw new ArgumentException("performedByUserId is required.", nameof(performedByUserId));

            var invoice = await GetInvoiceAsync(invoiceId);
            if (invoice.Status != "draft")
                throw new InvalidOperationException("Invoice is already posted.");
            if (invoice.Lines.Count == 0)
                throw new InvalidOperationException("Add at least one line before posting.");
            if (invoice.AmountTtc <= 0)
                throw new InvalidOperationException("Invoice total must be greater than zero.");

            var supplier = invoice.Supplier
                ?? throw new InvalidOperationException("Supplier is missing on this invoice.");

            var supplierAccount = await ResolveAccountAsync(supplier.AccountCode, "401");
            var vatAccount = await ResolveAccountAsync("4452", "445");

            var entryDate = invoice.IssueDate;
            var journalLines = new List<JournalLine>();

            foreach (var line in invoice.Lines.OrderBy(l => l.LineNumber))
            {
                var expenseCode = await ResolveAccountCodeAsync(line.ExpenseAccountCode, "604");
                journalLines.Add(new JournalLine
                {
                    AccountCode = expenseCode,
                    Debit = line.AmountHt,
                    Credit = 0,
                    LineDescription = line.Description,
                });

                if (line.VatAmount > 0 && vatAccount != null)
                {
                    journalLines.Add(new JournalLine
                    {
                        AccountCode = vatAccount.Code,
                        Debit = line.VatAmount,
                        Credit = 0,
                        LineDescription = $"TVA · {line.Description}",
                    });
                }
            }

            var netPayable = invoice.AmountTtc - invoice.Lines.Sum(l => l.WithholdingAmount);
            journalLines.Add(new JournalLine
            {
                AccountCode = supplierAccount.Code,
                Debit = 0,
                Credit = netPayable,
                LineDescription = supplier.Name,
            });

            var withholding = invoice.Lines.Sum(l => l.WithholdingAmount);
            if (withholding > 0)
            {
                var whAccount = await ResolveAccountAsync("4471", "447");
                journalLines.Add(new JournalLine
                {
                    AccountCode = whAccount.Code,
                    Debit = 0,
                    Credit = withholding,
                    LineDescription = "Retenue à la source",
                });
            }

            var journalEntry = new JournalEntry
            {
                EntryDate = entryDate,
                Description = $"Facture fournisseur {invoice.InvoiceNumber} · {supplier.Name}",
                CompanyId = supplier.CompanyId,
                CreatedById = performedByUserId,
                JournalType = "ACH",
                Reference = invoice.InvoiceNumber,
                FiscalYear = (short)entryDate.Year,
                FiscalPeriod = (short)entryDate.Month,
                Validated = false,
                JournalLines = journalLines,
            };

            var created = await _journal.CreateEntryAsync(journalEntry);
            created = await _journal.ValidateEntryAsync(created.Id)
                ?? throw new InvalidOperationException("Failed to validate supplier invoice journal.");

            invoice.JournalEntryId = created.Id;
            invoice.Status = "posted";
            supplier.CurrentBalance = (supplier.CurrentBalance ?? 0) + netPayable;

            await _db.SaveChangesAsync();
            return await GetInvoiceAsync(invoice.Id);
        }

        public async Task<IEnumerable<SupplierPayment>> GetPaymentsAsync(Guid companyId, string? status = null)
        {
            var query = _db.SupplierPayments
                .AsNoTracking()
                .Include(p => p.Supplier)
                .Include(p => p.Allocations)
                .Where(p => p.Supplier != null && p.Supplier.CompanyId == companyId);

            if (!string.IsNullOrWhiteSpace(status))
                query = query.Where(p => p.Status == status);

            return await query.OrderByDescending(p => p.PaymentDate).ToListAsync();
        }

        public async Task<SupplierPayment> GetPaymentAsync(Guid paymentId)
        {
            var payment = await _db.SupplierPayments
                .Include(p => p.Supplier)
                .Include(p => p.Allocations)
                .FirstOrDefaultAsync(p => p.Id == paymentId);

            if (payment == null) throw new InvalidOperationException("Supplier payment not found.");
            return payment;
        }

        public async Task<SupplierPayment> CreatePaymentAsync(
            SupplierPayment payment,
            IReadOnlyList<SupplierPaymentAllocation>? allocations = null)
        {
            if (payment.SupplierId == Guid.Empty)
                throw new InvalidOperationException("Supplier is required.");
            if (payment.Amount <= 0)
                throw new InvalidOperationException("Payment amount must be greater than zero.");

            var supplier = await _db.Suppliers.FindAsync(payment.SupplierId)
                ?? throw new InvalidOperationException("Supplier not found.");

            payment.Status = "draft";
            payment.AllocatedAmount = 0;
            payment.Reference = (payment.Reference ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(payment.Reference))
                payment.Reference = $"PAY-{DateTime.UtcNow:yyyyMMdd}-{Guid.NewGuid().ToString()[..6].ToUpperInvariant()}";

            if (string.IsNullOrWhiteSpace(payment.BankAccountCode))
                payment.BankAccountCode = payment.PaymentMethod == "cash" ? "571100" : "521100";

            await _db.SupplierPayments.AddAsync(payment);
            await _db.SaveChangesAsync();

            if (allocations != null && allocations.Count > 0)
            {
                await ApplyAllocationsAsync(payment, allocations, supplier.CompanyId, persistOnly: true);
                await _db.SaveChangesAsync();
            }

            return await GetPaymentAsync(payment.Id);
        }

        public async Task<SupplierPayment> PostPaymentAsync(Guid paymentId, Guid performedByUserId)
        {
            if (performedByUserId == Guid.Empty)
                throw new ArgumentException("performedByUserId is required.", nameof(performedByUserId));

            var payment = await GetPaymentAsync(paymentId);
            if (payment.Status != "draft")
                throw new InvalidOperationException("Payment is already posted.");

            var supplier = payment.Supplier
                ?? throw new InvalidOperationException("Supplier is missing on this payment.");

            var supplierAccount = await ResolveAccountAsync(supplier.AccountCode, "401");
            var bankAccount = await ResolveAccountAsync(payment.BankAccountCode, payment.PaymentMethod == "cash" ? "571" : "521");

            var entryDate = payment.PaymentDate;
            var journalEntry = new JournalEntry
            {
                EntryDate = entryDate,
                Description = $"Paiement fournisseur {payment.Reference} · {supplier.Name}",
                CompanyId = supplier.CompanyId,
                CreatedById = performedByUserId,
                JournalType = "BQ",
                Reference = payment.Reference,
                FiscalYear = (short)entryDate.Year,
                FiscalPeriod = (short)entryDate.Month,
                Validated = false,
                JournalLines = new List<JournalLine>
                {
                    new() { AccountCode = supplierAccount.Code, Debit = payment.Amount, Credit = 0, LineDescription = supplier.Name },
                    new() { AccountCode = bankAccount.Code, Debit = 0, Credit = payment.Amount, LineDescription = payment.PaymentMethod },
                },
            };

            var created = await _journal.CreateEntryAsync(journalEntry);
            created = await _journal.ValidateEntryAsync(created.Id)
                ?? throw new InvalidOperationException("Failed to validate supplier payment journal.");

            payment.JournalEntryId = created.Id;
            payment.Status = "posted";
            supplier.CurrentBalance = Math.Max(0, (supplier.CurrentBalance ?? 0) - payment.Amount);

            if (payment.Allocations.Count > 0)
                await ApplyAllocationsToInvoicesAsync(payment);

            await _db.SaveChangesAsync();
            return await GetPaymentAsync(payment.Id);
        }

        private async Task ApplyAllocationsAsync(
            SupplierPayment payment,
            IReadOnlyList<SupplierPaymentAllocation> allocations,
            Guid companyId,
            bool persistOnly)
        {
            var total = 0m;
            foreach (var alloc in allocations)
            {
                if (alloc.Amount <= 0) continue;
                var invoice = await _db.SupplierInvoices
                    .Include(i => i.Supplier)
                    .FirstOrDefaultAsync(i => i.Id == alloc.SupplierInvoiceId);

                if (invoice == null)
                    throw new InvalidOperationException("Allocated invoice not found.");
                if (invoice.SupplierId != payment.SupplierId)
                    throw new InvalidOperationException("Invoice belongs to a different supplier.");
                if (invoice.Supplier?.CompanyId != companyId)
                    throw new InvalidOperationException("Invoice company mismatch.");
                if (invoice.Status is not ("posted" or "paid"))
                    throw new InvalidOperationException($"Invoice {invoice.InvoiceNumber} is not open for payment.");

                var remaining = invoice.AmountTtc - invoice.PaidAmount;
                if (alloc.Amount > remaining + 0.01m)
                    throw new InvalidOperationException($"Allocation exceeds open balance on {invoice.InvoiceNumber}.");

                total += alloc.Amount;
                payment.Allocations.Add(new SupplierPaymentAllocation
                {
                    SupplierPaymentId = payment.Id,
                    SupplierInvoiceId = invoice.Id,
                    Amount = alloc.Amount,
                });
            }

            if (total > payment.Amount + 0.01m)
                throw new InvalidOperationException("Total allocations exceed payment amount.");

            payment.AllocatedAmount = total;
            if (!persistOnly)
                await ApplyAllocationsToInvoicesAsync(payment);
        }

        private Task ApplyAllocationsToInvoicesAsync(SupplierPayment payment)
        {
            foreach (var alloc in payment.Allocations)
            {
                var invoice = _db.SupplierInvoices.Local.FirstOrDefault(i => i.Id == alloc.SupplierInvoiceId)
                    ?? _db.SupplierInvoices.Find(alloc.SupplierInvoiceId);
                if (invoice == null) continue;

                invoice.PaidAmount = Math.Min(invoice.AmountTtc, invoice.PaidAmount + alloc.Amount);
                if (invoice.PaidAmount >= invoice.AmountTtc - 0.01m)
                    invoice.Status = "paid";
            }

            return Task.CompletedTask;
        }

        private static void RecalculateInvoiceTotals(SupplierInvoice invoice)
        {
            var lineNumber = 1;
            foreach (var line in invoice.Lines.OrderBy(l => l.LineNumber))
            {
                line.LineNumber = lineNumber++;
                line.VatAmount = Math.Round(line.AmountHt * line.VatRate / 100m, 2);
                if (line.WithholdingRate > 0 && line.WithholdingAmount <= 0)
                    line.WithholdingAmount = Math.Round(line.AmountHt * line.WithholdingRate / 100m, 2);
            }

            invoice.TotalHT = invoice.Lines.Sum(l => l.AmountHt);
            invoice.TotalTVA = invoice.Lines.Sum(l => l.VatAmount);
            var gross = invoice.TotalHT + invoice.TotalTVA;
            var withholding = invoice.Lines.Sum(l => l.WithholdingAmount);
            invoice.AmountTtc = Math.Round(gross - withholding, 2);
        }

        private async Task EnsureUniqueInvoiceNumberAsync(Guid companyId, Guid supplierId, string invoiceNumber)
        {
            var exists = await _db.SupplierInvoices.AsNoTracking()
                .AnyAsync(i => i.SupplierId == supplierId && i.InvoiceNumber == invoiceNumber);
            if (exists)
                throw new InvalidOperationException($"Invoice number {invoiceNumber} already exists for this supplier.");
        }

        private async Task<Account> ResolveAccountAsync(string preferredCode, string prefixFallback)
        {
            var code = await ResolveAccountCodeAsync(preferredCode, prefixFallback);
            return await _db.Accounts.FirstAsync(a => a.Code == code);
        }

        private async Task<string> ResolveAccountCodeAsync(string preferredCode, string prefixFallback)
        {
            if (!string.IsNullOrWhiteSpace(preferredCode))
            {
                var exact = await _db.Accounts.AsNoTracking()
                    .FirstOrDefaultAsync(a => a.Code == preferredCode.Trim());
                if (exact != null) return exact.Code;
            }

            var fallback = await _db.Accounts.AsNoTracking()
                .Where(a => a.Code.StartsWith(prefixFallback))
                .OrderBy(a => a.Code)
                .FirstOrDefaultAsync();

            if (fallback == null)
                throw new InvalidOperationException($"Required account ({preferredCode} or {prefixFallback}*) is missing in chart of accounts.");

            return fallback.Code;
        }
    }
}
