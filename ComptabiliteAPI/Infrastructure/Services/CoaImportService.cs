using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using ComptabiliteAPI.Configuration;
using ComptabiliteAPI.Domain.Entities;
using ComptabiliteAPI.Domain.Interfaces;
using ComptabiliteAPI.DTOs;
using ComptabiliteAPI.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace ComptabiliteAPI.Infrastructure.Services
{
    public sealed class CoaImportService : ICoaImportService
    {
        private static readonly JsonSerializerOptions WyvernJson = new() { PropertyNameCaseInsensitive = true };

        private readonly AppDbContext _db;
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly WyvernImportOptions _options;

        public CoaImportService(
            AppDbContext db,
            IHttpClientFactory httpClientFactory,
            IOptions<WyvernImportOptions> options)
        {
            _db = db;
            _httpClientFactory = httpClientFactory;
            _options = options.Value;
        }

        public async Task<CoaImportResult> ImportFromOhadaJsonAsync(CancellationToken cancellationToken = default)
        {
            var stats = await OhadaSixDigitCoaSeeder.SeedFromJsonWithStatsAsync(_db, cancellationToken);
            if (stats == null)
                throw new InvalidOperationException("OHADA chart JSON not found or invalid.");

            return new CoaImportResult
            {
                Source = "ohada-json",
                Inserted = stats.Inserted,
                Updated = stats.Updated,
                Total = stats.Total
            };
        }

        public async Task<CoaImportResult> ImportFromWyvernAsync(
            WyvernCoaImportRequest? request = null,
            CancellationToken cancellationToken = default)
        {
            var baseUrl = (request?.BaseUrl ?? _options.BaseUrl).Trim().TrimEnd('/');
            var username = (request?.Username ?? _options.Username).Trim();
            var password = request?.Password ?? _options.Password;

            if (string.IsNullOrEmpty(baseUrl))
                throw new InvalidOperationException("WYVERN base URL is required.");
            if (string.IsNullOrEmpty(username) || string.IsNullOrEmpty(password))
                throw new InvalidOperationException("WYVERN credentials are required.");

            var client = _httpClientFactory.CreateClient("WyvernImport");
            client.BaseAddress = new Uri(baseUrl + "/");

            var loginResponse = await client.PostAsJsonAsync(
                "api/v1/auth/login",
                new { username, password },
                cancellationToken);

            if (!loginResponse.IsSuccessStatusCode)
            {
                var body = await loginResponse.Content.ReadAsStringAsync(cancellationToken);
                throw new InvalidOperationException($"WYVERN login failed ({(int)loginResponse.StatusCode}): {body}");
            }

            var tokenPayload = await loginResponse.Content.ReadFromJsonAsync<WyvernTokenResponse>(WyvernJson, cancellationToken)
                ?? throw new InvalidOperationException("WYVERN login returned an empty token.");

            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", tokenPayload.AccessToken);

            var accountsResponse = await client.GetAsync("api/v1/accounts", cancellationToken);
            if (!accountsResponse.IsSuccessStatusCode)
            {
                var body = await accountsResponse.Content.ReadAsStringAsync(cancellationToken);
                throw new InvalidOperationException($"WYVERN accounts fetch failed ({(int)accountsResponse.StatusCode}): {body}");
            }

            var payload = await accountsResponse.Content.ReadFromJsonAsync<WyvernAccountsResponse>(WyvernJson, cancellationToken)
                ?? throw new InvalidOperationException("WYVERN accounts response was empty.");

            var flat = new List<WyvernAccountNode>();
            foreach (var root in payload.Tree)
                FlattenWyvernTree(root, flat);

            if (flat.Count == 0)
                throw new InvalidOperationException("WYVERN returned no chart accounts.");

            var idToCode = flat.ToDictionary(a => a.Id, a => a.Code, comparer: EqualityComparer<int>.Default);
            var rows = flat
                .OrderBy(a => a.Code, StringComparer.Ordinal)
                .Select(a => new AccountImportRow
                {
                    Code = a.Code,
                    Label = a.Label,
                    OhadaClass = a.OhadaClass,
                    AccountType = a.AccountType,
                    IsPosting = a.IsPosting,
                    IsActive = a.Active,
                    ParentCode = a.ParentId is int pid && idToCode.TryGetValue(pid, out var pc) ? pc : null
                })
                .ToList();

            var replace = request?.ReplaceExisting ?? true;
            var removed = replace
                ? await RemoveAccountsNotInSetAsync(_db, rows.Select(r => r.Code).ToHashSet(StringComparer.Ordinal), cancellationToken)
                : 0;

            var stats = await UpsertChartRowsAsync(_db, rows, cancellationToken);
            return new CoaImportResult
            {
                Source = "wyvern",
                Inserted = stats.Inserted,
                Updated = stats.Updated,
                Removed = removed,
                Total = stats.Total
            };
        }

        internal static async Task<int> RemoveAccountsNotInSetAsync(
            AppDbContext dbContext,
            IReadOnlySet<string> keepCodes,
            CancellationToken cancellationToken = default)
        {
            var existing = await dbContext.Accounts
                .Where(a => a.FiscalYear == null)
                .ToListAsync(cancellationToken);

            var toRemove = existing
                .Where(a => !keepCodes.Contains(a.Code))
                .ToList();
            if (toRemove.Count == 0) return 0;

            var removeIds = toRemove.Select(a => a.Id).ToHashSet();
            foreach (var acc in existing)
            {
                if (acc.ParentId is Guid parentId && removeIds.Contains(parentId))
                    acc.ParentId = null;
            }

            foreach (var acc in toRemove)
                acc.ParentId = null;

            await dbContext.SaveChangesAsync(cancellationToken);
            dbContext.Accounts.RemoveRange(toRemove);
            await dbContext.SaveChangesAsync(cancellationToken);
            return toRemove.Count;
        }

        private static void FlattenWyvernTree(WyvernAccountNode node, List<WyvernAccountNode> target)
        {
            target.Add(node);
            if (node.Children == null) return;
            foreach (var child in node.Children)
                FlattenWyvernTree(child, target);
        }

        internal sealed class AccountImportRow
        {
            public string Code { get; set; } = string.Empty;
            public string Label { get; set; } = string.Empty;
            public int OhadaClass { get; set; }
            public string AccountType { get; set; } = "expense";
            public string? ParentCode { get; set; }
            public bool IsPosting { get; set; }
            public bool IsActive { get; set; } = true;
        }

        internal static async Task<(int Inserted, int Updated, int Total)> UpsertChartRowsAsync(
            AppDbContext dbContext,
            IReadOnlyList<AccountImportRow> rows,
            CancellationToken cancellationToken = default)
        {
            var existing = await dbContext.Accounts
                .Where(a => a.FiscalYear == null)
                .ToListAsync(cancellationToken);
            var byCode = existing.ToDictionary(a => a.Code, StringComparer.Ordinal);

            var inserted = 0;
            var updated = 0;

            foreach (var row in rows)
            {
                var code = row.Code.Trim();
                if (code.Length == 0) continue;

                var accountType = MapAccountType(row.AccountType);
                var normalBalance = NormalBalanceFor(accountType);
                var label = row.Label.Trim();
                var classNo = row.OhadaClass is >= 1 and <= 9 ? row.OhadaClass : (int)char.GetNumericValue(code[0]);

                if (byCode.TryGetValue(code, out var acc))
                {
                    var changed = false;
                    if (!string.Equals(acc.NameEn, label, StringComparison.Ordinal)) { acc.NameEn = label; changed = true; }
                    if (!string.Equals(acc.NameFr, label, StringComparison.Ordinal)) { acc.NameFr = label; changed = true; }
                    if (acc.Class != classNo) { acc.Class = classNo; changed = true; }
                    if (!string.Equals(acc.AccountType, accountType, StringComparison.OrdinalIgnoreCase)) { acc.AccountType = accountType; changed = true; }
                    if (!string.Equals(acc.NormalBalance, normalBalance, StringComparison.OrdinalIgnoreCase)) { acc.NormalBalance = normalBalance; changed = true; }
                    if (acc.IsLeaf != row.IsPosting) { acc.IsLeaf = row.IsPosting; changed = true; }
                    if (acc.IsActive != row.IsActive) { acc.IsActive = row.IsActive; changed = true; }
                    if (changed) updated++;
                }
                else
                {
                    acc = new Account
                    {
                        Code = code,
                        NameEn = label,
                        NameFr = label,
                        Class = classNo,
                        AccountType = accountType,
                        NormalBalance = normalBalance,
                        IsLeaf = row.IsPosting,
                        IsActive = row.IsActive,
                        FiscalYear = null,
                    };
                    await dbContext.Accounts.AddAsync(acc, cancellationToken);
                    byCode[code] = acc;
                    inserted++;
                }
            }

            if (inserted > 0 || updated > 0)
                await dbContext.SaveChangesAsync(cancellationToken);

            var all = await dbContext.Accounts.Where(a => a.FiscalYear == null).ToListAsync(cancellationToken);
            byCode = all.ToDictionary(a => a.Code, StringComparer.Ordinal);
            var parentLinksChanged = false;

            foreach (var row in rows)
            {
                var code = row.Code.Trim();
                var parentCode = (row.ParentCode ?? string.Empty).Trim();
                if (code.Length == 0 || parentCode.Length == 0) continue;
                if (!byCode.TryGetValue(code, out var child) || !byCode.TryGetValue(parentCode, out var parent)) continue;
                if (child.ParentId != parent.Id)
                {
                    child.ParentId = parent.Id;
                    parent.IsLeaf = false;
                    parentLinksChanged = true;
                }
            }

            if (parentLinksChanged)
                await dbContext.SaveChangesAsync(cancellationToken);

            return (inserted, updated, rows.Count);
        }

        private static string MapAccountType(string? raw)
        {
            var t = (raw ?? "expense").Trim().ToLowerInvariant();
            return t switch
            {
                "income" or "revenue" => "revenue",
                "cost" => "cost",
                "equity" => "equity",
                "liability" => "liability",
                "asset" => "asset",
                _ => "expense",
            };
        }

        private static string NormalBalanceFor(string accountType) =>
            accountType is "equity" or "liability" or "revenue" ? "credit" : "debit";

        private sealed class WyvernTokenResponse
        {
            [JsonPropertyName("access_token")]
            public string AccessToken { get; set; } = string.Empty;
        }

        private sealed class WyvernAccountsResponse
        {
            [JsonPropertyName("tree")]
            public List<WyvernAccountNode> Tree { get; set; } = new();
        }

        private sealed class WyvernAccountNode
        {
            public int Id { get; set; }
            public string Code { get; set; } = string.Empty;
            public string Label { get; set; } = string.Empty;

            [JsonPropertyName("ohada_class")]
            public int OhadaClass { get; set; }

            [JsonPropertyName("account_type")]
            public string AccountType { get; set; } = "expense";

            [JsonPropertyName("parent_id")]
            public int? ParentId { get; set; }

            [JsonPropertyName("is_posting")]
            public bool IsPosting { get; set; }

            public bool Active { get; set; } = true;
            public List<WyvernAccountNode>? Children { get; set; }
        }
    }
}
