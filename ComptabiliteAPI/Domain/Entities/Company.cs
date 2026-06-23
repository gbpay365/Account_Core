using System.Collections.Generic;

namespace ComptabiliteAPI.Domain.Entities
{
    public class Company
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public string Name { get; set; } = string.Empty;
        public string TaxId { get; set; } = string.Empty;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        public decimal TransportAllowanceRate { get; set; } = 0.10m;      // 10% of base — non-taxable (Cameroon)
        public decimal HousingAllowanceRate { get; set; } = 0.15m;         // 15% of base — 100% taxable
        public decimal BenefitsInKindRate { get; set; } = 0.10m;           // 10% of base — 100% taxable (Avantages en nature)
        public decimal RepresentationAllowanceRate { get; set; } = 0.10m;  // 10% of base — non-taxable (Indemnité de représentation)

        public bool ApproveThirteenthMonth { get; set; } = false;
        public bool ApproveSeniorityBonus { get; set; } = false;
        public bool ApproveOvertimePay { get; set; } = false;
        public bool ApproveBonuses { get; set; } = false;

        public ICollection<UserCompany> UserCompanies { get; set; } = new List<UserCompany>();
        public ICollection<JournalEntry> JournalEntries { get; set; } = new List<JournalEntry>();
        public ICollection<CostCenter> CostCenters { get; set; } = new List<CostCenter>();
        public ICollection<Currency> Currencies { get; set; } = new List<Currency>();
        public ICollection<FiscalYear> FiscalYears { get; set; } = new List<FiscalYear>();
        public ICollection<AccountingJournal> AccountingJournals { get; set; } = new List<AccountingJournal>();
        public ICollection<Reconciliation> Reconciliations { get; set; } = new List<Reconciliation>();
    }
}
