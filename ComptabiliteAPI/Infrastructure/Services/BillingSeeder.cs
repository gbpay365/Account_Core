using ComptabiliteAPI.Domain.Entities;
using ComptabiliteAPI.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace ComptabiliteAPI.Infrastructure.Services
{
    public static class BillingSeeder
    {
        public static async Task SeedPlansAsync(AppDbContext db)
        {
            if (await db.Plans.AnyAsync()) return;

            await db.Plans.AddRangeAsync(
                new Plan
                {
                    Code = "STARTER",
                    Name = "Starter",
                    Description = "For freelancers and micro-entrepreneurs",
                    PriceMonthly = 0,
                    PriceYearly = 0,
                    MaxUsers = 2,
                    MaxCompanies = 1,
                    FeaturesJson = """["Chart of accounts","Journal entries","Trial balance","1 company"]"""
                },
                new Plan
                {
                    Code = "PROFESSIONAL",
                    Name = "Professional",
                    Description = "For SMEs managing accounting autonomously",
                    PriceMonthly = 49000,
                    PriceYearly = 490000,
                    MaxUsers = 10,
                    MaxCompanies = 3,
                    FeaturesJson = """["All Starter features","Reconciliation","Financial statements","Multi-currency","5 journals"]"""
                },
                new Plan
                {
                    Code = "ENTERPRISE",
                    Name = "Enterprise",
                    Description = "For accountants and multi-subsidiary organisations",
                    PriceMonthly = 149000,
                    PriceYearly = 1490000,
                    MaxUsers = 50,
                    MaxCompanies = 20,
                    FeaturesJson = """["All Professional features","Rules engine","Audit trail export","Priority support","API access"]"""
                });
            await db.SaveChangesAsync();
        }

        public static async Task EnsureTrialSubscriptionAsync(AppDbContext db, Guid companyId)
        {
            if (await db.Subscriptions.AnyAsync(s => s.CompanyId == companyId)) return;
            var starter = await db.Plans.FirstOrDefaultAsync(p => p.Code == "STARTER");
            if (starter == null) return;

            await db.Subscriptions.AddAsync(new Subscription
            {
                CompanyId = companyId,
                PlanId = starter.Id,
                Status = "Trial",
                BillingCycle = "monthly",
                RenewalDate = DateTime.UtcNow.AddDays(30)
            });
            await db.SaveChangesAsync();
        }
    }
}
