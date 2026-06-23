namespace ComptabiliteAPI.Domain.Entities
{
    public class FiscalPeriodLock
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid CompanyId { get; set; }
        public Company Company { get; set; } = null!;
        public int FiscalYear { get; set; }
        public int FiscalMonth { get; set; }
        public Guid LockedByUserId { get; set; }
        public User LockedByUser { get; set; } = null!;
        public DateTime LockedAt { get; set; } = DateTime.UtcNow;
        public string Notes { get; set; } = string.Empty;
    }

    public class AnalyticAccount
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid CompanyId { get; set; }
        public Company Company { get; set; } = null!;
        public string Code { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public string Axis { get; set; } = "project";
        public bool IsActive { get; set; } = true;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }

    public class JournalLineAnalytic
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid JournalLineId { get; set; }
        public JournalLine JournalLine { get; set; } = null!;
        public Guid AnalyticAccountId { get; set; }
        public AnalyticAccount AnalyticAccount { get; set; } = null!;
        public decimal WeightPercent { get; set; } = 100m;
    }

    /// <summary>Append-only application audit (distinct from report access logs).</summary>
    public class AuditLogEntry
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public DateTime Timestamp { get; set; } = DateTime.UtcNow;
        public Guid? CompanyId { get; set; }
        public Company? Company { get; set; }
        public Guid UserId { get; set; }
        public User User { get; set; } = null!;
        public string Action { get; set; } = string.Empty;
        public string EntityType { get; set; } = string.Empty;
        public string? EntityId { get; set; }
        public string PayloadJson { get; set; } = "{}";
        public string IpAddress { get; set; } = string.Empty;
    }

    public class TaxRulePack
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public string Code { get; set; } = string.Empty;
        public string Version { get; set; } = string.Empty;
        public string Title { get; set; } = string.Empty;
        public string JsonRules { get; set; } = "{}";
        public DateTime EffectiveFrom { get; set; }
        public DateTime? EffectiveTo { get; set; }
        public bool IsActive { get; set; } = true;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }

    /// <summary>Legal WORM (Write-Once-Read-Many) entry for immutable proof of data state.</summary>
    public class LegalWormEntry
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public long ChainIndex { get; set; }
        public DateTime TimestampUtc { get; set; } = DateTime.UtcNow;
        public Guid? ActorUserId { get; set; }
        public User? ActorUser { get; set; }
        public Guid? CompanyId { get; set; }
        public Company? Company { get; set; }
        public string EntityType { get; set; } = string.Empty;
        public string EntityId { get; set; } = string.Empty;
        public string Action { get; set; } = string.Empty;
        public string PayloadCanonicalJson { get; set; } = "{}";
        public string PayloadHash { get; set; } = string.Empty;
        public string PrevPayloadHash { get; set; } = string.Empty;
    }
}
