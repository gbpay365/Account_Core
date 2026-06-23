using System.Text.Json;
using ComptabiliteAPI.Domain.Entities;
using ComptabiliteAPI.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace ComptabiliteAPI.Infrastructure.Services
{
    public class IntegrationOutboxService
    {
        private readonly AppDbContext _db;
        private readonly IHttpClientFactory _httpFactory;
        private readonly ILogger<IntegrationOutboxService> _log;

        public IntegrationOutboxService(AppDbContext db, IHttpClientFactory httpFactory, ILogger<IntegrationOutboxService> log)
        {
            _db = db;
            _httpFactory = httpFactory;
            _log = log;
        }

        public async Task<IntegrationOutbox> EnqueueAsync(string eventType, object payload, CancellationToken ct = default)
        {
            var row = new IntegrationOutbox
            {
                Direction = "outbound",
                EventType = eventType,
                PayloadJson = JsonSerializer.Serialize(payload),
                Status = "pending",
                NextRetryAt = DateTime.UtcNow
            };
            await _db.IntegrationOutboxes.AddAsync(row, ct);
            await _db.SaveChangesAsync(ct);
            return row;
        }

        public async Task<List<IntegrationOutbox>> GetDeliverableAsync(int limit, CancellationToken ct = default)
        {
            var now = DateTime.UtcNow;
            return await _db.IntegrationOutboxes
                .Where(o => o.Direction == "outbound" && (o.Status == "pending" || o.Status == "failed"))
                .Where(o => o.NextRetryAt == null || o.NextRetryAt <= now)
                .OrderBy(o => o.CreatedAt)
                .Take(Math.Clamp(limit, 1, 200))
                .ToListAsync(ct);
        }

        public async Task MarkSentAsync(Guid id, CancellationToken ct = default)
        {
            var row = await _db.IntegrationOutboxes.FirstOrDefaultAsync(o => o.Id == id, ct);
            if (row == null) return;
            row.Status = "sent";
            row.SentAt = DateTime.UtcNow;
            row.LastError = null;
            await _db.SaveChangesAsync(ct);
        }

        public async Task MarkFailedAsync(Guid id, string error, int attempts, CancellationToken ct = default)
        {
            var row = await _db.IntegrationOutboxes.FirstOrDefaultAsync(o => o.Id == id, ct);
            if (row == null) return;
            row.Attempts = attempts + 1;
            row.LastError = error?.Length > 2000 ? error[..2000] : error;
            row.NextRetryAt = DateTime.UtcNow.AddMinutes(Math.Min(row.Attempts * 5, 60));
            row.Status = row.Attempts >= 10 ? "dead" : "failed";
            await _db.SaveChangesAsync(ct);
        }

        public async Task<(int sent, int failed)> ProcessPendingAsync(int limit = 50, CancellationToken ct = default)
        {
            var now = DateTime.UtcNow;
            var rows = await _db.IntegrationOutboxes
                .Where(o => o.Status == "pending" || o.Status == "failed")
                .Where(o => o.NextRetryAt == null || o.NextRetryAt <= now)
                .OrderBy(o => o.CreatedAt)
                .Take(Math.Clamp(limit, 1, 200))
                .ToListAsync(ct);

            int sent = 0, failed = 0;
            foreach (var row in rows)
            {
                row.Attempts++;
                row.Status = "pending";
                row.LastError = "Use IntegrationOutboundService.DeliverOutboxAsync for outbound events.";
                row.NextRetryAt = DateTime.UtcNow.AddMinutes(Math.Min(row.Attempts * 5, 60));
                if (row.Attempts >= 10) row.Status = "dead";
                failed++;
            }

            if (rows.Count > 0)
                await _db.SaveChangesAsync(ct);

            return (sent, failed);
        }
    }
}
