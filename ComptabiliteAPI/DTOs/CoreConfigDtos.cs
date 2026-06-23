namespace ComptabiliteAPI.DTOs
{
    public class CurrencyDto
    {
        public Guid Id { get; set; }
        public Guid CompanyId { get; set; }
        public string Code { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public string Symbol { get; set; } = string.Empty;
        public decimal ExchangeRate { get; set; }
        public bool IsDefault { get; set; }
        public bool IsActive { get; set; }
    }

    public class CreateCurrencyRequest
    {
        public Guid CompanyId { get; set; }
        public string Code { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public string? Symbol { get; set; }
        public decimal ExchangeRate { get; set; } = 1m;
        public bool IsDefault { get; set; }
    }

    public class FiscalYearDto
    {
        public Guid Id { get; set; }
        public Guid CompanyId { get; set; }
        public int Year { get; set; }
        public DateTime StartDate { get; set; }
        public DateTime EndDate { get; set; }
        public bool IsClosed { get; set; }
        public bool IsCurrent { get; set; }
        public List<PeriodDto> Periods { get; set; } = new();
    }

    public class CreateFiscalYearRequest
    {
        public Guid CompanyId { get; set; }
        public int Year { get; set; }
        public DateTime? StartDate { get; set; }
        public DateTime? EndDate { get; set; }
        public bool IsCurrent { get; set; }
    }

    public class PeriodDto
    {
        public Guid Id { get; set; }
        public Guid FiscalYearId { get; set; }
        public int Number { get; set; }
        public string Name { get; set; } = string.Empty;
        public DateTime StartDate { get; set; }
        public DateTime EndDate { get; set; }
        public bool IsClosed { get; set; }
    }

    public class AccountingJournalDto
    {
        public Guid Id { get; set; }
        public Guid CompanyId { get; set; }
        public string Code { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public string Type { get; set; } = string.Empty;
        public string? DefaultDebitAccountCode { get; set; }
        public string? DefaultCreditAccountCode { get; set; }
        public bool IsActive { get; set; }
    }

    public class CreateAccountingJournalRequest
    {
        public Guid CompanyId { get; set; }
        public string Code { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public string Type { get; set; } = "Miscellaneous";
        public string? DefaultDebitAccountCode { get; set; }
        public string? DefaultCreditAccountCode { get; set; }
    }

    public class ReconciliationDto
    {
        public Guid Id { get; set; }
        public Guid CompanyId { get; set; }
        public string Type { get; set; } = string.Empty;
        public string SourceEntityType { get; set; } = string.Empty;
        public Guid SourceEntityId { get; set; }
        public string TargetEntityType { get; set; } = string.Empty;
        public Guid TargetEntityId { get; set; }
        public decimal Amount { get; set; }
        public decimal Discrepancy { get; set; }
        public string Status { get; set; } = string.Empty;
        public string? Notes { get; set; }
        public DateTime CreatedAt { get; set; }
    }

    public class CreateReconciliationRequest
    {
        public Guid CompanyId { get; set; }
        public string Type { get; set; } = "AR";
        public string SourceEntityType { get; set; } = string.Empty;
        public Guid SourceEntityId { get; set; }
        public string TargetEntityType { get; set; } = string.Empty;
        public Guid TargetEntityId { get; set; }
        public decimal Amount { get; set; }
        public decimal Discrepancy { get; set; }
        public string? Notes { get; set; }
    }

    public class ReconciliationCandidateDto
    {
        public string EntityType { get; set; } = string.Empty;
        public Guid Id { get; set; }
        public string Reference { get; set; } = string.Empty;
        public DateTime Date { get; set; }
        public decimal Amount { get; set; }
        public decimal Remaining { get; set; }
        public string PartnerName { get; set; } = string.Empty;
        public string Source { get; set; } = string.Empty;
    }

    public class ReconciliationSummaryDto
    {
        public int OpenInvoiceCount { get; set; }
        public int OpenPaymentCount { get; set; }
        public decimal OpenInvoiceTotal { get; set; }
        public decimal OpenPaymentTotal { get; set; }
    }

    public class ReconciliationWorkbenchDto
    {
        public string Type { get; set; } = "AR";
        public List<ReconciliationCandidateDto> Candidates { get; set; } = new();
        public ReconciliationSummaryDto Summary { get; set; } = new();
    }

    public class GeneralLedgerLineDto
    {
        public DateTime EntryDate { get; set; }
        public string EntryId { get; set; } = string.Empty;
        public string JournalType { get; set; } = string.Empty;
        public string? Reference { get; set; }
        public string Description { get; set; } = string.Empty;
        public string AccountCode { get; set; } = string.Empty;
        public string AccountName { get; set; } = string.Empty;
        public decimal Debit { get; set; }
        public decimal Credit { get; set; }
        public decimal RunningBalance { get; set; }
        public string Status { get; set; } = string.Empty;
    }
}
