using System.Text.Json.Serialization;

namespace ComptabiliteAPI.Domain.Entities
{
    public class CustomerPayment
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid CustomerId { get; set; }
        public Customer Customer { get; set; } = null!;
        public DateTime PaymentDate { get; set; }
        public decimal Amount { get; set; }
        public string Reference { get; set; } = string.Empty;
        public Guid? JournalEntryId { get; set; }
        public JournalEntry? JournalEntry { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }

    public class Supplier
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid CompanyId { get; set; }

        [JsonIgnore] public Company Company { get; set; } = null!;

        public string Name { get; set; } = string.Empty;
        public string AccountCode { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public string Phone { get; set; } = string.Empty;
        public string Address { get; set; } = string.Empty;
        public string ContactPerson { get; set; } = string.Empty;
        public string TaxId { get; set; } = string.Empty;         // NIF / TIN (Cameroon)
        public decimal? CurrentBalance { get; set; }              // AP balance / dettes fournisseurs
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        [JsonIgnore] public ICollection<SupplierInvoice> Invoices { get; set; } = new List<SupplierInvoice>();
        [JsonIgnore] public ICollection<SupplierPayment> Payments { get; set; } = new List<SupplierPayment>();
    }

    public class SupplierInvoice
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid SupplierId { get; set; }
        public Supplier Supplier { get; set; } = null!;
        public string InvoiceNumber { get; set; } = string.Empty;
        public DateTime IssueDate { get; set; }
        public DateTime DueDate { get; set; }
        /// <summary>draft | posted | paid | void</summary>
        public string Status { get; set; } = "draft";
        public decimal TotalHT { get; set; }
        public decimal TotalTVA { get; set; }
        public decimal AmountTtc { get; set; }
        public decimal PaidAmount { get; set; }
        public string Notes { get; set; } = string.Empty;
        public Guid? JournalEntryId { get; set; }
        public JournalEntry? JournalEntry { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        [JsonIgnore] public ICollection<SupplierInvoiceLine> Lines { get; set; } = new List<SupplierInvoiceLine>();
        [JsonIgnore] public ICollection<SupplierPaymentAllocation> PaymentAllocations { get; set; } = new List<SupplierPaymentAllocation>();
    }

    public class SupplierInvoiceLine
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid SupplierInvoiceId { get; set; }
        [JsonIgnore] public SupplierInvoice SupplierInvoice { get; set; } = null!;
        public int LineNumber { get; set; }
        public string Description { get; set; } = string.Empty;
        /// <summary>SYSCOHADA expense or stock account (e.g. 604700, 311100).</summary>
        public string ExpenseAccountCode { get; set; } = "604700";
        public decimal AmountHt { get; set; }
        public decimal VatRate { get; set; } = 19.25m;
        public decimal VatAmount { get; set; }
        public decimal WithholdingRate { get; set; }
        public decimal WithholdingAmount { get; set; }
    }

    public class SupplierPayment
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid SupplierId { get; set; }
        public Supplier Supplier { get; set; } = null!;
        public DateTime PaymentDate { get; set; }
        public decimal Amount { get; set; }
        public decimal AllocatedAmount { get; set; }
        public string Reference { get; set; } = string.Empty;
        /// <summary>transfer | cash | cheque</summary>
        public string PaymentMethod { get; set; } = "transfer";
        public string BankAccountCode { get; set; } = "521100";
        /// <summary>draft | posted</summary>
        public string Status { get; set; } = "draft";
        public Guid? JournalEntryId { get; set; }
        public JournalEntry? JournalEntry { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        [JsonIgnore] public ICollection<SupplierPaymentAllocation> Allocations { get; set; } = new List<SupplierPaymentAllocation>();
    }

    public class SupplierPaymentAllocation
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid SupplierPaymentId { get; set; }
        [JsonIgnore] public SupplierPayment SupplierPayment { get; set; } = null!;
        public Guid SupplierInvoiceId { get; set; }
        [JsonIgnore] public SupplierInvoice SupplierInvoice { get; set; } = null!;
        public decimal Amount { get; set; }
    }
}
