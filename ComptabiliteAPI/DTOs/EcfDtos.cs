using System.ComponentModel.DataAnnotations;

namespace ComptabiliteAPI.DTOs
{
    public class TaxCreditDto
    {
        public string Label { get; set; } = string.Empty;
        public decimal Amount { get; set; }
    }

    public class CitCalculationRequest
    {
        public decimal NetProfit { get; set; }
        public decimal Turnover { get; set; }
        public List<TaxCreditDto> TaxCredits { get; set; } = new();
        /// <summary>Quarterly CIT installments already paid (optional).</summary>
        public decimal FirstQuarterInstallment { get; set; }
        public decimal SecondQuarterInstallment { get; set; }
        public decimal ThirdQuarterInstallment { get; set; }
        public decimal FourthQuarterInstallment { get; set; }
    }

    public class CitCalculationResult
    {
        public decimal TaxableIncome { get; set; }
        public decimal StatutoryRate { get; set; }
        public decimal GrossTaxProgressive { get; set; }
        public decimal TaxOnProfitFlat { get; set; }
        public decimal TaxCredits { get; set; }
        public decimal NetTaxLiability { get; set; }
        public decimal MinimumTax { get; set; }
        public decimal TaxToPay { get; set; }
        public decimal TotalInstallmentsPaid { get; set; }
        public decimal BalanceToPay { get; set; }
        public decimal Overpayment { get; set; }
    }

    public class Form2031Dto
    {
        public string CompanyName { get; set; } = string.Empty;
        public string TaxIdNumber { get; set; } = string.Empty;
        public int FiscalYear { get; set; }
        public decimal DomesticTurnover { get; set; }
        public decimal ExportTurnover { get; set; }
        public decimal Purchases { get; set; }
        public decimal Salaries { get; set; }
        public decimal Depreciation { get; set; }
        public decimal OtherExpenses { get; set; }
        public decimal NetProfit { get; set; }
        public decimal TaxRate { get; set; }
        public decimal CalculatedTax { get; set; }
        public decimal TaxCredits { get; set; }
        public decimal FinalTaxDue { get; set; }
        public decimal MinimumTax { get; set; }
        public decimal TaxToPay { get; set; }
    }

    public class Form2035Dto
    {
        public string CompanyName { get; set; } = string.Empty;
        public string TaxIdNumber { get; set; } = string.Empty;
        public int FiscalYear { get; set; }
        public decimal FinalTaxDue { get; set; }
        public decimal FirstQuarterInstallment { get; set; }
        public decimal SecondQuarterInstallment { get; set; }
        public decimal ThirdQuarterInstallment { get; set; }
        public decimal FourthQuarterInstallment { get; set; }
        public decimal TotalInstallmentsPaid { get; set; }
        public decimal BalanceToPay { get; set; }
        public decimal Overpayment { get; set; }
    }

    public class AnnualCitDeclarationDataDto
    {
        public Form2031Dto Form2031 { get; set; } = new();
        public Form2035Dto Form2035 { get; set; } = new();
        public CitCalculationResult Calculation { get; set; } = new();
        public PayrollSummaryForEcfDto PayrollSummary { get; set; } = new();
    }

    public class PayrollSummaryForEcfDto
    {
        public int PeriodCount { get; set; }
        public decimal TotalGrossPayroll { get; set; }
        public decimal TotalNetPayroll { get; set; }
        public decimal TotalEmployerCharges { get; set; }
    }

    public class VatMonthlyDeclarationDataDto
    {
        public int FiscalYear { get; set; }
        public int Month { get; set; }
        public decimal VatCollected { get; set; }
        public decimal VatRecoverable { get; set; }
        public decimal NetVatDue { get; set; }
    }

    public class IrppQuarterlyDeclarationDataDto
    {
        public int FiscalYear { get; set; }
        public int Quarter { get; set; }
        public decimal EstimatedIrppBase { get; set; }
        public decimal EstimatedIrppDue { get; set; }
        public string Notes { get; set; } = "Simplified estimate from payroll mass; adjust per DGI rules.";
    }

    public class FilingResultDto
    {
        public bool Success { get; set; }
        public string? ReceiptId { get; set; }
        public string? Message { get; set; }
        public string? RawResponse { get; set; }
        /// <summary>Same as TaxDeclaration.CorrelationId for traceability (Phase C).</summary>
        public string? CorrelationId { get; set; }
    }

    public class InvoiceValidationResponseDto
    {
        public string Status { get; set; } = "stub_pending";
        public string? ApprovalNumber { get; set; }
        public string? Message { get; set; }
    }

    public class EbillingInvoiceSubmitDto
    {
        [Required]
        public Guid CompanyId { get; set; }

        public Guid? SalesDocumentId { get; set; }

        [Required]
        [StringLength(50)]
        public string DocumentNumber { get; set; } = string.Empty;

        [Required]
        [StringLength(50)]
        public string CustomerTaxId { get; set; } = string.Empty;

        [Range(0, 999999999999)]
        public decimal TotalAmount { get; set; }
    }
}
