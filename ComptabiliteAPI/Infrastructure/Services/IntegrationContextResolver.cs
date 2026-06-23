using ComptabiliteAPI.Configuration;
using ComptabiliteAPI.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace ComptabiliteAPI.Infrastructure.Services
{
    public class IntegrationContextResolver
    {
        private readonly IntegrationOptions _opts;
        private readonly AppDbContext _db;
        private readonly IntegrationSettingsService _settings;

        public IntegrationContextResolver(
            IOptions<IntegrationOptions> opts,
            AppDbContext db,
            IntegrationSettingsService settings)
        {
            _opts = opts.Value;
            _db = db;
            _settings = settings;
        }

        public bool IsEnabled => _opts.Enabled;

        public async Task<Guid> ResolveCompanyIdAsync(int facilityId, CancellationToken ct = default)
        {
            var fromDb = await _settings.ResolveCompanyIdByFacilityAsync(facilityId, ct);
            if (fromDb != null && fromDb != Guid.Empty)
                return fromDb.Value;

            try
            {
                return ResolveCompanyId(facilityId);
            }
            catch
            {
                var first = await _db.Companies.AsNoTracking().OrderBy(c => c.CreatedAt).Select(c => c.Id).FirstOrDefaultAsync(ct);
                if (first != Guid.Empty)
                    return first;
                throw;
            }
        }

        public Guid ResolveCompanyId(int facilityId)
        {
            var key = facilityId.ToString();
            if (_opts.FacilityCompanyMap.TryGetValue(key, out var raw) && Guid.TryParse(raw, out var g) && g != Guid.Empty)
                return g;
            throw new InvalidOperationException($"No company mapping for HMS facility_id={facilityId}. Configure Integrations:FacilityCompanyMap or company integration settings.");
        }

        public async Task<Guid> ResolveSystemUserIdAsync(CancellationToken ct = default)
        {
            if (_opts.SystemUserId is Guid uid && uid != Guid.Empty)
                return uid;
            var user = await _db.Users.AsNoTracking().OrderBy(u => u.CreatedAt).Select(u => u.Id).FirstOrDefaultAsync(ct);
            if (user == Guid.Empty)
                throw new InvalidOperationException("No integration system user configured.");
            return user;
        }

        public async Task<int> ResolveFacilityIdForCompanyAsync(Guid companyId, CancellationToken ct = default)
        {
            var s = await _settings.GetForCompanyAsync(companyId, ct);
            if (s != null && s.HmsFacilityId > 0) return s.HmsFacilityId;
            return 1;
        }
    }
}
