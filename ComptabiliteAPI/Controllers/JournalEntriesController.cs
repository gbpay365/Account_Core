using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using System.Text.Json;
using ComptabiliteAPI.Domain.Entities;
using ComptabiliteAPI.Domain.Interfaces;
using ComptabiliteAPI.Middleware;
using ComptabiliteAPI.Filters;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ComptabiliteAPI.Controllers
{
    [ApiController]
    [Route("api/journal-entries")]
    [Route("api/v1/journal-entries")]
    [Authorize]
    [ServiceFilter(typeof(CompanyMembershipActionFilter))]
    public class JournalEntriesController : ControllerBase
    {
        private readonly IJournalEntryService _journalService;
        private readonly IImmutableAuditService _audit;
        private readonly ICostCenterService _costCenters;

        public JournalEntriesController(
            IJournalEntryService journalService,
            IImmutableAuditService audit,
            ICostCenterService costCenters)
        {
            _journalService = journalService;
            _audit = audit;
            _costCenters = costCenters;
        }

        [HttpGet]
        [RequirePermission("journal", "read")]
        public async Task<IActionResult> GetEntries(Guid companyId)
        {
            try
            {
                var entries = await _journalService.GetEntriesAsync(companyId);
                var result = entries.Select(e => new
                {
                    e.Id,
                    e.EntryDate,
                    e.Description,
                    journalType = e.JournalType,
                    e.Reference,
                    e.FiscalYear,
                    e.FiscalPeriod,
                    e.CurrencyCode,
                    e.ExchangeRate,
                    e.Validated,
                    e.Voided,
                    e.Status,
                    e.RejectionReason,
                    e.JournalId,
                    e.CreatedAt,
                    e.CompanyId,
                    CreatedBy = e.CreatedBy == null ? null : new { e.CreatedBy.Id, e.CreatedBy.FullName, e.CreatedBy.Email },
                    Lines = e.JournalLines?.Select(l => new
                    {
                        l.Id,
                        l.AccountCode,
                        l.LineDescription,
                        l.CostCentre,
                        l.TaxCode,
                        l.TaxAmount,
                        l.Debit,
                        l.Credit
                    })
                });
                return Ok(result);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpGet("{id:guid}")]
        [RequirePermission("journal", "read")]
        public async Task<IActionResult> GetById([FromRoute] Guid id, [FromQuery] Guid companyId)
        {
            var e = await _journalService.GetEntryByIdAsync(id, companyId);
            if (e == null) return NotFound(new { error = "Journal entry not found." });
            return Ok(new
            {
                id = e.Id,
                entryDate = e.EntryDate,
                journalType = e.JournalType,
                description = e.Description,
                reference = e.Reference,
                fiscalYear = e.FiscalYear,
                fiscalPeriod = e.FiscalPeriod,
                currencyCode = e.CurrencyCode,
                exchangeRate = e.ExchangeRate,
                validated = e.Validated,
                voided = e.Voided,
                status = e.Status,
                rejectionReason = e.RejectionReason,
                journalId = e.JournalId,
                createdAt = e.CreatedAt,
                companyId = e.CompanyId,
                totalDebits = e.JournalLines?.Sum(l => l.Debit) ?? 0,
                totalCredits = e.JournalLines?.Sum(l => l.Credit) ?? 0,
                lines = e.JournalLines?.Select(l => new
                {
                    l.Id,
                    accountCode = l.AccountCode,
                    lineDescription = l.LineDescription,
                    costCentre = l.CostCentre,
                    taxCode = l.TaxCode,
                    taxAmount = l.TaxAmount,
                    debit = l.Debit,
                    credit = l.Credit
                })
            });
        }

        [HttpPost]
        [RequirePermission("journal", "write")]
        public async Task<IActionResult> CreateEntry([FromBody] JournalEntryCreateDto dto)
        {
            var userIdStr = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(userIdStr) || !Guid.TryParse(userIdStr, out var userId))
                return Unauthorized();

            var jt = (dto.JournalType ?? "JNL").Trim().ToUpperInvariant();
            if (jt == "SLB")
            {
                return BadRequest(new { error = "Journal type SLB is system-generated from sub-ledger import; it cannot be created from this form." });
            }

            var d = DateTime.SpecifyKind(dto.EntryDate, DateTimeKind.Unspecified);
            var fiscalYear = dto.FiscalYear is > 0 ? (short)dto.FiscalYear!.Value : (short)d.Year;
            var fiscalPeriod = dto.FiscalPeriod is > 0 and <= 13 ? (short)dto.FiscalPeriod!.Value : (short)d.Month;

            var refVal = (dto.Reference ?? string.Empty).Trim();
            var desc = (dto.Description ?? string.Empty).Trim();
            if (string.IsNullOrEmpty(desc) && string.IsNullOrEmpty(refVal)) desc = "Journal entry";
            else if (string.IsNullOrEmpty(desc)) desc = refVal;

            var entry = new JournalEntry
            {
                EntryDate   = d,
                Description = desc,
                CompanyId   = dto.CompanyId,
                CreatedById = userId,
                JournalType = jt,
                Reference   = string.IsNullOrEmpty(refVal) ? null : refVal,
                FiscalYear  = fiscalYear,
                FiscalPeriod = fiscalPeriod,
                CurrencyCode = string.IsNullOrWhiteSpace(dto.CurrencyCode) ? "XAF" : dto.CurrencyCode.Trim().ToUpperInvariant(),
                ExchangeRate = dto.ExchangeRate is > 0 ? dto.ExchangeRate!.Value : 1m,
                JournalLines = dto.Lines.Select(l => new JournalLine
                {
                    AccountCode = l.AccountCode.Trim(),
                    Debit  = l.Debit,
                    Credit = l.Credit,
                    LineDescription = string.IsNullOrWhiteSpace(l.LineDescription) ? null : l.LineDescription?.Trim(),
                    CostCentre = string.IsNullOrWhiteSpace(l.CostCentre) ? null : l.CostCentre?.Trim().ToUpperInvariant(),
                    TaxCode = string.IsNullOrWhiteSpace(l.TaxCode) ? null : l.TaxCode?.Trim(),
                    TaxAmount = l.TaxAmount ?? 0m
                }).ToList()
            };

            var costCentreError = await _costCenters.GetJournalLineCostCenterValidationErrorAsync(
                dto.CompanyId,
                dto.Lines.Select(l => (l.CostCentre, l.Debit, l.Credit)));
            if (costCentreError != null)
                return BadRequest(new { error = costCentreError });

            try
            {
                var analytics = dto.Lines.Select(l => l.AnalyticAccountId).ToList();
                var created = await _journalService.CreateEntryAsync(entry, analytics);
                var ip = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "";
                await _audit.LogAsync(userId, created.CompanyId, "journal_entry.created", nameof(JournalEntry), created.Id.ToString(),
                    JsonSerializer.Serialize(new { created.EntryDate, created.JournalType, created.Description }), ip);
                return CreatedAtAction(nameof(GetById), new { id = created.Id, companyId = created.CompanyId }, new
                {
                    id = created.Id,
                    created.EntryDate,
                    created.JournalType,
                    created.Description,
                    created.Validated,
                    created.CreatedAt,
                    created.CompanyId,
                    Lines = created.JournalLines?.Select(l => new
                    {
                        l.Id,
                        l.AccountCode,
                        l.Debit,
                        l.Credit
                    })
                });
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { error = ex.Message });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpPatch("{id:guid}/submit")]
        [RequirePermission("journal", "write")]
        public async Task<IActionResult> SubmitEntry(Guid id)
        {
            try
            {
                var entry = await _journalService.SubmitEntryAsync(id);
                if (entry == null) return NotFound(new { error = "Journal entry not found." });
                return Ok(new { entry.Id, entry.Status, message = "Entry submitted for validation." });
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        [HttpPatch("{id:guid}/reject")]
        [RequirePermission("journal", "write")]
        public async Task<IActionResult> RejectEntry(Guid id, [FromBody] RejectEntryRequest body)
        {
            try
            {
                var reason = body?.Reason ?? "Rejected by validator";
                var entry = await _journalService.RejectEntryAsync(id, reason);
                if (entry == null) return NotFound(new { error = "Journal entry not found." });
                return Ok(new { entry.Id, entry.Status, entry.RejectionReason, message = "Entry rejected." });
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        [HttpPatch("{id:guid}/validate")]
        [RequirePermission("journal", "write")]
        public async Task<IActionResult> ValidateEntry(Guid id)
        {
            try
            {
                var userIdStr2 = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                if (string.IsNullOrEmpty(userIdStr2) || !Guid.TryParse(userIdStr2, out var uid2))
                    return Unauthorized();
                var entry = await _journalService.ValidateEntryAsync(id);
                if (entry == null) return NotFound(new { error = "Journal entry not found." });
                var ip2 = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "";
                await _audit.LogAsync(uid2, entry.CompanyId, "journal_entry.validated", nameof(JournalEntry), entry.Id.ToString(), "{}", ip2);
                return Ok(new { entry.Id, entry.Validated, entry.Description, message = "Entry validated successfully." });
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { error = ex.Message });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpPut("{id:guid}/post")]
        [RequirePermission("journal", "write")]
        public async Task<IActionResult> PostEntry([FromRoute] Guid id) => await ValidateEntry(id);

        [HttpPost("{id:guid}/void")]
        [HttpPut("{id:guid}/void")]
        [RequirePermission("journal", "write")]
        public async Task<IActionResult> VoidEntry(Guid id)
        {
            var userIdStr = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(userIdStr) || !Guid.TryParse(userIdStr, out var userId))
                return Unauthorized();
            if (!HttpContext.Items.TryGetValue(CompanyMembershipActionFilter.ResolvedCompanyIdItemKey, out var o) || o is not Guid companyId)
            {
                return BadRequest(new { error = "Company context is required. Use ?companyId=, header X-Company-Id, or a default company for your user." });
            }

            try
            {
                var entry = await _journalService.VoidEntryAsync(id, companyId);
                if (entry == null) return NotFound(new { error = "Journal entry not found." });
                var ip = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "";
                await _audit.LogAsync(userId, entry.CompanyId, "journal_entry.voided", nameof(JournalEntry), entry.Id.ToString(), "{}", ip);
                return Ok(new { entry.Id, entry.Voided, message = "Journal entry voided." });
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { error = ex.Message });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpPost("{id:guid}/reverse")]
        [RequirePermission("journal", "write")]
        public async Task<IActionResult> ReverseEntry([FromRoute] Guid id, [FromBody] ReverseRequest? body)
        {
            var userIdStr = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(userIdStr) || !Guid.TryParse(userIdStr, out var userId))
                return Unauthorized();
            if (!HttpContext.Items.TryGetValue(CompanyMembershipActionFilter.ResolvedCompanyIdItemKey, out var o) || o is not Guid companyId)
            {
                return BadRequest(new { error = "Company context is required." });
            }
            if (body == null || !DateTime.TryParse(body.ReversalDate, out var revDate))
                return BadRequest(new { error = "A valid reversalDate (ISO) is required." });
            if (body.FiscalYear is { } y && (y < 0 || y > 3000)) return BadRequest(new { error = "Invalid fiscalYear." });
            if (body.FiscalPeriod is { } p && (p < 0 || p > 13)) return BadRequest(new { error = "Invalid fiscalPeriod (0-13, 0=auto)." });

            try
            {
                var original = await _journalService.GetEntryByIdAsync(id, companyId);
                if (original == null) return NotFound(new { error = "Journal entry not found." });
                if (original.CompanyId != companyId)
                    return BadRequest(new { error = "Company mismatch for reversal." });

                var newId = await _journalService.CreateReversalEntryAsync(
                    id, revDate,
                    body.FiscalYear is > 0 ? body.FiscalYear.Value : (short)0,
                    body.FiscalPeriod is > 0 ? body.FiscalPeriod.Value : (short)0,
                    userId);

                return CreatedAtAction(nameof(GetById), new { id = newId, companyId },
                    new { id = newId, reversalId = newId, message = "Reversal created and posted." });
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { error = ex.Message });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        public record ReverseRequest(string? ReversalDate, short? FiscalYear, short? FiscalPeriod);
        public record RejectEntryRequest(string? Reason);
    }

    public class JournalEntryCreateDto
    {
        [Required] public DateTime EntryDate { get; set; }

        [StringLength(500)]
        public string? Description { get; set; }

        [StringLength(50)]
        public string? Reference { get; set; }

        [StringLength(10)]
        public string? JournalType { get; set; }

        [Range(0, 2099)] public int? FiscalYear { get; set; }
        [Range(0, 13)] public int? FiscalPeriod { get; set; }

        [StringLength(3, MinimumLength = 3)]
        public string? CurrencyCode { get; set; }
        [Range(0.0000001, 999_999.999999)]
        public decimal? ExchangeRate { get; set; }

        [Required] public Guid CompanyId { get; set; }

        [Required, MinLength(2, ErrorMessage = "A journal entry must have at least 2 lines.")]
        public List<JournalLineCreateDto> Lines { get; set; } = new();
    }

    public class JournalLineCreateDto
    {
        [Required, StringLength(20, MinimumLength = 1)]
        public string AccountCode { get; set; } = string.Empty;

        [Range(0, 999999999999, ErrorMessage = "Debit must be non-negative.")]
        public decimal Debit { get; set; }

        [Range(0, 999999999999, ErrorMessage = "Credit must be non-negative.")]
        public decimal Credit { get; set; }

        [StringLength(255)] public string? LineDescription { get; set; }
        [StringLength(20)] public string? CostCentre { get; set; }
        [StringLength(10)] public string? TaxCode { get; set; }
        [Range(0, 999999999999)]
        public decimal? TaxAmount { get; set; }
        public Guid? AnalyticAccountId { get; set; }
    }
}
