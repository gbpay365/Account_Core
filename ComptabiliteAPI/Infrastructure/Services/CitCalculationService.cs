using System.Linq;
using ComptabiliteAPI.Domain.Interfaces;
using ComptabiliteAPI.DTOs;

namespace ComptabiliteAPI.Infrastructure.Services
{
    /// <summary>Cameroon CIT (IS) — progressive scale + minimum tax + SME statutory rate comparison.</summary>
    public class CitCalculationService : ICitCalculationService
    {
        public CitCalculationResult Calculate(CitCalculationRequest request)
        {
            var taxableIncome = Math.Max(0, request.NetProfit);
            var turnover = Math.Max(0, request.Turnover);
            var credits = request.TaxCredits?.Sum(c => Math.Max(0, c.Amount)) ?? 0;

            var progressive = CalculateProgressiveCorporateTax(taxableIncome);
            var statutoryRate = turnover > 3_000_000_000m ? 0.33m : 0.275m;
            var taxOnProfitFlat = taxableIncome * statutoryRate;
            var grossTax = Math.Max(progressive, taxOnProfitFlat);
            var netAfterCredits = Math.Max(0, grossTax - credits);
            var minimumTax = turnover * 0.01m;
            var taxToPay = Math.Max(netAfterCredits, minimumTax);

            var q1 = Math.Max(0, request.FirstQuarterInstallment);
            var q2 = Math.Max(0, request.SecondQuarterInstallment);
            var q3 = Math.Max(0, request.ThirdQuarterInstallment);
            var q4 = Math.Max(0, request.FourthQuarterInstallment);
            var totalPaid = q1 + q2 + q3 + q4;
            var balance = taxToPay - totalPaid;
            var balanceToPay = Math.Max(0, balance);
            var overpayment = Math.Max(0, -balance);

            return new CitCalculationResult
            {
                TaxableIncome = taxableIncome,
                StatutoryRate = statutoryRate,
                GrossTaxProgressive = progressive,
                TaxOnProfitFlat = taxOnProfitFlat,
                TaxCredits = credits,
                NetTaxLiability = netAfterCredits,
                MinimumTax = minimumTax,
                TaxToPay = taxToPay,
                TotalInstallmentsPaid = totalPaid,
                BalanceToPay = balanceToPay,
                Overpayment = overpayment
            };
        }

        /// <summary>Official-style progressive brackets (simplified illustrative scale).</summary>
        public static decimal CalculateProgressiveCorporateTax(decimal taxableIncome)
        {
            if (taxableIncome <= 0) return 0;
            if (taxableIncome <= 3_000_000m) return taxableIncome * 0.275m;
            if (taxableIncome <= 10_000_000m) return (taxableIncome - 3_000_000m) * 0.33m + 825_000m;
            if (taxableIncome <= 100_000_000m) return (taxableIncome - 10_000_000m) * 0.35m + 3_141_000m;
            if (taxableIncome <= 1_000_000_000m) return (taxableIncome - 100_000_000m) * 0.37m + 34_641_000m;
            return (taxableIncome - 1_000_000_000m) * 0.385m + 404_410_000m;
        }
    }
}
