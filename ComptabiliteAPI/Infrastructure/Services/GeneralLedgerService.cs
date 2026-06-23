using ComptabiliteAPI.Domain.Entities;
using ComptabiliteAPI.Domain.Interfaces;
using ComptabiliteAPI.DTOs;
using ComptabiliteAPI.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace ComptabiliteAPI.Infrastructure.Services
{
    public interface IGeneralLedgerService
    {
        Task<List<GeneralLedgerLineDto>> GetGeneralLedgerAsync(
            int fiscalYear, Guid companyId, string? accountCode = null,
            string? journalType = null, int? fiscalPeriod = null, string lang = "en");
    }

    public class GeneralLedgerService : IGeneralLedgerService
    {
        private readonly AppDbContext _context;

        public GeneralLedgerService(AppDbContext context) => _context = context;

        public async Task<List<GeneralLedgerLineDto>> GetGeneralLedgerAsync(
            int fiscalYear, Guid companyId, string? accountCode = null,
            string? journalType = null, int? fiscalPeriod = null, string lang = "en")
        {
            var accounts = await _context.Accounts
                .AsNoTracking()
                .Where(a => a.FiscalYear == fiscalYear || a.FiscalYear == null)
                .ToListAsync();
            var accountMap = accounts.ToDictionary(a => a.Code, a => a, StringComparer.Ordinal);

            var query = _context.JournalEntries
                .AsNoTracking()
                .Include(e => e.JournalLines)
                .ForReporting(companyId, fiscalYear);

            if (!string.IsNullOrWhiteSpace(journalType))
                query = query.Where(e => e.JournalType == journalType.Trim().ToUpperInvariant());
            if (fiscalPeriod is > 0)
                query = query.Where(e => e.FiscalPeriod == fiscalPeriod);

            var entries = await query
                .OrderBy(e => e.EntryDate)
                .ThenBy(e => e.CreatedAt)
                .ToListAsync();

            var lines = new List<(DateTime date, JournalEntry entry, JournalLine line)>();
            foreach (var entry in entries)
            {
                foreach (var line in entry.JournalLines ?? Enumerable.Empty<JournalLine>())
                {
                    if (!string.IsNullOrWhiteSpace(accountCode)
                        && !line.AccountCode.StartsWith(accountCode.Trim(), StringComparison.Ordinal))
                        continue;
                    lines.Add((entry.EntryDate, entry, line));
                }
            }

            lines = lines.OrderBy(x => x.date).ThenBy(x => x.entry.CreatedAt).ToList();

            var result = new List<GeneralLedgerLineDto>();
            var runningByAccount = new Dictionary<string, decimal>(StringComparer.Ordinal);

            foreach (var (date, entry, line) in lines)
            {
                var code = line.AccountCode ?? string.Empty;
                accountMap.TryGetValue(code, out var acc);
                var normalDebit = acc?.NormalBalance?.ToUpperInvariant() != "CREDIT";
                var prev = runningByAccount.GetValueOrDefault(code);
                var delta = normalDebit ? (line.Debit - line.Credit) : (line.Credit - line.Debit);
                var running = prev + delta;
                runningByAccount[code] = running;

                var name = lang.StartsWith("fr", StringComparison.OrdinalIgnoreCase)
                    ? (acc?.NameFr ?? code)
                    : (acc?.NameEn ?? code);

                result.Add(new GeneralLedgerLineDto
                {
                    EntryDate = date,
                    EntryId = entry.Id.ToString(),
                    JournalType = entry.JournalType,
                    Reference = entry.Reference,
                    Description = string.IsNullOrWhiteSpace(line.LineDescription) ? entry.Description : line.LineDescription!,
                    AccountCode = code,
                    AccountName = name,
                    Debit = line.Debit,
                    Credit = line.Credit,
                    RunningBalance = running,
                    Status = entry.Status
                });
            }

            return result;
        }
    }
}
