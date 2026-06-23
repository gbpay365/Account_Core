namespace ComptabiliteAPI.Domain.Entities
{
    public class Plan
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public string Code { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
        public decimal PriceMonthly { get; set; }
        public decimal PriceYearly { get; set; }
        public int MaxUsers { get; set; } = 5;
        public int MaxCompanies { get; set; } = 1;
        public string FeaturesJson { get; set; } = "[]";
        public bool IsActive { get; set; } = true;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }

    public class Subscription
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid CompanyId { get; set; }
        public Company Company { get; set; } = null!;
        public Guid PlanId { get; set; }
        public Plan Plan { get; set; } = null!;
        /// <summary>Active, Trial, Suspended, Cancelled</summary>
        public string Status { get; set; } = "Trial";
        public DateTime StartDate { get; set; } = DateTime.UtcNow;
        public DateTime? EndDate { get; set; }
        public DateTime? RenewalDate { get; set; }
        public string BillingCycle { get; set; } = "monthly";
        public string? ExternalSubscriptionId { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    }

    public class PaymentTransaction
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid SubscriptionId { get; set; }
        public Subscription Subscription { get; set; } = null!;
        public decimal Amount { get; set; }
        public string Currency { get; set; } = "XAF";
        /// <summary>Stripe, PayPal, MobileMoney, Manual</summary>
        public string Provider { get; set; } = "Manual";
        /// <summary>Pending, Completed, Failed, Refunded</summary>
        public string Status { get; set; } = "Pending";
        public string? ExternalPaymentId { get; set; }
        public string? FailureReason { get; set; }
        public DateTime? PaidAt { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}
