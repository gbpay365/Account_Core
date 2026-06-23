namespace ComptabiliteAPI.DTOs
{
    public class TrialBalanceDto
    {
        public string AccountCode { get; set; } = string.Empty;
        public string NameFr { get; set; } = string.Empty;
        public string NameEn { get; set; } = string.Empty;
        public string AccountType { get; set; } = string.Empty;
        public string NormalBalance { get; set; } = string.Empty;
        public decimal TotalDebit { get; set; }
        public decimal TotalCredit { get; set; }
        public decimal Balance { get; set; }
    }
}
