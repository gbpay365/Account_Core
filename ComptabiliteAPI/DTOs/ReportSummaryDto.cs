namespace ComptabiliteAPI.DTOs;

/// <summary>Key figures for the intelligent reporting UI, always from live services (journal + chart).</summary>
public class ReportSummaryDto
{
    public string EngineKey { get; set; } = "";
    public int FiscalYear { get; set; }
    /// <summary>Identifies that values are computed from stored journal and account data, not placeholders.</summary>
    public string DataSource { get; set; } = "live_ledger";

    // Trial balance
    public int? AccountLineCount { get; set; }
    public int? AccountsWithMovementCount { get; set; }
    public decimal? SumTotalDebit { get; set; }
    public decimal? SumTotalCredit { get; set; }

    // Income statement
    public decimal? TotalRevenue { get; set; }
    public decimal? TotalExpenses { get; set; }
    public decimal? NetIncome { get; set; }

    // Balance sheet
    public decimal? TotalAssets { get; set; }
    public decimal? TotalLiabilities { get; set; }
    public decimal? TotalEquity { get; set; }

    // Cash flow
    public decimal? OperatingCashFlow { get; set; }
    public decimal? NetCashFlow { get; set; }
    public decimal? ClosingCashClass5 { get; set; }

    // Notes
    public int? StatutoryNotesTextLength { get; set; }

    // Analytic
    public int? ProjectCount { get; set; }
    public decimal? ProjectsCombinedNet { get; set; }
}
