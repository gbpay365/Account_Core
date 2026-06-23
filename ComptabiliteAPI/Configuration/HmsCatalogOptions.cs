namespace ComptabiliteAPI.Configuration
{
    public sealed class HmsCatalogOptions
    {
        public const string SectionName = "HmsCatalog";

        /// <summary>Path to hospital_service_catalog_prices.json (HMS_JS lib/data).</summary>
        public string Path { get; set; } = @"C:\HMS_JS\lib\data\hospital_service_catalog_prices.json";
    }
}
