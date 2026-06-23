using ComptabiliteAPI.Domain.Entities;

namespace ComptabiliteAPI.Domain.Interfaces
{
    public interface IFiscalPeriodService
    {
        Task EnsurePeriodUnlockedForDateAsync(Guid companyId, DateTime entryDate, CancellationToken cancellationToken = default);
        Task<IReadOnlyList<FiscalPeriodLock>> GetLocksAsync(Guid companyId, CancellationToken cancellationToken = default);
        Task<FiscalPeriodLock> LockPeriodAsync(Guid companyId, int fiscalYear, int fiscalMonth, Guid userId, string notes, CancellationToken cancellationToken = default);
    }

    public interface IImmutableAuditService
    {
        Task LogAsync(Guid userId, Guid? companyId, string action, string entityType, string? entityId, string payloadJson, string ipAddress, CancellationToken cancellationToken = default);
        Task<IReadOnlyList<AuditLogEntry>> QueryAsync(Guid? companyId, int take, CancellationToken cancellationToken = default);
    }

    public interface IBankTreasuryService
    {
        Task<IReadOnlyList<BankAccount>> ListBankAccountsAsync(Guid companyId, CancellationToken cancellationToken = default);
        Task<BankAccount> CreateBankAccountAsync(BankAccount account, CancellationToken cancellationToken = default);
        Task<BankStatement> ImportStatementAsync(Guid bankAccountId, DateTime statementDate, string reference, decimal openingBalance, decimal closingBalance, IReadOnlyList<(DateTime date, string description, decimal amount)> lines, CancellationToken cancellationToken = default);
        Task<BankStatement> SyncBankTransactionsAsync(Guid bankAccountId, string accessToken, DateTime startDate, DateTime endDate, CancellationToken cancellationToken = default);
        Task<bool> TryMatchStatementLineAsync(Guid statementLineId, Guid companyId, CancellationToken cancellationToken = default);
    }

    public interface IFixedAssetService
    {
        Task<IReadOnlyList<FixedAsset>> ListAsync(Guid companyId, CancellationToken cancellationToken = default);
        Task<FixedAsset> CreateAsync(FixedAsset asset, CancellationToken cancellationToken = default);
        Task<FixedAssetDepreciationLine?> PostMonthlyDepreciationAsync(Guid assetId, int periodYearMonth, Guid userId, CancellationToken cancellationToken = default);
    }

    // Legacy shim — use IAssetService for full module.

    public interface IAgingService
    {
        Task<object> GetArAgingAsync(Guid companyId, DateTime asOf, CancellationToken cancellationToken = default);
        Task<object> GetApAgingAsync(Guid companyId, DateTime asOf, CancellationToken cancellationToken = default);
    }

    public interface IAnalyticAccountService
    {
        Task<IReadOnlyList<AnalyticAccount>> ListAsync(Guid companyId, CancellationToken cancellationToken = default);
        Task<AnalyticAccount> CreateAsync(AnalyticAccount account, CancellationToken cancellationToken = default);
        Task AttachToJournalLineAsync(Guid journalLineId, Guid analyticAccountId, CancellationToken cancellationToken = default);
        Task<IReadOnlyList<ProjectProfitabilityDto>> GetProjectProfitabilityAsync(Guid companyId, int fiscalYear, CancellationToken cancellationToken = default);
    }

    public class ProjectProfitabilityDto
    {
        public Guid ProjectId { get; set; }
        public string ProjectName { get; set; } = string.Empty;
        public decimal TotalRevenue { get; set; }
        public decimal TotalExpense { get; set; }
        public decimal NetProfit => TotalRevenue - TotalExpense;
    }

    public interface ITaxRuleCatalogService
    {
        Task<IReadOnlyList<TaxRulePack>> ListPacksAsync(CancellationToken cancellationToken = default);
        Task<TaxRulePack?> GetActivePackAsync(string code, DateTime asOf, CancellationToken cancellationToken = default);
    }

    public interface ILegalWormService
    {
        Task<IReadOnlyList<LegalWormEntry>> ListEntriesAsync(Guid companyId, int take = 100, CancellationToken cancellationToken = default);
        Task<LegalWormEntry> RegisterEntryAsync(Guid companyId, Guid? actorUserId, string entityType, string entityId, string payloadHash, string payloadCanonicalJson, CancellationToken cancellationToken = default);
    }
}
