using ComptabiliteAPI.Domain.Interfaces;
using ComptabiliteAPI.DTOs;
using ComptabiliteAPI.Infrastructure.Data;
using ComptabiliteAPI.Infrastructure.Reporting;
using ComptabiliteAPI.Infrastructure.Services;
using ComptabiliteAPI.Middleware;
using ComptabiliteAPI.Filters;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace ComptabiliteAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    [ServiceFilter(typeof(CompanyMembershipActionFilter))]
    public class ReportsController : ControllerBase
    {
        private readonly ICashFlowGenerator _cashFlowGen;
        private readonly IPdfReportGenerator _pdfGen;
        private readonly IExcelExportService _excelExport;
        private readonly ITrialBalanceService _tbService;
        private readonly IGeneralLedgerService _glService;
        private readonly IIncomeStatementGenerator _isGen;
        private readonly IBalanceSheetGenerator _bsGen;
        private readonly INotesGenerator _notesGen;
        private readonly IAuditLogService _auditLog;
        private readonly IAnalyticAccountService _analytic;
        private readonly AppDbContext _db;
        private readonly IPermissionService _perm;

        public ReportsController(
            ICashFlowGenerator cashFlowGen,
            IPdfReportGenerator pdfGen,
            IExcelExportService excelExport,
            ITrialBalanceService tbService,
            IGeneralLedgerService glService,
            IIncomeStatementGenerator isGen,
            IBalanceSheetGenerator bsGen,
            INotesGenerator notesGen,
            IAuditLogService auditLog,
            IAnalyticAccountService analytic,
            AppDbContext db,
            IPermissionService perm)
        {
            _cashFlowGen = cashFlowGen;
            _pdfGen = pdfGen;
            _excelExport = excelExport;
            _tbService = tbService;
            _glService = glService;
            _isGen = isGen;
            _bsGen = bsGen;
            _notesGen = notesGen;
            _auditLog = auditLog;
            _analytic = analytic;
            _db = db;
            _perm = perm;
        }

        [HttpGet("project-profitability")]
        [RequirePermission("dashboard", "read")]
        public async Task<IActionResult> GetProjectProfitability(int fiscalYear, Guid companyId, CancellationToken ct)
        {
            var data = await _analytic.GetProjectProfitabilityAsync(companyId, fiscalYear, ct);
            await LogAsync(companyId, "project_profitability", "view");
            return Ok(data);
        }

        /// <summary>Report types, formats, and permissions for the intelligent reporting UI.</summary>
        [HttpGet("catalog")]
        [Authorize]
        public ActionResult<IReadOnlyList<ReportCatalogItemDto>> GetReportCatalog()
        {
            return Ok(ReportCatalogDefinition.GetItems());
        }

        /// <summary>Lightweight data presence signals for the selected company and fiscal year.</summary>
        [HttpGet("availability")]
        [RequirePermission("balance_sheet", "read")]
        public async Task<ActionResult<ReportAvailabilityDto>> GetReportAvailability(
            int fiscalYear,
            Guid companyId,
            CancellationToken cancellationToken = default)
        {
            var journalCount = await _db.JournalEntries
                .AsNoTracking()
                .ForReporting(companyId, fiscalYear)
                .CountAsync(cancellationToken);

            var yearsWithData = await _db.JournalEntries
                .AsNoTracking()
                .Where(e => e.CompanyId == companyId && !e.Voided && e.Validated)
                .Select(e => e.EntryDate.Year)
                .Distinct()
                .OrderByDescending(y => y)
                .ToListAsync(cancellationToken);

            var accountCount = await _db.Accounts
                .AsNoTracking()
                .CountAsync(
                    a => a.FiscalYear == null || a.FiscalYear == fiscalYear,
                    cancellationToken);

            await LogAsync(companyId, "reporting", "view_availability");
            return Ok(new ReportAvailabilityDto
            {
                FiscalYear = fiscalYear,
                HasJournalDataForYear = journalCount > 0,
                JournalEntryCount = journalCount,
                AccountCount = accountCount,
                LatestFiscalYearWithData = yearsWithData.Count > 0 ? yearsWithData[0] : null,
                FiscalYearsWithData = yearsWithData,
            });
        }

        /// <summary>Fiscal years that have posted journal entries (newest first).</summary>
        [HttpGet("journal-years")]
        [RequirePermission("balance_sheet", "read")]
        public async Task<ActionResult<IReadOnlyList<int>>> GetJournalYears(
            Guid companyId,
            CancellationToken cancellationToken = default)
        {
            var years = await _db.JournalEntries
                .AsNoTracking()
                .Where(e => e.CompanyId == companyId && !e.Voided && e.Validated)
                .Select(e => e.EntryDate.Year)
                .Distinct()
                .OrderByDescending(y => y)
                .ToListAsync(cancellationToken);
            return Ok(years);
        }

        /// <summary>Live headline figures for the selected report, from the same generators as PDF/JSON exports (journal + chart of accounts).</summary>
        [HttpGet("summary")]
        [Authorize]
        public async Task<ActionResult<ReportSummaryDto>> GetReportSummary(
            [FromQuery] string engineKey,
            [FromQuery] int fiscalYear,
            [FromQuery] Guid companyId,
            [FromQuery] string lang = "en",
            CancellationToken cancellationToken = default)
        {
            var userIdStr = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (!Guid.TryParse(userIdStr, out var userId))
                return Unauthorized();

            var (resource, action) = engineKey switch
            {
                "trial_balance" or "income_statement" or "balance_sheet" or "notes" => ("balance_sheet", "read"),
                "cash_flow" => ("cash_flow", "read"),
                "project_profitability" => ("dashboard", "read"),
                _ => (null as string, null as string)
            };
            if (resource == null)
                return BadRequest(new { error = "Unknown engineKey" });
            if (!await _perm.HasPermissionAsync(userId, resource, action!))
                return Forbid();

            var dto = new ReportSummaryDto
            {
                EngineKey = engineKey,
                FiscalYear = fiscalYear,
                DataSource = "live_ledger"
            };

            switch (engineKey)
            {
                case "trial_balance":
                {
                    var tb = await _tbService.GetTrialBalanceAsync(fiscalYear, companyId);
                    dto.AccountLineCount = tb.Count;
                    dto.AccountsWithMovementCount = tb.Count(l => l.TotalDebit != 0 || l.TotalCredit != 0);
                    dto.SumTotalDebit = tb.Sum(x => x.TotalDebit);
                    dto.SumTotalCredit = tb.Sum(x => x.TotalCredit);
                    break;
                }
                case "income_statement":
                {
                    var inc = await _isGen.GenerateAsync(fiscalYear, companyId);
                    dto.TotalRevenue = inc.TotalRevenue;
                    dto.TotalExpenses = inc.TotalExpenses;
                    dto.NetIncome = inc.NetIncome;
                    break;
                }
                case "balance_sheet":
                {
                    var bs = await _bsGen.GenerateAsync(fiscalYear, companyId);
                    dto.TotalAssets = bs.TotalAssets;
                    dto.TotalLiabilities = bs.TotalLiabilities;
                    dto.TotalEquity = bs.TotalEquity;
                    break;
                }
                case "cash_flow":
                {
                    var cf = await _cashFlowGen.GenerateAsync(fiscalYear, companyId);
                    dto.OperatingCashFlow = cf.OperatingCF;
                    dto.NetCashFlow = cf.NetCashFlow;
                    dto.ClosingCashClass5 = cf.ClosingCashClass5;
                    break;
                }
                case "notes":
                {
                    var text = await _notesGen.GenerateAsync(fiscalYear, companyId, lang);
                    dto.StatutoryNotesTextLength = text?.Length ?? 0;
                    break;
                }
                case "project_profitability":
                {
                    var list = await _analytic.GetProjectProfitabilityAsync(companyId, fiscalYear, cancellationToken);
                    dto.ProjectCount = list.Count;
                    dto.ProjectsCombinedNet = list.Sum(p => p.NetProfit);
                    break;
                }
                default:
                    return BadRequest(new { error = "Unknown engineKey" });
            }

            await LogAsync(companyId, "reporting", "view_summary");
            return Ok(dto);
        }

        // ─── GENERAL LEDGER ──────────────────────────────────────────────────────
        [HttpGet("general-ledger")]
        [RequirePermission("journal", "read")]
        public async Task<IActionResult> GetGeneralLedger(
            int fiscalYear, Guid companyId,
            string? accountCode = null, string? journalType = null,
            int? fiscalPeriod = null, string lang = "en")
        {
            var data = await _glService.GetGeneralLedgerAsync(
                fiscalYear, companyId, accountCode, journalType, fiscalPeriod, lang);
            await LogAsync(companyId, "general_ledger", "view");
            return Ok(data);
        }

        // ─── TRIAL BALANCE ───────────────────────────────────────────────────────
        [HttpGet("trial-balance")]
        [RequirePermission("balance_sheet", "read")]
        public async Task<IActionResult> GetTrialBalance(int fiscalYear, Guid companyId)
        {
            var tb = await _tbService.GetTrialBalanceAsync(fiscalYear, companyId);
            await LogAsync(companyId, "trial_balance", "view");
            return Ok(tb);
        }

        [HttpGet("trial-balance/export/excel")]
        [RequirePermission("balance_sheet", "export")]
        public async Task<IActionResult> ExportTrialBalanceExcel(int fiscalYear, Guid companyId, string lang = "en")
        {
            var data = await _tbService.GetTrialBalanceAsync(fiscalYear, companyId);
            var excel = _excelExport.ExportTrialBalance(data, lang);
            await LogAsync(companyId, "trial_balance", "export_excel");
            return File(excel, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", $"trial_balance_{fiscalYear}.xlsx");
        }

        [HttpGet("trial-balance/export/xml")]
        [RequirePermission("balance_sheet", "export")]
        public async Task<IActionResult> ExportTrialBalanceXml(int fiscalYear, Guid companyId, string lang = "en")
        {
            var data = await _tbService.GetTrialBalanceAsync(fiscalYear, companyId);
            var xml = ReportHtmlXmlSerializer.TrialBalanceToXml(data, fiscalYear, lang);
            await LogAsync(companyId, "trial_balance", "export_xml");
            return File(xml, "application/xml; charset=utf-8", $"trial_balance_{fiscalYear}.xml");
        }

        [HttpGet("trial-balance/export/html")]
        [RequirePermission("balance_sheet", "export")]
        public async Task<IActionResult> ExportTrialBalanceHtml(int fiscalYear, Guid companyId, string lang = "en")
        {
            var data = await _tbService.GetTrialBalanceAsync(fiscalYear, companyId);
            var html = ReportHtmlXmlSerializer.TrialBalanceToHtml(data, fiscalYear, lang);
            await LogAsync(companyId, "trial_balance", "export_html");
            return File(html, "text/html; charset=utf-8", $"trial_balance_{fiscalYear}.html");
        }

        // ─── INCOME STATEMENT ────────────────────────────────────────────────────
        [HttpGet("income-statement")]
        [RequirePermission("balance_sheet", "read")]
        public async Task<IActionResult> GetIncomeStatement(int fiscalYear, Guid companyId)
        {
            var statement = await _isGen.GenerateAsync(fiscalYear, companyId);
            await LogAsync(companyId, "income_statement", "view");
            return Ok(statement);
        }

        [HttpGet("income-statement/export")]
        [RequirePermission("balance_sheet", "export")]
        public async Task<IActionResult> ExportIncomeStatementPdf(int fiscalYear, Guid companyId, string lang = "en")
        {
            var data = await _isGen.GenerateAsync(fiscalYear, companyId);
            var pdf = _pdfGen.GenerateIncomeStatementReport(data, lang);
            await LogAsync(companyId, "income_statement", "export_pdf");
            return File(pdf, "application/pdf", $"income_statement_{fiscalYear}.pdf");
        }

        [HttpGet("income-statement/export/excel")]
        [RequirePermission("balance_sheet", "export")]
        public async Task<IActionResult> ExportIncomeStatementExcel(int fiscalYear, Guid companyId, string lang = "en")
        {
            var data = await _isGen.GenerateAsync(fiscalYear, companyId);
            var excel = _excelExport.ExportIncomeStatement(data, lang);
            await LogAsync(companyId, "income_statement", "export_excel");
            return File(excel, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", $"income_statement_{fiscalYear}.xlsx");
        }

        [HttpGet("income-statement/export/xml")]
        [RequirePermission("balance_sheet", "export")]
        public async Task<IActionResult> ExportIncomeStatementXml(int fiscalYear, Guid companyId, string lang = "en")
        {
            var data = await _isGen.GenerateAsync(fiscalYear, companyId);
            var xml = ReportHtmlXmlSerializer.IncomeStatementToXml(data, fiscalYear, lang);
            await LogAsync(companyId, "income_statement", "export_xml");
            return File(xml, "application/xml; charset=utf-8", $"income_statement_{fiscalYear}.xml");
        }

        [HttpGet("income-statement/export/html")]
        [RequirePermission("balance_sheet", "export")]
        public async Task<IActionResult> ExportIncomeStatementHtml(int fiscalYear, Guid companyId, string lang = "en")
        {
            var data = await _isGen.GenerateAsync(fiscalYear, companyId);
            var html = ReportHtmlXmlSerializer.IncomeStatementToHtml(data, fiscalYear, lang);
            await LogAsync(companyId, "income_statement", "export_html");
            return File(html, "text/html; charset=utf-8", $"income_statement_{fiscalYear}.html");
        }

        // ─── BALANCE SHEET ───────────────────────────────────────────────────────
        [HttpGet("balance-sheet")]
        [RequirePermission("balance_sheet", "read")]
        public async Task<IActionResult> GetBalanceSheet(int fiscalYear, Guid companyId)
        {
            var statement = await _bsGen.GenerateAsync(fiscalYear, companyId);
            await LogAsync(companyId, "balance_sheet", "view");
            return Ok(statement);
        }

        [HttpGet("balance-sheet/export")]
        [RequirePermission("balance_sheet", "export")]
        public async Task<IActionResult> ExportBalanceSheetPdf(int fiscalYear, Guid companyId, string lang = "en")
        {
            var data = await _bsGen.GenerateAsync(fiscalYear, companyId);
            var pdf = _pdfGen.GenerateBalanceSheetReport(data, lang);
            await LogAsync(companyId, "balance_sheet", "export_pdf");
            return File(pdf, "application/pdf", $"balance_sheet_{fiscalYear}.pdf");
        }

        [HttpGet("balance-sheet/export/excel")]
        [RequirePermission("balance_sheet", "export")]
        public async Task<IActionResult> ExportBalanceSheetExcel(int fiscalYear, Guid companyId, string lang = "en")
        {
            var data = await _bsGen.GenerateAsync(fiscalYear, companyId);
            var excel = _excelExport.ExportBalanceSheet(data, lang);
            await LogAsync(companyId, "balance_sheet", "export_excel");
            return File(excel, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", $"balance_sheet_{fiscalYear}.xlsx");
        }

        [HttpGet("balance-sheet/export/xml")]
        [RequirePermission("balance_sheet", "export")]
        public async Task<IActionResult> ExportBalanceSheetXml(int fiscalYear, Guid companyId, string lang = "en")
        {
            var data = await _bsGen.GenerateAsync(fiscalYear, companyId);
            var xml = ReportHtmlXmlSerializer.BalanceSheetToXml(data, fiscalYear, lang);
            await LogAsync(companyId, "balance_sheet", "export_xml");
            return File(xml, "application/xml; charset=utf-8", $"balance_sheet_{fiscalYear}.xml");
        }

        [HttpGet("balance-sheet/export/html")]
        [RequirePermission("balance_sheet", "export")]
        public async Task<IActionResult> ExportBalanceSheetHtml(int fiscalYear, Guid companyId, string lang = "en")
        {
            var data = await _bsGen.GenerateAsync(fiscalYear, companyId);
            var html = ReportHtmlXmlSerializer.BalanceSheetToHtml(data, fiscalYear, lang);
            await LogAsync(companyId, "balance_sheet", "export_html");
            return File(html, "text/html; charset=utf-8", $"balance_sheet_{fiscalYear}.html");
        }

        // ─── CASH FLOW ───────────────────────────────────────────────────────────
        [HttpGet("cash-flow")]
        [RequirePermission("cash_flow", "read")]
        public async Task<IActionResult> GetCashFlow(int fiscalYear, Guid companyId)
        {
            var report = await _cashFlowGen.GenerateAsync(fiscalYear, companyId);
            await LogAsync(companyId, "cash_flow", "view");
            return Ok(report);
        }

        [HttpGet("cash-flow/export")]
        [RequirePermission("cash_flow", "export")]
        public async Task<IActionResult> ExportCashFlowPdf(int fiscalYear, Guid companyId, string lang = "en")
        {
            var data = await _cashFlowGen.GenerateAsync(fiscalYear, companyId);
            var pdf = _pdfGen.GenerateCashFlowReport(data, lang);
            await LogAsync(companyId, "cash_flow", "export_pdf");
            return File(pdf, "application/pdf", $"cashflow_{fiscalYear}.pdf");
        }

        [HttpGet("cash-flow/export/xml")]
        [RequirePermission("cash_flow", "export")]
        public async Task<IActionResult> ExportCashFlowXml(int fiscalYear, Guid companyId, string lang = "en")
        {
            var data = await _cashFlowGen.GenerateAsync(fiscalYear, companyId);
            var xml = ReportHtmlXmlSerializer.CashFlowToXml(data, fiscalYear, lang);
            await LogAsync(companyId, "cash_flow", "export_xml");
            return File(xml, "application/xml; charset=utf-8", $"cashflow_{fiscalYear}.xml");
        }

        [HttpGet("cash-flow/export/html")]
        [RequirePermission("cash_flow", "export")]
        public async Task<IActionResult> ExportCashFlowHtml(int fiscalYear, Guid companyId, string lang = "en")
        {
            var data = await _cashFlowGen.GenerateAsync(fiscalYear, companyId);
            var html = ReportHtmlXmlSerializer.CashFlowToHtml(data, fiscalYear, lang);
            await LogAsync(companyId, "cash_flow", "export_html");
            return File(html, "text/html; charset=utf-8", $"cashflow_{fiscalYear}.html");
        }

        // ─── NOTES (OHADA Statutory Annexes) ─────────────────────────────────────
        [HttpGet("notes")]
        [RequirePermission("balance_sheet", "read")]
        public async Task<IActionResult> GetNotes(int fiscalYear, Guid companyId, string lang = "fr")
        {
            var notes = await _notesGen.GenerateAsync(fiscalYear, companyId, lang);
            await LogAsync(companyId, "notes", "view");
            return Ok(new { notes });
        }

        // ─── HELPER ──────────────────────────────────────────────────────────────
        private async Task LogAsync(Guid companyId, string reportType, string action)
        {
            var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (Guid.TryParse(userId, out var uid))
            {
                var ip = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
                var ua = Request.Headers.UserAgent.ToString();
                await _auditLog.LogAsync(uid, companyId, reportType, action, ip, ua);
            }
        }
    }
}
