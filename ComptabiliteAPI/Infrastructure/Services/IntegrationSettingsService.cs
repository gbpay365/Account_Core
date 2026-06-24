using ComptabiliteAPI.Configuration;
using ComptabiliteAPI.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace ComptabiliteAPI.Infrastructure.Services
{
    public class IntegrationSettingsService
    {
        private readonly AppDbContext _db;
        private readonly IntegrationOptions _opts;

        public IntegrationSettingsService(AppDbContext db, IOptions<IntegrationOptions> opts)
        {
            _db = db;
            _opts = opts.Value;
        }

        public async Task<CompanyIntegrationSettingsDto?> GetForCompanyAsync(Guid companyId, CancellationToken ct = default)
        {
            var row = await _db.CompanyIntegrationSettings.AsNoTracking()
                .FirstOrDefaultAsync(x => x.CompanyId == companyId, ct);
            return row == null ? null : Map(row);
        }

        public async Task<CompanyIntegrationSettingsDto> GetOrDefaultsAsync(Guid companyId, CancellationToken ct = default)
        {
            var row = await GetForCompanyAsync(companyId, ct);
            if (row == null)
            {
                return DefaultDto(companyId);
            }
            return ApplyDefaults(row);
        }

        public CompanyIntegrationSettingsDto ApplyDefaults(CompanyIntegrationSettingsDto dto)
        {
            var d = DefaultDto(dto.CompanyId);
            return new CompanyIntegrationSettingsDto
            {
                CompanyId = dto.CompanyId,
                HmsFacilityId = dto.HmsFacilityId > 0 ? dto.HmsFacilityId : d.HmsFacilityId,
                PublicBaseUrl = CoalesceUrl(dto.PublicBaseUrl, d.PublicBaseUrl),
                HmsBaseUrl = CoalesceUrl(dto.HmsBaseUrl, d.HmsBaseUrl),
                HmsWebhookKey = CoalesceKey(dto.HmsWebhookKey, d.HmsWebhookKey),
                ZaizensPayrollBaseUrl = CoalesceUrl(dto.ZaizensPayrollBaseUrl, d.ZaizensPayrollBaseUrl),
                InboundApiKey = CoalesceKey(dto.InboundApiKey, d.InboundApiKey),
                UpdatedAt = dto.UpdatedAt,
            };
        }

        public CompanyIntegrationSettingsDto MergeForTest(Guid companyId, CompanyIntegrationSettingsDto? form, CompanyIntegrationSettingsDto saved)
        {
            var merged = ApplyDefaults(saved);
            if (form == null) return merged;
            if (form.HmsFacilityId > 0) merged.HmsFacilityId = form.HmsFacilityId;
            if (!string.IsNullOrWhiteSpace(form.PublicBaseUrl)) merged.PublicBaseUrl = IntegrationUrlNormalizer.Normalize(form.PublicBaseUrl);
            if (!string.IsNullOrWhiteSpace(form.HmsBaseUrl)) merged.HmsBaseUrl = IntegrationUrlNormalizer.Normalize(form.HmsBaseUrl);
            if (!string.IsNullOrWhiteSpace(form.HmsWebhookKey)) merged.HmsWebhookKey = form.HmsWebhookKey.Trim();
            if (!string.IsNullOrWhiteSpace(form.ZaizensPayrollBaseUrl)) merged.ZaizensPayrollBaseUrl = IntegrationUrlNormalizer.Normalize(form.ZaizensPayrollBaseUrl);
            if (!string.IsNullOrWhiteSpace(form.InboundApiKey)) merged.InboundApiKey = form.InboundApiKey.Trim();
            return ApplyDefaults(merged);
        }

        private CompanyIntegrationSettingsDto DefaultDto(Guid companyId) => new()
        {
            CompanyId = companyId,
            HmsFacilityId = 1,
            HmsBaseUrl = _opts.HmsBaseUrl,
            HmsWebhookKey = _opts.HmsWebhookKey,
            ZaizensPayrollBaseUrl = _opts.ZaizensPayrollBaseUrl,
            InboundApiKey = _opts.ApiKey,
        };

        private static string? CoalesceUrl(string? value, string? fallback)
        {
            if (IsMissingOrPlaceholder(value)) return fallback;
            return value!.Trim().TrimEnd('/');
        }

        private static string? CoalesceKey(string? value, string? fallback)
        {
            if (string.IsNullOrWhiteSpace(value)) return fallback;
            return value.Trim();
        }

        private static bool IsMissingOrPlaceholder(string? url)
        {
            if (string.IsNullOrWhiteSpace(url)) return true;
            var u = url.Trim().ToLowerInvariant();
            return u.Contains("example.com") || u.Contains("example.c");
        }

        public async Task<CompanyIntegrationSettingsDto> SaveAsync(Guid companyId, CompanyIntegrationSettingsDto dto, CancellationToken ct = default)
        {
            var zaizensErr = IntegrationUrlNormalizer.ValidateZaizensPayrollUrl(dto.ZaizensPayrollBaseUrl);
            if (zaizensErr != null) throw new InvalidOperationException(zaizensErr);
            var hmsErr = IntegrationUrlNormalizer.ValidateHmsUrl(dto.HmsBaseUrl);
            if (hmsErr != null) throw new InvalidOperationException(hmsErr);

            var row = await _db.CompanyIntegrationSettings.FirstOrDefaultAsync(x => x.CompanyId == companyId, ct);
            if (row == null)
            {
                row = new Domain.Entities.CompanyIntegrationSettings { CompanyId = companyId };
                _db.CompanyIntegrationSettings.Add(row);
            }

            row.HmsFacilityId = dto.HmsFacilityId > 0 ? dto.HmsFacilityId : 1;
            row.PublicBaseUrl = TrimUrl(IntegrationUrlNormalizer.Normalize(dto.PublicBaseUrl));
            row.HmsBaseUrl = TrimUrl(IntegrationUrlNormalizer.Normalize(dto.HmsBaseUrl));
            row.HmsWebhookKey = string.IsNullOrWhiteSpace(dto.HmsWebhookKey) ? null : dto.HmsWebhookKey.Trim();
            row.ZaizensPayrollBaseUrl = TrimUrl(IntegrationUrlNormalizer.Normalize(dto.ZaizensPayrollBaseUrl));
            row.InboundApiKey = string.IsNullOrWhiteSpace(dto.InboundApiKey) ? null : dto.InboundApiKey.Trim();
            row.UpdatedAt = DateTime.UtcNow;

            await _db.SaveChangesAsync(ct);
            return Map(row);
        }

        public async Task<Guid?> ResolveCompanyIdByFacilityAsync(int facilityId, CancellationToken ct = default)
        {
            if (facilityId < 1) return null;
            var row = await _db.CompanyIntegrationSettings.AsNoTracking()
                .Where(x => x.HmsFacilityId == facilityId)
                .Select(x => x.CompanyId)
                .FirstOrDefaultAsync(ct);
            if (row != Guid.Empty) return row;

            var key = facilityId.ToString();
            if (_opts.FacilityCompanyMap.TryGetValue(key, out var raw) && Guid.TryParse(raw, out var g) && g != Guid.Empty)
                return g;
            return null;
        }

        public async Task<CompanyIntegrationSettingsDto?> GetByFacilityAsync(int facilityId, CancellationToken ct = default)
        {
            var companyId = await ResolveCompanyIdByFacilityAsync(facilityId, ct);
            if (companyId == null) return null;
            return await GetOrDefaultsAsync(companyId.Value, ct);
        }

        public async Task<string> ResolveHmsBaseUrlAsync(int facilityId, CancellationToken ct = default)
        {
            var s = await GetByFacilityAsync(facilityId, ct);
            var url = s?.HmsBaseUrl;
            if (!string.IsNullOrWhiteSpace(url)) return url!.TrimEnd('/');
            return _opts.HmsBaseUrl.TrimEnd('/');
        }

        public async Task<string> ResolveHmsWebhookKeyAsync(int facilityId, CancellationToken ct = default)
        {
            var s = await GetByFacilityAsync(facilityId, ct);
            if (!string.IsNullOrWhiteSpace(s?.HmsWebhookKey)) return s!.HmsWebhookKey!;
            return _opts.HmsWebhookKey;
        }

        private static string? TrimUrl(string? url)
        {
            if (string.IsNullOrWhiteSpace(url)) return null;
            return url.Trim().TrimEnd('/');
        }

        private static CompanyIntegrationSettingsDto Map(Domain.Entities.CompanyIntegrationSettings row) => new()
        {
            CompanyId = row.CompanyId,
            HmsFacilityId = row.HmsFacilityId,
            PublicBaseUrl = row.PublicBaseUrl,
            HmsBaseUrl = row.HmsBaseUrl,
            HmsWebhookKey = row.HmsWebhookKey,
            ZaizensPayrollBaseUrl = row.ZaizensPayrollBaseUrl,
            InboundApiKey = row.InboundApiKey,
            UpdatedAt = row.UpdatedAt,
        };
    }

    public class CompanyIntegrationSettingsDto
    {
        public Guid CompanyId { get; set; }
        public int HmsFacilityId { get; set; } = 1;
        public string? PublicBaseUrl { get; set; }
        public string? HmsBaseUrl { get; set; }
        public string? HmsWebhookKey { get; set; }
        public string? ZaizensPayrollBaseUrl { get; set; }
        public string? InboundApiKey { get; set; }
        public DateTime? UpdatedAt { get; set; }
    }
}
