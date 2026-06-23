using System;

namespace ComptabiliteAPI.Domain.Entities
{
    public class Employee
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid CompanyId { get; set; }
        public Company Company { get; set; } = null!;

        public string FirstName { get; set; } = string.Empty;
        public string LastName { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        /// <summary>French job title (default for local HR documents).</summary>
        public string Position { get; set; } = string.Empty;
        /// <summary>English job title for bilingual UI and payslips.</summary>
        public string PositionEn { get; set; } = string.Empty;
        
        // Industry Sector for CNPS Risk calculations
        public string IndustrySector { get; set; } = "office";

        public decimal BaseSalary { get; set; } // Monthly base salary in XAF
        
        // --- Specific Allowances / Earnings ---
        public decimal IndemniteTransport { get; set; } = 0;
        public decimal IndemniteLogement { get; set; } = 0;
        public decimal PrimeAnciennete { get; set; } = 0;
        public decimal Mois13 { get; set; } = 0; // If paid monthly, usually paid in December though, but we can store it here.
        public decimal AvantagesNature { get; set; } = 0;
        public decimal IndemniteRepresentation { get; set; } = 0;
        public decimal OvertimePay { get; set; } = 0;
        public decimal Bonuses { get; set; } = 0;
        
        public DateTime HireDate { get; set; }
        public string EmploymentType { get; set; } = "CDI"; // 'CDI', 'CDD'
        public DateTime? ContractEndDate { get; set; }

        public string BankAccountInfo { get; set; } = string.Empty;
        
        public bool IsActive { get; set; } = true;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        /// <summary>HMS tbl_employee.id for one-way HR sync.</summary>
        public int? ExternalHmsEmployeeId { get; set; }
        public int? ExternalHmsFacilityId { get; set; }
        /// <summary>Department name from HMS for payroll rollups.</summary>
        public string Department { get; set; } = string.Empty;
        public string? ExternalEmployeeCode { get; set; }
        public string? CnpsNumber { get; set; }
        public string? TaxNiu { get; set; }
        public string? BankName { get; set; }
        public string? BankAccountNo { get; set; }
    }
}
