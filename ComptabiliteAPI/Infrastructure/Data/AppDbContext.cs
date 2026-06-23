using ComptabiliteAPI.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace ComptabiliteAPI.Infrastructure.Data
{
    public class AppDbContext : DbContext
    {
        public DbSet<Company> Companies { get; set; }
        public DbSet<User> Users { get; set; }
        public DbSet<UserCompany> UserCompanies { get; set; }
        public DbSet<Role> Roles { get; set; }
        public DbSet<Permission> Permissions { get; set; }
        public DbSet<RolePermission> RolePermissions { get; set; }
        public DbSet<Account> Accounts { get; set; }
        public DbSet<JournalEntry> JournalEntries { get; set; }
        public DbSet<JournalLine> JournalLines { get; set; }
        public DbSet<CostCenter> CostCenters { get; set; }
        public DbSet<ReportAccessLog> ReportAccessLogs { get; set; }
        
        // Commercial ERP
        public DbSet<ProductFamily> ProductFamilies { get; set; }
        public DbSet<Product> Products { get; set; }
        public DbSet<Customer> Customers { get; set; }
        public DbSet<SalesDocument> SalesDocuments { get; set; }
        public DbSet<SalesDocumentLine> SalesDocumentLines { get; set; }
        public DbSet<Warehouse> Warehouses { get; set; }
        public DbSet<InventoryMovement> InventoryMovements { get; set; }
        public DbSet<Lead> Leads { get; set; }
        public DbSet<SalesQuote> SalesQuotes { get; set; }
        public DbSet<SalesQuoteLine> SalesQuoteLines { get; set; }
        public DbSet<PortalAccessLink> PortalAccessLinks { get; set; }

        // HR & Payroll
        public DbSet<Employee> Employees { get; set; }
        public DbSet<PayrollPeriod> PayrollPeriods { get; set; }
        public DbSet<PayrollDetail> PayrollDetails { get; set; }
        public DbSet<PayrollDepartmentSummary> PayrollDepartmentSummaries { get; set; }

        public DbSet<TaxDeclaration> TaxDeclarations { get; set; }
        public DbSet<TaxDeclarationAttachment> TaxDeclarationAttachments { get; set; }
        public DbSet<FecGeneration> FecGenerations { get; set; }

        public DbSet<BankAccount> BankAccounts { get; set; }
        public DbSet<BankStatement> BankStatements { get; set; }
        public DbSet<BankStatementLine> BankStatementLines { get; set; }
        public DbSet<FixedAsset> FixedAssets { get; set; }
        public DbSet<FixedAssetDepreciationLine> FixedAssetDepreciationLines { get; set; }
        public DbSet<FixedAssetComponent> FixedAssetComponents { get; set; }
        public DbSet<FixedAssetEvent> FixedAssetEvents { get; set; }
        public DbSet<CustomerPayment> CustomerPayments { get; set; }
        public DbSet<Supplier> Suppliers { get; set; }
        public DbSet<SupplierInvoice> SupplierInvoices { get; set; }
        public DbSet<SupplierInvoiceLine> SupplierInvoiceLines { get; set; }
        public DbSet<SupplierPayment> SupplierPayments { get; set; }
        public DbSet<SupplierPaymentAllocation> SupplierPaymentAllocations { get; set; }
        public DbSet<FiscalPeriodLock> FiscalPeriodLocks { get; set; }
        public DbSet<AnalyticAccount> AnalyticAccounts { get; set; }
        public DbSet<JournalLineAnalytic> JournalLineAnalytics { get; set; }
        public DbSet<AuditLogEntry> AuditLogEntries { get; set; }
        public DbSet<TaxRulePack> TaxRulePacks { get; set; }
        public DbSet<LegalWormEntry> LegalWormEntries { get; set; }

        public DbSet<Currency> Currencies { get; set; }
        public DbSet<FiscalYear> FiscalYears { get; set; }
        public DbSet<Period> Periods { get; set; }
        public DbSet<AccountingJournal> AccountingJournals { get; set; }
        public DbSet<Reconciliation> Reconciliations { get; set; }

        public DbSet<Plan> Plans { get; set; }
        public DbSet<Subscription> Subscriptions { get; set; }
        public DbSet<PaymentTransaction> PaymentTransactions { get; set; }
        public DbSet<ValidationRule> ValidationRules { get; set; }
        public DbSet<RuleCondition> RuleConditions { get; set; }

        public DbSet<IntegrationOutbox> IntegrationOutboxes { get; set; }
        public DbSet<IntegrationEntityLink> IntegrationEntityLinks { get; set; }
        public DbSet<CompanyIntegrationSettings> CompanyIntegrationSettings { get; set; }

        public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            // Composite keys
            modelBuilder.Entity<UserCompany>()
                .HasKey(uc => new { uc.UserId, uc.CompanyId });

            modelBuilder.Entity<RolePermission>()
                .HasKey(rp => new { rp.RoleId, rp.PermissionId });

            modelBuilder.Entity<CompanyIntegrationSettings>()
                .HasKey(x => x.CompanyId);
            modelBuilder.Entity<CompanyIntegrationSettings>()
                .HasIndex(x => x.HmsFacilityId)
                .IsUnique();

            // Unique constraints
            modelBuilder.Entity<Account>()
                .HasIndex(a => new { a.Code, a.FiscalYear })
                .IsUnique();

            modelBuilder.Entity<Permission>()
                .HasIndex(p => new { p.Resource, p.Action })
                .IsUnique();

            // ERP Unique constraints
            modelBuilder.Entity<Product>()
                .HasIndex(p => p.Code)
                .IsUnique();

            modelBuilder.Entity<Customer>()
                .HasIndex(c => new { c.CompanyId, c.AccountCode })
                .IsUnique();

            modelBuilder.Entity<SalesDocument>()
                .HasIndex(s => new { s.CompanyId, s.DocumentNumber })
                .IsUnique();

            modelBuilder.Entity<PayrollPeriod>()
                .HasIndex(p => new { p.CompanyId, p.PeriodDate })
                .IsUnique();

            modelBuilder.Entity<PayrollDepartmentSummary>()
                .HasIndex(s => new { s.CompanyId, s.Year, s.Month, s.Department })
                .IsUnique();

            modelBuilder.Entity<JournalEntry>()
                .HasIndex(e => new { e.CompanyId, e.SourceSystem, e.ExternalReference })
                .IsUnique()
                .HasFilter("\"SourceSystem\" IS NOT NULL AND \"ExternalReference\" IS NOT NULL");

            modelBuilder.Entity<IntegrationEntityLink>()
                .HasIndex(l => new { l.CompanyId, l.SourceSystem, l.EntityType, l.ExternalId })
                .IsUnique();

            modelBuilder.Entity<Employee>()
                .HasIndex(e => new { e.CompanyId, e.ExternalHmsEmployeeId })
                .IsUnique()
                .HasFilter("\"ExternalHmsEmployeeId\" IS NOT NULL");

            // Check constraints
            modelBuilder.Entity<JournalLine>()
                .ToTable(t => t.HasCheckConstraint("CK_JournalLine_DebitCredit", 
                    "\"Debit\" >= 0 AND \"Credit\" >= 0 AND (\"Debit\" + \"Credit\") > 0"));
            
            // Delete behaviors
            modelBuilder.Entity<RolePermission>()
                .HasOne(rp => rp.Role)
                .WithMany(r => r.RolePermissions)
                .HasForeignKey(rp => rp.RoleId)
                .OnDelete(DeleteBehavior.Cascade);
                
            modelBuilder.Entity<RolePermission>()
                .HasOne(rp => rp.Permission)
                .WithMany(p => p.RolePermissions)
                .HasForeignKey(rp => rp.PermissionId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<JournalLine>()
                .HasOne(jl => jl.Entry)
                .WithMany(je => je.JournalLines)
                .HasForeignKey(jl => jl.EntryId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<CostCenter>()
                .HasIndex(c => new { c.CompanyId, c.Code })
                .IsUnique();
            modelBuilder.Entity<CostCenter>()
                .HasOne(c => c.Company)
                .WithMany(co => co.CostCenters)
                .HasForeignKey(c => c.CompanyId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<TaxDeclaration>()
                .HasOne(d => d.CreatedBy)
                .WithMany()
                .HasForeignKey(d => d.CreatedById)
                .OnDelete(DeleteBehavior.Restrict);

            modelBuilder.Entity<TaxDeclarationAttachment>()
                .HasOne(a => a.TaxDeclaration)
                .WithMany(d => d.Attachments)
                .HasForeignKey(a => a.TaxDeclarationId)
                .OnDelete(DeleteBehavior.Cascade);

            // Store JSON as text — jsonb + string mapping can fail to round-trip in some Npgsql/EF versions (UI sees empty {}).
            modelBuilder.Entity<TaxDeclaration>()
                .Property(d => d.DeclarationData)
                .HasColumnType("text");

            modelBuilder.Entity<FecGeneration>()
                .HasOne(f => f.GeneratedBy)
                .WithMany()
                .HasForeignKey(f => f.GeneratedById)
                .OnDelete(DeleteBehavior.Restrict);

            modelBuilder.Entity<BankAccount>()
                .HasIndex(b => new { b.CompanyId, b.Code })
                .IsUnique();

            modelBuilder.Entity<BankStatement>()
                .HasOne(s => s.BankAccount)
                .WithMany(a => a.Statements)
                .HasForeignKey(s => s.BankAccountId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<BankStatementLine>()
                .HasOne(l => l.BankStatement)
                .WithMany(s => s.Lines)
                .HasForeignKey(l => l.BankStatementId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<BankStatementLine>()
                .HasOne(l => l.MatchedJournalEntry)
                .WithMany()
                .HasForeignKey(l => l.MatchedJournalEntryId)
                .OnDelete(DeleteBehavior.SetNull);

            modelBuilder.Entity<FixedAsset>()
                .HasIndex(a => new { a.CompanyId, a.Code })
                .IsUnique();

            modelBuilder.Entity<FixedAssetDepreciationLine>()
                .HasIndex(l => new { l.FixedAssetId, l.PeriodYearMonth })
                .IsUnique()
                .HasFilter("\"FixedAssetComponentId\" IS NULL");

            modelBuilder.Entity<FixedAssetDepreciationLine>()
                .HasOne(l => l.Component)
                .WithMany()
                .HasForeignKey(l => l.FixedAssetComponentId)
                .OnDelete(DeleteBehavior.SetNull);

            modelBuilder.Entity<FixedAssetComponent>()
                .HasOne(c => c.FixedAsset)
                .WithMany(a => a.Components)
                .HasForeignKey(c => c.FixedAssetId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<FixedAssetEvent>()
                .HasOne(e => e.FixedAsset)
                .WithMany(a => a.Events)
                .HasForeignKey(e => e.FixedAssetId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<FixedAsset>()
                .HasIndex(a => new { a.CompanyId, a.ExternalHmsRef })
                .IsUnique()
                .HasFilter("\"ExternalHmsRef\" IS NOT NULL AND \"ExternalHmsRef\" <> ''");

            modelBuilder.Entity<Supplier>()
                .HasIndex(s => new { s.CompanyId, s.AccountCode })
                .IsUnique();

            modelBuilder.Entity<FiscalPeriodLock>()
                .HasIndex(l => new { l.CompanyId, l.FiscalYear, l.FiscalMonth })
                .IsUnique();

            modelBuilder.Entity<FiscalPeriodLock>()
                .HasOne(l => l.LockedByUser)
                .WithMany()
                .HasForeignKey(l => l.LockedByUserId)
                .OnDelete(DeleteBehavior.Restrict);

            modelBuilder.Entity<AnalyticAccount>()
                .HasIndex(a => new { a.CompanyId, a.Code })
                .IsUnique();

            modelBuilder.Entity<Warehouse>()
                .HasIndex(w => new { w.CompanyId, w.Code })
                .IsUnique();

            modelBuilder.Entity<InventoryMovement>()
                .HasOne(m => m.Warehouse)
                .WithMany(w => w.Movements)
                .HasForeignKey(m => m.WarehouseId)
                .OnDelete(DeleteBehavior.Restrict);

            modelBuilder.Entity<SalesQuote>()
                .HasIndex(q => new { q.CompanyId, q.QuoteNumber })
                .IsUnique();

            modelBuilder.Entity<SalesQuoteLine>()
                .HasOne(l => l.SalesQuote)
                .WithMany(q => q.Lines)
                .HasForeignKey(l => l.SalesQuoteId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<PortalAccessLink>()
                .HasIndex(p => p.SecureToken)
                .IsUnique();

            modelBuilder.Entity<JournalLineAnalytic>()
                .HasIndex(x => x.JournalLineId)
                .IsUnique();

            modelBuilder.Entity<JournalLineAnalytic>()
                .HasOne(x => x.JournalLine)
                .WithMany()
                .HasForeignKey(x => x.JournalLineId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<JournalLineAnalytic>()
                .HasOne(x => x.AnalyticAccount)
                .WithMany()
                .HasForeignKey(x => x.AnalyticAccountId)
                .OnDelete(DeleteBehavior.Restrict);

            modelBuilder.Entity<AuditLogEntry>()
                .HasOne(e => e.User)
                .WithMany()
                .HasForeignKey(e => e.UserId)
                .OnDelete(DeleteBehavior.Restrict);

            modelBuilder.Entity<AuditLogEntry>()
                .HasOne(e => e.Company)
                .WithMany()
                .HasForeignKey(e => e.CompanyId)
                .OnDelete(DeleteBehavior.SetNull);

            modelBuilder.Entity<TaxRulePack>()
                .HasIndex(p => new { p.Code, p.Version })
                .IsUnique();

            modelBuilder.Entity<CustomerPayment>()
                .HasOne(p => p.Customer)
                .WithMany(c => c.Payments)
                .HasForeignKey(p => p.CustomerId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<CustomerPayment>()
                .HasOne(p => p.JournalEntry)
                .WithMany()
                .HasForeignKey(p => p.JournalEntryId)
                .OnDelete(DeleteBehavior.SetNull);

            modelBuilder.Entity<SupplierInvoice>()
                .HasOne(i => i.Supplier)
                .WithMany(s => s.Invoices)
                .HasForeignKey(i => i.SupplierId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<SupplierInvoice>()
                .HasOne(i => i.JournalEntry)
                .WithMany()
                .HasForeignKey(i => i.JournalEntryId)
                .OnDelete(DeleteBehavior.SetNull);

            modelBuilder.Entity<SupplierPayment>()
                .HasOne(p => p.Supplier)
                .WithMany(s => s.Payments)
                .HasForeignKey(p => p.SupplierId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<SupplierPayment>()
                .HasOne(p => p.JournalEntry)
                .WithMany()
                .HasForeignKey(p => p.JournalEntryId)
                .OnDelete(DeleteBehavior.SetNull);

            modelBuilder.Entity<SupplierInvoiceLine>()
                .HasOne(l => l.SupplierInvoice)
                .WithMany(i => i.Lines)
                .HasForeignKey(l => l.SupplierInvoiceId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<SupplierPaymentAllocation>()
                .HasOne(a => a.SupplierPayment)
                .WithMany(p => p.Allocations)
                .HasForeignKey(a => a.SupplierPaymentId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<SupplierPaymentAllocation>()
                .HasOne(a => a.SupplierInvoice)
                .WithMany(i => i.PaymentAllocations)
                .HasForeignKey(a => a.SupplierInvoiceId)
                .OnDelete(DeleteBehavior.Restrict);

            modelBuilder.Entity<SupplierPaymentAllocation>()
                .HasIndex(a => new { a.SupplierPaymentId, a.SupplierInvoiceId })
                .IsUnique();

            modelBuilder.Entity<SupplierInvoice>()
                .HasIndex(i => new { i.SupplierId, i.InvoiceNumber })
                .IsUnique();

            modelBuilder.Entity<FixedAssetDepreciationLine>()
                .HasOne(l => l.FixedAsset)
                .WithMany(a => a.DepreciationLines)
                .HasForeignKey(l => l.FixedAssetId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<FixedAssetDepreciationLine>()
                .HasOne(l => l.PostedJournalEntry)
                .WithMany()
                .HasForeignKey(l => l.PostedJournalEntryId)
                .OnDelete(DeleteBehavior.SetNull);

            modelBuilder.Entity<Lead>()
                .HasOne(l => l.AssignedToUser)
                .WithMany()
                .HasForeignKey(l => l.AssignedToUserId)
                .OnDelete(DeleteBehavior.SetNull);

            modelBuilder.Entity<PortalAccessLink>()
                .HasOne(p => p.Customer)
                .WithMany()
                .HasForeignKey(p => p.CustomerId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<PortalAccessLink>()
                .HasOne(p => p.Supplier)
                .WithMany()
                .HasForeignKey(p => p.SupplierId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<LegalWormEntry>()
                .HasIndex(e => e.ChainIndex)
                .IsUnique();

            modelBuilder.Entity<LegalWormEntry>()
                .HasOne(e => e.ActorUser)
                .WithMany()
                .HasForeignKey(e => e.ActorUserId)
                .OnDelete(DeleteBehavior.SetNull);

            modelBuilder.Entity<LegalWormEntry>()
                .HasOne(e => e.Company)
                .WithMany()
                .HasForeignKey(e => e.CompanyId)
                .OnDelete(DeleteBehavior.SetNull);

            modelBuilder.Entity<Currency>()
                .HasIndex(c => new { c.CompanyId, c.Code })
                .IsUnique();

            modelBuilder.Entity<FiscalYear>()
                .HasIndex(fy => new { fy.CompanyId, fy.Year })
                .IsUnique();

            modelBuilder.Entity<Period>()
                .HasIndex(p => new { p.FiscalYearId, p.Number })
                .IsUnique();

            modelBuilder.Entity<AccountingJournal>()
                .HasIndex(j => new { j.CompanyId, j.Code })
                .IsUnique();

            modelBuilder.Entity<FiscalYear>()
                .HasOne(fy => fy.Company)
                .WithMany(c => c.FiscalYears)
                .HasForeignKey(fy => fy.CompanyId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<Period>()
                .HasOne(p => p.FiscalYear)
                .WithMany(fy => fy.Periods)
                .HasForeignKey(p => p.FiscalYearId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<JournalEntry>()
                .HasOne(je => je.Journal)
                .WithMany()
                .HasForeignKey(je => je.JournalId)
                .OnDelete(DeleteBehavior.SetNull);

            modelBuilder.Entity<Reconciliation>()
                .HasOne(r => r.CreatedBy)
                .WithMany()
                .HasForeignKey(r => r.CreatedById)
                .OnDelete(DeleteBehavior.Restrict);

            modelBuilder.Entity<Plan>()
                .HasIndex(p => p.Code)
                .IsUnique();

            modelBuilder.Entity<Subscription>()
                .HasOne(s => s.Company)
                .WithMany()
                .HasForeignKey(s => s.CompanyId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<Subscription>()
                .HasOne(s => s.Plan)
                .WithMany()
                .HasForeignKey(s => s.PlanId)
                .OnDelete(DeleteBehavior.Restrict);

            modelBuilder.Entity<PaymentTransaction>()
                .HasOne(p => p.Subscription)
                .WithMany()
                .HasForeignKey(p => p.SubscriptionId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<ValidationRule>()
                .HasOne(r => r.Company)
                .WithMany()
                .HasForeignKey(r => r.CompanyId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<RuleCondition>()
                .HasOne(c => c.Rule)
                .WithMany(r => r.Conditions)
                .HasForeignKey(c => c.RuleId)
                .OnDelete(DeleteBehavior.Cascade);
        }
    }
}
