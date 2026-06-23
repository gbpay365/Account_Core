using ComptabiliteAPI.Domain.Entities;
using ComptabiliteAPI.Domain.Interfaces;
using ComptabiliteAPI.Infrastructure.Data;

namespace ComptabiliteAPI.Infrastructure.Services
{
    // OHADA double-entry validation: debits must equal credits
    public class DoubleEntryValidator : IDoubleEntryValidator
    {
        public bool Validate(JournalEntry entry)
        {
            if (entry.JournalLines == null || !entry.JournalLines.Any())
                return false;

            decimal totalDebit = entry.JournalLines.Sum(l => l.Debit);
            decimal totalCredit = entry.JournalLines.Sum(l => l.Credit);

            return totalDebit == totalCredit && totalDebit > 0;
        }
    }

    // Validates that account codes conform to SYSCOHADA 9-class numbering
    public class SYSCOHADAValidator : ISYSCOHADAValidator
    {
        private readonly AppDbContext _context;
        public SYSCOHADAValidator(AppDbContext context) => _context = context;

        public async Task<bool> ValidateAccountCodeAsync(string code)
        {
            if (string.IsNullOrWhiteSpace(code)) return false;
            // Must start with 1-9 and be a valid account code length (2-8 digits)
            if (!int.TryParse(code[0].ToString(), out int cls) || cls < 1 || cls > 9) return false;
            if (code.Length < 2 || code.Length > 8) return false;
            return await System.Threading.Tasks.Task.FromResult(true);
        }
    }

    // Audit log service – records every report access to the DB
    public class AuditLogService : IAuditLogService
    {
        private readonly AppDbContext _context;
        public AuditLogService(AppDbContext context) => _context = context;

        public async Task LogAsync(Guid userId, Guid companyId, string reportType, string action, string ipAddress, string userAgent)
        {
            var log = new ReportAccessLog
            {
                UserId = userId,
                CompanyId = companyId,
                ReportType = reportType,
                Action = action,
                IpAddress = ipAddress,
                UserAgent = userAgent
            };
            await _context.ReportAccessLogs.AddAsync(log);
            await _context.SaveChangesAsync();
        }
    }

    // Notes generator – returns the statutory annexes for OHADA reports
    public class NotesGenerator : INotesGenerator
    {
        private readonly ITrialBalanceService _tbService;
        public NotesGenerator(ITrialBalanceService tbService) => _tbService = tbService;

        public async Task<string> GenerateAsync(int fiscalYear, Guid companyId, string lang = "fr")
        {
            var tb = await _tbService.GetTrialBalanceAsync(fiscalYear, companyId);
            var totalAssets = tb.Where(a => a.AccountCode.StartsWith("1") || a.AccountCode.StartsWith("2") ||
                                             a.AccountCode.StartsWith("3") || a.AccountCode.StartsWith("4") ||
                                             a.AccountCode.StartsWith("5")).Sum(a => a.Balance);

            if (!string.IsNullOrWhiteSpace(lang) && lang.Trim().StartsWith("en", StringComparison.OrdinalIgnoreCase))
            {
                return $"Notes to financial statements – Fiscal year {fiscalYear}\n" +
                       $"Total assets: {totalAssets:N2} FCFA\n" +
                       $"Compliance: Revised SYSCOHADA 2017\n";
            }

            return $"Notes aux états financiers – Exercice {fiscalYear}\n" +
                   $"Total Actif: {totalAssets:N2} FCFA\n" +
                   $"Conformité: SYSCOHADA Révisé 2017\n";
        }
    }
}
