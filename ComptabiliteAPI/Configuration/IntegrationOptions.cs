namespace ComptabiliteAPI.Configuration
{
    public class IntegrationOptions
    {
        public const string SectionName = "Integrations";

        public bool Enabled { get; set; } = true;

        /// <summary>Shared secret for HMS → Core calls (X-API-Key).</summary>
        public string ApiKey { get; set; } = "dev-integration-key-change-in-production";

        /// <summary>Secret Core uses when calling HMS inbound APIs.</summary>
        public string HmsWebhookKey { get; set; } = "dev-hms-inbound-key-change-in-production";

        public string HmsBaseUrl { get; set; } = "http://127.0.0.1:3000";

        public string ZaizensPayrollBaseUrl { get; set; } = "http://127.0.0.1:3010";

        /// <summary>Integration user for CreatedById on system journal entries.</summary>
        public Guid? SystemUserId { get; set; }

        /// <summary>Auto-validate journal entries ingested from HMS.</summary>
        public bool AutoValidateInboundJournals { get; set; } = true;

        /// <summary>facility_id (HMS) → company_id (Core) map.</summary>
        public Dictionary<string, string> FacilityCompanyMap { get; set; } = new()
        {
            ["1"] = ""
        };
    }
}
