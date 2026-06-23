using ComptabiliteAPI.Domain.Entities;
using ComptabiliteAPI.DTOs;

namespace ComptabiliteAPI.Domain.Interfaces
{
    public interface ITaxDeclarationService
    {
        Task<TaxDeclaration> CalculateDeclarationAsync(Guid companyId, Guid userId, string declarationType, int fiscalYear, int? periodMonth, int? periodQuarter, CancellationToken cancellationToken = default);
        Task<(byte[] Content, string Filename, Guid GenerationId)> GenerateFECAsync(Guid companyId, Guid userId, int fiscalYear, CancellationToken cancellationToken = default);
        Task<FilingResultDto> SubmitToDGIAsync(Guid declarationId, Guid userId, CancellationToken cancellationToken = default);
        Task<TaxDeclaration> UpdateDeclarationStatusAsync(Guid declarationId, Guid userId, string newStatus, CancellationToken cancellationToken = default);
        Task<(byte[] Zip, string Filename)?> BuildFiscalYearComplianceZipAsync(Guid companyId, int fiscalYear, CancellationToken cancellationToken = default);
        Task<TaxDeclaration?> GetAsync(Guid id, CancellationToken cancellationToken = default);
        Task<List<TaxDeclaration>> ListAsync(Guid companyId, CancellationToken cancellationToken = default);
        Task<byte[]?> GetFecFileAsync(Guid generationId, CancellationToken cancellationToken = default);
        Task<FecGeneration?> GetFecGenerationAsync(Guid generationId, CancellationToken cancellationToken = default);
        Task<List<FecGeneration>> ListFecAsync(Guid companyId, CancellationToken cancellationToken = default);
        string BuildCitEdiXmlPackage(TaxDeclaration declaration);
    }
}
