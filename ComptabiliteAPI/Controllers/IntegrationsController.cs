using ComptabiliteAPI.Filters;
using ComptabiliteAPI.Domain.Interfaces;
using ComptabiliteAPI.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ComptabiliteAPI.Controllers
{
    [ApiController]
    [Route("api/v1/integrations")]
    [AllowAnonymous]
    [IntegrationApiKey]
    public class IntegrationsController : ControllerBase
    {
        private readonly IntegrationInboundService _inbound;
        private readonly IntegrationOutboundService _outbound;
        private readonly IntegrationContextResolver _ctx;
        private readonly ServiceCatalogService _catalog;

        public IntegrationsController(
            IntegrationInboundService inbound,
            IntegrationOutboundService outbound,
            IntegrationContextResolver ctx,
            ServiceCatalogService catalog)
        {
            _inbound = inbound;
            _outbound = outbound;
            _ctx = ctx;
            _catalog = catalog;
        }

        [HttpGet("health")]
        public IActionResult Health()
        {
            return Ok(new
            {
                status = "ok",
                integrationsEnabled = _ctx.IsEnabled,
                service = "ComptabiliteAPI",
                version = "1.0",
                timestamp = DateTime.UtcNow
            });
        }

        [HttpPost("employees")]
        public async Task<IActionResult> UpsertEmployee([FromBody] HmsEmployeeUpsertDto dto, CancellationToken ct)
        {
            var facilityId = _inbound.ParseFacilityId(Request, dto.FacilityId);
            if (dto.HmsEmployeeId < 1)
                return BadRequest(new { error = "hms_employee_id required." });
            var (_, result) = await _inbound.UpsertEmployeeAsync(facilityId, dto, ct);
            return Ok(result);
        }

        [HttpPost("employees/bulk")]
        public async Task<IActionResult> BulkEmployees([FromBody] HmsEmployeeBulkSyncDto dto, CancellationToken ct)
        {
            var facilityId = _inbound.ParseFacilityId(Request, dto.FacilityId);
            if (dto.Employees == null || dto.Employees.Count == 0)
                return BadRequest(new { error = "employees array required." });
            var result = await _inbound.SyncEmployeesAsync(facilityId, dto, ct);
            return Ok(result);
        }

        [HttpPost("payroll-periods")]
        public async Task<IActionResult> SyncPayrollPeriod([FromBody] ZaizensPayrollPeriodSyncDto dto, CancellationToken ct)
        {
            var facilityId = _inbound.ParseFacilityId(Request, dto.FacilityId);
            if (dto.Year < 2000 || dto.Month is < 1 or > 12)
                return BadRequest(new { error = "year and month required." });
            var result = await _inbound.SyncPayrollPeriodAsync(facilityId, dto, ct);
            return Ok(result);
        }

        [HttpPost("payroll-department-summaries")]
        public async Task<IActionResult> SyncPayrollDepartmentSummaries(
            [FromBody] ZaizensPayrollDeptSummarySyncDto dto, CancellationToken ct)
        {
            var facilityId = _inbound.ParseFacilityId(Request, dto.FacilityId);
            if (dto.Year < 2000 || dto.Month is < 1 or > 12)
                return BadRequest(new { error = "year and month required." });
            var result = await _inbound.SyncPayrollDepartmentSummariesAsync(facilityId, dto, ct);
            return Ok(result);
        }

        [HttpPost("receipt")]
        public async Task<IActionResult> Receipt([FromBody] HmsCashierReceiptDto dto, CancellationToken ct)
        {
            var facilityId = _inbound.ParseFacilityId(Request);
            var (code, body) = await _inbound.IngestReceiptAsync(facilityId, dto, ct);
            return StatusCode(code, body);
        }

        [HttpPost("expense")]
        public async Task<IActionResult> Expense([FromBody] HmsCashierExpenseDto dto, CancellationToken ct)
        {
            var facilityId = _inbound.ParseFacilityId(Request);
            var (code, body) = await _inbound.IngestExpenseAsync(facilityId, dto, ct);
            return StatusCode(code, body);
        }

        [HttpPost("purchase-order")]
        public async Task<IActionResult> PurchaseOrder([FromBody] HmsPurchaseOrderDto dto, CancellationToken ct)
        {
            var facilityId = _inbound.ParseFacilityId(Request);
            var (code, body) = await _inbound.IngestPurchaseOrderAsync(facilityId, dto, ct);
            return StatusCode(code, body);
        }

        [HttpPost("journal-entry")]
        public async Task<IActionResult> JournalEntry([FromBody] HmsJournalIngestDto dto, CancellationToken ct)
        {
            var facilityId = _inbound.ParseFacilityId(Request);
            var (code, body) = await _inbound.IngestJournalEntryAsync(facilityId, dto, ct);
            return StatusCode(code, body);
        }

        [HttpPost("service-catalog")]
        public IActionResult ServiceCatalog([FromBody] System.Text.Json.JsonElement body)
        {
            var (ok, error) = _catalog.ApplyIntegrationPayload(body);
            if (!ok)
                return BadRequest(new { error = error ?? "Invalid catalog payload." });
            return Ok(new { status = "updated", generated_at = _catalog.CacheTimestamp });
        }

        [HttpPost("products")]
        public async Task<IActionResult> SyncProducts([FromBody] HmsProductSyncDto dto, CancellationToken ct)
        {
            var facilityId = _inbound.ParseFacilityId(Request, dto.FacilityId);
            var result = await _inbound.SyncProductsAsync(facilityId, dto, ct);
            return Ok(result);
        }

        [HttpPost("fixed-asset")]
        public async Task<IActionResult> FixedAsset([FromBody] HmsFixedAssetIngestDto dto, [FromServices] IAssetService assets, CancellationToken ct)
        {
            var facilityId = _inbound.ParseFacilityId(Request, dto.FacilityId.GetValueOrDefault(0));
            var userId = await _ctx.ResolveSystemUserIdAsync(ct);
            var (code, body) = await assets.IngestFromHmsAsync(facilityId, dto, userId, ct);
            return StatusCode(code, body);
        }

        [HttpPost("outbox/process")]
        public async Task<IActionResult> ProcessOutbox([FromQuery] int limit = 50, CancellationToken ct = default)
        {
            var (sent, failed) = await _outbound.DeliverOutboxAsync(limit, ct);
            return Ok(new { sent, failed });
        }
    }
}
