namespace ComptabiliteAPI.Domain.Interfaces
{
    public interface IAccountRepository
    {
        Task<List<Domain.Entities.Account>> GetAllAsync(int? fiscalYear = null);
        Task<Domain.Entities.Account?> GetByCodeAsync(string code);
        Task AddAsync(Domain.Entities.Account account);
        Task<bool> ExistsAsync(string code);
    }

    public interface IJournalEntryRepository
    {
        Task<Domain.Entities.JournalEntry> CreateAsync(Domain.Entities.JournalEntry entry);
        Task<List<Domain.Entities.JournalEntry>> GetByCompanyAsync(Guid companyId);
        Task<Domain.Entities.JournalEntry?> GetByIdAsync(Guid id);
    }
}
