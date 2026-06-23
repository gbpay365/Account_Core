using ComptabiliteAPI.Domain.Interfaces;
using ComptabiliteAPI.DTOs;

namespace ComptabiliteAPI.Infrastructure.Services
{
    public class IncomeStatementGenerator : IIncomeStatementGenerator
    {
        private readonly ITrialBalanceService _tbService;

        public IncomeStatementGenerator(ITrialBalanceService tbService)
        {
            _tbService = tbService;
        }

        public async Task<IncomeStatement> GenerateAsync(int fiscalYear, Guid companyId)
        {
            var tb = await _tbService.GetTrialBalanceAsync(fiscalYear, companyId);
            
            var statement = new IncomeStatement();

            foreach (var account in tb)
            {
                if (account.AccountCode.StartsWith("7")) // Revenue
                {
                    statement.Revenues.Add(new StatementLine
                    {
                        Code = account.AccountCode,
                        LabelFr = account.NameFr,
                        LabelEn = account.NameEn,
                        Amount = account.Balance
                    });
                }
                else if (account.AccountCode.StartsWith("6")) // Expenses
                {
                    statement.Expenses.Add(new StatementLine
                    {
                        Code = account.AccountCode,
                        LabelFr = account.NameFr,
                        LabelEn = account.NameEn,
                        Amount = account.Balance
                    });
                }
            }

            statement.TotalRevenue = statement.Revenues.Sum(r => r.Amount);
            statement.TotalExpenses = statement.Expenses.Sum(e => e.Amount);

            return statement;
        }
    }
}
