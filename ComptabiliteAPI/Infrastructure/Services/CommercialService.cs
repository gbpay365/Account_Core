using ComptabiliteAPI.Domain.Entities;
using ComptabiliteAPI.Domain.Interfaces;
using ComptabiliteAPI.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace ComptabiliteAPI.Infrastructure.Services
{
    public class CommercialService : ICommercialService
    {
        private readonly AppDbContext _dbContext;

        public CommercialService(AppDbContext dbContext)
        {
            _dbContext = dbContext;
        }

        public async Task<IEnumerable<Product>> GetProductsAsync(Guid companyId)
        {
            return await _dbContext.Products
                .Include(p => p.Family)
                .Where(p => p.CompanyId == companyId)
                .ToListAsync();
        }

        public async Task<Product> CreateProductAsync(Product product)
        {
            await _dbContext.Products.AddAsync(product);
            await _dbContext.SaveChangesAsync();
            return product;
        }

        public async Task<IEnumerable<ProductFamily>> GetProductFamiliesAsync(Guid companyId)
        {
            return await _dbContext.ProductFamilies
                .Where(f => f.CompanyId == companyId)
                .ToListAsync();
        }

        public async Task<Product> UpdateProductAsync(Product product)
        {
            var existing = await _dbContext.Products.FindAsync(product.Id);
            if (existing == null) throw new Exception("Product not found");

            existing.Code = product.Code;
            existing.NameEn = product.NameEn;
            existing.NameFr = product.NameFr;
            existing.Description = product.Description;
            existing.UnitPrice = product.UnitPrice;
            existing.TaxRate = product.TaxRate;
            existing.StockQuantity = product.StockQuantity;
            existing.FamilyId = product.FamilyId;
            existing.IsActive = product.IsActive;
            existing.ValuationMethod = product.ValuationMethod;

            await _dbContext.SaveChangesAsync();
            return existing;
        }

        public async Task DeleteProductAsync(Guid id)
        {
            var p = await _dbContext.Products.FindAsync(id);
            if (p != null)
            {
                _dbContext.Products.Remove(p);
                await _dbContext.SaveChangesAsync();
            }
        }

        public async Task<IEnumerable<Customer>> GetCustomersAsync(Guid companyId)
        {
            return await _dbContext.Customers
                .Where(c => c.CompanyId == companyId)
                .ToListAsync();
        }

        public async Task<Customer> CreateCustomerAsync(Customer customer)
        {
            await _dbContext.Customers.AddAsync(customer);
            await _dbContext.SaveChangesAsync();
            return customer;
        }

        public async Task<Customer> UpdateCustomerAsync(Customer customer)
        {
            var existing = await _dbContext.Customers.FindAsync(customer.Id);
            if (existing == null) throw new Exception("Customer not found");

            existing.Name = customer.Name;
            existing.AccountCode = customer.AccountCode;
            existing.Email = customer.Email;
            existing.Phone = customer.Phone;
            existing.Address = customer.Address;
            existing.CreditLimit = customer.CreditLimit;
            // Add other fields as needed

            await _dbContext.SaveChangesAsync();
            return existing;
        }

        public async Task DeleteCustomerAsync(Guid id)
        {
            var c = await _dbContext.Customers.FindAsync(id);
            if (c != null)
            {
                _dbContext.Customers.Remove(c);
                await _dbContext.SaveChangesAsync();
            }
        }

        public async Task<IEnumerable<Supplier>> GetSuppliersAsync(Guid companyId)
        {
            return await _dbContext.Suppliers
                .AsNoTracking()
                .Where(s => s.CompanyId == companyId)
                .OrderBy(s => s.Name)
                .ToListAsync();
        }

        public async Task<Supplier> CreateSupplierAsync(Supplier supplier)
        {
            await _dbContext.Suppliers.AddAsync(supplier);
            await _dbContext.SaveChangesAsync();
            return supplier;
        }

        public async Task<IEnumerable<SalesDocument>> GetSalesDocumentsAsync(Guid companyId, string? status = null)
        {
            var query = _dbContext.SalesDocuments
                .Include(s => s.Customer)
                .Where(s => s.CompanyId == companyId);

            if (!string.IsNullOrEmpty(status))
            {
                query = query.Where(s => s.Status == status);
            }

            return await query.OrderByDescending(s => s.IssueDate).ToListAsync();
        }

        public async Task<SalesDocument> GetSalesDocumentAsync(Guid documentId)
        {
            var doc = await _dbContext.SalesDocuments
                .Include(s => s.Customer)
                .Include(s => s.Lines)
                    .ThenInclude(l => l.Product)
                .FirstOrDefaultAsync(s => s.Id == documentId);
                
            if (doc == null) throw new Exception("Document not found");
            return doc;
        }

        public async Task<SalesDocument> CreateQuoteAsync(SalesDocument document)
        {
            document.DocumentType = "quote";
            document.Status = "draft";
            
            // Calculate totals
            document.TotalHT = document.Lines.Sum(l => l.TotalLine);
            document.TotalTVA = document.Lines.Sum(l => l.TotalLine * (l.Product?.TaxRate ?? 19.25m) / 100m);
            document.TotalTTC = document.TotalHT + document.TotalTVA;

            await _dbContext.SalesDocuments.AddAsync(document);
            await _dbContext.SaveChangesAsync();
            return document;
        }

        public async Task<SalesDocument> TransformToOrderAsync(Guid quoteId)
        {
            var doc = await GetSalesDocumentAsync(quoteId);
            if (doc.DocumentType != "quote") throw new Exception("Only quotes can be transformed to orders.");
            
            doc.DocumentType = "order";
            doc.Status = "confirmed";
            await _dbContext.SaveChangesAsync();
            return doc;
        }

        public async Task<SalesDocument> TransformToInvoiceAsync(Guid orderId, Guid performedByUserId)
        {
            if (performedByUserId == Guid.Empty)
                throw new ArgumentException("performedByUserId is required.", nameof(performedByUserId));

            var doc = await GetSalesDocumentAsync(orderId);
            if (doc.DocumentType == "invoice") throw new Exception("Already an invoice.");

            doc.DocumentType = "invoice";
            doc.Status = "invoiced";

            // Deduct Stock + create inventory movements
            foreach (var line in doc.Lines)
            {
                var product = await _dbContext.Products.FindAsync(line.ProductId);
                if (product != null)
                {
                    product.StockQuantity -= line.Quantity;

                    _dbContext.InventoryMovements.Add(new InventoryMovement
                    {
                        ProductId = product.Id,
                        MovementType = "out",
                        Quantity = line.Quantity,
                        UnitCost = product.UnitPrice,
                        ReferenceId = doc.Id,
                        CompanyId = doc.CompanyId
                    });
                }
            }

            if (doc.Customer == null)
                throw new InvalidOperationException("Invoice customer is missing. Please select a valid customer before invoicing.");
            doc.Customer.CurrentOutstanding += doc.TotalTTC;

            await _dbContext.SaveChangesAsync();

            // Auto Post to Accounting
            await PostInvoiceToAccountingAsync(doc.Id, performedByUserId);

            return doc;
        }

        public async Task PostInvoiceToAccountingAsync(Guid invoiceId, Guid performedByUserId)
        {
            if (performedByUserId == Guid.Empty)
                throw new ArgumentException("performedByUserId is required.", nameof(performedByUserId));

            var invoice = await GetSalesDocumentAsync(invoiceId);
            if (invoice.DocumentType != "invoice") throw new Exception("Can only post invoices.");

            // Find accounting accounts
            var clientAccount = await _dbContext.Accounts.FirstOrDefaultAsync(a => a.Code == "4111");
            var salesAccount = await _dbContext.Accounts.FirstOrDefaultAsync(a => a.Code == "701");
            var vatAccount = await _dbContext.Accounts.FirstOrDefaultAsync(a => a.Code == "4431");

            // Fallbacks for SYSCOHADA if specific accounts don't exist
            if (clientAccount == null) clientAccount = await _dbContext.Accounts.FirstOrDefaultAsync(a => a.Code.StartsWith("411"));
            if (salesAccount == null) salesAccount = await _dbContext.Accounts.FirstOrDefaultAsync(a => a.Code.StartsWith("70"));
            if (vatAccount == null) vatAccount = await _dbContext.Accounts.FirstOrDefaultAsync(a => a.Code.StartsWith("443"));

            if (clientAccount == null || salesAccount == null) 
                throw new Exception("Required SYSCOHADA accounts (411, 701) are missing. Please setup Chart of Accounts.");

            if (invoice.Customer == null)
                throw new InvalidOperationException("Invoice customer is missing. Please select a valid customer before posting.");

            var entryDate = invoice.IssueDate;
            var fiscalYear = (short)entryDate.Year;
            var fiscalPeriod = (short)entryDate.Month;

            var journalEntry = new JournalEntry
            {
                EntryDate = entryDate,
                Description = $"Facture {invoice.DocumentNumber} - {invoice.Customer.Name}",
                CompanyId = invoice.CompanyId,
                CreatedById = performedByUserId,
                JournalType = "SLB",
                Reference = invoice.DocumentNumber,
                FiscalYear = fiscalYear,
                FiscalPeriod = fiscalPeriod,
                Validated = false,
                JournalLines = new List<JournalLine>
                {
                    new JournalLine { AccountCode = clientAccount.Code, Debit = invoice.TotalTTC, Credit = 0 },
                    new JournalLine { AccountCode = salesAccount.Code, Debit = 0, Credit = invoice.TotalHT }
                }
            };

            if (invoice.TotalTVA > 0 && vatAccount != null)
            {
                journalEntry.JournalLines.Add(new JournalLine { AccountCode = vatAccount.Code, Debit = 0, Credit = invoice.TotalTVA });
            }

            await _dbContext.JournalEntries.AddAsync(journalEntry);
            await _dbContext.SaveChangesAsync();
        }

        public async Task UpdateSalesDocumentStatusAsync(Guid documentId, string status)
        {
            var doc = await _dbContext.SalesDocuments.FindAsync(documentId);
            if (doc == null) throw new Exception("Document not found");
            doc.Status = status;
            await _dbContext.SaveChangesAsync();
        }
    }
}
