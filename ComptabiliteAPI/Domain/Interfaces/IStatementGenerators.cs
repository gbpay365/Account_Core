using ComptabiliteAPI.DTOs;

namespace ComptabiliteAPI.Domain.Interfaces
{
    public interface IIncomeStatementGenerator
    {
        Task<IncomeStatement> GenerateAsync(int fiscalYear, Guid companyId);
    }

    public interface IBalanceSheetGenerator
    {
        Task<BalanceSheetStatement> GenerateAsync(int fiscalYear, Guid companyId);
    }
}
