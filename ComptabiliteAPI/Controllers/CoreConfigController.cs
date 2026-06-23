using System.Security.Claims;
using ComptabiliteAPI.Domain.Entities;
using ComptabiliteAPI.DTOs;
using ComptabiliteAPI.Filters;
using ComptabiliteAPI.Infrastructure.Data;
using ComptabiliteAPI.Infrastructure.Services;
using ComptabiliteAPI.Middleware;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ComptabiliteAPI.Controllers
{
    [ApiController]
    [Route("api/core")]
    [Authorize]
    [ServiceFilter(typeof(CompanyMembershipActionFilter))]
    public class CoreConfigController : ControllerBase
    {
        private readonly AppDbContext _db;

        public CoreConfigController(AppDbContext db) => _db = db;

        // ─── Currencies ───────────────────────────────────────────────────────

        [HttpGet("currencies")]
        [RequirePermission("dashboard", "read")]
        public async Task<IActionResult> ListCurrencies([FromQuery] Guid companyId, CancellationToken ct)
        {
            var rows = await _db.Currencies.AsNoTracking()
                .Where(c => c.CompanyId == companyId)
                .OrderByDescending(c => c.IsDefault).ThenBy(c => c.Code)
                .Select(c => new CurrencyDto
                {
                    Id = c.Id, CompanyId = c.CompanyId, Code = c.Code, Name = c.Name,
                    Symbol = c.Symbol, ExchangeRate = c.ExchangeRate,
                    IsDefault = c.IsDefault, IsActive = c.IsActive
                })
                .ToListAsync(ct);
            return Ok(rows);
        }

        [HttpPost("currencies")]
        [RequirePermission("dashboard", "edit")]
        public async Task<IActionResult> CreateCurrency([FromBody] CreateCurrencyRequest req, CancellationToken ct)
        {
            var code = req.Code.Trim().ToUpperInvariant();
            if (await _db.Currencies.AnyAsync(c => c.CompanyId == req.CompanyId && c.Code == code, ct))
                return BadRequest(new { error = $"Currency {code} already exists." });

            if (req.IsDefault)
            {
                var existing = await _db.Currencies.Where(c => c.CompanyId == req.CompanyId && c.IsDefault).ToListAsync(ct);
                foreach (var c in existing) c.IsDefault = false;
            }

            var entity = new Currency
            {
                CompanyId = req.CompanyId,
                Code = code,
                Name = req.Name.Trim(),
                Symbol = (req.Symbol ?? code).Trim(),
                ExchangeRate = req.ExchangeRate > 0 ? req.ExchangeRate : 1m,
                IsDefault = req.IsDefault,
                IsActive = true
            };
            await _db.Currencies.AddAsync(entity, ct);
            await _db.SaveChangesAsync(ct);
            return Ok(new CurrencyDto
            {
                Id = entity.Id, CompanyId = entity.CompanyId, Code = entity.Code,
                Name = entity.Name, Symbol = entity.Symbol, ExchangeRate = entity.ExchangeRate,
                IsDefault = entity.IsDefault, IsActive = entity.IsActive
            });
        }

        // ─── Fiscal Years & Periods ───────────────────────────────────────────

        [HttpGet("fiscal-years")]
        [RequirePermission("dashboard", "read")]
        public async Task<IActionResult> ListFiscalYears([FromQuery] Guid companyId, CancellationToken ct)
        {
            var years = await _db.FiscalYears.AsNoTracking()
                .Include(fy => fy.Periods)
                .Where(fy => fy.CompanyId == companyId)
                .OrderByDescending(fy => fy.Year)
                .ToListAsync(ct);

            return Ok(years.Select(fy => new FiscalYearDto
            {
                Id = fy.Id, CompanyId = fy.CompanyId, Year = fy.Year,
                StartDate = fy.StartDate, EndDate = fy.EndDate,
                IsClosed = fy.IsClosed, IsCurrent = fy.IsCurrent,
                Periods = fy.Periods.OrderBy(p => p.Number).Select(p => new PeriodDto
                {
                    Id = p.Id, FiscalYearId = p.FiscalYearId, Number = p.Number,
                    Name = p.Name, StartDate = p.StartDate, EndDate = p.EndDate, IsClosed = p.IsClosed
                }).ToList()
            }));
        }

        [HttpPost("fiscal-years")]
        [RequirePermission("dashboard", "edit")]
        public async Task<IActionResult> CreateFiscalYear([FromBody] CreateFiscalYearRequest req, CancellationToken ct)
        {
            if (await _db.FiscalYears.AnyAsync(fy => fy.CompanyId == req.CompanyId && fy.Year == req.Year, ct))
                return BadRequest(new { error = $"Fiscal year {req.Year} already exists." });

            var fy = await CoreConfigSeeder.CreateFiscalYearWithPeriodsAsync(_db, req.CompanyId, req.Year, req.IsCurrent);
            if (req.StartDate.HasValue) fy.StartDate = req.StartDate.Value;
            if (req.EndDate.HasValue) fy.EndDate = req.EndDate.Value;
            await _db.SaveChangesAsync(ct);

            return Ok(new FiscalYearDto
            {
                Id = fy.Id, CompanyId = fy.CompanyId, Year = fy.Year,
                StartDate = fy.StartDate, EndDate = fy.EndDate,
                IsClosed = fy.IsClosed, IsCurrent = fy.IsCurrent
            });
        }

        [HttpPatch("periods/{id:guid}/close")]
        [RequirePermission("dashboard", "edit")]
        public async Task<IActionResult> ClosePeriod(Guid id, CancellationToken ct)
        {
            var period = await _db.Periods.FindAsync(new object[] { id }, ct);
            if (period == null) return NotFound();
            period.IsClosed = true;
            await _db.SaveChangesAsync(ct);
            return Ok(new { period.Id, period.IsClosed });
        }

        // ─── Accounting Journals ──────────────────────────────────────────────

        [HttpGet("journals")]
        [RequirePermission("journal", "read")]
        public async Task<IActionResult> ListJournals([FromQuery] Guid companyId, CancellationToken ct)
        {
            var rows = await _db.AccountingJournals.AsNoTracking()
                .Where(j => j.CompanyId == companyId)
                .OrderBy(j => j.Code)
                .Select(j => new AccountingJournalDto
                {
                    Id = j.Id, CompanyId = j.CompanyId, Code = j.Code, Name = j.Name,
                    Type = j.Type, DefaultDebitAccountCode = j.DefaultDebitAccountCode,
                    DefaultCreditAccountCode = j.DefaultCreditAccountCode, IsActive = j.IsActive
                })
                .ToListAsync(ct);
            return Ok(rows);
        }

        [HttpPost("journals")]
        [RequirePermission("journal", "write")]
        public async Task<IActionResult> CreateJournal([FromBody] CreateAccountingJournalRequest req, CancellationToken ct)
        {
            var code = req.Code.Trim().ToUpperInvariant();
            if (await _db.AccountingJournals.AnyAsync(j => j.CompanyId == req.CompanyId && j.Code == code, ct))
                return BadRequest(new { error = $"Journal {code} already exists." });

            var entity = new AccountingJournal
            {
                CompanyId = req.CompanyId,
                Code = code,
                Name = req.Name.Trim(),
                Type = req.Type.Trim(),
                DefaultDebitAccountCode = string.IsNullOrWhiteSpace(req.DefaultDebitAccountCode) ? null : req.DefaultDebitAccountCode.Trim(),
                DefaultCreditAccountCode = string.IsNullOrWhiteSpace(req.DefaultCreditAccountCode) ? null : req.DefaultCreditAccountCode.Trim(),
                IsActive = true
            };
            await _db.AccountingJournals.AddAsync(entity, ct);
            await _db.SaveChangesAsync(ct);
            return Ok(new AccountingJournalDto
            {
                Id = entity.Id, CompanyId = entity.CompanyId, Code = entity.Code,
                Name = entity.Name, Type = entity.Type,
                DefaultDebitAccountCode = entity.DefaultDebitAccountCode,
                DefaultCreditAccountCode = entity.DefaultCreditAccountCode,
                IsActive = entity.IsActive
            });
        }

        [HttpPut("journals/{id:guid}")]
        [RequirePermission("journal", "write")]
        public async Task<IActionResult> UpdateJournal(Guid id, [FromBody] CreateAccountingJournalRequest req, CancellationToken ct)
        {
            var entity = await _db.AccountingJournals.FirstOrDefaultAsync(j => j.Id == id && j.CompanyId == req.CompanyId, ct);
            if (entity == null) return NotFound();
            entity.Name = req.Name.Trim();
            entity.Type = req.Type.Trim();
            entity.DefaultDebitAccountCode = string.IsNullOrWhiteSpace(req.DefaultDebitAccountCode) ? null : req.DefaultDebitAccountCode.Trim();
            entity.DefaultCreditAccountCode = string.IsNullOrWhiteSpace(req.DefaultCreditAccountCode) ? null : req.DefaultCreditAccountCode.Trim();
            await _db.SaveChangesAsync(ct);
            return Ok(new AccountingJournalDto
            {
                Id = entity.Id, CompanyId = entity.CompanyId, Code = entity.Code,
                Name = entity.Name, Type = entity.Type,
                DefaultDebitAccountCode = entity.DefaultDebitAccountCode,
                DefaultCreditAccountCode = entity.DefaultCreditAccountCode,
                IsActive = entity.IsActive
            });
        }

        [HttpPost("seed-defaults")]
        [RequirePermission("dashboard", "edit")]
        public async Task<IActionResult> SeedDefaults([FromQuery] Guid companyId, CancellationToken ct)
        {
            await CoreConfigSeeder.SeedCompanyDefaultsAsync(_db, companyId);
            return Ok(new { seeded = true });
        }
    }

    [ApiController]
    [Route("api/reconciliation")]
    [Authorize]
    [ServiceFilter(typeof(CompanyMembershipActionFilter))]
    public class ReconciliationController : ControllerBase
    {
        private readonly AppDbContext _db;
        private readonly ReconciliationCandidateService _candidates;

        public ReconciliationController(AppDbContext db, ReconciliationCandidateService candidates)
        {
            _db = db;
            _candidates = candidates;
        }

        [HttpGet]
        [RequirePermission("finance", "read")]
        public async Task<IActionResult> List([FromQuery] Guid companyId, [FromQuery] string? type, CancellationToken ct)
        {
            var q = _db.Reconciliations.AsNoTracking().Where(r => r.CompanyId == companyId);
            if (!string.IsNullOrWhiteSpace(type))
                q = q.Where(r => r.Type == type.Trim().ToUpperInvariant());
            var rows = await q.OrderByDescending(r => r.CreatedAt)
                .Select(r => new ReconciliationDto
                {
                    Id = r.Id, CompanyId = r.CompanyId, Type = r.Type,
                    SourceEntityType = r.SourceEntityType, SourceEntityId = r.SourceEntityId,
                    TargetEntityType = r.TargetEntityType, TargetEntityId = r.TargetEntityId,
                    Amount = r.Amount, Discrepancy = r.Discrepancy,
                    Status = r.Status, Notes = r.Notes, CreatedAt = r.CreatedAt
                })
                .ToListAsync(ct);
            return Ok(rows);
        }

        [HttpGet("candidates")]
        [RequirePermission("finance", "read")]
        public async Task<IActionResult> GetCandidates([FromQuery] Guid companyId, [FromQuery] string type = "AR", CancellationToken ct = default)
        {
            var workbench = await _candidates.GetWorkbenchAsync(companyId, type, ct);
            return Ok(workbench);
        }

        [HttpPost]
        [RequirePermission("finance", "write")]
        public async Task<IActionResult> Create([FromBody] CreateReconciliationRequest req, CancellationToken ct)
        {
            var userIdStr = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (!Guid.TryParse(userIdStr, out var userId))
                return Unauthorized();

            var status = Math.Abs(req.Discrepancy) < 0.01m ? "Matched" : "Partial";
            var entity = new Reconciliation
            {
                CompanyId = req.CompanyId,
                Type = req.Type.Trim().ToUpperInvariant(),
                SourceEntityType = req.SourceEntityType,
                SourceEntityId = req.SourceEntityId,
                TargetEntityType = req.TargetEntityType,
                TargetEntityId = req.TargetEntityId,
                Amount = req.Amount,
                Discrepancy = req.Discrepancy,
                Status = status,
                Notes = req.Notes,
                CreatedById = userId
            };
            await _db.Reconciliations.AddAsync(entity, ct);

            await _candidates.ApplyMatchAsync(req, ct);
            await _db.SaveChangesAsync(ct);

            return Ok(new ReconciliationDto
            {
                Id = entity.Id, CompanyId = entity.CompanyId, Type = entity.Type,
                SourceEntityType = entity.SourceEntityType, SourceEntityId = entity.SourceEntityId,
                TargetEntityType = entity.TargetEntityType, TargetEntityId = entity.TargetEntityId,
                Amount = entity.Amount, Discrepancy = entity.Discrepancy,
                Status = entity.Status, Notes = entity.Notes, CreatedAt = entity.CreatedAt
            });
        }
    }
}
