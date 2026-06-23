namespace ComptabiliteAPI.DTOs
{
    public class IncomeStatement
    {
        public decimal TotalRevenue { get; set; }
        public decimal TotalExpenses { get; set; }
        public decimal NetIncome => TotalRevenue - TotalExpenses;

        public List<StatementLine> Revenues { get; set; } = new List<StatementLine>();
        public List<StatementLine> Expenses { get; set; } = new List<StatementLine>();
    }

    public class BalanceSheetStatement
    {
        public decimal TotalAssets { get; set; }
        public decimal TotalLiabilities { get; set; }
        public decimal TotalEquity { get; set; }
        public decimal TotalLiabilitiesAndEquity => TotalLiabilities + TotalEquity;

        public List<StatementLine> Assets { get; set; } = new List<StatementLine>();
        public List<StatementLine> Liabilities { get; set; } = new List<StatementLine>();
        public List<StatementLine> Equity { get; set; } = new List<StatementLine>();
    }

    public class StatementLine
    {
        public string Code { get; set; } = string.Empty;
        public string LabelFr { get; set; } = string.Empty;
        public string LabelEn { get; set; } = string.Empty;
        public decimal Amount { get; set; }
    }
}
