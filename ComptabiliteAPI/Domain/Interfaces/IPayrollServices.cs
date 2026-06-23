using ComptabiliteAPI.Domain.Entities;
using System;
using System.Threading.Tasks;

namespace ComptabiliteAPI.Domain.Interfaces
{
    public class CnpsContributions
    {
        public decimal EmployeeContribution { get; set; }
        public decimal EmployerContribution { get; set; }
    }

    public interface ICnpsCalculationService
    {
        CnpsContributions Calculate(decimal grossSalary, string industrySector);
    }

    public interface ICameroonTaxService
    {
        decimal CalculateIncomeTax(decimal taxableAnnualIncome);
        decimal CalculateCac(decimal irpp);
        decimal CalculateCfcEmployee(decimal grossSalary);
        decimal CalculateCfcEmployer(decimal grossSalary);
        decimal CalculateFneEmployer(decimal grossSalary);
        decimal CalculateRav(decimal grossSalary);
        decimal CalculateTdl(decimal grossSalary);
    }

    public interface IPayrollProcessingService
    {
        Task PostPayrollToLedgerAsync(Guid payrollPeriodId, Guid userId);
    }
}
