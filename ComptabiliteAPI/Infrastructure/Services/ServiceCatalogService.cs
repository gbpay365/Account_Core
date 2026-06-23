using System.Text.Json;
using ComptabiliteAPI.Configuration;
using Microsoft.Extensions.Options;

namespace ComptabiliteAPI.Infrastructure.Services
{
    public sealed class ServiceCatalogService
    {
        private readonly HmsCatalogOptions _options;
        private readonly object _lock = new();
        private object? _cache;
        private DateTime? _cacheAt;
        private static readonly JsonSerializerOptions JsonOpts = new() { PropertyNameCaseInsensitive = true };

        public ServiceCatalogService(IOptions<HmsCatalogOptions> options) => _options = options.Value;

        public object LoadByAccountCode()
        {
            lock (_lock)
            {
                if (_cache != null)
                    return _cache;
            }

            foreach (var path in ResolvePaths())
            {
                if (!File.Exists(path)) continue;
                try
                {
                    using var stream = File.OpenRead(path);
                    var doc = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(stream, JsonOpts);
                    if (doc != null && doc.TryGetValue("by_account_code", out var byCode))
                    {
                        var loaded = JsonSerializer.Deserialize<object>(byCode.GetRawText(), JsonOpts) ?? new { };
                        lock (_lock)
                        {
                            _cache = loaded;
                            _cacheAt = File.GetLastWriteTimeUtc(path);
                        }
                        return loaded;
                    }
                }
                catch
                {
                    // try next path
                }
            }

            return new { };
        }

        /// <summary>Apply HMS webhook payload and persist to local Data file.</summary>
        public (bool ok, string? error) ApplyIntegrationPayload(JsonElement body)
        {
            try
            {
                JsonElement byCodeEl;
                if (body.TryGetProperty("by_account_code", out var nested))
                    byCodeEl = nested;
                else if (body.ValueKind == JsonValueKind.Object)
                    byCodeEl = body;
                else
                    return (false, "by_account_code required.");

                var byCode = JsonSerializer.Deserialize<object>(byCodeEl.GetRawText(), JsonOpts) ?? new { };
                var generatedAt = body.TryGetProperty("generated_at", out var g)
                    ? g.GetString()
                    : DateTime.UtcNow.ToString("o");
                var currency = body.TryGetProperty("currency", out var c) ? c.GetString() : "XAF";

                var envelope = new Dictionary<string, object?>
                {
                    ["source"] = "HMS_JS",
                    ["generated_at"] = generatedAt,
                    ["currency"] = currency ?? "XAF",
                    ["by_account_code"] = byCode,
                };

                var target = ResolveWritePath();
                Directory.CreateDirectory(Path.GetDirectoryName(target)!);
                File.WriteAllText(target, JsonSerializer.Serialize(envelope, new JsonSerializerOptions { WriteIndented = true }));

                lock (_lock)
                {
                    _cache = byCode;
                    _cacheAt = DateTime.UtcNow;
                }

                return (true, null);
            }
            catch (Exception ex)
            {
                return (false, ex.Message);
            }
        }

        public DateTime? CacheTimestamp
        {
            get
            {
                lock (_lock) return _cacheAt;
            }
        }

        private string ResolveWritePath()
        {
            var configured = _options.Path;
            if (!string.IsNullOrWhiteSpace(configured))
            {
                var dir = Path.GetDirectoryName(configured);
                if (!string.IsNullOrWhiteSpace(dir) && Directory.Exists(dir))
                    return configured;
            }

            return Path.Combine(AppContext.BaseDirectory, "Data", "hospital_service_catalog_prices.json");
        }

        private IEnumerable<string> ResolvePaths()
        {
            var env = Environment.GetEnvironmentVariable("HMS_CATALOG_PATH");
            if (!string.IsNullOrWhiteSpace(env))
                yield return env;

            if (!string.IsNullOrWhiteSpace(_options.Path))
                yield return _options.Path;

            yield return Path.Combine(AppContext.BaseDirectory, "Data", "hospital_service_catalog_prices.json");
            yield return Path.Combine(Directory.GetCurrentDirectory(), "Data", "hospital_service_catalog_prices.json");
        }
    }
}
