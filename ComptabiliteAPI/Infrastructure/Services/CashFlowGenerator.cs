using ComptabiliteAPI.Domain.Interfaces;
using ComptabiliteAPI.DTOs;
using ComptabiliteAPI.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace ComptabiliteAPI.Infrastructure.Services
{
    public class CashFlowGenerator : ICashFlowGenerator
    {
        private readonly ITrialBalanceService _tbService;
        private readonly AppDbContext _db;

        public CashFlowGenerator(ITrialBalanceService tbService, AppDbContext db)
        {
            _tbService = tbService;
            _db = db;
        }

        public async Task<CashFlowStatement> GenerateAsync(int fiscalYear, Guid companyId)
        {
            var current = await _tbService.GetTrialBalanceAsync(fiscalYear, companyId);
            var previous = await _tbService.GetTrialBalanceAsync(fiscalYear - 1, companyId);

            var netIncome = current.Where(a => a.AccountCode.StartsWith("7")).Sum(a => a.Balance)
                            - current.Where(a => a.AccountCode.StartsWith("6")).Sum(a => a.Balance);
            var depreciation = current.Where(a => a.AccountCode.StartsWith("68")).Sum(a => a.Balance);
            var provisions = current.Where(a => a.AccountCode.StartsWith("49") || a.AccountCode.StartsWith("59")).Sum(a => a.Balance);

            var inventoryChange = Change(current, previous, "3%");
            var receivablesChange = Change(current, previous, "41%", "42%", "43%");
            var payablesChange = Change(current, previous, "44%", "45%");

            var inventoryCashEffect = -inventoryChange;
            var receivablesCashEffect = -receivablesChange;
            var payablesCashEffect = payablesChange;

            var operatingCf = netIncome + depreciation + provisions + inventoryCashEffect + receivablesCashEffect + payablesCashEffect;

            var prevCore2 = previous.Where(a => IsCoreFixedAsset(a.AccountCode)).ToDictionary(a => a.AccountCode, a => a.Balance);
            var core2Cur = current.Where(a => IsCoreFixedAsset(a.AccountCode)).Sum(a => a.Balance);
            var core2Prev = previous.Where(a => IsCoreFixedAsset(a.AccountCode)).Sum(a => a.Balance);
            var deltaCore2 = core2Cur - core2Prev;
            var investingCf = -deltaCore2;

            var loanChange = Change(current, previous, "16%");
            var capitalChange = Change(current, previous, "10%", "11%");
            var financingCf = loanChange + capitalChange;

            var startYear = new DateTime(fiscalYear, 1, 1);
            var startNextYear = new DateTime(fiscalYear + 1, 1, 1);
            var openingCash = await CumulativeClass5SignedBalanceAsync(companyId, startYear);
            var closingCash = await CumulativeClass5SignedBalanceAsync(companyId, startNextYear);

            var result = new CashFlowStatement
            {
                OperatingCF = operatingCf,
                InvestingCF = investingCf,
                FinancingCF = financingCf,
                OpeningCashClass5 = openingCash,
                ClosingCashClass5 = closingCash
            };

            void Add(CashFlowLine line) => result.Lines.Add(line);

            Add(new CashFlowLine { Section = "operating", LabelEn = "Net income (classes 7 − 6)", LabelFr = "Résultat net (classes 7 − 6)", Amount = netIncome, LineKind = "detail" });
            Add(new CashFlowLine { Section = "operating", LabelEn = "Depreciation & amortization (class 68)", LabelFr = "Dotations aux amortissements (classe 68)", Amount = depreciation, LineKind = "detail" });
            Add(new CashFlowLine { Section = "operating", LabelEn = "Provisions (classes 49, 59)", LabelFr = "Provisions (classes 49, 59)", Amount = provisions, LineKind = "detail" });
            Add(new CashFlowLine { Section = "operating", LabelEn = "Change in inventories (class 3) — cash effect", LabelFr = "Variation des stocks (classe 3) — effet trésorerie", Amount = inventoryCashEffect, LineKind = "detail" });
            Add(new CashFlowLine { Section = "operating", LabelEn = "Change in receivables (classes 41–43) — cash effect", LabelFr = "Variation des créances (classes 41–43) — effet trésorerie", Amount = receivablesCashEffect, LineKind = "detail" });
            Add(new CashFlowLine { Section = "operating", LabelEn = "Change in payables (classes 44–45) — cash effect", LabelFr = "Variation des dettes fournisseurs (classes 44–45) — effet trésorerie", Amount = payablesCashEffect, LineKind = "detail" });
            Add(new CashFlowLine { Section = "operating", LabelEn = "Cash flows from operating activities", LabelFr = "Flux de trésorerie liés aux activités opérationnelles", Amount = operatingCf, LineKind = "subtotal" });

            Add(new CashFlowLine { Section = "investing", LabelEn = "Investing — largest class-2 movements (excl. 28–29)", LabelFr = "Investissement — principaux mouvements classe 2 (hors 28–29)", Amount = 0, LineKind = "section_header" });
            foreach (var mv in TopFixedAssetMovers(current, prevCore2).Take(8))
            {
                var cashEffect = -mv.Delta;
                Add(new CashFlowLine
                {
                    Section = "investing",
                    LabelEn = $"{mv.Code} — {mv.NameEn}",
                    LabelFr = $"{mv.Code} — {mv.NameFr}",
                    Amount = cashEffect,
                    LineKind = "detail"
                });
            }
            Add(new CashFlowLine { Section = "investing", LabelEn = "Cash flows from investing activities (class 2 core, y/y trial balance)", LabelFr = "Flux liés aux activités d'investissement (classe 2, balance n/n−1)", Amount = investingCf, LineKind = "subtotal" });

            Add(new CashFlowLine { Section = "financing", LabelEn = "Financing — largest loan & capital movements (10–11, 16)", LabelFr = "Financement — principaux mouvements emprunts & capitaux (10–11, 16)", Amount = 0, LineKind = "section_header" });
            foreach (var mv in TopFinancingMovers(current, previous).Take(8))
            {
                Add(new CashFlowLine
                {
                    Section = "financing",
                    LabelEn = $"{mv.Code} — {mv.NameEn}",
                    LabelFr = $"{mv.Code} — {mv.NameFr}",
                    Amount = mv.Delta,
                    LineKind = "detail"
                });
            }
            Add(new CashFlowLine { Section = "financing", LabelEn = "Cash flows from financing activities (Δ loans 16 + Δ capital 10–11)", LabelFr = "Flux liés au financement (Δ emprunts 16 + Δ capitaux 10–11)", Amount = financingCf, LineKind = "subtotal" });

            Add(new CashFlowLine { Section = "bridge", LabelEn = "Class 5 cash bridge (cumulative journal balances)", LabelFr = "Pont de trésorerie classe 5 (soldes cumulés des écritures)", Amount = 0, LineKind = "section_header" });
            Add(new CashFlowLine { Section = "bridge", LabelEn = $"Opening cash (class 5) — through {fiscalYear - 1}-12-31", LabelFr = $"Trésorerie d'ouverture (classe 5) — au {fiscalYear - 1}-12-31", Amount = openingCash, LineKind = "detail" });
            Add(new CashFlowLine { Section = "bridge", LabelEn = $"Closing cash (class 5) — through {fiscalYear}-12-31", LabelFr = $"Trésorerie de clôture (classe 5) — au {fiscalYear}-12-31", Amount = closingCash, LineKind = "detail" });
            Add(new CashFlowLine { Section = "bridge", LabelEn = "Change in cash per ledger (closing − opening)", LabelFr = "Variation de trésorerie (clôture − ouverture)", Amount = result.ChangeInCashClass5Ledger, LineKind = "detail" });
            Add(new CashFlowLine { Section = "bridge", LabelEn = "Modeled net cash flow (operating + investing + financing)", LabelFr = "Flux de trésorerie modélisé (opérationnel + investissement + financement)", Amount = result.NetCashFlow, LineKind = "detail" });
            Add(new CashFlowLine { Section = "bridge", LabelEn = "Reconciliation difference (ledger − modeled)", LabelFr = "Écart de réconciliation (grand livre − modèle)", Amount = result.CashBridgeVariance, LineKind = "subtotal" });

            return result;
        }

        private async Task<decimal> CumulativeClass5SignedBalanceAsync(Guid companyId, DateTime exclusiveEndDate)
        {
            var grouped = await _db.JournalEntries.AsNoTracking()
                .Where(e => e.CompanyId == companyId && e.EntryDate < exclusiveEndDate)
                .SelectMany(e => e.JournalLines)
                .Where(l => l.AccountCode.StartsWith("5"))
                .GroupBy(l => l.AccountCode)
                .Select(g => new { Code = g.Key, Dr = g.Sum(x => x.Debit), Cr = g.Sum(x => x.Credit) })
                .ToListAsync();

            var nbLookup = await _db.Accounts.AsNoTracking()
                .Where(a => a.IsActive && a.Code.StartsWith("5"))
                .ToListAsync();
            var nbByCode = nbLookup
                .GroupBy(a => a.Code)
                .ToDictionary(g => g.Key, g => g.First().NormalBalance ?? "DEBIT", StringComparer.OrdinalIgnoreCase);

            decimal sum = 0;
            foreach (var g in grouped)
            {
                var nb = nbByCode.GetValueOrDefault(g.Code, "DEBIT");
                var bal = nb.Equals("CREDIT", StringComparison.OrdinalIgnoreCase) ? g.Cr - g.Dr : g.Dr - g.Cr;
                sum += bal;
            }

            return sum;
        }

        private static bool IsCoreFixedAsset(string code) =>
            code.Length >= 2
            && code.StartsWith("2", StringComparison.Ordinal)
            && !code.StartsWith("28", StringComparison.Ordinal)
            && !code.StartsWith("29", StringComparison.Ordinal);

        private static bool IsFinancingAccount(string code) =>
            code.StartsWith("16", StringComparison.Ordinal)
            || code.StartsWith("10", StringComparison.Ordinal)
            || code.StartsWith("11", StringComparison.Ordinal);

        private static IEnumerable<(string Code, string NameEn, string NameFr, decimal Delta)> TopFixedAssetMovers(
            List<TrialBalanceDto> current, Dictionary<string, decimal> prevByCode)
        {
            return current
                .Where(a => IsCoreFixedAsset(a.AccountCode))
                .Select(a =>
                {
                    var prevBal = prevByCode.GetValueOrDefault(a.AccountCode, 0m);
                    var delta = a.Balance - prevBal;
                    return (Code: a.AccountCode, NameEn: a.NameEn, NameFr: a.NameFr, Delta: delta);
                })
                .Where(x => Math.Abs(x.Delta) > 0.01m)
                .OrderByDescending(x => Math.Abs(x.Delta));
        }

        private static IEnumerable<(string Code, string NameEn, string NameFr, decimal Delta)> TopFinancingMovers(
            List<TrialBalanceDto> current, List<TrialBalanceDto> previous)
        {
            var prevByCode = previous.Where(a => IsFinancingAccount(a.AccountCode)).ToDictionary(a => a.AccountCode, a => a.Balance);
            return current
                .Where(a => IsFinancingAccount(a.AccountCode))
                .Select(a =>
                {
                    var prevBal = prevByCode.GetValueOrDefault(a.AccountCode, 0m);
                    var delta = a.Balance - prevBal;
                    return (Code: a.AccountCode, NameEn: a.NameEn, NameFr: a.NameFr, Delta: delta);
                })
                .Where(x => Math.Abs(x.Delta) > 0.01m)
                .OrderByDescending(x => Math.Abs(x.Delta));
        }

        private static decimal Change(List<TrialBalanceDto> current, List<TrialBalanceDto> previous, params string[] prefixes)
        {
            var cur = current.Where(a => prefixes.Any(p => a.AccountCode.StartsWith(p.TrimEnd('%')))).Sum(a => a.Balance);
            var prev = previous.Where(a => prefixes.Any(p => a.AccountCode.StartsWith(p.TrimEnd('%')))).Sum(a => a.Balance);
            return cur - prev;
        }
    }
}
