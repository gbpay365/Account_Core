using ComptabiliteAPI.Domain.Entities;
using ComptabiliteAPI.Domain.Interfaces;
using ComptabiliteAPI.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace ComptabiliteAPI.Infrastructure.Services
{
    public class PayrollProcessingService : IPayrollProcessingService
    {
        private readonly AppDbContext _dbContext;

        public PayrollProcessingService(AppDbContext dbContext)
        {
            _dbContext = dbContext;
        }

        public async Task PostPayrollToLedgerAsync(Guid payrollPeriodId, Guid userId)
        {
            var payrollPeriod = await _dbContext.PayrollPeriods
                .Include(p => p.Details)
                .FirstOrDefaultAsync(p => p.Id == payrollPeriodId);

            if (payrollPeriod == null) throw new Exception("Payroll Period not found.");
            if (payrollPeriod.Status == "posted") throw new Exception("Already posted to ledger.");

            var salariesAccount = await _dbContext.Accounts.FirstOrDefaultAsync(a => a.Code == "661");
            var cnpsAccount = await _dbContext.Accounts.FirstOrDefaultAsync(a => a.Code == "664");
            var staffPayableAccount = await _dbContext.Accounts.FirstOrDefaultAsync(a => a.Code == "422");
            var cnpsPayableAccount = await _dbContext.Accounts.FirstOrDefaultAsync(a => a.Code == "431");
            var taxPayableAccount = await _dbContext.Accounts.FirstOrDefaultAsync(a => a.Code == "442");

            if (salariesAccount == null) salariesAccount = await _dbContext.Accounts.FirstOrDefaultAsync(a => a.Code.StartsWith("66"));
            if (staffPayableAccount == null) staffPayableAccount = await _dbContext.Accounts.FirstOrDefaultAsync(a => a.Code.StartsWith("42"));

            if (salariesAccount == null || staffPayableAccount == null)
                throw new Exception("Required SYSCOHADA accounts (66x, 42x) are missing.");

            var journalEntry = new JournalEntry
            {
                EntryDate = payrollPeriod.PeriodDate,
                Description = $"Payroll for {payrollPeriod.PeriodDate:MMM yyyy}",
                CompanyId = payrollPeriod.CompanyId,
                CreatedById = userId,
                Validated = false,
                JournalLines = new List<JournalLine>()
            };

            foreach (var detail in payrollPeriod.Details)
            {
                if (detail.BaseSalary > 0)
                    journalEntry.JournalLines.Add(new JournalLine { AccountCode = salariesAccount.Code, Debit = detail.BaseSalary, Credit = 0 });
                if (cnpsPayableAccount != null && detail.EmployeeCnpsContrib > 0)
                    journalEntry.JournalLines.Add(new JournalLine { AccountCode = cnpsPayableAccount.Code, Debit = 0, Credit = detail.EmployeeCnpsContrib });
                if (taxPayableAccount != null && detail.IncomeTax > 0)
                    journalEntry.JournalLines.Add(new JournalLine { AccountCode = taxPayableAccount.Code, Debit = 0, Credit = detail.IncomeTax });
                if (detail.NetSalary > 0)
                    journalEntry.JournalLines.Add(new JournalLine { AccountCode = staffPayableAccount.Code, Debit = 0, Credit = detail.NetSalary });
            }

            if (cnpsAccount != null && cnpsPayableAccount != null && payrollPeriod.TotalEmployerCharges > 0)
            {
                journalEntry.JournalLines.Add(new JournalLine { AccountCode = cnpsAccount.Code, Debit = payrollPeriod.TotalEmployerCharges, Credit = 0 });
                journalEntry.JournalLines.Add(new JournalLine { AccountCode = cnpsPayableAccount.Code, Debit = 0, Credit = payrollPeriod.TotalEmployerCharges });
            }

            await _dbContext.JournalEntries.AddAsync(journalEntry);
            payrollPeriod.Status = "posted";
            await _dbContext.SaveChangesAsync();
        }
    }
}
