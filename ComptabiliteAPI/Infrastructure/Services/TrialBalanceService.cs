using ComptabiliteAPI.Domain.Interfaces;
using ComptabiliteAPI.DTOs;
using ComptabiliteAPI.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace ComptabiliteAPI.Infrastructure.Services
{
    public class TrialBalanceService : ITrialBalanceService
    {
        private readonly AppDbContext _context;
        public TrialBalanceService(AppDbContext context)
        {
            _context = context;
        }

        public async Task<List<TrialBalanceDto>> GetTrialBalanceAsync(int fiscalYear, Guid companyId)
        {
            var accounts = await _context.Accounts
                .Where(a => a.FiscalYear == fiscalYear || a.FiscalYear == null)
                .ToListAsync();

            var entries = await _context.JournalEntries
                .Include(e => e.JournalLines)
                .ForReporting(companyId, fiscalYear)
                .ToListAsync();

            var linesByAccount = entries.SelectMany(e => e.JournalLines)
                .GroupBy(l => l.AccountCode ?? string.Empty)
                .ToDictionary(g => g.Key, g => new 
                { 
                    Debit = g.Sum(l => l.Debit), 
                    Credit = g.Sum(l => l.Credit) 
                });

            var result = new List<TrialBalanceDto>();
            foreach (var acc in accounts)
            {
                decimal debit = 0;
                decimal credit = 0;
                if (linesByAccount.TryGetValue(acc.Code ?? string.Empty, out var totals))
                {
                    debit = totals.Debit;
                    credit = totals.Credit;
                }

                decimal balance = acc.NormalBalance?.ToUpper() == "DEBIT" ? (debit - credit) : (credit - debit);

                result.Add(new TrialBalanceDto
                {
                    AccountCode = acc.Code ?? string.Empty,
                    NameFr = acc.NameFr ?? string.Empty,
                    NameEn = acc.NameEn ?? string.Empty,
                    AccountType = acc.AccountType ?? string.Empty,
                    NormalBalance = acc.NormalBalance ?? string.Empty,
                    TotalDebit = debit,
                    TotalCredit = credit,
                    Balance = balance
                });
            }

            return result.OrderBy(a => a.AccountCode).ToList();
        }
    }
}
