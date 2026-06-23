namespace ComptabiliteAPI.DTOs
{
    public sealed class CoaImportResult
    {
        public string Source { get; set; } = string.Empty;
        public int Inserted { get; set; }
        public int Updated { get; set; }
        public int Removed { get; set; }
        public int Total { get; set; }
    }

    public sealed class WyvernCoaImportRequest
    {
        /// <summary>WYVERN API base URL (default from config, e.g. http://127.0.0.1:8000).</summary>
        public string? BaseUrl { get; set; }
        public string? Username { get; set; }
        public string? Password { get; set; }
        /// <summary>When true, delete canonical accounts not present in the WYVERN chart before import.</summary>
        public bool ReplaceExisting { get; set; } = true;
    }
}
