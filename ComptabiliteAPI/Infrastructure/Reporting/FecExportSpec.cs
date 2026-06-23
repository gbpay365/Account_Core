namespace ComptabiliteAPI.Infrastructure.Reporting;

/// <summary>DGFIP-style FEC: 18 tab-separated columns, UTF-8 with BOM, validated lines only (Phase A contract).</summary>
public static class FecExportSpec
{
    public static readonly string[] ColumnHeaders =
    {
        "JournalCode", "JournalLib", "EcritureNum", "EcritureDate", "CompteNum", "CompteLib",
        "CompAuxNum", "CompAuxLib", "PieceRef", "PieceDate", "EcritureLib", "Debit", "Credit",
        "EcritureLet", "DateLet", "ValidDate", "Montantdevise", "Idevise"
    };

    public static string HeaderLine => string.Join("\t", ColumnHeaders);
}
