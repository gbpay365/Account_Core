using ComptabiliteAPI.Domain.Entities;
using ComptabiliteAPI.DTOs;

namespace ComptabiliteAPI.Domain.Interfaces
{
    /// <summary>Pluggable DGI e-filing client; default implementation is a stub until official API is available.</summary>
    public interface IDGIClient
    {
        Task<FilingResultDto> SubmitDeclarationAsync(
            TaxDeclaration declaration,
            string? ediPayload,
            string? correlationId,
            CancellationToken cancellationToken = default);
    }
}
