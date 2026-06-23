using System.Security.Claims;
using ComptabiliteAPI.Domain.Entities;
using ComptabiliteAPI.Domain.Interfaces;
using ComptabiliteAPI.Infrastructure.Services;
using ComptabiliteAPI.Middleware;
using ComptabiliteAPI.Filters;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ComptabiliteAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    [ServiceFilter(typeof(CompanyMembershipActionFilter))]
    public class FinanceController : ControllerBase
    {
        private readonly IFiscalPeriodService _fiscal;
        private readonly IImmutableAuditService _audit;
        private readonly IBankTreasuryService _bank;
        private readonly IAssetService _assets;
        private readonly IAgingService _aging;
        private readonly IAnalyticAccountService _analytic;
        private readonly ITaxRuleCatalogService _tax;

        public FinanceController(
            IFiscalPeriodService fiscal,
            IImmutableAuditService audit,
            IBankTreasuryService bank,
            IAssetService fixedAsset,
            IAgingService aging,
            IAnalyticAccountService analytic,
            ITaxRuleCatalogService tax)
        {
            _fiscal = fiscal;
            _audit = audit;
            _bank = bank;
            _assets = fixedAsset;
            _aging = aging;
            _analytic = analytic;
            _tax = tax;
        }

        private bool TryUserId(out Guid userId)
        {
            var s = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            return Guid.TryParse(s, out userId);
        }

        [HttpGet("bank-accounts")]
        [RequirePermission("finance", "read")]
        public async Task<IActionResult> ListBankAccounts([FromQuery] Guid companyId, CancellationToken ct)
            => Ok(await _bank.ListBankAccountsAsync(companyId, ct));

        [HttpPost("bank-accounts")]
        [RequirePermission("finance", "write")]
        public async Task<IActionResult> CreateBankAccount([FromBody] CreateBankAccountDto dto, CancellationToken ct)
        {
            try
            {
                var acc = new BankAccount
                {
                    CompanyId = dto.CompanyId,
                    Code = dto.Code.Trim(),
                    Name = dto.Name.Trim(),
                    LedgerAccountCode = dto.LedgerAccountCode.Trim(),
                    Currency = string.IsNullOrWhiteSpace(dto.Currency) ? "XAF" : dto.Currency!.Trim()
                };
                var created = await _bank.CreateBankAccountAsync(acc, ct);
                return Ok(created);
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        [HttpPost("bank-statements/import")]
        [RequirePermission("finance", "write")]
        public async Task<IActionResult> ImportStatement([FromBody] ImportBankStatementDto dto, CancellationToken ct)
        {
            try
            {
                var lines = dto.Lines.Select(l => (l.Date, l.Description ?? "", l.Amount)).ToList();
                var stmt = await _bank.ImportStatementAsync(
                    dto.BankAccountId,
                    dto.StatementDate,
                    dto.Reference ?? "",
                    dto.OpeningBalance,
                    dto.ClosingBalance,
                    lines,
                    ct);
                return Ok(new { stmt.Id, stmt.StatementDate, stmt.Reference, lineCount = stmt.Lines.Count });
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        [HttpPost("bank-statement-lines/{lineId:guid}/match")]
        [RequirePermission("finance", "write")]
        public async Task<IActionResult> MatchStatementLine(Guid lineId, [FromQuery] Guid companyId, CancellationToken ct)
        {
            var ok = await _bank.TryMatchStatementLineAsync(lineId, companyId, ct);
            return Ok(new { matched = ok });
        }

        [HttpGet("fixed-assets")]
        [RequirePermission("finance", "read")]
        public async Task<IActionResult> ListFixedAssets([FromQuery] Guid companyId, CancellationToken ct)
            => Ok(await _assets.ListAsync(companyId, ct: ct));

        [HttpPost("fixed-assets")]
        [RequirePermission("finance", "write")]
        public async Task<IActionResult> CreateFixedAsset([FromBody] CreateFixedAssetDto dto, CancellationToken ct)
        {
            try
            {
                var defaults = AssetOhadaDefaults.Resolve("equipment");
                var a = new FixedAsset
                {
                    CompanyId = dto.CompanyId,
                    Code = dto.Code.Trim(),
                    Name = dto.Name.Trim(),
                    AcquisitionDate = dto.AcquisitionDate,
                    Cost = dto.Cost,
                    ActiveCost = dto.Cost,
                    SalvageValue = dto.SalvageValue,
                    UsefulLifeMonths = dto.UsefulLifeMonths,
                    AssetAccountCode = string.IsNullOrWhiteSpace(dto.AssetAccountCode) ? defaults.AssetAccountCode : dto.AssetAccountCode.Trim(),
                    AccumulatedDepreciationAccountCode = string.IsNullOrWhiteSpace(dto.AccumulatedDepreciationAccountCode) ? defaults.AccumulatedDepreciationAccountCode : dto.AccumulatedDepreciationAccountCode.Trim(),
                    DepreciationExpenseAccountCode = string.IsNullOrWhiteSpace(dto.DepreciationExpenseAccountCode) ? defaults.DepreciationExpenseAccountCode : dto.DepreciationExpenseAccountCode.Trim(),
                };
                return Ok(await _assets.CreateAsync(a, null, ct));
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        [HttpPost("fixed-assets/{assetId:guid}/depreciation")]
        [RequirePermission("finance", "write")]
        public async Task<IActionResult> PostDepreciation(Guid assetId, [FromQuery] int periodYearMonth, CancellationToken ct)
        {
            if (!TryUserId(out var userId))
                return Unauthorized();
            try
            {
                var line = await _assets.PostMonthlyDepreciationAsync(assetId, periodYearMonth, userId, ct);
                if (line == null)
                    return Ok(new { posted = false, message = "Nothing to post (disposed, already posted, or fully depreciated)." });
                return Ok(new { posted = true, line });
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        [HttpGet("aging/ar")]
        [RequirePermission("finance", "read")]
        public async Task<IActionResult> ArAging([FromQuery] Guid companyId, [FromQuery] DateTime? asOf, CancellationToken ct)
            => Ok(await _aging.GetArAgingAsync(companyId, (asOf ?? DateTime.UtcNow).Date, ct));

        [HttpGet("aging/ap")]
        [RequirePermission("finance", "read")]
        public async Task<IActionResult> ApAging([FromQuery] Guid companyId, [FromQuery] DateTime? asOf, CancellationToken ct)
            => Ok(await _aging.GetApAgingAsync(companyId, (asOf ?? DateTime.UtcNow).Date, ct));

        [HttpGet("fiscal-locks")]
        [RequirePermission("finance", "read")]
        public async Task<IActionResult> ListLocks([FromQuery] Guid companyId, CancellationToken ct)
            => Ok(await _fiscal.GetLocksAsync(companyId, ct));

        [HttpPost("fiscal-locks")]
        [RequirePermission("finance", "write")]
        public async Task<IActionResult> LockPeriod([FromBody] LockFiscalPeriodDto dto, CancellationToken ct)
        {
            if (!TryUserId(out var userId))
                return Unauthorized();
            try
            {
                var row = await _fiscal.LockPeriodAsync(dto.CompanyId, dto.FiscalYear, dto.FiscalMonth, userId, dto.Notes ?? "", ct);
                return Ok(row);
            }
            catch (ArgumentOutOfRangeException ex)
            {
                return BadRequest(new { error = ex.Message });
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        [HttpGet("audit")]
        [RequirePermission("finance", "read")]
        public async Task<IActionResult> QueryAudit([FromQuery] Guid? companyId, [FromQuery] int take = 100, CancellationToken ct = default)
            => Ok(await _audit.QueryAsync(companyId, take, ct));

        [HttpGet("analytic-accounts")]
        [RequirePermission("finance", "read")]
        public async Task<IActionResult> ListAnalytics([FromQuery] Guid companyId, CancellationToken ct)
            => Ok(await _analytic.ListAsync(companyId, ct));

        [HttpPost("analytic-accounts")]
        [RequirePermission("finance", "write")]
        public async Task<IActionResult> CreateAnalytic([FromBody] CreateAnalyticAccountDto dto, CancellationToken ct)
        {
            try
            {
                var a = new AnalyticAccount
                {
                    CompanyId = dto.CompanyId,
                    Code = dto.Code.Trim(),
                    Name = dto.Name.Trim(),
                    Axis = string.IsNullOrWhiteSpace(dto.Axis) ? "project" : dto.Axis!.Trim()
                };
                return Ok(await _analytic.CreateAsync(a, ct));
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        [HttpPost("journal-lines/{journalLineId:guid}/analytic")]
        [RequirePermission("finance", "write")]
        public async Task<IActionResult> AttachAnalytic(Guid journalLineId, [FromBody] AttachAnalyticDto dto, CancellationToken ct)
        {
            try
            {
                await _analytic.AttachToJournalLineAsync(journalLineId, dto.AnalyticAccountId, ct);
                return Ok(new { ok = true });
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        [HttpGet("tax-rule-packs")]
        [RequirePermission("finance", "read")]
        public async Task<IActionResult> ListTaxPacks(CancellationToken ct)
            => Ok(await _tax.ListPacksAsync(ct));

        [HttpGet("tax-rule-packs/active")]
        [RequirePermission("finance", "read")]
        public async Task<IActionResult> ActiveTaxPack([FromQuery] string code, [FromQuery] DateTime? asOf, CancellationToken ct)
        {
            var pack = await _tax.GetActivePackAsync(code, (asOf ?? DateTime.UtcNow).Date, ct);
            if (pack == null) return NotFound(new { error = "No active pack for code and date." });
            return Ok(pack);
        }
    }

    public class CreateBankAccountDto
    {
        public Guid CompanyId { get; set; }
        public string Code { get; set; } = "";
        public string Name { get; set; } = "";
        public string LedgerAccountCode { get; set; } = "";
        public string? Currency { get; set; }
    }

    public class ImportBankStatementDto
    {
        public Guid BankAccountId { get; set; }
        public DateTime StatementDate { get; set; }
        public string? Reference { get; set; }
        public decimal OpeningBalance { get; set; }
        public decimal ClosingBalance { get; set; }
        public List<ImportBankStatementLineDto> Lines { get; set; } = new();
    }

    public class ImportBankStatementLineDto
    {
        public DateTime Date { get; set; }
        public string? Description { get; set; }
        public decimal Amount { get; set; }
    }

    public class CreateFixedAssetDto
    {
        public Guid CompanyId { get; set; }
        public string Code { get; set; } = "";
        public string Name { get; set; } = "";
        public DateTime AcquisitionDate { get; set; }
        public decimal Cost { get; set; }
        public decimal SalvageValue { get; set; }
        public int UsefulLifeMonths { get; set; }
        public string AssetAccountCode { get; set; } = "";
        public string AccumulatedDepreciationAccountCode { get; set; } = "";
        public string DepreciationExpenseAccountCode { get; set; } = "";
    }

    public class LockFiscalPeriodDto
    {
        public Guid CompanyId { get; set; }
        public int FiscalYear { get; set; }
        public int FiscalMonth { get; set; }
        public string? Notes { get; set; }
    }

    public class CreateAnalyticAccountDto
    {
        public Guid CompanyId { get; set; }
        public string Code { get; set; } = "";
        public string Name { get; set; } = "";
        public string? Axis { get; set; }
    }

    public class AttachAnalyticDto
    {
        public Guid AnalyticAccountId { get; set; }
    }
}
