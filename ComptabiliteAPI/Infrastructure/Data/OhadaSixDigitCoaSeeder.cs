using System.Text.Json;
using ComptabiliteAPI.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace ComptabiliteAPI.Infrastructure.Data
{
    /// <summary>
    /// Seeds the full revised SYSCOHADA 6-digit chart from Data/ohada_english_6digit_coa.json
    /// (shared with HMS — single canonical source).
    /// </summary>
    public static class OhadaSixDigitCoaSeeder
    {
        private sealed class OhadaCoaRoot
        {
            public List<OhadaCoaRow> accounts { get; set; } = new();
        }

        private sealed class OhadaCoaRow
        {
            public string code { get; set; } = string.Empty;
            public string label { get; set; } = string.Empty;
            public int ohada_class { get; set; }
            public string account_type { get; set; } = "expense";
            public string? parent_code { get; set; }
            public int is_posting { get; set; }
        }

        public sealed class SeedStats
        {
            public int Inserted { get; set; }
            public int Updated { get; set; }
            public int Total { get; set; }
        }

        public static async Task<bool> SeedFromJsonAsync(AppDbContext dbContext, CancellationToken cancellationToken = default) =>
            await SeedFromJsonInternalAsync(dbContext, cancellationToken) != null;

        public static async Task<SeedStats?> SeedFromJsonWithStatsAsync(AppDbContext dbContext, CancellationToken cancellationToken = default) =>
            await SeedFromJsonInternalAsync(dbContext, cancellationToken);

        private static async Task<SeedStats?> SeedFromJsonInternalAsync(AppDbContext dbContext, CancellationToken cancellationToken = default)
        {
            var jsonPath = ResolveJsonPath();
            if (!File.Exists(jsonPath)) return null;

            OhadaCoaRoot? root;
            try
            {
                var json = await File.ReadAllTextAsync(jsonPath, cancellationToken);
                root = JsonSerializer.Deserialize<OhadaCoaRoot>(json, newJsonSerializerOptions());
            }
            catch
            {
                return null;
            }

            if (root?.accounts == null || root.accounts.Count == 0) return null;

            var existing = await dbContext.Accounts
                .Where(a => a.FiscalYear == null)
                .ToListAsync(cancellationToken);
            var byCode = existing.ToDictionary(a => a.Code, StringComparer.Ordinal);

            var inserted = 0;
            var updated = 0;

            foreach (var row in root.accounts.OrderBy(r => r.code, StringComparer.Ordinal))
            {
                var code = (row.code ?? string.Empty).Trim();
                if (code.Length == 0) continue;

                var accountType = MapAccountType(row.account_type);
                var normalBalance = NormalBalanceFor(accountType);
                var label = (row.label ?? string.Empty).Trim();
                var isLeaf = row.is_posting == 1;
                var classNo = row.ohada_class is >= 1 and <= 9 ? row.ohada_class : (int)char.GetNumericValue(code[0]);

                if (byCode.TryGetValue(code, out var acc))
                {
                    var changed = false;
                    if (!string.Equals(acc.NameEn, label, StringComparison.Ordinal)) { acc.NameEn = label; changed = true; }
                    if (!string.Equals(acc.NameFr, label, StringComparison.Ordinal)) { acc.NameFr = label; changed = true; }
                    if (acc.Class != classNo) { acc.Class = classNo; changed = true; }
                    if (!string.Equals(acc.AccountType, accountType, StringComparison.OrdinalIgnoreCase)) { acc.AccountType = accountType; changed = true; }
                    if (!string.Equals(acc.NormalBalance, normalBalance, StringComparison.OrdinalIgnoreCase)) { acc.NormalBalance = normalBalance; changed = true; }
                    if (acc.IsLeaf != isLeaf) { acc.IsLeaf = isLeaf; changed = true; }
                    if (!acc.IsActive) { acc.IsActive = true; changed = true; }
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
                        IsLeaf = isLeaf,
                        IsActive = true,
                        FiscalYear = null,
                    };
                    await dbContext.Accounts.AddAsync(acc, cancellationToken);
                    byCode[code] = acc;
                    inserted++;
                }
            }

            if (inserted > 0 || updated > 0)
                await dbContext.SaveChangesAsync(cancellationToken);

            // Parent links (second pass — all codes exist)
            var all = await dbContext.Accounts.Where(a => a.FiscalYear == null).ToListAsync(cancellationToken);
            byCode = all.ToDictionary(a => a.Code, StringComparer.Ordinal);
            var parentLinksChanged = false;

            foreach (var row in root.accounts)
            {
                var code = (row.code ?? string.Empty).Trim();
                var parentCode = (row.parent_code ?? string.Empty).Trim();
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

            return new SeedStats
            {
                Inserted = inserted,
                Updated = updated,
                Total = root.accounts.Count
            };
        }

        private static string ResolveJsonPath()
        {
            var env = Environment.GetEnvironmentVariable("OHADA_COA_PATH");
            if (!string.IsNullOrWhiteSpace(env) && File.Exists(env))
                return env;

            var candidates = new[]
            {
                Path.Combine(AppContext.BaseDirectory, "Data", "ohada_english_6digit_coa.json"),
                Path.Combine(Directory.GetCurrentDirectory(), "Data", "ohada_english_6digit_coa.json"),
                Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "Data", "ohada_english_6digit_coa.json")),
            };

            foreach (var p in candidates)
            {
                if (File.Exists(p)) return p;
            }

            return candidates[0];
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

        private static JsonSerializerOptions newJsonSerializerOptions() =>
            new() { PropertyNameCaseInsensitive = true };
    }
}
