using ComptabiliteAPI.DTOs;

namespace ComptabiliteAPI.Domain.Interfaces
{
    public interface ITrialBalanceService
    {
        Task<List<TrialBalanceDto>> GetTrialBalanceAsync(int fiscalYear, Guid companyId);
    }
}
