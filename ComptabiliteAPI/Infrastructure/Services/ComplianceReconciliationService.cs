using ComptabiliteAPI.Configuration;
using ComptabiliteAPI.Domain.Interfaces;
using ComptabiliteAPI.DTOs;
using Microsoft.Extensions.Options;

namespace ComptabiliteAPI.Infrastructure.Services;

public class ComplianceReconciliationService
{
    private readonly ITrialBalanceService _tb;
    private readonly IIncomeStatementGenerator _is;
    private readonly IOptions<ComplianceOptions> _opts;

    public ComplianceReconciliationService(
        ITrialBalanceService tb,
        IIncomeStatementGenerator isGen,
        IOptions<ComplianceOptions> opts)
    {
        _tb = tb;
        _is = isGen;
        _opts = opts;
    }

    public async Task<ComplianceReconciliationDto> BuildAsync(int fiscalYear, Guid companyId, CancellationToken ct = default)
    {
        var tb = await _tb.GetTrialBalanceAsync(fiscalYear, companyId);
        var inc = await _is.GenerateAsync(fiscalYear, companyId);

        var sum7 = tb.Where(a => a.AccountCode.StartsWith("7", StringComparison.Ordinal)).Sum(a => a.Balance);
        var sum6 = tb.Where(a => a.AccountCode.StartsWith("6", StringComparison.Ordinal)).Sum(a => a.Balance);

        return new ComplianceReconciliationDto
        {
            FiscalYear = fiscalYear,
            CompanyId = companyId,
            TrialBalanceClass7Revenue = sum7,
            IncomeStatementTotalRevenue = inc.TotalRevenue,
            RevenueDelta = sum7 - inc.TotalRevenue,
            TrialBalanceClass6Expenses = sum6,
            IncomeStatementTotalExpenses = inc.TotalExpenses,
            ExpenseDelta = sum6 - inc.TotalExpenses,
            EcfXmlSchemaVersion = _opts.Value.EcfXmlSchemaVersion
        };
    }
}
