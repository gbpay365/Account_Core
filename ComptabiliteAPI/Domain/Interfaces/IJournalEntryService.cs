using ComptabiliteAPI.Domain.Entities;

namespace ComptabiliteAPI.Domain.Interfaces
{
    public interface IJournalEntryService
    {
        Task<JournalEntry> CreateEntryAsync(JournalEntry entry, IReadOnlyList<Guid?>? analyticAccountIdPerLine = null);
        Task<List<JournalEntry>> GetEntriesAsync(Guid companyId);
        Task<JournalEntry?> GetEntryByIdAsync(Guid id, Guid companyId);
        Task<bool> ValidateDoubleEntryAsync(JournalEntry entry);
        Task<JournalEntry?> ValidateEntryAsync(Guid id);
        Task<JournalEntry?> SubmitEntryAsync(Guid id);
        Task<JournalEntry?> RejectEntryAsync(Guid id, string reason);
        Task<JournalEntry?> VoidEntryAsync(Guid id, Guid companyId);
        /// <summary>Creates a balanced REV entry by swapping debits and credits, then marks it as validated (posted in legacy terms).</summary>
        Task<Guid> CreateReversalEntryAsync(Guid originalJournalId, DateTime reversalDate, short fiscalYear, short fiscalPeriod, Guid userId, IReadOnlyList<Guid?>? analyticAccountIdPerLine = null);
    }
}
