using System.Collections.Generic;

namespace ComptabiliteAPI.Domain.Entities
{
    public class JournalEntry
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public DateTime EntryDate { get; set; }
        public string Description { get; set; } = string.Empty;
        public Guid CompanyId { get; set; }
        public Company Company { get; set; } = null!;
        public Guid CreatedById { get; set; }
        public User CreatedBy { get; set; } = null!;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public bool Validated { get; set; } = false;
        /// <summary>User/mark as cancelled; excluded from current GL unless reports include voids.</summary>
        public bool Voided { get; set; } = false;

        /// <summary>Workflow: Draft → Pending → Validated / Rejected.</summary>
        public string Status { get; set; } = "Draft";
        public string? RejectionReason { get; set; }
        public Guid? JournalId { get; set; }
        public AccountingJournal? Journal { get; set; }

        /// <summary>Sage-style journal type: JNL, RJE, REV, AJE, TJE, SLB, OBL.</summary>
        public string JournalType { get; set; } = "JNL";
        public string? Reference { get; set; }
        public short FiscalYear { get; set; }
        public short FiscalPeriod { get; set; }
        public string CurrencyCode { get; set; } = "XAF";
        public decimal ExchangeRate { get; set; } = 1m;

        /// <summary>Origin system for idempotent integration (e.g. HMS).</summary>
        public string? SourceSystem { get; set; }
        /// <summary>Stable external key, e.g. cashier_txn:1:4821.</summary>
        public string? ExternalReference { get; set; }

        public ICollection<JournalLine> JournalLines { get; set; } = new List<JournalLine>();
    }

    public class JournalLine
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid EntryId { get; set; }
        public JournalEntry Entry { get; set; } = null!;
        public string AccountCode { get; set; } = string.Empty;
        public decimal Debit { get; set; } = 0;
        public decimal Credit { get; set; } = 0;
        public string? LineDescription { get; set; }
        public string? CostCentre { get; set; }
        public string? TaxCode { get; set; }
        public decimal TaxAmount { get; set; }
    }

    public class ReportAccessLog
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid UserId { get; set; }
        public User User { get; set; } = null!;
        public Guid CompanyId { get; set; }
        public Company Company { get; set; } = null!;
        public string ReportType { get; set; } = string.Empty;
        public string Action { get; set; } = string.Empty; // 'view', 'export_pdf', 'export_excel'
        public string IpAddress { get; set; } = string.Empty;
        public string UserAgent { get; set; } = string.Empty;
        public DateTime AccessedAt { get; set; } = DateTime.UtcNow;
    }
}
