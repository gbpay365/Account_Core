using ComptabiliteAPI.DTOs;

namespace ComptabiliteAPI.Domain.Interfaces
{
    public interface ICashFlowGenerator
    {
        Task<CashFlowStatement> GenerateAsync(int fiscalYear, Guid companyId);
    }
}
