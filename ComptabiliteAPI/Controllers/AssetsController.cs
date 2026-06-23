using ComptabiliteAPI.Domain.Entities;
using ComptabiliteAPI.Domain.Interfaces;
using ComptabiliteAPI.Filters;
using ComptabiliteAPI.Infrastructure.Services;
using ComptabiliteAPI.Middleware;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace ComptabiliteAPI.Controllers
{
    [ApiController]
    [Route("api/assets")]
    [Authorize]
    [ServiceFilter(typeof(CompanyMembershipActionFilter))]
    public class AssetsController : ControllerBase
    {
        private readonly IAssetService _assets;

        public AssetsController(IAssetService assets) => _assets = assets;

        private bool TryGetUserId(out Guid userId)
        {
            userId = Guid.Empty;
            var raw = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            return !string.IsNullOrWhiteSpace(raw) && Guid.TryParse(raw, out userId) && userId != Guid.Empty;
        }

        [HttpGet("categories")]
        [RequirePermission("finance", "read")]
        public IActionResult GetCategories() => Ok(_assets.GetCategoryDefaults());

        [HttpGet]
        [RequirePermission("finance", "read")]
        public async Task<IActionResult> List([FromQuery] Guid companyId, [FromQuery] string? status = null, [FromQuery] string? category = null, CancellationToken ct = default)
        {
            var list = await _assets.ListAsync(companyId, status, category, ct);
            return Ok(list.Select(MapList));
        }

        [HttpGet("{id:guid}")]
        [RequirePermission("finance", "read")]
        public async Task<IActionResult> Get(Guid id, CancellationToken ct = default)
        {
            var detail = await _assets.GetDetailAsync(id, ct);
            return Ok(MapDetail(detail));
        }

        [HttpPost]
        [RequirePermission("finance", "write")]
        public async Task<IActionResult> Create([FromBody] CreateAssetDto dto, CancellationToken ct = default)
        {
            try
            {
                var asset = MapNewAsset(dto);
                var components = dto.Components?.Select(c => new FixedAssetComponent
                {
                    Name = c.Name,
                    Cost = c.Cost,
                    SalvageValue = c.SalvageValue,
                    UsefulLifeMonths = c.UsefulLifeMonths,
                }).ToList();
                var created = await _assets.CreateAsync(asset, components, ct);
                return Ok(MapList(created));
            }
            catch (InvalidOperationException ex) { return BadRequest(new { error = ex.Message }); }
        }

        [HttpPut("{id:guid}")]
        [RequirePermission("finance", "write")]
        public async Task<IActionResult> Update(Guid id, [FromBody] UpdateAssetDto dto, CancellationToken ct = default)
        {
            try
            {
                dto.Id = id;
                var updated = await _assets.UpdateAsync(MapUpdateAsset(dto), ct);
                return Ok(MapList(updated));
            }
            catch (InvalidOperationException ex) { return BadRequest(new { error = ex.Message }); }
        }

        [HttpPost("{id:guid}/components")]
        [RequirePermission("finance", "write")]
        public async Task<IActionResult> AddComponent(Guid id, [FromBody] AssetComponentDto dto, CancellationToken ct = default)
        {
            try
            {
                var comp = await _assets.AddComponentAsync(id, new FixedAssetComponent
                {
                    Name = dto.Name,
                    Cost = dto.Cost,
                    SalvageValue = dto.SalvageValue,
                    UsefulLifeMonths = dto.UsefulLifeMonths,
                }, ct);
                return Ok(comp);
            }
            catch (InvalidOperationException ex) { return BadRequest(new { error = ex.Message }); }
        }

        [HttpPost("{id:guid}/acquisition")]
        [RequirePermission("finance", "write")]
        public async Task<IActionResult> PostAcquisition(Guid id, [FromBody] PostAcquisitionDto? dto, CancellationToken ct = default)
        {
            if (!TryGetUserId(out var userId)) return Unauthorized();
            try
            {
                var asset = await _assets.PostAcquisitionAsync(id, userId, dto?.CreditAccountCode, ct);
                return Ok(MapList(asset));
            }
            catch (InvalidOperationException ex) { return BadRequest(new { error = ex.Message }); }
        }

        [HttpPost("{id:guid}/depreciation")]
        [RequirePermission("finance", "write")]
        public async Task<IActionResult> PostDepreciation(Guid id, [FromQuery] int periodYearMonth, CancellationToken ct = default)
        {
            if (!TryGetUserId(out var userId)) return Unauthorized();
            try
            {
                var line = await _assets.PostMonthlyDepreciationAsync(id, periodYearMonth, userId, ct);
                if (line == null) return Ok(new { posted = false });
                return Ok(new { posted = true, line });
            }
            catch (InvalidOperationException ex) { return BadRequest(new { error = ex.Message }); }
        }

        [HttpPost("depreciation/run")]
        [RequirePermission("finance", "write")]
        public async Task<IActionResult> RunBatchDepreciation([FromQuery] Guid companyId, [FromQuery] int periodYearMonth, CancellationToken ct = default)
        {
            if (!TryGetUserId(out var userId)) return Unauthorized();
            var result = await _assets.RunBatchDepreciationAsync(companyId, periodYearMonth, userId, ct);
            return Ok(result);
        }

        [HttpPost("{id:guid}/disposal/request")]
        [RequirePermission("finance", "write")]
        public async Task<IActionResult> RequestDisposal(Guid id, [FromBody] DisposalRequestDto dto, CancellationToken ct = default)
        {
            if (!TryGetUserId(out var userId)) return Unauthorized();
            try
            {
                var asset = await _assets.RequestDisposalAsync(id, userId, dto.DisposalDate, dto.Proceeds, dto.Notes, ct);
                return Ok(MapList(asset));
            }
            catch (InvalidOperationException ex) { return BadRequest(new { error = ex.Message }); }
        }

        [HttpPost("{id:guid}/disposal/approve")]
        [RequirePermission("finance", "write")]
        public async Task<IActionResult> ApproveDisposal(Guid id, CancellationToken ct = default)
        {
            if (!TryGetUserId(out var userId)) return Unauthorized();
            try
            {
                var asset = await _assets.ApproveDisposalAsync(id, userId, ct);
                return Ok(MapList(asset));
            }
            catch (InvalidOperationException ex) { return BadRequest(new { error = ex.Message }); }
        }

        [HttpPost("{id:guid}/disposal")]
        [RequirePermission("finance", "write")]
        public async Task<IActionResult> PostDisposal(Guid id, [FromBody] PostDisposalDto? dto, CancellationToken ct = default)
        {
            if (!TryGetUserId(out var userId)) return Unauthorized();
            try
            {
                var asset = await _assets.PostDisposalAsync(id, userId, dto?.PartialAmount, ct);
                return Ok(MapList(asset));
            }
            catch (InvalidOperationException ex) { return BadRequest(new { error = ex.Message }); }
        }

        [HttpPost("{id:guid}/write-off")]
        [RequirePermission("finance", "write")]
        public async Task<IActionResult> WriteOff(Guid id, [FromBody] WriteOffDto dto, CancellationToken ct = default)
        {
            if (!TryGetUserId(out var userId)) return Unauthorized();
            try
            {
                var asset = await _assets.PostWriteOffAsync(id, userId, dto.WriteOffDate, dto.Notes, ct);
                return Ok(MapList(asset));
            }
            catch (InvalidOperationException ex) { return BadRequest(new { error = ex.Message }); }
        }

        [HttpPost("{id:guid}/revaluation")]
        [RequirePermission("finance", "write")]
        public async Task<IActionResult> Revalue(Guid id, [FromBody] RevaluationDto dto, CancellationToken ct = default)
        {
            if (!TryGetUserId(out var userId)) return Unauthorized();
            try
            {
                var asset = await _assets.PostRevaluationAsync(id, userId, dto.NewActiveCost, dto.Notes, ct);
                return Ok(MapList(asset));
            }
            catch (InvalidOperationException ex) { return BadRequest(new { error = ex.Message }); }
        }

        [HttpPost("capitalize-from-invoice")]
        [RequirePermission("finance", "write")]
        public async Task<IActionResult> CapitalizeFromInvoice([FromQuery] Guid companyId, [FromBody] CapitalizeFromInvoiceBodyDto body, CancellationToken ct = default)
        {
            if (!TryGetUserId(out var userId)) return Unauthorized();
            try
            {
                var asset = await _assets.CapitalizeFromSupplierInvoiceAsync(companyId, body.SupplierInvoiceId, userId, body.Request, ct);
                return Ok(MapList(asset));
            }
            catch (InvalidOperationException ex) { return BadRequest(new { error = ex.Message }); }
        }

        [HttpGet("reports/register")]
        [RequirePermission("finance", "read")]
        public async Task<IActionResult> RegisterReport([FromQuery] Guid companyId, [FromQuery] DateTime? asOf, CancellationToken ct = default)
            => Ok(await _assets.GetRegisterReportAsync(companyId, asOf, ct));

        [HttpGet("reports/depreciation-schedule")]
        [RequirePermission("finance", "read")]
        public async Task<IActionResult> DepreciationSchedule([FromQuery] Guid companyId, [FromQuery] int fiscalYear, CancellationToken ct = default)
            => Ok(await _assets.GetDepreciationScheduleAsync(companyId, fiscalYear, ct));

        [HttpGet("reports/movements")]
        [RequirePermission("finance", "read")]
        public async Task<IActionResult> Movements([FromQuery] Guid companyId, [FromQuery] DateTime from, [FromQuery] DateTime to, CancellationToken ct = default)
            => Ok(await _assets.GetMovementsReportAsync(companyId, from, to, ct));

        [HttpGet("reports/gl-reconciliation")]
        [RequirePermission("finance", "read")]
        public async Task<IActionResult> GlReconciliation([FromQuery] Guid companyId, CancellationToken ct = default)
            => Ok(await _assets.GetGlReconciliationAsync(companyId, ct));

        private static object MapList(FixedAsset a) => new
        {
            a.Id,
            a.Code,
            a.Name,
            a.Status,
            a.Category,
            a.AcquisitionDate,
            a.Cost,
            a.ActiveCost,
            a.SalvageValue,
            a.UsefulLifeMonths,
            a.SerialNumber,
            a.Location,
            a.Custodian,
            a.AssetAccountCode,
            a.AccumulatedDepreciationAccountCode,
            a.DepreciationExpenseAccountCode,
            a.CreditAccountCode,
            a.AcquisitionJournalEntryId,
            a.DisposalJournalEntryId,
            a.DisposalDate,
            a.DisposalProceeds,
            a.ExternalHmsRef,
            a.SupplierInvoiceId,
            a.RevaluationAmount,
            a.DisposalApprovedByUserId,
            a.DisposalRequestedAt,
        };

        private static object MapDetail(FixedAssetDetailDto d) => new
        {
            Asset = MapList(d.Asset),
            d.AccumulatedDepreciation,
            d.NetBookValue,
            DepreciationLines = d.DepreciationLines.Select(l => new { l.Id, l.PeriodYearMonth, l.Amount, l.PostedJournalEntryId, l.FixedAssetComponentId }),
            Events = d.Events.Select(e => new { e.Id, e.EventType, e.EventDate, e.Amount, e.Notes, e.JournalEntryId }),
            Components = d.Components.Select(c => new { c.Id, c.Name, c.Cost, c.SalvageValue, c.UsefulLifeMonths }),
        };

        private static FixedAsset MapNewAsset(CreateAssetDto dto)
        {
            var defaults = AssetOhadaDefaults.Resolve(dto.Category);
            return new FixedAsset
            {
                CompanyId = dto.CompanyId,
                Code = dto.Code.Trim(),
                Name = dto.Name.Trim(),
                Category = dto.Category ?? "equipment",
                AcquisitionDate = dto.AcquisitionDate,
                Cost = dto.Cost,
                ActiveCost = dto.Cost,
                SalvageValue = dto.SalvageValue,
                UsefulLifeMonths = dto.UsefulLifeMonths > 0 ? dto.UsefulLifeMonths : defaults.DefaultUsefulLifeMonths,
                AssetAccountCode = dto.AssetAccountCode ?? defaults.AssetAccountCode,
                AccumulatedDepreciationAccountCode = dto.AccumulatedDepreciationAccountCode ?? defaults.AccumulatedDepreciationAccountCode,
                DepreciationExpenseAccountCode = dto.DepreciationExpenseAccountCode ?? defaults.DepreciationExpenseAccountCode,
                CreditAccountCode = dto.CreditAccountCode ?? "521100",
                SerialNumber = dto.SerialNumber ?? string.Empty,
                Location = dto.Location ?? string.Empty,
                Custodian = dto.Custodian ?? string.Empty,
                CostCenterId = dto.CostCenterId,
                AnalyticAccountId = dto.AnalyticAccountId,
            };
        }

        private static FixedAsset MapUpdateAsset(UpdateAssetDto dto) => new()
        {
            Id = dto.Id,
            Name = dto.Name,
            Category = dto.Category,
            Cost = dto.Cost,
            SalvageValue = dto.SalvageValue,
            UsefulLifeMonths = dto.UsefulLifeMonths,
            SerialNumber = dto.SerialNumber,
            Location = dto.Location,
            Custodian = dto.Custodian,
            CostCenterId = dto.CostCenterId,
            AnalyticAccountId = dto.AnalyticAccountId,
            AcquisitionDate = dto.AcquisitionDate,
            AssetAccountCode = dto.AssetAccountCode ?? string.Empty,
            AccumulatedDepreciationAccountCode = dto.AccumulatedDepreciationAccountCode ?? string.Empty,
            DepreciationExpenseAccountCode = dto.DepreciationExpenseAccountCode ?? string.Empty,
            CreditAccountCode = dto.CreditAccountCode ?? "521100",
        };
    }

    public class CreateAssetDto
    {
        public Guid CompanyId { get; set; }
        public string Code { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public string? Category { get; set; }
        public DateTime AcquisitionDate { get; set; }
        public decimal Cost { get; set; }
        public decimal SalvageValue { get; set; }
        public int UsefulLifeMonths { get; set; }
        public string? AssetAccountCode { get; set; }
        public string? AccumulatedDepreciationAccountCode { get; set; }
        public string? DepreciationExpenseAccountCode { get; set; }
        public string? CreditAccountCode { get; set; }
        public string? SerialNumber { get; set; }
        public string? Location { get; set; }
        public string? Custodian { get; set; }
        public Guid? CostCenterId { get; set; }
        public Guid? AnalyticAccountId { get; set; }
        public List<AssetComponentDto>? Components { get; set; }
    }

    public class UpdateAssetDto : CreateAssetDto { public Guid Id { get; set; } }

    public class AssetComponentDto
    {
        public string Name { get; set; } = string.Empty;
        public decimal Cost { get; set; }
        public decimal SalvageValue { get; set; }
        public int UsefulLifeMonths { get; set; }
    }

    public class PostAcquisitionDto { public string? CreditAccountCode { get; set; } }

    public class DisposalRequestDto
    {
        public DateTime DisposalDate { get; set; }
        public decimal? Proceeds { get; set; }
        public string? Notes { get; set; }
    }

    public class PostDisposalDto { public decimal? PartialAmount { get; set; } }

    public class WriteOffDto
    {
        public DateTime WriteOffDate { get; set; }
        public string? Notes { get; set; }
    }

    public class RevaluationDto
    {
        public decimal NewActiveCost { get; set; }
        public string? Notes { get; set; }
    }

    public class CapitalizeFromInvoiceBodyDto
    {
        public Guid SupplierInvoiceId { get; set; }
        public CapitalizeFromInvoiceRequest Request { get; set; } = new();
    }
}
