namespace ComptabiliteAPI.Domain.Entities
{
    public class IntegrationOutbox
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public string Direction { get; set; } = "outbound";
        public string EventType { get; set; } = string.Empty;
        public string PayloadJson { get; set; } = "{}";
        public string Status { get; set; } = "pending";
        public int Attempts { get; set; }
        public string? LastError { get; set; }
        public DateTime? NextRetryAt { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime? SentAt { get; set; }
    }

    public class IntegrationEntityLink
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid CompanyId { get; set; }
        public string SourceSystem { get; set; } = "HMS";
        public string EntityType { get; set; } = string.Empty;
        public string ExternalId { get; set; } = string.Empty;
        public string InternalId { get; set; } = string.Empty;
        public string? MetadataJson { get; set; }
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    }
}
