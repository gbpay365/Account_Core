namespace ComptabiliteAPI.DTOs
{
    /// <summary>
    /// Cameroonian tax calculation result per OHADA/DGI compliance.
    /// Phase 3 – Tax Engine (IS, TVA, Minimum Tax)
    /// </summary>
    public class TaxCalculationResult
    {
        /// <summary>Net taxable income before tax</summary>
        public decimal TaxableIncome { get; set; }

        /// <summary>Corporate Income Tax (IS) – 30% standard rate</summary>
        public decimal CorporateTax { get; set; }

        /// <summary>Effective IS rate applied (30% or 27.5% for large enterprises)</summary>
        public decimal CorporateTaxRate { get; set; }

        /// <summary>VAT (TVA) at 19.25%</summary>
        public decimal VAT { get; set; }

        /// <summary>
        /// Minimum tax (Impôt Minimum Forfaitaire) – applies when IS < minimum threshold.
        /// Set to 1% of turnover with a floor of 100,000 FCFA (simplified).
        /// </summary>
        public decimal MinimumTax { get; set; }

        /// <summary>The higher of IS and Minimum Tax (actual tax due)</summary>
        public decimal TotalTaxDue { get; set; }

        /// <summary>Net income after tax</summary>
        public decimal NetIncomeAfterTax { get; set; }

        public int FiscalYear { get; set; }
        public string CompanyId { get; set; } = string.Empty;

        /// <summary>True when results are estimates from the ledger, not a filed DGI return (Phase A).</summary>
        public bool Indicative { get; set; } = true;

        /// <summary>API schema version for clients (e.g. tax calc payload).</summary>
        public string SchemaVersion { get; set; } = "1.0";

        /// <summary>Short legal / process disclaimer for UI display.</summary>
        public string? LegalDisclaimer { get; set; }
    }

    /// <summary>Company DTO for multi-tenant company management</summary>
    public class CompanyDto
    {
        public Guid Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public string? TaxId { get; set; }
        public DateTime CreatedAt { get; set; }

        public decimal TransportAllowanceRate { get; set; }
        public decimal HousingAllowanceRate { get; set; }
        public decimal BenefitsInKindRate { get; set; }
        public decimal RepresentationAllowanceRate { get; set; }

        public bool ApproveThirteenthMonth { get; set; }
        public bool ApproveSeniorityBonus { get; set; }
        public bool ApproveOvertimePay { get; set; }
        public bool ApproveBonuses { get; set; }
    }

    public class CreateCompanyRequest
    {
        public string Name { get; set; } = string.Empty;
        public string? TaxId { get; set; }
    }

    /// <summary>Account lookup DTO for journal entry autocomplete</summary>
    public class AccountLookupDto
    {
        public string Code { get; set; } = string.Empty;
        public string NameFr { get; set; } = string.Empty;
        public string NameEn { get; set; } = string.Empty;
        public string AccountType { get; set; } = string.Empty;
        public string NormalBalance { get; set; } = string.Empty;
        public bool IsLeaf { get; set; }
    }

    /// <summary>6-digit postable accounts for journal line pickers (WYVERN-compatible).</summary>
    public class JournalAccountLookupDto
    {
        public Guid Id { get; set; }
        public string Code { get; set; } = string.Empty;
        public string NameFr { get; set; } = string.Empty;
        public string NameEn { get; set; } = string.Empty;
        public int OhadaClass { get; set; }
        public string AccountType { get; set; } = string.Empty;
        public string NormalBalance { get; set; } = "debit";
    }
}
