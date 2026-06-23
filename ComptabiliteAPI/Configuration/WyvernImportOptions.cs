namespace ComptabiliteAPI.Configuration
{
    public sealed class WyvernImportOptions
    {
        public const string SectionName = "WyvernImport";

        /// <summary>WYVERN FastAPI base URL (UI on :5173 proxies here).</summary>
        public string BaseUrl { get; set; } = "http://127.0.0.1:8000";
        public string Username { get; set; } = "admin";
        public string Password { get; set; } = "admin123";
    }
}
