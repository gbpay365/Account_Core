using System;

namespace ComptabiliteAPI.Domain.Entities
{
    public class PayrollDetail
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        
        public Guid PayrollPeriodId { get; set; }
        public PayrollPeriod PayrollPeriod { get; set; } = null!;

        public Guid EmployeeId { get; set; }
        public Employee Employee { get; set; } = null!;

        public decimal BaseSalary { get; set; }
        public decimal OvertimePay { get; set; } = 0;
        public decimal Bonuses { get; set; } = 0; // Generic other bonuses
        
        // --- Earnings (Cameroon specific) ---
        public decimal IndemniteTransport { get; set; } = 0;
        public decimal IndemniteLogement { get; set; } = 0;
        public decimal PrimeAnciennete { get; set; } = 0;
        public decimal Mois13 { get; set; } = 0;
        public decimal AvantagesNature { get; set; } = 0;
        public decimal IndemniteRepresentation { get; set; } = 0;

        public decimal Advances { get; set; } = 0;

        public decimal EmployeeCnpsContrib { get; set; } // Employee's share of CNPS
        public decimal EmployerCnpsContrib { get; set; } // Employer's share of CNPS
        
        public decimal TaxableIncome { get; set; }
        
        // --- Deductions (Cameroon specific) ---
        public decimal IncomeTax { get; set; } // IRPP
        public decimal Cac { get; set; } // Centimes Additionnels Communaux
        public decimal Rav { get; set; } // Redevance Audiovisuelle
        public decimal Tdl { get; set; } // Taxe de Développement Local
        public decimal CfcEmployee { get; set; } // Crédit Foncier du Cameroun (Employee)
        public decimal CfcEmployer { get; set; } // Crédit Foncier du Cameroun (Employer)
        public decimal FneEmployer { get; set; } // Fonds National de l'Emploi (Employer)
        
        public decimal NetSalary { get; set; } // Final take-home pay
        
        public byte[]? PayslipPdf { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}
