using ComptabiliteAPI.Domain.Entities;
using ComptabiliteAPI.DTOs;
using ComptabiliteAPI.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace ComptabiliteAPI.Infrastructure.Services
{
    public interface IBillingService
    {
        Task<IReadOnlyList<PlanDto>> GetPlansAsync(CancellationToken ct = default);
        Task<SubscriptionDto?> GetSubscriptionAsync(Guid companyId, CancellationToken ct = default);
        Task<SubscriptionDto> SubscribeAsync(Guid companyId, Guid planId, string billingCycle, string provider, CancellationToken ct = default);
        Task<SubscriptionDto?> CancelAsync(Guid companyId, CancellationToken ct = default);
        Task<IReadOnlyList<PaymentTransactionDto>> GetPaymentsAsync(Guid companyId, CancellationToken ct = default);
        Task<PaymentTransactionDto> CreateCheckoutAsync(Guid companyId, Guid planId, string billingCycle, string provider, CancellationToken ct = default);
        Task HandleWebhookAsync(string provider, string eventType, string externalId, decimal? amount, CancellationToken ct = default);
    }

    public class BillingService : IBillingService
    {
        private readonly AppDbContext _db;

        public BillingService(AppDbContext db) => _db = db;

        public async Task<IReadOnlyList<PlanDto>> GetPlansAsync(CancellationToken ct = default)
        {
            return await _db.Plans.AsNoTracking()
                .Where(p => p.IsActive)
                .OrderBy(p => p.PriceMonthly)
                .Select(p => new PlanDto
                {
                    Id = p.Id, Code = p.Code, Name = p.Name, Description = p.Description,
                    PriceMonthly = p.PriceMonthly, PriceYearly = p.PriceYearly,
                    MaxUsers = p.MaxUsers, MaxCompanies = p.MaxCompanies,
                    FeaturesJson = p.FeaturesJson, IsActive = p.IsActive
                })
                .ToListAsync(ct);
        }

        public async Task<SubscriptionDto?> GetSubscriptionAsync(Guid companyId, CancellationToken ct = default)
        {
            var sub = await _db.Subscriptions.AsNoTracking()
                .Include(s => s.Plan)
                .Where(s => s.CompanyId == companyId && s.Status != "Cancelled")
                .OrderByDescending(s => s.CreatedAt)
                .FirstOrDefaultAsync(ct);
            return sub == null ? null : MapSubscription(sub);
        }

        public async Task<SubscriptionDto> SubscribeAsync(Guid companyId, Guid planId, string billingCycle, string provider, CancellationToken ct = default)
        {
            var plan = await _db.Plans.FirstOrDefaultAsync(p => p.Id == planId && p.IsActive, ct)
                ?? throw new InvalidOperationException("Plan not found or inactive.");

            var existing = await _db.Subscriptions
                .Where(s => s.CompanyId == companyId && s.Status != "Cancelled")
                .ToListAsync(ct);
            foreach (var s in existing)
            {
                s.Status = "Cancelled";
                s.EndDate = DateTime.UtcNow;
                s.UpdatedAt = DateTime.UtcNow;
            }

            var cycle = billingCycle.Equals("yearly", StringComparison.OrdinalIgnoreCase) ? "yearly" : "monthly";
            var amount = cycle == "yearly" ? plan.PriceYearly : plan.PriceMonthly;
            var renewal = cycle == "yearly" ? DateTime.UtcNow.AddYears(1) : DateTime.UtcNow.AddMonths(1);

            var sub = new Subscription
            {
                CompanyId = companyId,
                PlanId = planId,
                Status = amount == 0 ? "Active" : "Active",
                BillingCycle = cycle,
                RenewalDate = renewal,
                ExternalSubscriptionId = $"sub_{Guid.NewGuid():N}"[..24]
            };
            await _db.Subscriptions.AddAsync(sub, ct);

            if (amount > 0)
            {
                await _db.PaymentTransactions.AddAsync(new PaymentTransaction
                {
                    SubscriptionId = sub.Id,
                    Amount = amount,
                    Currency = "XAF",
                    Provider = string.IsNullOrWhiteSpace(provider) ? "Manual" : provider.Trim(),
                    Status = provider.Equals("Manual", StringComparison.OrdinalIgnoreCase) ? "Completed" : "Pending",
                    ExternalPaymentId = $"pay_{Guid.NewGuid():N}"[..24],
                    PaidAt = provider.Equals("Manual", StringComparison.OrdinalIgnoreCase) ? DateTime.UtcNow : null
                }, ct);
            }

            await _db.SaveChangesAsync(ct);
            await _db.Entry(sub).Reference(s => s.Plan).LoadAsync(ct);
            return MapSubscription(sub);
        }

        public async Task<SubscriptionDto?> CancelAsync(Guid companyId, CancellationToken ct = default)
        {
            var sub = await _db.Subscriptions
                .Include(s => s.Plan)
                .Where(s => s.CompanyId == companyId && s.Status != "Cancelled")
                .OrderByDescending(s => s.CreatedAt)
                .FirstOrDefaultAsync(ct);
            if (sub == null) return null;
            sub.Status = "Cancelled";
            sub.EndDate = DateTime.UtcNow;
            sub.UpdatedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync(ct);
            return MapSubscription(sub);
        }

        public async Task<IReadOnlyList<PaymentTransactionDto>> GetPaymentsAsync(Guid companyId, CancellationToken ct = default)
        {
            return await _db.PaymentTransactions.AsNoTracking()
                .Include(p => p.Subscription)
                .Where(p => p.Subscription.CompanyId == companyId)
                .OrderByDescending(p => p.CreatedAt)
                .Select(p => new PaymentTransactionDto
                {
                    Id = p.Id, Amount = p.Amount, Currency = p.Currency,
                    Provider = p.Provider, Status = p.Status,
                    PaidAt = p.PaidAt, CreatedAt = p.CreatedAt
                })
                .ToListAsync(ct);
        }

        public async Task<PaymentTransactionDto> CreateCheckoutAsync(Guid companyId, Guid planId, string billingCycle, string provider, CancellationToken ct = default)
        {
            var plan = await _db.Plans.FirstOrDefaultAsync(p => p.Id == planId && p.IsActive, ct)
                ?? throw new InvalidOperationException("Plan not found.");
            var cycle = billingCycle.Equals("yearly", StringComparison.OrdinalIgnoreCase) ? "yearly" : "monthly";
            var amount = cycle == "yearly" ? plan.PriceYearly : plan.PriceMonthly;

            var sub = await _db.Subscriptions
                .Where(s => s.CompanyId == companyId && s.Status != "Cancelled")
                .OrderByDescending(s => s.CreatedAt)
                .FirstOrDefaultAsync(ct);

            if (sub == null)
            {
                sub = new Subscription
                {
                    CompanyId = companyId,
                    PlanId = planId,
                    Status = "Trial",
                    BillingCycle = cycle
                };
                await _db.Subscriptions.AddAsync(sub, ct);
                await _db.SaveChangesAsync(ct);
            }

            var payment = new PaymentTransaction
            {
                SubscriptionId = sub.Id,
                Amount = amount,
                Currency = "XAF",
                Provider = provider.Trim(),
                Status = "Pending",
                ExternalPaymentId = $"chk_{Guid.NewGuid():N}"[..24]
            };
            await _db.PaymentTransactions.AddAsync(payment, ct);
            await _db.SaveChangesAsync(ct);

            return new PaymentTransactionDto
            {
                Id = payment.Id, Amount = payment.Amount, Currency = payment.Currency,
                Provider = payment.Provider, Status = payment.Status,
                PaidAt = payment.PaidAt, CreatedAt = payment.CreatedAt
            };
        }

        public async Task HandleWebhookAsync(string provider, string eventType, string externalId, decimal? amount, CancellationToken ct = default)
        {
            var payment = await _db.PaymentTransactions
                .Include(p => p.Subscription)
                .FirstOrDefaultAsync(p => p.ExternalPaymentId == externalId || p.Id.ToString() == externalId, ct);
            if (payment == null) return;

            if (eventType.Contains("completed", StringComparison.OrdinalIgnoreCase)
                || eventType.Contains("succeeded", StringComparison.OrdinalIgnoreCase))
            {
                payment.Status = "Completed";
                payment.PaidAt = DateTime.UtcNow;
                payment.Subscription.Status = "Active";
                payment.Subscription.RenewalDate = payment.Subscription.BillingCycle == "yearly"
                    ? DateTime.UtcNow.AddYears(1)
                    : DateTime.UtcNow.AddMonths(1);
                payment.Subscription.UpdatedAt = DateTime.UtcNow;
            }
            else if (eventType.Contains("failed", StringComparison.OrdinalIgnoreCase))
            {
                payment.Status = "Failed";
                payment.FailureReason = "Payment provider reported failure.";
            }

            if (amount.HasValue) payment.Amount = amount.Value;
            await _db.SaveChangesAsync(ct);
        }

        private static SubscriptionDto MapSubscription(Subscription sub) => new()
        {
            Id = sub.Id, CompanyId = sub.CompanyId, PlanId = sub.PlanId,
            PlanName = sub.Plan?.Name ?? "", PlanCode = sub.Plan?.Code ?? "",
            Status = sub.Status, StartDate = sub.StartDate, EndDate = sub.EndDate,
            RenewalDate = sub.RenewalDate, BillingCycle = sub.BillingCycle
        };
    }
}
