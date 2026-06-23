namespace ComptabiliteAPI.Domain.Entities
{
    /// <summary>Configurable validation rule applied before journal operations.</summary>
    public class ValidationRule
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid CompanyId { get; set; }
        public Company Company { get; set; } = null!;
        public string Name { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
        /// <summary>create, submit, validate</summary>
        public string TriggerEvent { get; set; } = "validate";
        /// <summary>reject, require_approval</summary>
        public string Action { get; set; } = "reject";
        public string ErrorMessage { get; set; } = string.Empty;
        public int Priority { get; set; } = 100;
        public bool IsActive { get; set; } = true;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public ICollection<RuleCondition> Conditions { get; set; } = new List<RuleCondition>();
    }

    public class RuleCondition
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid RuleId { get; set; }
        public ValidationRule Rule { get; set; } = null!;
        /// <summary>max_amount, min_amount, journal_type, required_role, account_prefix, fiscal_period</summary>
        public string Field { get; set; } = string.Empty;
        /// <summary>eq, neq, gt, gte, lt, lte, in, not_in, contains</summary>
        public string Operator { get; set; } = "lte";
        public string Value { get; set; } = string.Empty;
    }
}
