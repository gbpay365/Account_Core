using ComptabiliteAPI.Domain.Entities;
using ComptabiliteAPI.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace ComptabiliteAPI.Infrastructure.Services
{
    public static class CoreConfigSeeder
    {
        private static readonly (string Code, string Name, string Symbol, decimal Rate, bool Default)[] DefaultCurrencies =
        {
            ("XAF", "Central African CFA Franc", "FCFA", 1m, true),
            ("EUR", "Euro", "€", 655.957m, false),
            ("USD", "US Dollar", "$", 600m, false)
        };

        private static readonly (string Code, string Name, string Type, string? Debit, string? Credit)[] DefaultJournals =
        {
            ("BNK", "Bank Journal", "Bank", "521", "521"),
            ("CSH", "Cash Journal", "Cash", "571", "571"),
            ("PUR", "Purchases Journal", "Purchases", "601", "401"),
            ("SAL", "Sales Journal", "Sales", "411", "701"),
            ("GEN", "General Journal", "Miscellaneous", null, null)
        };

        public static async Task SeedCompanyDefaultsAsync(AppDbContext db, Guid companyId)
        {
            if (!await db.Currencies.AnyAsync(c => c.CompanyId == companyId))
            {
                foreach (var (code, name, symbol, rate, isDefault) in DefaultCurrencies)
                {
                    await db.Currencies.AddAsync(new Currency
                    {
                        CompanyId = companyId,
                        Code = code,
                        Name = name,
                        Symbol = symbol,
                        ExchangeRate = rate,
                        IsDefault = isDefault,
                        IsActive = true
                    });
                }
            }

            if (!await db.AccountingJournals.AnyAsync(j => j.CompanyId == companyId))
            {
                foreach (var (code, name, type, debit, credit) in DefaultJournals)
                {
                    await db.AccountingJournals.AddAsync(new AccountingJournal
                    {
                        CompanyId = companyId,
                        Code = code,
                        Name = name,
                        Type = type,
                        DefaultDebitAccountCode = debit,
                        DefaultCreditAccountCode = credit,
                        IsActive = true
                    });
                }
            }

            var currentYear = DateTime.UtcNow.Year;
            if (!await db.FiscalYears.AnyAsync(fy => fy.CompanyId == companyId && fy.Year == currentYear))
            {
                await CreateFiscalYearWithPeriodsAsync(db, companyId, currentYear, isCurrent: true);
            }

            await db.SaveChangesAsync();
        }

        public static async Task<FiscalYear> CreateFiscalYearWithPeriodsAsync(
            AppDbContext db, Guid companyId, int year, bool isCurrent = false)
        {
            if (isCurrent)
            {
                var existing = await db.FiscalYears.Where(fy => fy.CompanyId == companyId && fy.IsCurrent).ToListAsync();
                foreach (var fy in existing) fy.IsCurrent = false;
            }

            var fiscalYear = new FiscalYear
            {
                CompanyId = companyId,
                Year = year,
                StartDate = new DateTime(year, 1, 1),
                EndDate = new DateTime(year, 12, 31),
                IsCurrent = isCurrent
            };
            await db.FiscalYears.AddAsync(fiscalYear);

            for (var m = 1; m <= 12; m++)
            {
                var start = new DateTime(year, m, 1);
                var end = start.AddMonths(1).AddDays(-1);
                await db.Periods.AddAsync(new Period
                {
                    FiscalYearId = fiscalYear.Id,
                    Number = m,
                    Name = start.ToString("MMMM yyyy"),
                    StartDate = start,
                    EndDate = end
                });
            }

            return fiscalYear;
        }
    }
}
