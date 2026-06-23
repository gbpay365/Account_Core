namespace ComptabiliteAPI.DTOs
{
    public sealed class AccountAdminDto
    {
        public Guid Id { get; set; }
        public string Code { get; set; } = string.Empty;
        public string NameEn { get; set; } = string.Empty;
        public string NameFr { get; set; } = string.Empty;
        public int Class { get; set; }
        public string? ParentCode { get; set; }
        public string AccountType { get; set; } = string.Empty;
        public string NormalBalance { get; set; } = "debit";
        public bool IsLeaf { get; set; }
        public bool IsActive { get; set; } = true;
    }

    public sealed class CreateAccountRequest
    {
        public string Code { get; set; } = string.Empty;
        public string NameEn { get; set; } = string.Empty;
        public string NameFr { get; set; } = string.Empty;
        public string AccountType { get; set; } = "expense";
        public string NormalBalance { get; set; } = "debit";
        /// <summary>Usually true for a postable (leaf) compte. Set false for a grouping account (non-postable until children are removed).</summary>
        public bool IsLeaf { get; set; } = true;
    }

    public sealed class UpdateAccountRequest
    {
        public string? NameEn { get; set; }
        public string? NameFr { get; set; }
        public string? AccountType { get; set; }
        public string? NormalBalance { get; set; }
        public bool? IsLeaf { get; set; }
        public bool? IsActive { get; set; }
    }

    public sealed class DeleteAccountResult
    {
        public bool Ok { get; set; }
        public string? Error { get; set; }
        public bool Deactivated { get; set; }
    }
}
