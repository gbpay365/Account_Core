using System.Linq;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using ComptabiliteAPI.Domain.Entities;
using ComptabiliteAPI.Domain.Interfaces;
using ComptabiliteAPI.DTOs;
using ComptabiliteAPI.Infrastructure.Data;
using ComptabiliteAPI.Infrastructure.Reporting;
using ComptabiliteAPI.Middleware;
using ComptabiliteAPI.Filters;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ComptabiliteAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    [ServiceFilter(typeof(CompanyMembershipActionFilter))]
    public class TaxDeclarationsController : ControllerBase
    {
        private readonly ITaxDeclarationService _ecf;
        private readonly AppDbContext _db;
        private readonly ITrialBalanceService _trial;
        private readonly IIncomeStatementGenerator _income;
        private readonly IBalanceSheetGenerator _balance;
        private readonly INotesGenerator _notes;
        private readonly ILegalWormService _worm;
        private readonly IFiscalPeriodService _fiscal;
        private readonly IImmutableAuditService _audit;

        public TaxDeclarationsController(
            ITaxDeclarationService ecf,
            AppDbContext db,
            ITrialBalanceService trial,
            IIncomeStatementGenerator income,
            IBalanceSheetGenerator balance,
            INotesGenerator notes,
            ILegalWormService worm,
            IFiscalPeriodService fiscal,
            IImmutableAuditService audit)
        {
            _ecf = ecf;
            _db = db;
            _trial = trial;
            _income = income;
            _balance = balance;
            _notes = notes;
            _worm = worm;
            _fiscal = fiscal;
            _audit = audit;
        }

        [HttpGet]
        [RequirePermission("ecf", "read")]
        public async Task<IActionResult> List([FromQuery] Guid companyId)
        {
            var rows = await _ecf.ListAsync(companyId);
            return Ok(rows.Select(ToTaxDeclarationDto));
        }

        [HttpGet("{id:guid}")]
        [RequirePermission("ecf", "read")]
        public async Task<IActionResult> Get(Guid id, [FromQuery] Guid companyId)
        {
            // SECURITY FIX: Verify company ownership
            var userId = GetUserIdOrUnauthorized();
            if (userId == null) return Unauthorized();

            var isMember = await _db.UserCompanies.AnyAsync(uc => uc.UserId == userId && uc.CompanyId == companyId);
            if (!isMember)
                return Forbid();

            var d = await _ecf.GetAsync(id);
            if (d == null || d.CompanyId != companyId) return NotFound();
            return Ok(ToTaxDeclarationDto(d));
        }

        /// <summary>Explicit shape so <c>declarationData</c> is always a JSON string (never dropped by serializers / jsonb quirks).</summary>
        private static object ToTaxDeclarationDto(TaxDeclaration d) => new
        {
            d.Id,
            d.CompanyId,
            d.DeclarationType,
            d.FiscalYear,
            d.PeriodMonth,
            d.PeriodQuarter,
            d.Status,
            declarationData = string.IsNullOrWhiteSpace(d.DeclarationData) ? "{}" : d.DeclarationData,
            correlationId = d.CorrelationId?.ToString(),
            d.LockedAt,
            d.FiledAt,
            d.FilingReceiptId,
            d.CreatedById,
            d.CreatedAt
        };

        [HttpPost("calculate")]
        [RequirePermission("ecf", "write")]
        public async Task<IActionResult> Calculate([FromBody] CalculateDeclarationDto dto)
        {
            var userId = GetUserIdOrUnauthorized();
            if (userId == null) return Unauthorized();
            try
            {
                var d = await _ecf.CalculateDeclarationAsync(
                    dto.CompanyId, userId.Value, dto.DeclarationType, dto.FiscalYear, dto.PeriodMonth, dto.PeriodQuarter);
                return CreatedAtAction(nameof(Get), new { id = d.Id }, new { d.Id, d.DeclarationType, d.FiscalYear, d.Status });
            }
            catch (Exception ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        [HttpGet("compliance-zip")]
        [RequirePermission("ecf", "read")]
        public async Task<IActionResult> DownloadComplianceZip(
            [FromQuery] Guid companyId,
            [FromQuery] int fiscalYear,
            CancellationToken cancellationToken)
        {
            var zip = await BuildComplianceZipAsync(companyId, fiscalYear, cancellationToken);
            if (zip == null)
                return NotFound(new { error = "No annual CIT declaration or FEC file found for this fiscal year." });
            return File(zip.Value.Zip, "application/zip", zip.Value.Filename);
        }

        [HttpGet("compliance/checklist")]
        [RequirePermission("balance_sheet", "read")]
        public async Task<IActionResult> GetComplianceChecklist(
            [FromQuery] Guid companyId,
            [FromQuery] int fiscalYear,
            [FromQuery] string jurisdiction = "CM",
            CancellationToken cancellationToken = default)
        {
            var tb = await _trial.GetTrialBalanceAsync(fiscalYear, companyId);
            var isData = await _income.GenerateAsync(fiscalYear, companyId);
            var bsData = await _balance.GenerateAsync(fiscalYear, companyId);
            var notesJson = await _notes.GenerateAsync(fiscalYear, companyId, "fr");

            var sumDebit = tb.Sum(x => x.TotalDebit);
            var sumCredit = tb.Sum(x => x.TotalCredit);
            var debitCreditOk = Math.Abs(sumDebit - sumCredit) <= 0.01m;
            var accountsWithMovement = tb.Count(x => x.TotalDebit != 0m || x.TotalCredit != 0m);

            var knownCodes = await _db.Accounts.AsNoTracking()
                .Where(a => a.FiscalYear == fiscalYear || a.FiscalYear == null)
                .Select(a => a.Code)
                .ToListAsync(cancellationToken);
            var knownSet = new HashSet<string>(knownCodes.Where(x => !string.IsNullOrWhiteSpace(x)));
            var usedCodes = await _db.JournalLines.AsNoTracking()
                .Where(l => l.Entry.CompanyId == companyId && l.Entry.EntryDate.Year == fiscalYear)
                .Select(l => l.AccountCode)
                .Distinct()
                .ToListAsync(cancellationToken);
            var orphans = usedCodes
                .Where(c => !string.IsNullOrWhiteSpace(c) && !knownSet.Contains(c))
                .OrderBy(c => c)
                .Take(100)
                .ToList();

            var assetsOk = Math.Abs(bsData.TotalAssets - bsData.TotalLiabilitiesAndEquity) <= 0.01m;
            var netIncomeLine = bsData.Equity.FirstOrDefault(x => x.Code == "13");
            var netIncomeOk = netIncomeLine != null && Math.Abs(isData.NetIncome - netIncomeLine.Amount) <= 0.01m;

            var maps = CameroonLiasseLineCatalog.ForJurisdiction(jurisdiction);
            var mappedPrefixes = maps.Select(m => m.AccountCodePrefix).Where(p => !string.IsNullOrWhiteSpace(p)).Distinct().ToList();
            var movementCodes = tb.Where(x => x.TotalDebit != 0m || x.TotalCredit != 0m).Select(x => x.AccountCode).Where(x => !string.IsNullOrWhiteSpace(x)).Distinct().ToList();
            var unmapped = movementCodes
                .Where(code => !mappedPrefixes.Any(p => code.StartsWith(p, StringComparison.Ordinal)))
                .OrderBy(code => code)
                .Take(100)
                .ToList();

            var notesOk = !string.IsNullOrWhiteSpace(notesJson) && notesJson.Trim().Length > 5 && notesJson.Trim() != "{}";

            var dto = new TaxComplianceChecklistDto
            {
                CompanyId = companyId,
                FiscalYear = fiscalYear,
                Jurisdiction = jurisdiction
            };

            dto.Preparation.Add(new TaxComplianceCheckResultDto
            {
                Code = "mapping_completeness",
                Title = "Mapping completeness (DSF/liasse lines)",
                Severity = unmapped.Count == 0 ? "info" : "warning",
                Passed = unmapped.Count == 0,
                Summary = unmapped.Count == 0 ? "All accounts with movement match a liasse mapping prefix." : $"{unmapped.Count} account codes with movement do not match any liasse mapping prefix.",
                EvidenceJson = JsonSerializer.Serialize(new { mappedPrefixes, unmappedAccountCodes = unmapped })
            });

            dto.Controls.Add(new TaxComplianceCheckResultDto
            {
                Code = "trial_balance_integrity",
                Title = "Trial balance integrity",
                Severity = debitCreditOk && orphans.Count == 0 ? "info" : "error",
                Passed = debitCreditOk && orphans.Count == 0,
                Summary = debitCreditOk
                    ? (orphans.Count == 0 ? "Debit equals credit and no orphan account codes were found." : $"Debit equals credit but {orphans.Count} orphan account codes were found.")
                    : $"Debit/credit mismatch: {sumDebit:N2} vs {sumCredit:N2}.",
                EvidenceJson = JsonSerializer.Serialize(new { sumDebit, sumCredit, accountsWithMovement, orphanAccountCodes = orphans })
            });

            dto.Controls.Add(new TaxComplianceCheckResultDto
            {
                Code = "statement_coherence",
                Title = "Statement coherence",
                Severity = assetsOk && netIncomeOk ? "info" : "error",
                Passed = assetsOk && netIncomeOk,
                Summary = assetsOk
                    ? (netIncomeOk ? "Assets = Liabilities + Equity and Net income ties to equity result line." : "Assets = Liabilities + Equity but Net income does not tie to equity result line.")
                    : $"Balance sheet is not balanced: Assets {bsData.TotalAssets:N2} vs (L+E) {bsData.TotalLiabilitiesAndEquity:N2}.",
                EvidenceJson = JsonSerializer.Serialize(new
                {
                    bsData.TotalAssets,
                    bsTotalLe = bsData.TotalLiabilitiesAndEquity,
                    netIncomeIs = isData.NetIncome,
                    netIncomeEquityLine = netIncomeLine?.Amount
                })
            });

            dto.Preparation.Add(new TaxComplianceCheckResultDto
            {
                Code = "annex_completeness",
                Title = "Annex (notes) completeness",
                Severity = notesOk ? "info" : "warning",
                Passed = notesOk,
                Summary = notesOk ? "Notes are present." : "Notes appear empty or missing for this fiscal year.",
                EvidenceJson = JsonSerializer.Serialize(new { notesTextLength = notesJson?.Length ?? 0 })
            });

            return Ok(dto);
        }

        [HttpPost("compliance/pack")]
        [RequirePermission("balance_sheet", "edit")]
        public async Task<IActionResult> GenerateCompliancePack(
            [FromBody] GenerateCompliancePackRequest req,
            CancellationToken cancellationToken)
        {
            var userId = GetUserIdOrUnauthorized();
            if (userId == null) return Unauthorized();

            var zip = await BuildComplianceZipAsync(req.CompanyId, req.FiscalYear, cancellationToken);
            if (zip == null)
                return NotFound(new { error = "No annual CIT declaration or FEC file found for this fiscal year." });

            var sha = SHA256.HashData(zip.Value.Zip);
            var shaHex = Convert.ToHexString(sha).ToLowerInvariant();

            try
            {
                await _fiscal.LockPeriodAsync(req.CompanyId, req.FiscalYear, req.LockMonth ?? 12, userId.Value, "Compliance pack generation", cancellationToken);
            }
            catch (InvalidOperationException)
            {
            }

            var resourceType = "COMPLIANCE_PACK";
            var resourceId = $"{req.CompanyId:N}:FY{req.FiscalYear}";
            var meta = JsonSerializer.Serialize(new
            {
                filename = zip.Value.Filename,
                sizeBytes = zip.Value.Zip.Length,
                sha256 = shaHex,
                fiscalYear = req.FiscalYear,
                generatedAtUtc = DateTime.UtcNow
            });

            var worm = await _worm.RegisterEntryAsync(req.CompanyId, userId, resourceType, resourceId, shaHex, meta, cancellationToken);
            var ip = HttpContext?.Connection?.RemoteIpAddress?.ToString() ?? string.Empty;
            await _audit.LogAsync(userId.Value, req.CompanyId, "GENERATE_COMPLIANCE_PACK", resourceType, resourceId, meta, ip, cancellationToken);

            Response.Headers["X-CompliancePack-SHA256"] = shaHex;
            Response.Headers["X-Worm-Entry-Id"] = worm.Id.ToString();

            return File(zip.Value.Zip, "application/zip", zip.Value.Filename);
        }

        [HttpGet("{id:guid}/attachments")]
        [RequirePermission("ecf", "read")]
        public async Task<IActionResult> ListAttachments(Guid id, [FromQuery] Guid companyId, CancellationToken cancellationToken)
        {
            var d = await _db.TaxDeclarations.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, cancellationToken);
            if (d == null || d.CompanyId != companyId) return NotFound();

            var rows = await _db.Set<TaxDeclarationAttachment>().AsNoTracking()
                .Where(a => a.TaxDeclarationId == id)
                .OrderByDescending(a => a.UploadedAt)
                .Select(a => new { a.Id, a.UploadedAt, a.FileName, a.ContentType, a.SizeBytes })
                .ToListAsync(cancellationToken);

            return Ok(rows);
        }

        [HttpPost("{id:guid}/attachments")]
        [RequirePermission("ecf", "write")]
        [RequestSizeLimit(25_000_000)]
        public async Task<IActionResult> UploadAttachment(Guid id, [FromQuery] Guid companyId, IFormFile file, CancellationToken cancellationToken)
        {
            var userId = GetUserIdOrUnauthorized();
            if (userId == null) return Unauthorized();

            var d = await _db.TaxDeclarations.FirstOrDefaultAsync(x => x.Id == id, cancellationToken);
            if (d == null || d.CompanyId != companyId) return NotFound();

            if (file == null || file.Length <= 0) return BadRequest(new { error = "File is required." });

            await using var ms = new MemoryStream();
            await file.CopyToAsync(ms, cancellationToken);
            var bytes = ms.ToArray();

            var row = new TaxDeclarationAttachment
            {
                TaxDeclarationId = id,
                FileName = file.FileName ?? "attachment",
                ContentType = string.IsNullOrWhiteSpace(file.ContentType) ? "application/octet-stream" : file.ContentType,
                SizeBytes = bytes.LongLength,
                Content = bytes
            };

            _db.Set<TaxDeclarationAttachment>().Add(row);
            await _db.SaveChangesAsync(cancellationToken);

            return CreatedAtAction(nameof(DownloadAttachment), new { attachmentId = row.Id }, new { row.Id, row.UploadedAt, row.FileName, row.ContentType, row.SizeBytes });
        }

        [HttpGet("attachments/{attachmentId:guid}/download")]
        [RequirePermission("ecf", "read")]
        public async Task<IActionResult> DownloadAttachment(Guid attachmentId, [FromQuery] Guid companyId, CancellationToken cancellationToken)
        {
            // SECURITY FIX: Verify company membership before allowing download
            var userId = GetUserIdOrUnauthorized();
            if (userId == null) return Unauthorized();

            var isMember = await _db.UserCompanies.AnyAsync(uc => uc.UserId == userId && uc.CompanyId == companyId, cancellationToken);
            if (!isMember)
                return Forbid();

            var row = await _db.Set<TaxDeclarationAttachment>().AsNoTracking().FirstOrDefaultAsync(x => x.Id == attachmentId, cancellationToken);
            if (row == null || row.Content == null || row.Content.Length == 0) return NotFound();
            var name = string.IsNullOrWhiteSpace(row.FileName) ? $"attachment_{attachmentId:N}" : row.FileName;
            return File(row.Content, row.ContentType, name);
        }

        [HttpPatch("{id:guid}/status")]
        [RequirePermission("ecf", "write")]
        public async Task<IActionResult> UpdateStatus(Guid id, [FromQuery] Guid companyId, [FromBody] UpdateDeclarationStatusDto body)
        {
            var userId = GetUserIdOrUnauthorized();
            if (userId == null) return Unauthorized();
            var existing = await _ecf.GetAsync(id, cancellationToken: default);
            if (existing == null || existing.CompanyId != companyId)
                return NotFound();
            try
            {
                var updated = await _ecf.UpdateDeclarationStatusAsync(id, userId.Value, body.Status);
                return Ok(ToTaxDeclarationDto(updated));
            }
            catch (Exception ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        [HttpPost("{id:guid}/submit-dgi")]
        [RequirePermission("ecf", "write")]
        public async Task<IActionResult> SubmitDgi(Guid id)
        {
            var userId = GetUserIdOrUnauthorized();
            if (userId == null) return Unauthorized();
            try
            {
                var result = await _ecf.SubmitToDGIAsync(id, userId.Value);
                return Ok(result);
            }
            catch (Exception ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        [HttpGet("{id:guid}/edi-xml")]
        [RequirePermission("ecf", "read")]
        public async Task<IActionResult> EdiXml(Guid id, [FromQuery] Guid companyId)
        {
            // SECURITY FIX: Verify company ownership
            var userId = GetUserIdOrUnauthorized();
            if (userId == null) return Unauthorized();

            var isMember = await _db.UserCompanies.AnyAsync(uc => uc.UserId == userId && uc.CompanyId == companyId);
            if (!isMember)
                return Forbid();

            var d = await _ecf.GetAsync(id);
            if (d == null || d.CompanyId != companyId) return NotFound();
            var xml = _ecf.BuildCitEdiXmlPackage(d);
            var bytes = Encoding.UTF8.GetBytes(xml);
            var name = $"liasse_{d.DeclarationType}_{d.FiscalYear}_{id:N}.xml";
            return File(bytes, "application/xml", name);
        }

        [HttpPost("fec/generate")]
        [RequirePermission("ecf", "write")]
        public async Task<IActionResult> GenerateFec([FromBody] GenerateFecDto dto)
        {
            var userId = GetUserIdOrUnauthorized();
            if (userId == null) return Unauthorized();
            try
            {
                var (content, filename, genId) = await _ecf.GenerateFECAsync(dto.CompanyId, userId.Value, dto.FiscalYear);
                return Ok(new { generationId = genId, filename, sizeBytes = content.Length });
            }
            catch (Exception ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        [HttpGet("fec/generations")]
        [RequirePermission("ecf", "read")]
        public async Task<IActionResult> ListFec([FromQuery] Guid companyId) =>
            Ok(await _ecf.ListFecAsync(companyId));

        [HttpGet("fec/{generationId:guid}/download")]
        [RequirePermission("ecf", "read")]
        public async Task<IActionResult> DownloadFec(Guid generationId)
        {
            var meta = await _ecf.GetFecGenerationAsync(generationId);
            if (meta == null) return NotFound();
            var bytes = await _ecf.GetFecFileAsync(generationId);
            if (bytes == null || bytes.Length == 0) return NotFound();
            var name = string.IsNullOrWhiteSpace(meta.FecFilename) ? $"FEC_{generationId:N}.txt" : meta.FecFilename;
            return File(bytes, "text/plain; charset=utf-8", name);
        }

        private Guid? GetUserIdOrUnauthorized()
        {
            var s = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            return Guid.TryParse(s, out var id) ? id : null;
        }

        private async Task<(byte[] Zip, string Filename)?> BuildComplianceZipAsync(
            Guid companyId,
            int fiscalYear,
            CancellationToken cancellationToken)
        {
            var zip = await _ecf.BuildFiscalYearComplianceZipAsync(companyId, fiscalYear, cancellationToken);
            if (zip == null) return null;
            return (zip.Value.Zip, zip.Value.Filename);
        }
    }

    public class CalculateDeclarationDto
    {
        public Guid CompanyId { get; set; }
        public string DeclarationType { get; set; } = string.Empty;
        public int FiscalYear { get; set; }
        public int? PeriodMonth { get; set; }
        public int? PeriodQuarter { get; set; }
    }

    public class GenerateFecDto
    {
        public Guid CompanyId { get; set; }
        public int FiscalYear { get; set; }
    }

    public class UpdateDeclarationStatusDto
    {
        /// <summary>reviewed | locked | adjusted (see TaxDeclarationService transitions).</summary>
        public string Status { get; set; } = string.Empty;
    }

    public class GenerateCompliancePackRequest
    {
        public Guid CompanyId { get; set; }
        public int FiscalYear { get; set; }
        public int? LockMonth { get; set; }
    }
}
