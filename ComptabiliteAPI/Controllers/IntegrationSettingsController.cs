using ComptabiliteAPI.Filters;
using ComptabiliteAPI.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ComptabiliteAPI.Controllers
{
    [ApiController]
    [Route("api/integration-settings")]
    [Authorize]
    [ServiceFilter(typeof(CompanyMembershipActionFilter))]
    public class IntegrationSettingsController : ControllerBase
    {
        private readonly IntegrationSettingsService _settings;
        private readonly IHttpClientFactory _httpFactory;

        public IntegrationSettingsController(IntegrationSettingsService settings, IHttpClientFactory httpFactory)
        {
            _settings = settings;
            _httpFactory = httpFactory;
        }

        [HttpGet]
        public async Task<IActionResult> Get([FromQuery] Guid companyId, CancellationToken ct)
        {
            var dto = await _settings.GetOrDefaultsAsync(companyId, ct);
            return Ok(dto);
        }

        [HttpPut]
        public async Task<IActionResult> Save([FromQuery] Guid companyId, [FromBody] CompanyIntegrationSettingsDto body, CancellationToken ct)
        {
            body.CompanyId = companyId;
            try
            {
                var saved = await _settings.SaveAsync(companyId, body, ct);
                return Ok(_settings.ApplyDefaults(saved));
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        [HttpPost("test-hms")]
        public async Task<IActionResult> TestHms([FromQuery] Guid companyId, [FromBody] CompanyIntegrationSettingsDto? form, CancellationToken ct)
        {
            var saved = await _settings.GetOrDefaultsAsync(companyId, ct);
            var s = _settings.MergeForTest(companyId, form, saved);
            var baseUrl = (s.HmsBaseUrl ?? "").TrimEnd('/');
            if (string.IsNullOrWhiteSpace(baseUrl))
                return BadRequest(new { ok = false, error = "HMS URL not configured." });

            var urlError = IntegrationUrlNormalizer.ValidateHmsUrl(baseUrl);
            if (urlError != null)
                return Ok(new { ok = false, status = 0, error = urlError, url = baseUrl });

            try
            {
                var client = _httpFactory.CreateClient();
                client.Timeout = TimeSpan.FromSeconds(25);
                using var req = new HttpRequestMessage(HttpMethod.Get, baseUrl + "/api/v1/integrations/health");
                if (!string.IsNullOrWhiteSpace(s.HmsWebhookKey))
                    req.Headers.TryAddWithoutValidation("X-API-Key", s.HmsWebhookKey);
                req.Headers.TryAddWithoutValidation("X-Facility-Id", s.HmsFacilityId.ToString());

                var res = await client.SendAsync(req, ct);
                var body = await res.Content.ReadAsStringAsync(ct);
                return Ok(new { ok = res.IsSuccessStatusCode, status = (int)res.StatusCode, body, url = baseUrl });
            }
            catch (Exception ex)
            {
                return Ok(new { ok = false, status = 0, error = $"Cannot reach {baseUrl}: {ex.Message}", url = baseUrl });
            }
        }

        [HttpPost("test-zaizens")]
        public async Task<IActionResult> TestZaizens([FromQuery] Guid companyId, [FromBody] CompanyIntegrationSettingsDto? form, CancellationToken ct)
        {
            var saved = await _settings.GetOrDefaultsAsync(companyId, ct);
            var s = _settings.MergeForTest(companyId, form, saved);
            var baseUrl = (s.ZaizensPayrollBaseUrl ?? "").TrimEnd('/');
            if (string.IsNullOrWhiteSpace(baseUrl))
                return BadRequest(new { ok = false, error = "Zaizens PayRoll URL not configured." });

            var urlError = IntegrationUrlNormalizer.ValidateZaizensPayrollUrl(baseUrl);
            if (urlError != null)
                return Ok(new { ok = false, status = 0, error = urlError, url = baseUrl });

            try
            {
                var client = _httpFactory.CreateClient();
                client.Timeout = TimeSpan.FromSeconds(25);
                using var req = new HttpRequestMessage(HttpMethod.Get, baseUrl + "/api/v1/integrations/health");
                if (!string.IsNullOrWhiteSpace(s.InboundApiKey))
                    req.Headers.TryAddWithoutValidation("X-API-Key", s.InboundApiKey);
                req.Headers.TryAddWithoutValidation("X-Facility-Id", s.HmsFacilityId.ToString());

                var res = await client.SendAsync(req, ct);
                var body = await res.Content.ReadAsStringAsync(ct);
                return Ok(new { ok = res.IsSuccessStatusCode, status = (int)res.StatusCode, body, url = baseUrl });
            }
            catch (Exception ex)
            {
                return Ok(new { ok = false, status = 0, error = $"Cannot reach {baseUrl}: {ex.Message}", url = baseUrl });
            }
        }
    }
}
