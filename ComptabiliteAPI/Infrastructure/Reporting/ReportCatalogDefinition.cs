using ComptabiliteAPI.DTOs;

namespace ComptabiliteAPI.Infrastructure.Reporting;

public static class ReportCatalogDefinition
{
    public static IReadOnlyList<ReportCatalogItemDto> GetItems() => new[]
    {
        new ReportCatalogItemDto
        {
            Id = "trial_balance",
            Title = "Trial balance",
            Description = "List of accounts with debit and credit movements for the fiscal year. All amounts come from posted journal lines and your chart of accounts.",
            EngineKey = "trial_balance",
            Formats = new[] { "PDF", "XLSX", "CSV", "XML", "HTML", "JSON" },
            Category = "Core financial",
            ReadPermission = "balance_sheet:read",
            ExportPermission = "balance_sheet:export"
        },
        new ReportCatalogItemDto
        {
            Id = "income_statement",
            Title = "Income statement (P&L)",
            Description = "Revenue, expenses, and result for the fiscal year.",
            EngineKey = "income_statement",
            Formats = new[] { "PDF", "XLSX", "CSV", "XML", "HTML", "JSON" },
            Category = "Core financial",
            ReadPermission = "balance_sheet:read",
            ExportPermission = "balance_sheet:export"
        },
        new ReportCatalogItemDto
        {
            Id = "balance_sheet",
            Title = "Balance sheet",
            Description = "Statement of financial position (SYSCOHADA-style balance sheet).",
            EngineKey = "balance_sheet",
            Formats = new[] { "PDF", "XLSX", "CSV", "XML", "HTML", "JSON" },
            Category = "Core financial",
            ReadPermission = "balance_sheet:read",
            ExportPermission = "balance_sheet:export"
        },
        new ReportCatalogItemDto
        {
            Id = "cash_flow",
            Title = "Cash flow statement",
            Description = "Cash flows from operating, investing, and financing activities.",
            EngineKey = "cash_flow",
            Formats = new[] { "PDF", "XML", "HTML", "JSON" },
            Category = "Core financial",
            ReadPermission = "cash_flow:read",
            ExportPermission = "cash_flow:export"
        },
        new ReportCatalogItemDto
        {
            Id = "statutory_notes",
            Title = "Statutory notes (annexes)",
            Description = "OHADA statutory note texts generated from company data and balances.",
            EngineKey = "notes",
            Formats = new[] { "JSON" },
            Category = "Statutory",
            ReadPermission = "balance_sheet:read",
            ExportPermission = null
        },
        new ReportCatalogItemDto
        {
            Id = "project_profitability",
            Title = "Project profitability (analytic)",
            Description = "Profitability by project when analytic dimensions and postings are present.",
            EngineKey = "project_profitability",
            Formats = new[] { "JSON" },
            Category = "Analytical",
            ReadPermission = "dashboard:read",
            ExportPermission = null
        },
    };
}
