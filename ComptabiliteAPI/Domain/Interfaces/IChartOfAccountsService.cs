using ComptabiliteAPI.DTOs;

namespace ComptabiliteAPI.Domain.Interfaces
{
    public interface IChartOfAccountsService
    {
        Task<IReadOnlyList<AccountAdminDto>> GetFlatAsync(int? classNo, bool includeInactive, string? search, CancellationToken cancellationToken = default);
        Task<AccountAdminDto?> GetOneAsync(string code, bool includeInactive = true, CancellationToken cancellationToken = default);
        Task<AccountAdminDto> CreateAsync(CreateAccountRequest request, CancellationToken cancellationToken = default);
        Task<AccountAdminDto?> UpdateAsync(string code, UpdateAccountRequest request, CancellationToken cancellationToken = default);
        Task<DeleteAccountResult> DeleteAsync(string code, bool forceSoftDeleteIfInUse, CancellationToken cancellationToken = default);
    }
}
