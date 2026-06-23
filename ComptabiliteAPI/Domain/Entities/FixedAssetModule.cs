using System.Text.Json.Serialization;

namespace ComptabiliteAPI.Domain.Entities
{
    public class FixedAsset
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid CompanyId { get; set; }
        [JsonIgnore] public Company Company { get; set; } = null!;
        public string Code { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        /// <summary>draft | active | pending_disposal | disposed | written_off</summary>
        public string Status { get; set; } = "draft";
        /// <summary>building | equipment | vehicle | furniture | it | medical | other</summary>
        public string Category { get; set; } = "equipment";
        public DateTime AcquisitionDate { get; set; }
        public decimal Cost { get; set; }
        /// <summary>Remaining gross after partial disposals / revaluations base.</summary>
        public decimal ActiveCost { get; set; }
        public decimal SalvageValue { get; set; }
        public int UsefulLifeMonths { get; set; }
        public decimal RevaluationAmount { get; set; }
        public DateTime? DisposalDate { get; set; }
        public decimal? DisposalProceeds { get; set; }
        public string AssetAccountCode { get; set; } = string.Empty;
        public string AccumulatedDepreciationAccountCode { get; set; } = string.Empty;
        public string DepreciationExpenseAccountCode { get; set; } = string.Empty;
        public string CreditAccountCode { get; set; } = "521100";
        public string SerialNumber { get; set; } = string.Empty;
        public string Location { get; set; } = string.Empty;
        public string Custodian { get; set; } = string.Empty;
        public string ExternalHmsRef { get; set; } = string.Empty;
        public Guid? SupplierInvoiceId { get; set; }
        public Guid? CostCenterId { get; set; }
        public Guid? AnalyticAccountId { get; set; }
        public Guid? AcquisitionJournalEntryId { get; set; }
        public Guid? DisposalJournalEntryId { get; set; }
        public string DisposalNotes { get; set; } = string.Empty;
        public Guid? DisposalRequestedByUserId { get; set; }
        public Guid? DisposalApprovedByUserId { get; set; }
        public DateTime? DisposalRequestedAt { get; set; }
        public DateTime? DisposalApprovedAt { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        [JsonIgnore] public ICollection<FixedAssetDepreciationLine> DepreciationLines { get; set; } = new List<FixedAssetDepreciationLine>();
        [JsonIgnore] public ICollection<FixedAssetComponent> Components { get; set; } = new List<FixedAssetComponent>();
        [JsonIgnore] public ICollection<FixedAssetEvent> Events { get; set; } = new List<FixedAssetEvent>();
    }

    public class FixedAssetDepreciationLine
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid FixedAssetId { get; set; }
        [JsonIgnore] public FixedAsset FixedAsset { get; set; } = null!;
        /// <summary>YYYYMM calendar period.</summary>
        public int PeriodYearMonth { get; set; }
        public decimal Amount { get; set; }
        public Guid? PostedJournalEntryId { get; set; }
        public JournalEntry? PostedJournalEntry { get; set; }
        public Guid? FixedAssetComponentId { get; set; }
        public FixedAssetComponent? Component { get; set; }
    }

    public class FixedAssetComponent
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid FixedAssetId { get; set; }
        [JsonIgnore] public FixedAsset FixedAsset { get; set; } = null!;
        public string Name { get; set; } = string.Empty;
        public decimal Cost { get; set; }
        public decimal SalvageValue { get; set; }
        public int UsefulLifeMonths { get; set; }
    }

    public class FixedAssetEvent
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid FixedAssetId { get; set; }
        [JsonIgnore] public FixedAsset FixedAsset { get; set; } = null!;
        /// <summary>acquisition | depreciation | disposal | partial_disposal | revaluation | write_off | approval</summary>
        public string EventType { get; set; } = string.Empty;
        public DateTime EventDate { get; set; }
        public decimal Amount { get; set; }
        public Guid? JournalEntryId { get; set; }
        public string Notes { get; set; } = string.Empty;
        public Guid? CreatedByUserId { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}
