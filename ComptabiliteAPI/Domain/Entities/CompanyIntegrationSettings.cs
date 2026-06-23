namespace ComptabiliteAPI.Domain.Entities
{
    /// <summary>Per-company (tenant) partner integration URLs and API keys.</summary>
    public class CompanyIntegrationSettings
    {
        public Guid CompanyId { get; set; }

        /// <summary>HMS facility_id that maps to this company.</summary>
        public int HmsFacilityId { get; set; } = 1;

        public string? PublicBaseUrl { get; set; }
        public string? HmsBaseUrl { get; set; }
        public string? HmsWebhookKey { get; set; }
        public string? ZaizensPayrollBaseUrl { get; set; }
        public string? InboundApiKey { get; set; }
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    }
}
