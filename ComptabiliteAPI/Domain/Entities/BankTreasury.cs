namespace ComptabiliteAPI.Domain.Entities
{
    public class BankAccount
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid CompanyId { get; set; }
        public Company Company { get; set; } = null!;
        public string Code { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        /// <summary>Linked GL account (e.g. 571).</summary>
        public string LedgerAccountCode { get; set; } = string.Empty;
        public string Currency { get; set; } = "XAF";
        public bool IsActive { get; set; } = true;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public ICollection<BankStatement> Statements { get; set; } = new List<BankStatement>();
    }

    public class BankStatement
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid BankAccountId { get; set; }
        public BankAccount BankAccount { get; set; } = null!;
        public DateTime StatementDate { get; set; }
        public string Reference { get; set; } = string.Empty;
        public decimal OpeningBalance { get; set; }
        public decimal ClosingBalance { get; set; }
        public DateTime ImportedAt { get; set; } = DateTime.UtcNow;
        public ICollection<BankStatementLine> Lines { get; set; } = new List<BankStatementLine>();
    }

    public class BankStatementLine
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid BankStatementId { get; set; }
        public BankStatement BankStatement { get; set; } = null!;
        public DateTime LineDate { get; set; }
        public string Description { get; set; } = string.Empty;
        public decimal Amount { get; set; }
        public bool IsReconciled { get; set; }
        public Guid? MatchedJournalEntryId { get; set; }
        public JournalEntry? MatchedJournalEntry { get; set; }
        public Guid? MatchedJournalLineId { get; set; }
    }
}
