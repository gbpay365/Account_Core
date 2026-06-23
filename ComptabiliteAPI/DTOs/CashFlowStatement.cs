namespace ComptabiliteAPI.DTOs
{
    public class CashFlowStatement
    {
        public decimal OperatingCF { get; set; }
        public decimal InvestingCF { get; set; }
        public decimal FinancingCF { get; set; }
        public decimal NetCashFlow => OperatingCF + InvestingCF + FinancingCF;

        /// <summary>Cumulative signed balance of all class-5 accounts (journal through prior fiscal year-end).</summary>
        public decimal OpeningCashClass5 { get; set; }

        /// <summary>Cumulative signed balance of all class-5 accounts (journal through current fiscal year-end).</summary>
        public decimal ClosingCashClass5 { get; set; }

        /// <summary>ClosingCashClass5 − OpeningCashClass5 (ledger cash bridge).</summary>
        public decimal ChangeInCashClass5Ledger => ClosingCashClass5 - OpeningCashClass5;

        /// <summary>Ledger bridge vs modeled indirect flow (should trend to zero as the model improves).</summary>
        public decimal CashBridgeVariance => ChangeInCashClass5Ledger - NetCashFlow;

        public List<CashFlowLine> Lines { get; set; } = new List<CashFlowLine>();
    }

    public class CashFlowLine
    {
        public string LabelFr { get; set; } = string.Empty;
        public string LabelEn { get; set; } = string.Empty;
        public decimal Amount { get; set; }

        /// <summary>detail | subtotal | placeholder | section_header</summary>
        public string LineKind { get; set; } = "detail";

        /// <summary>operating | investing | financing | bridge</summary>
        public string Section { get; set; } = "operating";
    }
}
