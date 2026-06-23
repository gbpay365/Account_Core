using ComptabiliteAPI.Domain.Entities;
using ComptabiliteAPI.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace ComptabiliteAPI.Infrastructure.Services
{
    public class IntegrationNotifyService
    {
        private readonly IntegrationOutboundService _outbound;
        private readonly AppDbContext _db;
        private readonly IntegrationSettingsService _settings;

        public IntegrationNotifyService(
            IntegrationOutboundService outbound,
            AppDbContext db,
            IntegrationSettingsService settings)
        {
            _outbound = outbound;
            _db = db;
            _settings = settings;
        }

        public async Task NotifyAccountChangedAsync(Account account, string evt, CancellationToken ct = default)
        {
            if (!_outbound.IsEnabled || account == null) return;
            var firstCompany = await _db.Companies.AsNoTracking().OrderBy(c => c.CreatedAt).Select(c => c.Id).FirstOrDefaultAsync(ct);
            var facilityId = firstCompany != Guid.Empty
                ? await ResolveFacilityForCompany(firstCompany, ct)
                : 1;
            await _outbound.EnqueueAccountChangedAsync(new
            {
                @event = evt,
                facility_id = facilityId,
                account = new
                {
                    code = account.Code,
                    label_en = account.NameEn,
                    label_fr = account.NameFr,
                    ohada_class = account.Class,
                    account_type = account.AccountType,
                    is_posting = account.IsLeaf,
                    active = account.IsActive,
                }
            }, ct);
            await _outbound.DeliverOutboxAsync(5, ct);
        }

        public async Task NotifyJournalPostedAsync(JournalEntry entry, CancellationToken ct = default)
        {
            if (!_outbound.IsEnabled || entry == null) return;
            if (string.Equals(entry.SourceSystem, "HMS", StringComparison.OrdinalIgnoreCase)) return;

            var lines = entry.JournalLines?.ToList() ?? await _db.JournalLines
                .AsNoTracking()
                .Where(l => l.EntryId == entry.Id)
                .ToListAsync(ct);

            var facilityId = await ResolveFacilityForCompany(entry.CompanyId, ct);

            await _outbound.EnqueueJournalPostedAsync(new
            {
                external_reference = $"core:je:{entry.Id}",
                facility_id = facilityId,
                entry = new
                {
                    entry_date = entry.EntryDate.ToString("yyyy-MM-dd"),
                    reference = entry.Reference,
                    description = entry.Description,
                    journal_type = entry.JournalType,
                    lines = lines.Select(l => new
                    {
                        account_code = l.AccountCode,
                        debit = l.Debit,
                        credit = l.Credit,
                        line_description = l.LineDescription,
                    })
                }
            }, ct);
            await _outbound.DeliverOutboxAsync(5, ct);
        }

        private async Task<int> ResolveFacilityForCompany(Guid companyId, CancellationToken ct)
        {
            var s = await _settings.GetForCompanyAsync(companyId, ct);
            if (s != null && s.HmsFacilityId > 0) return s.HmsFacilityId;
            return 1;
        }

        /// <summary>Payroll runs in Zaizens_PayRoll — no HMS pay-profile push.</summary>
        public Task NotifyPayProfileAsync(Employee employee, CancellationToken ct = default) =>
            Task.CompletedTask;

        /// <summary>Payroll runs in Zaizens_PayRoll — no HMS dept-summary push.</summary>
        public Task NotifyPayrollDeptSummaryAsync(PayrollPeriod period, CancellationToken ct = default) =>
            Task.CompletedTask;
    }
}
