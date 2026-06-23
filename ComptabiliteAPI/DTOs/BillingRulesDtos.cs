namespace ComptabiliteAPI.DTOs
{
    public class PlanDto
    {
        public Guid Id { get; set; }
        public string Code { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
        public decimal PriceMonthly { get; set; }
        public decimal PriceYearly { get; set; }
        public int MaxUsers { get; set; }
        public int MaxCompanies { get; set; }
        public string FeaturesJson { get; set; } = "[]";
        public bool IsActive { get; set; }
    }

    public class SubscriptionDto
    {
        public Guid Id { get; set; }
        public Guid CompanyId { get; set; }
        public Guid PlanId { get; set; }
        public string PlanName { get; set; } = string.Empty;
        public string PlanCode { get; set; } = string.Empty;
        public string Status { get; set; } = string.Empty;
        public DateTime StartDate { get; set; }
        public DateTime? EndDate { get; set; }
        public DateTime? RenewalDate { get; set; }
        public string BillingCycle { get; set; } = string.Empty;
    }

    public class PaymentTransactionDto
    {
        public Guid Id { get; set; }
        public decimal Amount { get; set; }
        public string Currency { get; set; } = string.Empty;
        public string Provider { get; set; } = string.Empty;
        public string Status { get; set; } = string.Empty;
        public DateTime? PaidAt { get; set; }
        public DateTime CreatedAt { get; set; }
    }

    public class SubscribeRequest
    {
        public Guid CompanyId { get; set; }
        public Guid PlanId { get; set; }
        public string BillingCycle { get; set; } = "monthly";
        public string Provider { get; set; } = "Manual";
    }

    public class CheckoutRequest
    {
        public Guid CompanyId { get; set; }
        public Guid PlanId { get; set; }
        public string BillingCycle { get; set; } = "monthly";
        public string Provider { get; set; } = "Stripe";
    }

    public class PermissionCatalogItemDto
    {
        public Guid Id { get; set; }
        public string Resource { get; set; } = string.Empty;
        public string Action { get; set; } = string.Empty;
        public string Key { get; set; } = string.Empty;
    }

    public class RolePermissionsDto
    {
        public Guid RoleId { get; set; }
        public string RoleName { get; set; } = string.Empty;
        public List<PermissionCatalogItemDto> Permissions { get; set; } = new();
    }

    public class UpdateRolePermissionsRequest
    {
        public List<Guid> PermissionIds { get; set; } = new();
    }

    public class UpdateUserRoleRequest
    {
        public Guid RoleId { get; set; }
    }

    public class ValidationRuleDto
    {
        public Guid Id { get; set; }
        public Guid CompanyId { get; set; }
        public string Name { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
        public string TriggerEvent { get; set; } = string.Empty;
        public string Action { get; set; } = string.Empty;
        public string ErrorMessage { get; set; } = string.Empty;
        public int Priority { get; set; }
        public bool IsActive { get; set; }
        public List<RuleConditionDto> Conditions { get; set; } = new();
    }

    public class RuleConditionDto
    {
        public Guid? Id { get; set; }
        public string Field { get; set; } = string.Empty;
        public string Operator { get; set; } = string.Empty;
        public string Value { get; set; } = string.Empty;
    }

    public class CreateValidationRuleRequest
    {
        public Guid CompanyId { get; set; }
        public string Name { get; set; } = string.Empty;
        public string? Description { get; set; }
        public string TriggerEvent { get; set; } = "validate";
        public string Action { get; set; } = "reject";
        public string ErrorMessage { get; set; } = string.Empty;
        public int Priority { get; set; } = 100;
        public List<RuleConditionDto> Conditions { get; set; } = new();
    }

    public class RuleEvaluationResult
    {
        public bool Passed { get; set; } = true;
        public bool RequiresApproval { get; set; }
        public List<string> Errors { get; set; } = new();
    }
}
