namespace ComptabiliteAPI.Infrastructure.Services
{
    /// <summary>Normalizes partner base URLs (Railway has no public :3010/:3003 ports).</summary>
    public static class IntegrationUrlNormalizer
    {
        private static readonly int[] DevPortsOnRailway = { 3010, 3003, 3000, 5072, 5174 };

        public static string? Normalize(string? url)
        {
            if (string.IsNullOrWhiteSpace(url)) return null;
            var trimmed = url.Trim().TrimEnd('/');
            if (!Uri.TryCreate(trimmed, UriKind.Absolute, out var uri))
                return trimmed;

            if (IsRailwayHost(uri.Host) && uri.Port is > 0 and not 80 and not 443)
            {
                var builder = new UriBuilder(uri) { Port = -1 };
                trimmed = builder.Uri.ToString().TrimEnd('/');
            }

            return trimmed;
        }

        public static string? ValidateZaizensPayrollUrl(string? url)
        {
            var normalized = Normalize(url);
            if (string.IsNullOrWhiteSpace(normalized)) return null;
            if (!Uri.TryCreate(normalized, UriKind.Absolute, out var uri))
                return "Zaizens PayRoll URL must be a valid absolute URL (https://…).";

            if (uri.Host.Contains("-account-ui.", StringComparison.OrdinalIgnoreCase)
                || uri.Host.Equals("zaizens-account-ui.up.railway.app", StringComparison.OrdinalIgnoreCase))
                return "Use the PayRoll API host (e.g. https://zaizenspay.up.railway.app), not the Account_Core UI URL.";

            return null;
        }

        public static string? ValidateHmsUrl(string? url)
        {
            var normalized = Normalize(url);
            if (string.IsNullOrWhiteSpace(normalized)) return null;
            if (!Uri.TryCreate(normalized, UriKind.Absolute, out var uri))
                return "HMS URL must be a valid absolute URL (https://…).";

            if (uri.Host is "127.0.0.1" or "localhost")
                return "127.0.0.1 only works when Account_Core API runs on the same machine. On Railway, use the public HMS URL (e.g. https://zaizens-hms.up.railway.app).";

            return null;
        }

        private static bool IsRailwayHost(string host) =>
            host.EndsWith(".railway.app", StringComparison.OrdinalIgnoreCase)
            || host.EndsWith(".up.railway.app", StringComparison.OrdinalIgnoreCase);
    }
}
