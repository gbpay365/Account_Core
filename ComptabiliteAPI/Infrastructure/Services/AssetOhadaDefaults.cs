namespace ComptabiliteAPI.Infrastructure.Services
{
    public record AssetCategoryDefaults(
        string Category,
        string LabelEn,
        string LabelFr,
        string AssetAccountCode,
        string AccumulatedDepreciationAccountCode,
        string DepreciationExpenseAccountCode,
        int DefaultUsefulLifeMonths);

    public static class AssetOhadaDefaults
    {
        public static readonly IReadOnlyList<AssetCategoryDefaults> Categories = new List<AssetCategoryDefaults>
        {
            new("building", "Buildings & constructions", "Bâtiments & constructions", "211000", "281100", "681100", 240),
            new("equipment", "Equipment & tools", "Matériel & outillage", "244000", "284400", "684400", 60),
            new("vehicle", "Transport equipment", "Matériel de transport", "245000", "284500", "684500", 48),
            new("furniture", "Furniture & fittings", "Mobilier & aménagements", "246000", "284600", "684600", 60),
            new("it", "IT & software", "Informatique & logiciels", "248000", "284800", "684800", 36),
            new("medical", "Medical equipment", "Matériel médical", "244200", "284420", "684420", 84),
            new("other", "Other fixed assets", "Autres immobilisations", "249000", "284900", "684900", 60),
        };

        public static AssetCategoryDefaults Resolve(string? category)
        {
            var key = (category ?? "equipment").Trim().ToLowerInvariant();
            return Categories.FirstOrDefault(c => c.Category == key) ?? Categories.First(c => c.Category == "equipment");
        }
    }
}
