using ComptabiliteAPI.DTOs;

namespace ComptabiliteAPI.Infrastructure.Reporting;

/// <summary>Seed liasse/DSF line mapping for CM (Phase B) — can move to DB later.</summary>
public static class CameroonLiasseLineCatalog
{
    public static IReadOnlyList<LiasseLineMapDto> ForJurisdiction(string jurisdiction) =>
        string.Equals(jurisdiction, "CM", StringComparison.OrdinalIgnoreCase)
            ? Cm
            : Array.Empty<LiasseLineMapDto>();

    private static readonly LiasseLineMapDto[] Cm =
    {
        new() { Jurisdiction = "CM", AccountCodePrefix = "7", LiasseLineCode = "REV_7", Description = "Produits d'exploitation (classe 7)", SortOrder = 10 },
        new() { Jurisdiction = "CM", AccountCodePrefix = "6", LiasseLineCode = "CHA_6", Description = "Charges d'exploitation (classe 6)", SortOrder = 20 },
        new() { Jurisdiction = "CM", AccountCodePrefix = "2", LiasseLineCode = "IMMO_2", Description = "Immobilisations (classe 2)", SortOrder = 30 },
        new() { Jurisdiction = "CM", AccountCodePrefix = "3", LiasseLineCode = "STK_3", Description = "Stocks (classe 3)", SortOrder = 40 },
        new() { Jurisdiction = "CM", AccountCodePrefix = "4", LiasseLineCode = "TCR_4", Description = "Tiers (classe 4)", SortOrder = 50 },
    };
}
