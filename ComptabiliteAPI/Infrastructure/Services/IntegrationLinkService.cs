using System.Text.Json;
using ComptabiliteAPI.Domain.Entities;
using ComptabiliteAPI.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace ComptabiliteAPI.Infrastructure.Services
{
    public class IntegrationLinkService
    {
        private readonly AppDbContext _db;

        public IntegrationLinkService(AppDbContext db) => _db = db;

        public async Task<IntegrationEntityLink?> FindAsync(
            Guid companyId, string sourceSystem, string entityType, string externalId,
            CancellationToken ct = default)
        {
            return await _db.IntegrationEntityLinks.AsNoTracking().FirstOrDefaultAsync(
                l => l.CompanyId == companyId
                     && l.SourceSystem == sourceSystem
                     && l.EntityType == entityType
                     && l.ExternalId == externalId,
                ct);
        }

        public async Task<IntegrationEntityLink> UpsertAsync(
            Guid companyId, string sourceSystem, string entityType, string externalId,
            string internalId, object? metadata = null, CancellationToken ct = default)
        {
            var row = await _db.IntegrationEntityLinks.FirstOrDefaultAsync(
                l => l.CompanyId == companyId
                     && l.SourceSystem == sourceSystem
                     && l.EntityType == entityType
                     && l.ExternalId == externalId,
                ct);

            var meta = metadata == null ? null : JsonSerializer.Serialize(metadata);
            if (row == null)
            {
                row = new IntegrationEntityLink
                {
                    CompanyId = companyId,
                    SourceSystem = sourceSystem,
                    EntityType = entityType,
                    ExternalId = externalId,
                    InternalId = internalId,
                    MetadataJson = meta,
                    UpdatedAt = DateTime.UtcNow
                };
                await _db.IntegrationEntityLinks.AddAsync(row, ct);
            }
            else
            {
                row.InternalId = internalId;
                row.MetadataJson = meta ?? row.MetadataJson;
                row.UpdatedAt = DateTime.UtcNow;
            }

            await _db.SaveChangesAsync(ct);
            return row;
        }
    }
}
