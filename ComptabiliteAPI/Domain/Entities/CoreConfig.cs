using System.Collections.Generic;

namespace ComptabiliteAPI.Domain.Entities
{
    /// <summary>Company-scoped currency master (multi-currency support per spec).</summary>
    public class Currency
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid CompanyId { get; set; }
        public Company Company { get; set; } = null!;
        public string Code { get; set; } = string.Empty;       // ISO 4217, e.g. XAF, EUR
        public string Name { get; set; } = string.Empty;
        public string Symbol { get; set; } = string.Empty;
        public decimal ExchangeRate { get; set; } = 1m;        // Rate vs company base currency
        public bool IsDefault { get; set; }
        public bool IsActive { get; set; } = true;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }

    /// <summary>Fiscal year entity (replaces implicit year on entries).</summary>
    public class FiscalYear
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid CompanyId { get; set; }
        public Company Company { get; set; } = null!;
        public int Year { get; set; }
        public DateTime StartDate { get; set; }
        public DateTime EndDate { get; set; }
        public bool IsClosed { get; set; }
        public bool IsCurrent { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public ICollection<Period> Periods { get; set; } = new List<Period>();
    }

    /// <summary>Accounting period within a fiscal year (monthly by default).</summary>
    public class Period
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid FiscalYearId { get; set; }
        public FiscalYear FiscalYear { get; set; } = null!;
        public int Number { get; set; }                          // 1-12 (or 13 for adjustment)
        public string Name { get; set; } = string.Empty;
        public DateTime StartDate { get; set; }
        public DateTime EndDate { get; set; }
        public bool IsClosed { get; set; }
    }

    /// <summary>Journal master data (Bank, Cash, Purchases, Sales, Miscellaneous).</summary>
    public class AccountingJournal
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid CompanyId { get; set; }
        public Company Company { get; set; } = null!;
        public string Code { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        /// <summary>Bank, Cash, Purchases, Sales, Miscellaneous</summary>
        public string Type { get; set; } = "Miscellaneous";
        public string? DefaultDebitAccountCode { get; set; }
        public string? DefaultCreditAccountCode { get; set; }
        public bool IsActive { get; set; } = true;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }

    /// <summary>Invoice/payment or bank reconciliation match record.</summary>
    public class Reconciliation
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid CompanyId { get; set; }
        public Company Company { get; set; } = null!;
        /// <summary>AR, AP, Bank</summary>
        public string Type { get; set; } = "AR";
        public string SourceEntityType { get; set; } = string.Empty;
        public Guid SourceEntityId { get; set; }
        public string TargetEntityType { get; set; } = string.Empty;
        public Guid TargetEntityId { get; set; }
        public decimal Amount { get; set; }
        public decimal Discrepancy { get; set; }
        /// <summary>Matched, Partial, Pending, Settled</summary>
        public string Status { get; set; } = "Pending";
        public string? Notes { get; set; }
        public Guid CreatedById { get; set; }
        public User CreatedBy { get; set; } = null!;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}
