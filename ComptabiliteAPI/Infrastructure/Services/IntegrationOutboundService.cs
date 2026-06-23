using ComptabiliteAPI.Configuration;
using ComptabiliteAPI.Infrastructure.Services;
using Microsoft.Extensions.Options;
using System.Text.Json;

namespace ComptabiliteAPI.Infrastructure.Services
{
    public class IntegrationOutboundService
    {
        private readonly IntegrationOptions _opts;
        private readonly IntegrationOutboxService _outbox;
        private readonly IntegrationSettingsService _settings;
        private readonly IHttpClientFactory _httpFactory;
        private readonly ILogger<IntegrationOutboundService> _log;

        public IntegrationOutboundService(
            IOptions<IntegrationOptions> opts,
            IntegrationOutboxService outbox,
            IntegrationSettingsService settings,
            IHttpClientFactory httpFactory,
            ILogger<IntegrationOutboundService> log)
        {
            _opts = opts.Value;
            _outbox = outbox;
            _settings = settings;
            _httpFactory = httpFactory;
            _log = log;
        }

        public bool IsEnabled => _opts.Enabled && !string.IsNullOrWhiteSpace(_opts.HmsBaseUrl);

        public Task EnqueueAccountChangedAsync(object accountPayload, CancellationToken ct = default)
            => _outbox.EnqueueAsync("account.changed", accountPayload, ct);

        public Task EnqueueJournalPostedAsync(object journalPayload, CancellationToken ct = default)
            => _outbox.EnqueueAsync("journal.posted", journalPayload, ct);

        public Task EnqueuePayProfileAsync(object profilePayload, CancellationToken ct = default)
            => _outbox.EnqueueAsync("pay_profile.updated", profilePayload, ct);

        public Task EnqueuePayrollDeptSummaryAsync(object summaryPayload, CancellationToken ct = default)
            => _outbox.EnqueueAsync("payroll_dept_summary.updated", summaryPayload, ct);

        public async Task<(int sent, int failed)> DeliverOutboxAsync(int limit = 50, CancellationToken ct = default)
        {
            if (!_opts.Enabled) return (0, 0);

            var client = _httpFactory.CreateClient("HmsIntegration");
            int sent = 0, failed = 0;

            var rows = await _outbox.GetDeliverableAsync(limit, ct);
            foreach (var row in rows)
            {
                var path = row.EventType switch
                {
                    "account.changed" => "/api/integrations/chart-of-accounts",
                    "journal.posted" => "/api/integrations/journal-entry",
                    "pay_profile.updated" => "/api/integrations/pay-profile",
                    "payroll_dept_summary.updated" => "/api/integrations/payroll-dept-summary",
                    _ => null
                };
                if (path == null)
                {
                    await _outbox.MarkFailedAsync(row.Id, "No route for " + row.EventType, row.Attempts, ct);
                    failed++;
                    continue;
                }

                var facilityId = ParseFacilityIdFromPayload(row.PayloadJson);
                var baseUrl = await _settings.ResolveHmsBaseUrlAsync(facilityId, ct);
                var webhookKey = await _settings.ResolveHmsWebhookKeyAsync(facilityId, ct);
                if (string.IsNullOrWhiteSpace(baseUrl))
                {
                    await _outbox.MarkFailedAsync(row.Id, "HMS base URL not configured", row.Attempts, ct);
                    failed++;
                    continue;
                }

                try
                {
                    using var req = new HttpRequestMessage(HttpMethod.Post, baseUrl.TrimEnd('/') + path);
                    req.Headers.Add("X-API-Key", webhookKey);
                    req.Headers.Add("X-Facility-Id", facilityId.ToString());
                    req.Content = new StringContent(row.PayloadJson, System.Text.Encoding.UTF8, "application/json");
                    var res = await client.SendAsync(req, ct);
                    var body = await res.Content.ReadAsStringAsync(ct);
                    if (res.IsSuccessStatusCode || (int)res.StatusCode == 409)
                    {
                        await _outbox.MarkSentAsync(row.Id, ct);
                        sent++;
                    }
                    else
                    {
                        await _outbox.MarkFailedAsync(row.Id, $"HTTP {(int)res.StatusCode}: {body}", row.Attempts, ct);
                        failed++;
                    }
                }
                catch (Exception ex)
                {
                    await _outbox.MarkFailedAsync(row.Id, ex.Message, row.Attempts, ct);
                    failed++;
                }
            }

            return (sent, failed);
        }

        private static int ParseFacilityIdFromPayload(string json)
        {
            try
            {
                using var doc = JsonDocument.Parse(json);
                if (doc.RootElement.TryGetProperty("facility_id", out var el))
                {
                    if (el.TryGetInt32(out var n) && n > 0) return n;
                }
            }
            catch { /* ignore */ }
            return 1;
        }
    }
}
