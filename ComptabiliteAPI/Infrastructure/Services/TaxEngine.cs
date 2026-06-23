using ComptabiliteAPI.DTOs;

namespace ComptabiliteAPI.Infrastructure.Services
{
    /// <summary>
    /// Cameroonian tax engine implementing OHADA/DGI rules.
    /// Phase 3 compliance: IS (30% / 27.5%), TVA (19.25%), Minimum Forfaitaire Tax.
    /// Reference: Loi de Finances Cameroun, OHADA Acte Uniforme.
    /// </summary>
    public class TaxEngine
    {
        // ── Cameroonian Tax Constants (DGI) ─────────────────────────────────────
        private const decimal CORPORATE_TAX_RATE_STANDARD = 0.30m;         // IS standard: 30%
        private const decimal CORPORATE_TAX_RATE_LARGE_ENTERPRISE = 0.275m; // IS large: 27.5%
        private const decimal VAT_RATE = 0.1925m;                           // TVA: 19.25%
        private const decimal MINIMUM_TAX_RATE = 0.01m;                     // IMF: 1% of turnover
        private const decimal MINIMUM_TAX_FLOOR = 100_000m;                 // Floor: 100,000 FCFA
        private const decimal LARGE_ENTERPRISE_THRESHOLD = 3_000_000_000m;  // 3 billion FCFA turnover

        /// <summary>
        /// Calculates all applicable Cameroonian taxes for a fiscal year.
        /// </summary>
        /// <param name="taxableIncome">Net income before tax (Revenue - Expenses)</param>
        /// <param name="turnover">Total gross revenue for the year</param>
        /// <param name="isLargeEnterprise">Whether registered at DGE (Direction des Grandes Entreprises)</param>
        public TaxCalculationResult Calculate(
            decimal taxableIncome,
            decimal turnover,
            int fiscalYear,
            string companyId,
            bool isLargeEnterprise = false)
        {
            var rate = isLargeEnterprise || turnover >= LARGE_ENTERPRISE_THRESHOLD
                ? CORPORATE_TAX_RATE_LARGE_ENTERPRISE
                : CORPORATE_TAX_RATE_STANDARD;

            // Corporate Income Tax (IS)
            decimal corporateTax = taxableIncome > 0 ? taxableIncome * rate : 0;

            // VAT collected on revenue (informational — not a cost to company but must be reported)
            decimal vat = turnover * VAT_RATE;

            // Minimum Forfaitaire Tax (IMF) – payable even at a loss
            decimal minimumTax = Math.Max(turnover * MINIMUM_TAX_RATE, MINIMUM_TAX_FLOOR);

            // The DGI collects whichever is higher: IS or IMF
            decimal totalTaxDue = Math.Max(corporateTax, minimumTax);

            return new TaxCalculationResult
            {
                TaxableIncome = taxableIncome,
                CorporateTax = corporateTax,
                CorporateTaxRate = rate,
                VAT = vat,
                MinimumTax = minimumTax,
                TotalTaxDue = totalTaxDue,
                NetIncomeAfterTax = taxableIncome - totalTaxDue,
                FiscalYear = fiscalYear,
                CompanyId = companyId
            };
        }
    }
}
