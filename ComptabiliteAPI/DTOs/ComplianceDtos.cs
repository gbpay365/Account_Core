namespace ComptabiliteAPI.DTOs;

public class LiasseLineMapDto
{
    public string Jurisdiction { get; set; } = "CM";
    public string AccountCodePrefix { get; set; } = string.Empty;
    public string LiasseLineCode { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public int SortOrder { get; set; }
}

/// <summary>Reconciliation between trial balance aggregates and financial statement engines (Phase B).</summary>
public class ComplianceReconciliationDto
{
    public int FiscalYear { get; set; }
    public Guid CompanyId { get; set; }
    public decimal TrialBalanceClass7Revenue { get; set; }
    public decimal IncomeStatementTotalRevenue { get; set; }
    public decimal RevenueDelta { get; set; }
    public decimal TrialBalanceClass6Expenses { get; set; }
    public decimal IncomeStatementTotalExpenses { get; set; }
    public decimal ExpenseDelta { get; set; }
    public string Notes { get; set; } = "Deltas are normal if recognition rules differ; use for control only.";
    public string EcfXmlSchemaVersion { get; set; } = "";
}

public class RegisterWormEntryRequest
{
    public Guid CompanyId { get; set; }
    public string ResourceType { get; set; } = string.Empty;
    public string ResourceId { get; set; } = string.Empty;
    public string ContentHash { get; set; } = string.Empty;
    public string MetadataJson { get; set; } = "{}";
}

public class WormEntryDto
{
    public Guid Id { get; set; }
    public DateTime Timestamp { get; set; }
    public string ResourceType { get; set; } = string.Empty;
    public string ResourceId { get; set; } = string.Empty;
    public string ContentHash { get; set; } = string.Empty;
    public string MetadataJson { get; set; } = "{}";
}

public class LockFiscalPeriodRequest
{
    public Guid CompanyId { get; set; }
    public int FiscalYear { get; set; }
    public int FiscalMonth { get; set; }
    public string Notes { get; set; } = string.Empty;
}

public class TaxComplianceCheckResultDto
{
    public string Code { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string Severity { get; set; } = "info";
    public bool Passed { get; set; }
    public string Summary { get; set; } = string.Empty;
    public string EvidenceJson { get; set; } = "{}";
}

public class TaxComplianceChecklistDto
{
    public Guid CompanyId { get; set; }
    public int FiscalYear { get; set; }
    public string Jurisdiction { get; set; } = "CM";
    public List<TaxComplianceCheckResultDto> Preparation { get; set; } = new();
    public List<TaxComplianceCheckResultDto> Controls { get; set; } = new();
    public List<TaxComplianceCheckResultDto> FilingPack { get; set; } = new();
    public List<TaxComplianceCheckResultDto> Integrity { get; set; } = new();
}
