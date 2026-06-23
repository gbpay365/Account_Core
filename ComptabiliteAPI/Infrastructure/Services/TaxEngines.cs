using ComptabiliteAPI.Domain.Interfaces;
using System;
using System.Collections.Generic;

namespace ComptabiliteAPI.Infrastructure.Services
{
    public class TaxBracket
    {
        public decimal Min { get; set; }
        public decimal Max { get; set; }
        public decimal Rate { get; set; }
    }

    public class CameroonTaxService : ICameroonTaxService
    {
        // Progressive tax brackets for 2025 (annual taxable income in XAF)
        private readonly List<TaxBracket> _brackets = new()
        {
            new TaxBracket { Min = 0, Max = 2_000_000m, Rate = 0.10m },
            new TaxBracket { Min = 2_000_001m, Max = 3_000_000m, Rate = 0.15m },
            new TaxBracket { Min = 3_000_001m, Max = 5_000_000m, Rate = 0.25m },
            new TaxBracket { Min = 5_000_001m, Max = decimal.MaxValue, Rate = 0.35m }
        };

        public decimal CalculateIncomeTax(decimal taxableAnnualIncome)
        {
            decimal tax = 0;
            foreach (var bracket in _brackets)
            {
                if (taxableAnnualIncome <= bracket.Min) continue;
                var taxableInBracket = Math.Min(taxableAnnualIncome, bracket.Max) - bracket.Min;
                tax += taxableInBracket * bracket.Rate;
            }
            return tax;
        }

        public decimal CalculateCac(decimal irpp) => irpp * 0.10m;
        
        public decimal CalculateCfcEmployee(decimal grossSalary) => grossSalary * 0.01m;
        
        public decimal CalculateCfcEmployer(decimal grossSalary) => grossSalary * 0.015m;
        
        public decimal CalculateFneEmployer(decimal grossSalary) => grossSalary * 0.01m;

        public decimal CalculateRav(decimal grossSalary)
        {
            if (grossSalary <= 50000) return 0;
            if (grossSalary <= 100000) return 750;
            if (grossSalary <= 200000) return 1950;
            if (grossSalary <= 300000) return 3250;
            if (grossSalary <= 400000) return 4550;
            if (grossSalary <= 500000) return 5850;
            if (grossSalary <= 600000) return 7150;
            if (grossSalary <= 700000) return 8450;
            if (grossSalary <= 800000) return 9750;
            if (grossSalary <= 900000) return 11050;
            if (grossSalary <= 1000000) return 12350;
            return 13000;
        }

        public decimal CalculateTdl(decimal grossSalary)
        {
            if (grossSalary <= 62000) return 0;
            if (grossSalary <= 100000) return 250;
            if (grossSalary <= 200000) return 500;
            if (grossSalary <= 300000) return 1000;
            if (grossSalary <= 400000) return 1500;
            if (grossSalary <= 500000) return 2000;
            return 3000;
        }
    }

    public class CnpsCalculationService : ICnpsCalculationService
    {
        private const decimal SALARY_CAP = 750_000m; // XAF monthly cap
        private const decimal EMPLOYEE_PENSION_RATE = 0.042m; // 4.2%
        private const decimal EMPLOYER_PENSION_RATE = 0.042m; // 4.2%
        private const decimal EMPLOYER_FAMILY_BENEFITS_RATE = 0.07m; // 7% for general scheme

        public CnpsContributions Calculate(decimal grossSalary, string industrySector)
        {
            // Apply salary cap
            var contributorySalary = Math.Min(grossSalary, SALARY_CAP);
            
            // Old-age, disability, and death pension branch
            var employeePension = contributorySalary * EMPLOYEE_PENSION_RATE;
            var employerPension = contributorySalary * EMPLOYER_PENSION_RATE;
            
            // Family benefits branch (employer-only, based on capped salary)
            var familyBenefits = contributorySalary * EMPLOYER_FAMILY_BENEFITS_RATE;
            
            var employerAccidentInsurance = grossSalary * GetAccidentRate(industrySector);
            
            return new CnpsContributions
            {
                EmployeeContribution = employeePension,
                EmployerContribution = employerPension + familyBenefits + employerAccidentInsurance
            };
        }

        private decimal GetAccidentRate(string industrySector)
        {
            return industrySector.ToLower() switch
            {
                "office" => 0.0175m,
                "construction" => 0.04m,
                "industry" => 0.03m,
                _ => 0.0175m
            };
        }
    }
}
