using ComptabiliteAPI.Configuration;
using ComptabiliteAPI.Domain.Interfaces;
using ComptabiliteAPI.Infrastructure.Reporting;
using ComptabiliteAPI.Infrastructure.Services;
using ComptabiliteAPI.Middleware;
using ComptabiliteAPI.DTOs;
using ComptabiliteAPI.Filters;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using System.Linq;
using System.Security.Claims;

namespace ComptabiliteAPI.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
[ServiceFilter(typeof(CompanyMembershipActionFilter))]
public class ComplianceController : ControllerBase
{
    private readonly ComplianceReconciliationService _recon;
    private readonly ILegalWormService _worm;
    private readonly IFiscalPeriodService _fiscal;
    private readonly IImmutableAuditService _audit;
    private readonly IOptions<ComplianceOptions> _opts;

    public ComplianceController(
        ComplianceReconciliationService recon,
        ILegalWormService worm,
        IFiscalPeriodService fiscal,
        IImmutableAuditService audit,
        IOptions<ComplianceOptions> opts)
    {
        _recon = recon;
        _worm = worm;
        _fiscal = fiscal;
        _audit = audit;
        _opts = opts;
    }

    [HttpGet("liasse-mappings")]
    [RequirePermission("balance_sheet", "read")]
    public ActionResult<IReadOnlyList<LiasseLineMapDto>> GetLiasseMappings([FromQuery] string jurisdiction = "CM") =>
        Ok(CameroonLiasseLineCatalog.ForJurisdiction(jurisdiction));

    [HttpGet("reconciliation")]
    [RequirePermission("balance_sheet", "read")]
    public async Task<ActionResult<ComplianceReconciliationDto>> GetReconciliation(
        int fiscalYear,
        Guid companyId,
        CancellationToken cancellationToken) =>
        Ok(await _recon.BuildAsync(fiscalYear, companyId, cancellationToken));

    [HttpGet("worm-entries")]
    [RequirePermission("balance_sheet", "read")]
    public async Task<IActionResult> ListWormEntries([FromQuery] Guid companyId, [FromQuery] int take = 100, CancellationToken ct = default)
    {
        var entries = await _worm.ListEntriesAsync(companyId, take, ct);
        var dto = entries.Select(e => new WormEntryDto
        {
            Id = e.Id,
            Timestamp = e.TimestampUtc,
            ResourceType = e.EntityType,
            ResourceId = e.EntityId,
            ContentHash = e.PayloadHash,
            MetadataJson = e.PayloadCanonicalJson,
        }).ToList();

        return Ok(dto);
    }

    [HttpGet("fiscal-locks")]
    [RequirePermission("balance_sheet", "read")]
    public async Task<IActionResult> ListLocks([FromQuery] Guid companyId, CancellationToken ct)
        => Ok(await _fiscal.GetLocksAsync(companyId, ct));

    [HttpGet("audit")]
    [RequirePermission("balance_sheet", "read")]
    public async Task<IActionResult> QueryAudit([FromQuery] Guid? companyId, [FromQuery] int take = 100, CancellationToken ct = default)
        => Ok(await _audit.QueryAsync(companyId, take, ct));

    [HttpPost("worm-entries")]
    [RequirePermission("balance_sheet", "edit")]
    public async Task<IActionResult> RegisterWormEntry([FromBody] RegisterWormEntryRequest req, CancellationToken ct)
    {
        var userIdStr = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        Guid? userId = Guid.TryParse(userIdStr, out var parsed) ? parsed : null;

        var entry = await _worm.RegisterEntryAsync(req.CompanyId, userId, req.ResourceType, req.ResourceId, req.ContentHash, req.MetadataJson, ct);
        var dto = new WormEntryDto
        {
            Id = entry.Id,
            Timestamp = entry.TimestampUtc,
            ResourceType = entry.EntityType,
            ResourceId = entry.EntityId,
            ContentHash = entry.PayloadHash,
            MetadataJson = entry.PayloadCanonicalJson,
        };

        return CreatedAtAction(nameof(ListWormEntries), new { companyId = req.CompanyId }, dto);
    }

    [HttpPost("fiscal-locks")]
    [RequirePermission("balance_sheet", "edit")]
    public async Task<IActionResult> LockFiscalPeriod([FromBody] LockFiscalPeriodRequest req, CancellationToken ct)
    {
        var userIdStr = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (!Guid.TryParse(userIdStr, out var userId)) return Unauthorized();

        var lockEntry = await _fiscal.LockPeriodAsync(req.CompanyId, req.FiscalYear, req.FiscalMonth, userId, req.Notes, ct);
        return Ok(lockEntry);
    }

    [HttpGet("options")]
    public ActionResult<object> GetComplianceOptions() =>
        Ok(new
        {
            ecfXmlSchemaVersion = _opts.Value.EcfXmlSchemaVersion,
            dgiStubMode = _opts.Value.DgiStubMode,
        });
}
