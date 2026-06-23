using System.ComponentModel.DataAnnotations;
using ComptabiliteAPI.Domain;
using ComptabiliteAPI.Domain.Entities;
using ComptabiliteAPI.Domain.Interfaces;
using ComptabiliteAPI.Filters;
using ComptabiliteAPI.Infrastructure.CostCenters;
using ComptabiliteAPI.Middleware;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ComptabiliteAPI.Controllers
{
    [ApiController]
    [Route("api/cost-centers")]
    [Route("api/v1/cost-centers")]
    [Authorize]
    [ServiceFilter(typeof(CompanyMembershipActionFilter))]
    public class CostCentersController : ControllerBase
    {
        private readonly ICostCenterService _service;

        public CostCentersController(ICostCenterService service) => _service = service;

        [HttpGet("templates")]
        [RequirePermission("journal", "read")]
        public IActionResult GetTemplateCatalog()
        {
            var list = OhadaCostCenterTemplateCatalog.All.Select(t => new
            {
                key = t.Key,
                labelEn = t.LabelEn,
                labelFr = t.LabelFr,
                ohadaNote = t.OhadaNote
            });
            return Ok(list);
        }

        [HttpGet("templates/{key}/lines")]
        [RequirePermission("journal", "read")]
        public IActionResult GetTemplateLines([FromRoute] string key)
        {
            var tpl = OhadaCostCenterTemplateCatalog.All
                .FirstOrDefault(t => string.Equals(t.Key, key, StringComparison.OrdinalIgnoreCase));
            if (tpl == null) return NotFound(new { error = "Template not found." });
            return Ok(tpl.Items.Select(i => new
            {
                code = i.Code,
                i.OhadaClass,
                i.Name,
                i.Description,
                relatedAccountCode = i.RelatedAccountCode
            }));
        }

        [HttpGet]
        [RequirePermission("journal", "read")]
        public async Task<IActionResult> ListForCompany(
            [FromQuery] Guid companyId,
            [FromQuery] bool includeInactive = false,
            CancellationToken ct = default)
        {
            var list = await _service.GetByCompanyAsync(companyId, includeInactive, ct);
            return Ok(list.Select(c => new
            {
                c.Id, c.CompanyId, c.Code, c.Name, c.Description, c.OhadaClass, c.RelatedAccountCode, c.SortOrder, c.IsActive, c.CreatedAt, c.UpdatedAt
            }));
        }

        [HttpGet("{id:guid}")]
        [RequirePermission("journal", "read")]
        public async Task<IActionResult> GetById([FromRoute] Guid id, [FromQuery] Guid companyId, CancellationToken ct = default)
        {
            var c = await _service.GetByIdAsync(id, companyId, ct);
            if (c == null) return NotFound(new { error = "Not found" });
            return Ok(new
            {
                c.Id, c.CompanyId, c.Code, c.Name, c.Description, c.OhadaClass, c.RelatedAccountCode, c.SortOrder, c.IsActive, c.CreatedAt, c.UpdatedAt
            });
        }

        [HttpPost]
        [RequirePermission("journal", "write")]
        public async Task<IActionResult> Create([FromBody] CostCenterWriteDto body, [FromQuery] Guid companyId, CancellationToken ct = default)
        {
            try
            {
                var entity = new CostCenter
                {
                    CompanyId = companyId,
                    Code = body.Code,
                    Name = body.Name,
                    Description = body.Description,
                    OhadaClass = (byte)body.OhadaClass,
                    RelatedAccountCode = string.IsNullOrWhiteSpace(body.RelatedAccountCode) ? null : body.RelatedAccountCode!.Trim().ToUpperInvariant(),
                    SortOrder = body.SortOrder
                };
                var created = await _service.CreateAsync(entity, ct);
                return CreatedAtAction(nameof(GetById), new { id = created.Id, companyId }, new { created.Id, created.Code });
            }
            catch (DbUpdateException)
            {
                return Conflict(new { error = "A cost centre with this code already exists for the company." });
            }
        }

        [HttpPut("{id:guid}")]
        [RequirePermission("journal", "write")]
        public async Task<IActionResult> Update([FromRoute] Guid id, [FromQuery] Guid companyId, [FromBody] CostCenterWriteDto body, CancellationToken ct = default)
        {
            var existing = await _service.GetByIdAsync(id, companyId, ct);
            if (existing == null) return NotFound();
            existing.Code = body.Code;
            existing.Name = body.Name;
            existing.Description = body.Description;
            existing.OhadaClass = (byte)body.OhadaClass;
            existing.RelatedAccountCode = string.IsNullOrWhiteSpace(body.RelatedAccountCode) ? null : body.RelatedAccountCode!.Trim().ToUpperInvariant();
            existing.SortOrder = body.SortOrder;
            existing.IsActive = body.IsActive;
            try
            {
                await _service.UpdateAsync(existing, companyId, ct);
                return Ok(new { id });
            }
            catch (DbUpdateException)
            {
                return Conflict(new { error = "Code conflict for this company." });
            }
        }

        [HttpPatch("{id:guid}/active")]
        [RequirePermission("journal", "write")]
        public async Task<IActionResult> SetActive([FromRoute] Guid id, [FromQuery] Guid companyId, [FromBody] SetActiveBody body, CancellationToken ct = default)
        {
            var ok = await _service.SetActiveAsync(id, companyId, body.IsActive, ct);
            if (!ok) return NotFound();
            return Ok();
        }

        [HttpPost("apply-template")]
        [RequirePermission("journal", "write")]
        public async Task<IActionResult> ApplyTemplate([FromQuery] Guid companyId, [FromBody] ApplyTemplateBody body, CancellationToken ct = default)
        {
            try
            {
                var options = new ApplyTemplateOptions
                {
                    CodePrefix = string.IsNullOrWhiteSpace(body.CodePrefix) ? null : body.CodePrefix!.Trim(),
                    EnrichNameWithCompany = body.EnrichNameWithCompany,
                    EnrichDescriptionWithCompany = body.EnrichDescriptionWithCompany,
                    UpdateExistingFromTemplate = body.UpdateExistingFromTemplate
                };
                var n = await _service.ApplyTemplateAsync(companyId, body.TemplateKey ?? string.Empty, options, ct);
                return Ok(new { added = n.Added, updated = n.Updated });
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        public class CostCenterWriteDto
        {
            [MinLength(1), MaxLength(20)] public string Code { get; set; } = string.Empty;
            [MinLength(1), MaxLength(300)] public string Name { get; set; } = string.Empty;
            [MaxLength(2000)] public string? Description { get; set; }
            [Range(1, 7)] public int OhadaClass { get; set; } = 6;
            [MaxLength(20)] public string? RelatedAccountCode { get; set; }
            public int SortOrder { get; set; }
            public bool IsActive { get; set; } = true;
        }

        public class SetActiveBody
        {
            public bool IsActive { get; set; }
        }

        public class ApplyTemplateBody
        {
            [MinLength(1), MaxLength(64)] public string? TemplateKey { get; set; }
            [MaxLength(8)] public string? CodePrefix { get; set; }
            public bool EnrichNameWithCompany { get; set; } = true;
            public bool EnrichDescriptionWithCompany { get; set; } = true;
            public bool UpdateExistingFromTemplate { get; set; }
        }
    }
}
