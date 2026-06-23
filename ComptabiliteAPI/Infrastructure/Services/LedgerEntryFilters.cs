using ComptabiliteAPI.Domain.Entities;

namespace ComptabiliteAPI.Infrastructure.Services
{
    /// <summary>Shared filters so GL, trial balance, and financial statements stay aligned with posted journals.</summary>
    public static class LedgerEntryFilters
    {
        public static IQueryable<JournalEntry> ForReporting(
            this IQueryable<JournalEntry> query,
            Guid companyId,
            int fiscalYear)
        {
            return query.Where(e =>
                e.CompanyId == companyId
                && e.EntryDate.Year == fiscalYear
                && !e.Voided
                && e.Validated);
        }
    }
}
