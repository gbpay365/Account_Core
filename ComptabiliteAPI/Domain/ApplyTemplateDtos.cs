namespace ComptabiliteAPI.Domain
{
    public sealed class ApplyTemplateOptions
    {
        /// <summary>Optional A–Z / 0–9 prefix to distinguish your entity in codes (e.g. initials, max 6 used).</summary>
        public string? CodePrefix { get; set; }
        public bool EnrichNameWithCompany { get; set; } = true;
        public bool EnrichDescriptionWithCompany { get; set; } = true;
        public bool UpdateExistingFromTemplate { get; set; }
    }

    public sealed class ApplyTemplateResult
    {
        public int Added { get; init; }
        public int Updated { get; init; }
    }
}
