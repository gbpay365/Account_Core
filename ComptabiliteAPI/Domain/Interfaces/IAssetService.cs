using ComptabiliteAPI.Domain.Entities;
using ComptabiliteAPI.Infrastructure.Services;

namespace ComptabiliteAPI.Domain.Interfaces
{
    public interface IAssetService
    {
        IReadOnlyList<AssetCategoryDefaults> GetCategoryDefaults();
        Task<IReadOnlyList<FixedAsset>> ListAsync(Guid companyId, string? status = null, string? category = null, CancellationToken ct = default);
        Task<FixedAssetDetailDto> GetDetailAsync(Guid assetId, CancellationToken ct = default);
        Task<FixedAsset> CreateAsync(FixedAsset asset, IReadOnlyList<FixedAssetComponent>? components = null, CancellationToken ct = default);
        Task<FixedAsset> UpdateAsync(FixedAsset asset, CancellationToken ct = default);
        Task<FixedAssetComponent> AddComponentAsync(Guid assetId, FixedAssetComponent component, CancellationToken ct = default);
        Task<FixedAsset> PostAcquisitionAsync(Guid assetId, Guid userId, string? creditAccountCode = null, CancellationToken ct = default);
        Task<FixedAssetDepreciationLine?> PostMonthlyDepreciationAsync(Guid assetId, int periodYearMonth, Guid userId, CancellationToken ct = default);
        Task<BatchDepreciationResult> RunBatchDepreciationAsync(Guid companyId, int periodYearMonth, Guid userId, CancellationToken ct = default);
        Task<FixedAsset> RequestDisposalAsync(Guid assetId, Guid userId, DateTime disposalDate, decimal? proceeds, string? notes, CancellationToken ct = default);
        Task<FixedAsset> ApproveDisposalAsync(Guid assetId, Guid approverUserId, CancellationToken ct = default);
        Task<FixedAsset> PostDisposalAsync(Guid assetId, Guid userId, decimal? partialAmount = null, CancellationToken ct = default);
        Task<FixedAsset> PostWriteOffAsync(Guid assetId, Guid userId, DateTime writeOffDate, string? notes, CancellationToken ct = default);
        Task<FixedAsset> PostRevaluationAsync(Guid assetId, Guid userId, decimal newActiveCost, string? notes, CancellationToken ct = default);
        Task<FixedAsset> CapitalizeFromSupplierInvoiceAsync(Guid companyId, Guid supplierInvoiceId, Guid userId, CapitalizeFromInvoiceRequest req, CancellationToken ct = default);
        Task<(int statusCode, object body)> IngestFromHmsAsync(int facilityId, HmsFixedAssetIngestDto dto, Guid userId, CancellationToken ct = default);

        Task<AssetRegisterReportDto> GetRegisterReportAsync(Guid companyId, DateTime? asOf, CancellationToken ct = default);
        Task<AssetDepreciationScheduleDto> GetDepreciationScheduleAsync(Guid companyId, int fiscalYear, CancellationToken ct = default);
        Task<AssetMovementsReportDto> GetMovementsReportAsync(Guid companyId, DateTime from, DateTime to, CancellationToken ct = default);
        Task<AssetGlReconciliationDto> GetGlReconciliationAsync(Guid companyId, CancellationToken ct = default);
    }

    public class FixedAssetDetailDto
    {
        public FixedAsset Asset { get; set; } = null!;
        public decimal AccumulatedDepreciation { get; set; }
        public decimal NetBookValue { get; set; }
        public IReadOnlyList<FixedAssetDepreciationLine> DepreciationLines { get; set; } = Array.Empty<FixedAssetDepreciationLine>();
        public IReadOnlyList<FixedAssetEvent> Events { get; set; } = Array.Empty<FixedAssetEvent>();
        public IReadOnlyList<FixedAssetComponent> Components { get; set; } = Array.Empty<FixedAssetComponent>();
    }

    public class BatchDepreciationResult
    {
        public int Posted { get; set; }
        public int Skipped { get; set; }
        public List<string> Messages { get; set; } = new();
    }

    public class CapitalizeFromInvoiceRequest
    {
        public string Code { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public string Category { get; set; } = "equipment";
        public decimal Amount { get; set; }
        public int UsefulLifeMonths { get; set; }
        public string? SerialNumber { get; set; }
        public string? Location { get; set; }
    }

    public class HmsFixedAssetIngestDto
    {
        public int? FacilityId { get; set; }
        public string ExternalRef { get; set; } = string.Empty;
        public string Code { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public string Category { get; set; } = "medical";
        public DateTime AcquisitionDate { get; set; }
        public decimal Cost { get; set; }
        public int UsefulLifeMonths { get; set; }
        public string? SerialNumber { get; set; }
        public string? Location { get; set; }
        public string? Custodian { get; set; }
        public string? PurchaseOrderRef { get; set; }
        public bool PostAcquisition { get; set; }
        public string? CreditAccountCode { get; set; }
    }

    public class AssetRegisterRowDto
    {
        public Guid Id { get; set; }
        public string Code { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public string Category { get; set; } = string.Empty;
        public string Status { get; set; } = string.Empty;
        public decimal GrossCost { get; set; }
        public decimal AccumulatedDepreciation { get; set; }
        public decimal NetBookValue { get; set; }
        public DateTime AcquisitionDate { get; set; }
    }

    public class AssetRegisterReportDto
    {
        public DateTime AsOf { get; set; }
        public decimal TotalGross { get; set; }
        public decimal TotalAccumulatedDepreciation { get; set; }
        public decimal TotalNetBookValue { get; set; }
        public IReadOnlyList<AssetRegisterRowDto> Rows { get; set; } = Array.Empty<AssetRegisterRowDto>();
    }

    public class AssetDepreciationScheduleDto
    {
        public int FiscalYear { get; set; }
        public IReadOnlyList<AssetDepreciationPeriodRow> Periods { get; set; } = Array.Empty<AssetDepreciationPeriodRow>();
    }

    public class AssetDepreciationPeriodRow
    {
        public int PeriodYearMonth { get; set; }
        public string AssetCode { get; set; } = string.Empty;
        public string AssetName { get; set; } = string.Empty;
        public decimal Amount { get; set; }
    }

    public class AssetMovementsReportDto
    {
        public DateTime From { get; set; }
        public DateTime To { get; set; }
        public IReadOnlyList<FixedAssetEvent> Events { get; set; } = Array.Empty<FixedAssetEvent>();
    }

    public class AssetGlReconciliationDto
    {
        public decimal RegisterNetBookValue { get; set; }
        public decimal GlClass2NetBalance { get; set; }
        public decimal Variance { get; set; }
        public IReadOnlyList<AssetGlAccountRow> GlAccounts { get; set; } = Array.Empty<AssetGlAccountRow>();
    }

    public class AssetGlAccountRow
    {
        public string AccountCode { get; set; } = string.Empty;
        public string Label { get; set; } = string.Empty;
        public decimal Balance { get; set; }
    }
}
