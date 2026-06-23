using ComptabiliteAPI.Domain.Interfaces;
using ComptabiliteAPI.DTOs;

namespace ComptabiliteAPI.Infrastructure.Services
{
    public class BalanceSheetGenerator : IBalanceSheetGenerator
    {
        private readonly ITrialBalanceService _tbService;

        public BalanceSheetGenerator(ITrialBalanceService tbService)
        {
            _tbService = tbService;
        }

        public async Task<BalanceSheetStatement> GenerateAsync(int fiscalYear, Guid companyId)
        {
            var tb = await _tbService.GetTrialBalanceAsync(fiscalYear, companyId);
            
            var statement = new BalanceSheetStatement();

            foreach (var account in tb)
            {
                var line = new StatementLine
                {
                    Code = account.AccountCode,
                    LabelFr = account.NameFr,
                    LabelEn = account.NameEn,
                    Amount = account.Balance
                };

                if (account.AccountCode.StartsWith("2") || account.AccountCode.StartsWith("3") || 
                    account.AccountCode.StartsWith("4") && (account.AccountType == "asset" || account.NormalBalance == "debit") || 
                    account.AccountCode.StartsWith("5") && account.NormalBalance == "debit")
                {
                    statement.Assets.Add(line);
                }
                else if (account.AccountCode.StartsWith("1") || 
                         account.AccountCode.StartsWith("4") && account.NormalBalance == "credit" || 
                         account.AccountCode.StartsWith("5") && account.NormalBalance == "credit")
                {
                    if (account.AccountCode.StartsWith("10") || account.AccountCode.StartsWith("11") || account.AccountCode.StartsWith("12") || account.AccountCode.StartsWith("13"))
                        statement.Equity.Add(line);
                    else
                        statement.Liabilities.Add(line);
                }
            }

            // Calculate Net Income and add to Equity
            decimal netIncome = tb.Where(a => a.AccountCode.StartsWith("7")).Sum(a => a.Balance) -
                                tb.Where(a => a.AccountCode.StartsWith("6")).Sum(a => a.Balance);
            
            statement.Equity.Add(new StatementLine { Code = "13", LabelFr = "Résultat Net", LabelEn = "Net Income", Amount = netIncome });

            statement.TotalAssets = statement.Assets.Sum(a => a.Amount);
            statement.TotalLiabilities = statement.Liabilities.Sum(l => l.Amount);
            statement.TotalEquity = statement.Equity.Sum(e => e.Amount);

            return statement;
        }
    }
}
