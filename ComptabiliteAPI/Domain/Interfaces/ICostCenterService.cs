using ComptabiliteAPI.Domain;
using ComptabiliteAPI.Domain.Entities;

namespace ComptabiliteAPI.Domain.Interfaces
{
    public interface ICostCenterService
    {
        Task<IReadOnlyList<CostCenter>> GetByCompanyAsync(Guid companyId, bool includeInactive, CancellationToken ct = default);
        Task<CostCenter?> GetByIdAsync(Guid id, Guid companyId, CancellationToken ct = default);
        Task<CostCenter> CreateAsync(CostCenter entity, CancellationToken ct = default);
        Task<CostCenter> UpdateAsync(CostCenter entity, Guid companyId, CancellationToken ct = default);
        Task<bool> SetActiveAsync(Guid id, Guid companyId, bool isActive, CancellationToken ct = default);
        /// <summary>Inserts new template lines (enriched for the company) and optionally updates matching codes from the same template.</summary>
        Task<ApplyTemplateResult> ApplyTemplateAsync(Guid companyId, string templateKey, ApplyTemplateOptions? options, CancellationToken ct = default);

        /// <summary>When the company has at least one active cost centre, every line with a non-zero amount must reference an active code.</summary>
        Task<string?> GetJournalLineCostCenterValidationErrorAsync(
            Guid companyId,
            IEnumerable<(string? costCentre, decimal debit, decimal credit)> lines,
            CancellationToken ct = default);
    }
}
