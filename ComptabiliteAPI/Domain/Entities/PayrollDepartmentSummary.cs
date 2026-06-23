using System;

namespace ComptabiliteAPI.Domain.Entities
{
    public class PayrollDepartmentSummary
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid CompanyId { get; set; }
        public Company Company { get; set; } = null!;
        public int Year { get; set; }
        public int Month { get; set; }
        public string Department { get; set; } = string.Empty;
        public int Headcount { get; set; }
        public decimal GrossPayroll { get; set; }
        public decimal NetPayroll { get; set; }
        public decimal EmployerCharges { get; set; }
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    }
}
