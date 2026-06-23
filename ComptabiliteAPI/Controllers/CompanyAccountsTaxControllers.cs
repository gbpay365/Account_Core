using ComptabiliteAPI.Configuration;
using ComptabiliteAPI.Domain.Entities;
using ComptabiliteAPI.Domain.Interfaces;
using ComptabiliteAPI.DTOs;
using ComptabiliteAPI.Filters;
using ComptabiliteAPI.Infrastructure.Data;
using ComptabiliteAPI.Infrastructure.Services;
using ComptabiliteAPI.Middleware;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Linq;
using System.Security.Claims;
using Microsoft.Extensions.Options;

namespace ComptabiliteAPI.Controllers
{
    // ─── Company Management (Phase 4: Multi-tenant) ──────────────────────────
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    [ServiceFilter(typeof(CompanyMembershipActionFilter))]
    public class CompaniesController : ControllerBase
    {
        private readonly AppDbContext _context;
        private readonly IRulesEngineService _rulesEngine;

        public CompaniesController(AppDbContext context, IRulesEngineService rulesEngine)
        {
            _context = context;
            _rulesEngine = rulesEngine;
        }

        [HttpGet]
        [Authorize]
        public async Task<IActionResult> GetAll()
        {
            var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(userId) || !Guid.TryParse(userId, out var uid))
                return Unauthorized();

            // SECURITY FIX: Only return companies the user is a member of
            var companyIds = await _context.UserCompanies
                .AsNoTracking()
                .Where(uc => uc.UserId == uid)
                .Select(uc => uc.CompanyId)
                .ToListAsync();

            if (companyIds.Count == 0)
                return Ok(Array.Empty<CompanyDto>());

            var companies = await _context.Companies
                .Where(c => companyIds.Contains(c.Id))
                .Select(c => new CompanyDto
                {
                    Id = c.Id,
                    Name = c.Name,
                    TaxId = c.TaxId,
                    CreatedAt = c.CreatedAt,
                    TransportAllowanceRate = c.TransportAllowanceRate,
                    HousingAllowanceRate = c.HousingAllowanceRate,
                    BenefitsInKindRate = c.BenefitsInKindRate,
                    RepresentationAllowanceRate = c.RepresentationAllowanceRate,
                    ApproveThirteenthMonth = c.ApproveThirteenthMonth,
                    ApproveSeniorityBonus = c.ApproveSeniorityBonus,
                    ApproveOvertimePay = c.ApproveOvertimePay,
                    ApproveBonuses = c.ApproveBonuses
                })
                .ToListAsync();
            return Ok(companies);
        }

        [HttpGet("{id:guid}")]
        [Authorize]
        public async Task<IActionResult> GetById(Guid id)
        {
            var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(userId) || !Guid.TryParse(userId, out var uid))
                return Unauthorized();

            var c = await _context.Companies.FindAsync(id);
            if (c == null) return NotFound();
            return Ok(new CompanyDto
            {
                Id = c.Id,
                Name = c.Name,
                TaxId = c.TaxId,
                CreatedAt = c.CreatedAt,
                TransportAllowanceRate = c.TransportAllowanceRate,
                HousingAllowanceRate = c.HousingAllowanceRate,
                BenefitsInKindRate = c.BenefitsInKindRate,
                RepresentationAllowanceRate = c.RepresentationAllowanceRate,
                ApproveThirteenthMonth = c.ApproveThirteenthMonth,
                ApproveSeniorityBonus = c.ApproveSeniorityBonus,
                ApproveOvertimePay = c.ApproveOvertimePay,
                ApproveBonuses = c.ApproveBonuses
            });
        }

        [HttpPost]
        [RequirePermission("dashboard", "read")]
        public async Task<IActionResult> Create([FromBody] CreateCompanyRequest req)
        {
            var company = new Company { Name = req.Name, TaxId = req.TaxId ?? string.Empty };
            await _context.Companies.AddAsync(company);
            await _context.SaveChangesAsync();

            // Automatically associate with the requesting user
            var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (Guid.TryParse(userId, out var uid))
            {
                var link = new UserCompany { UserId = uid, CompanyId = company.Id, AccessLevel = "admin" };
                await _context.UserCompanies.AddAsync(link);
                await _context.SaveChangesAsync();
            }

            await CoreConfigSeeder.SeedCompanyDefaultsAsync(_context, company.Id);
            await BillingSeeder.EnsureTrialSubscriptionAsync(_context, company.Id);
            await _rulesEngine.SeedDefaultRulesAsync(company.Id);

            return CreatedAtAction(nameof(GetById), new { id = company.Id },
                new CompanyDto
                {
                    Id = company.Id,
                    Name = company.Name,
                    TaxId = company.TaxId,
                    CreatedAt = company.CreatedAt,
                    TransportAllowanceRate = company.TransportAllowanceRate,
                    HousingAllowanceRate = company.HousingAllowanceRate,
                    BenefitsInKindRate = company.BenefitsInKindRate,
                    RepresentationAllowanceRate = company.RepresentationAllowanceRate,
                    ApproveThirteenthMonth = company.ApproveThirteenthMonth,
                    ApproveSeniorityBonus = company.ApproveSeniorityBonus,
                    ApproveOvertimePay = company.ApproveOvertimePay,
                    ApproveBonuses = company.ApproveBonuses
                });
        }

        public class UpdateCompanyPayrollSettingsRequest
        {
            public decimal TransportAllowanceRate { get; set; }
            public decimal HousingAllowanceRate { get; set; }
            public decimal BenefitsInKindRate { get; set; }
            public decimal RepresentationAllowanceRate { get; set; }

            public bool ApproveThirteenthMonth { get; set; }
            public bool ApproveSeniorityBonus { get; set; }
            public bool ApproveOvertimePay { get; set; }
            public bool ApproveBonuses { get; set; }
        }

        [HttpPatch("{id:guid}/payroll-settings")]
        [Authorize]
        public async Task<IActionResult> UpdatePayrollSettings(Guid id, [FromBody] UpdateCompanyPayrollSettingsRequest req)
        {
            var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(userId) || !Guid.TryParse(userId, out var uid))
                return Unauthorized();

            var c = await _context.Companies.FindAsync(id);
            if (c == null) return NotFound();

            c.TransportAllowanceRate = req.TransportAllowanceRate;
            c.HousingAllowanceRate = req.HousingAllowanceRate;
            c.BenefitsInKindRate = req.BenefitsInKindRate;
            c.RepresentationAllowanceRate = req.RepresentationAllowanceRate;
            c.ApproveThirteenthMonth = req.ApproveThirteenthMonth;
            c.ApproveSeniorityBonus = req.ApproveSeniorityBonus;
            c.ApproveOvertimePay = req.ApproveOvertimePay;
            c.ApproveBonuses = req.ApproveBonuses;

            await _context.SaveChangesAsync();
            return Ok(new { c.Id });
        }
    }

    // ─── Account Lookup (Phase 2: Chart of Accounts) ─────────────────────────
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class AccountsController : ControllerBase
    {
        private readonly AppDbContext _context;
        private readonly IChartOfAccountsService _chart;
        private readonly ICoaImportService _coaImport;
        private readonly ServiceCatalogService _catalog;

        public AccountsController(AppDbContext context, IChartOfAccountsService chart, ICoaImportService coaImport, ServiceCatalogService catalog)
        {
            _context = context;
            _chart = chart;
            _coaImport = coaImport;
            _catalog = catalog;
        }

        [HttpGet]
        public async Task<IActionResult> GetAll([FromQuery] string? search = null)
        {
            var query = _context.Accounts
                .Where(a => a.FiscalYear == null && a.IsActive && a.IsLeaf && a.Code.Length == 6)
                .AsQueryable();

            if (!string.IsNullOrWhiteSpace(search))
                query = query.Where(a => a.Code.StartsWith(search) || a.NameFr.Contains(search) || a.NameEn.Contains(search));

            var results = await query
                .OrderBy(a => a.Code)
                .Select(a => new AccountLookupDto
                {
                    Code = a.Code, NameFr = a.NameFr, NameEn = a.NameEn,
                    AccountType = a.AccountType, NormalBalance = a.NormalBalance ?? "debit",
                    IsLeaf = a.IsLeaf
                })
                .ToListAsync();

            return Ok(results);
        }

        /// <summary>All active 6-digit postable accounts for journal lines. GET api/accounts/journal?q=</summary>
        [HttpGet("journal")]
        public async Task<IActionResult> GetJournalAccounts([FromQuery] string? q = null, CancellationToken cancellationToken = default)
        {
            var query = _context.Accounts.AsNoTracking()
                .Where(a => a.FiscalYear == null && a.IsActive && a.IsLeaf && a.Code.Length == 6);

            if (!string.IsNullOrWhiteSpace(q))
            {
                var s = q.Trim();
                query = query.Where(a => a.Code.StartsWith(s) || a.NameFr.Contains(s) || a.NameEn.Contains(s));
            }

            var rows = await query
                .OrderBy(a => a.Code)
                .Select(a => new JournalAccountLookupDto
                {
                    Id = a.Id,
                    Code = a.Code,
                    NameEn = a.NameEn,
                    NameFr = a.NameFr,
                    OhadaClass = a.Class,
                    AccountType = a.AccountType,
                    NormalBalance = a.NormalBalance ?? "debit",
                })
                .ToListAsync(cancellationToken);

            return Ok(new { accounts = rows });
        }

        /// <summary>HMS service catalog prices by revenue GL account (7016xx–7066xx). GET api/accounts/service-catalog</summary>
        [HttpGet("service-catalog")]
        public IActionResult GetServiceCatalog() =>
            Ok(new { by_account_code = _catalog.LoadByAccountCode() });

        /// <summary>Full list for management (incl. non-leaf, optional inactive). GET api/accounts/chart/flat?classNo=6&amp;includeInactive=false</summary>
        [HttpGet("chart/flat")]
        [RequirePermission("journal", "read")]
        public async Task<IActionResult> GetChartFlat(
            [FromQuery] int? classNo = null,
            [FromQuery] bool includeInactive = false,
            [FromQuery] string? search = null,
            CancellationToken cancellationToken = default) =>
            Ok(await _chart.GetFlatAsync(
                classNo is >= 1 and <= 9 ? classNo : null,
                includeInactive,
                search,
                cancellationToken));

        [HttpPost]
        [RequirePermission("journal", "write")]
        public async Task<IActionResult> CreateAccount([FromBody] CreateAccountRequest request, CancellationToken cancellationToken = default)
        {
            try
            {
                var a = await _chart.CreateAsync(request, cancellationToken);
                return Ok(a);
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        [HttpPut("{code}")]
        [RequirePermission("journal", "write")]
        public async Task<IActionResult> UpdateAccount(
            [FromRoute] string code, [FromBody] UpdateAccountRequest request, CancellationToken cancellationToken = default)
        {
            try
            {
                var a = await _chart.UpdateAsync(code, request, cancellationToken);
                if (a == null) return NotFound();
                return Ok(a);
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        [HttpDelete("{code}")]
        [RequirePermission("journal", "write")]
        public async Task<IActionResult> DeleteAccount(
            [FromRoute] string code, [FromQuery] bool force = false, CancellationToken cancellationToken = default)
        {
            var r = await _chart.DeleteAsync(code, force, cancellationToken);
            if (!r.Ok) return BadRequest(new { error = r.Error, deactivated = r.Deactivated });
            return Ok(new { ok = true, deactivated = r.Deactivated });
        }

        /// <summary>Import the full SYSCOHADA chart from WYVERN (UI :5173, API :8000).</summary>
        [HttpPost("chart/import/wyvern")]
        [RequirePermission("journal", "write")]
        public async Task<IActionResult> ImportFromWyvern([FromBody] WyvernCoaImportRequest? request, CancellationToken cancellationToken = default)
        {
            try
            {
                var result = await _coaImport.ImportFromWyvernAsync(request, cancellationToken);
                return Ok(result);
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        /// <summary>Re-import the bundled OHADA 6-digit JSON chart.</summary>
        [HttpPost("chart/import/ohada")]
        [RequirePermission("journal", "write")]
        public async Task<IActionResult> ImportFromOhadaJson(CancellationToken cancellationToken = default)
        {
            try
            {
                var result = await _coaImport.ImportFromOhadaJsonAsync(cancellationToken);
                return Ok(result);
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        [HttpGet("{code}")]
        public async Task<IActionResult> GetByCode(string code)
        {
            var a = await _context.Accounts.FirstOrDefaultAsync(x => x.Code == code && x.FiscalYear == null && x.IsActive);
            if (a == null) return NotFound();
            return Ok(new AccountLookupDto
            {
                Code = a.Code, NameFr = a.NameFr, NameEn = a.NameEn,
                AccountType = a.AccountType, NormalBalance = a.NormalBalance ?? "debit", IsLeaf = a.IsLeaf
            });
        }

        /// <summary>Return chart accounts as a tree: parent = longest code that is a strict prefix (e.g. 6 → 60 → 601). GET api/accounts/chart/hierarchy?classNo=6</summary>
        [HttpGet("chart/hierarchy")]
        public async Task<IActionResult> GetHierarchy([FromQuery] int? classNo = null, [FromQuery] string? prefix = null)
        {
            var q = _context.Accounts.AsNoTracking().Where(a => a.FiscalYear == null && a.IsActive);
            if (classNo is >= 1 and <= 9) q = q.Where(a => a.Class == classNo);
            if (!string.IsNullOrWhiteSpace(prefix))
            {
                var p = prefix.Trim();
                q = q.Where(a => a.Code == p || a.Code.StartsWith(p));
            }
            var flat = await q.OrderBy(a => a.Code).ToListAsync();
            var roots = flat
                .Where(a => string.IsNullOrEmpty(GetParentCode(a, flat)))
                .OrderBy(a => a.Code)
                .ToList();
            return Ok(roots.Select(r => MapTree(r, flat)).ToList());
        }

        private static string? GetParentCode(Account a, IReadOnlyList<Account> all) =>
            all
                .Where(p => p.Code != a.Code && a.Code.StartsWith(p.Code) && a.Code.Length > p.Code.Length)
                .OrderByDescending(p => p.Code.Length)
                .Select(p => p.Code)
                .FirstOrDefault();

        private static object MapTree(Account a, IReadOnlyList<Account> all) =>
            new
            {
                a.Code, a.NameEn, a.NameFr, a.Class, a.IsLeaf,
                children = all
                    .Where(c => c.Code != a.Code && GetParentCode(c, all) == a.Code)
                    .OrderBy(c => c.Code)
                    .Select(c => MapTree(c, all))
            };
    }

    // ─── Tax Engine Controller (Phase 3: Cameroonian Tax Compliance) ─────────
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    [ServiceFilter(typeof(CompanyMembershipActionFilter))]
    public class TaxController : ControllerBase
    {
        private readonly ITrialBalanceService _tbService;
        private readonly TaxEngine _taxEngine;
        private readonly ComplianceOptions _compliance;

        public TaxController(ITrialBalanceService tbService, IOptions<ComplianceOptions> compliance)
        {
            _tbService = tbService;
            _taxEngine = new TaxEngine();
            _compliance = compliance.Value;
        }

        /// <summary>
        /// Calculates IS, TVA, and Minimum Forfaitaire Tax for the given fiscal year.
        /// Compliant with Loi de Finances Cameroun and OHADA rules.
        /// </summary>
        [HttpGet("calculate")]
        [RequirePermission("balance_sheet", "read")]
        public async Task<IActionResult> Calculate(int fiscalYear, Guid companyId, bool isLargeEnterprise = false)
        {
            var tb = await _tbService.GetTrialBalanceAsync(fiscalYear, companyId);

            decimal revenue = tb.Where(a => a.AccountCode.StartsWith("7")).Sum(a => a.Balance);
            decimal expenses = tb.Where(a => a.AccountCode.StartsWith("6")).Sum(a => a.Balance);
            decimal taxableIncome = revenue - expenses;

            var result = _taxEngine.Calculate(taxableIncome, revenue, fiscalYear, companyId.ToString(), isLargeEnterprise);
            result.Indicative = true;
            result.SchemaVersion = "1.0";
            result.LegalDisclaimer = _compliance.IndicativeTaxDisclaimer;
            return Ok(result);
        }
    }
}
