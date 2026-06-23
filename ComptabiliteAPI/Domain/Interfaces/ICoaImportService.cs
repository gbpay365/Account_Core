using ComptabiliteAPI.DTOs;

namespace ComptabiliteAPI.Domain.Interfaces
{
    public interface ICoaImportService
    {
        Task<CoaImportResult> ImportFromWyvernAsync(WyvernCoaImportRequest? request = null, CancellationToken cancellationToken = default);
        Task<CoaImportResult> ImportFromOhadaJsonAsync(CancellationToken cancellationToken = default);
    }
}
