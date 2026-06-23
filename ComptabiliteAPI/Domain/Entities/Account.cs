namespace ComptabiliteAPI.Domain.Entities
{
    public class Account
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public string Code { get; set; } = string.Empty;
        public string NameFr { get; set; } = string.Empty;
        public string NameEn { get; set; } = string.Empty;
        public int Class { get; set; }
        public Guid? ParentId { get; set; }
        public Account? Parent { get; set; }
        public string AccountType { get; set; } = string.Empty;  // "asset","liability","equity","expense","revenue","cost"
        public string NormalBalance { get; set; } = string.Empty; // "debit" or "credit"
        public bool IsLeaf { get; set; } = true;
        public int? FiscalYear { get; set; }
        public bool IsActive { get; set; } = true;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}
