namespace ComptabiliteAPI.DTOs;

/// <summary>Static catalog for the intelligent reporting module (drives UI + permission checks).</summary>
public class ReportCatalogItemDto
{
    public string Id { get; set; } = "";
    public string Title { get; set; } = "";
    public string Description { get; set; } = "";
    public string EngineKey { get; set; } = "";
    public IReadOnlyList<string> Formats { get; set; } = Array.Empty<string>();
    public string Category { get; set; } = "";
    public string ReadPermission { get; set; } = "";
    /// <summary>Permission required for binary or generated file exports. Null: JSON/REST view uses <see cref="ReadPermission"/> only.</summary>
    public string? ExportPermission { get; set; }
}

public class ReportAvailabilityDto
{
    public int FiscalYear { get; set; }
    public bool HasJournalDataForYear { get; set; }
    public int JournalEntryCount { get; set; }
    public int AccountCount { get; set; }
    /// <summary>Most recent fiscal year with posted journal data (for UI default).</summary>
    public int? LatestFiscalYearWithData { get; set; }
    public IReadOnlyList<int> FiscalYearsWithData { get; set; } = Array.Empty<int>();
}
