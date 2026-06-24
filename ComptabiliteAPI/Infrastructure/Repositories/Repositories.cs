using ComptabiliteAPI.Domain.Entities;
using ComptabiliteAPI.Domain.Interfaces;
using ComptabiliteAPI.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace ComptabiliteAPI.Infrastructure.Repositories
{
    public class AccountRepository : IAccountRepository
    {
        private readonly AppDbContext _context;
        public AccountRepository(AppDbContext context) => _context = context;

        public async Task<List<Account>> GetAllAsync(int? fiscalYear = null)
        {
            var query = _context.Accounts.AsQueryable();
            if (fiscalYear.HasValue)
                query = query.Where(a => a.FiscalYear == fiscalYear || a.FiscalYear == null);
            return await query.OrderBy(a => a.Code).ToListAsync();
        }

        public async Task<Account?> GetByCodeAsync(string code)
            => await _context.Accounts.FirstOrDefaultAsync(a => a.Code == code && a.IsActive);

        public async Task AddAsync(Account account)
        {
            await _context.Accounts.AddAsync(account);
            await _context.SaveChangesAsync();
        }

        public async Task<bool> ExistsAsync(string code)
            => await _context.Accounts.AnyAsync(a => a.Code == code && a.IsActive);
    }

    public class JournalEntryRepository : IJournalEntryRepository
    {
        private readonly AppDbContext _context;
        public JournalEntryRepository(AppDbContext context) => _context = context;

        public async Task<JournalEntry> CreateAsync(JournalEntry entry)
        {
            await _context.JournalEntries.AddAsync(entry);
            await _context.SaveChangesAsync();
            return entry;
        }

        public async Task<List<JournalEntry>> GetByCompanyAsync(Guid companyId)
            => await _context.JournalEntries
                .Include(e => e.JournalLines)
                .Where(e => e.CompanyId == companyId)
                .OrderByDescending(e => e.EntryDate)
                .ThenByDescending(e => e.CreatedAt)
                .ThenByDescending(e => e.Id)
                .ToListAsync();

        public async Task<JournalEntry?> GetByIdAsync(Guid id)
            => await _context.JournalEntries
                .Include(e => e.JournalLines)
                .FirstOrDefaultAsync(e => e.Id == id);
    }
}
