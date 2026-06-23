using System;
using System.Collections.Generic;

namespace ComptabiliteAPI.Domain.Entities
{
    public class PayrollPeriod
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid CompanyId { get; set; }
        public Company Company { get; set; } = null!;

        public DateTime PeriodDate { get; set; } // First day of the payroll month

        // 'draft', 'processed', 'posted'
        public string Status { get; set; } = "draft";

        public decimal TotalGrossPayroll { get; set; }
        public decimal TotalNetPayroll { get; set; }
        public decimal TotalEmployerCharges { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        public ICollection<PayrollDetail> Details { get; set; } = new List<PayrollDetail>();
    }
}
