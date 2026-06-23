using ComptabiliteAPI.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace ComptabiliteAPI.Infrastructure.Data
{
    /// <summary>
    /// Seeds or removes the 22 standard OHADA/ERP security roles. Permission keys are <c>resource:action</c>
    /// and must match rows created by <see cref="DbSeeder.EnsureCorePermissionsGrantedAsync"/>.
    /// </summary>
    public static class SecurityRolesSeeder
    {
        public const int StandardRoleCount = 22;

        // Canonical permission keys (12 total) — same resources as RequirePermission in controllers.
        private static readonly string[] AllPermissions =
        {
            "dashboard:read", "dashboard:edit",
            "balance_sheet:read", "balance_sheet:export",
            "cash_flow:read", "cash_flow:export",
            "journal:read", "journal:write",
            "ecf:read", "ecf:write",
            "finance:read", "finance:write",
            "billing:read", "billing:write",
            "rules:read", "rules:write"
        };

        private static readonly string[] ReadStack =
        {
            "dashboard:read",
            "balance_sheet:read", "cash_flow:read",
            "journal:read", "ecf:read", "finance:read"
        };

        /// <summary>22 role names with permission sets (may overlap; names match typical enterprise titles).</summary>
        public static readonly (string Name, string[] PermissionKeys)[] StandardRoles =
        {
            ("Super Administrator", AllPermissions),
            ("Company Administrator", AllPermissions),
            ("Chief Financial Officer (CFO)", AllPermissions),
            ("Financial Controller", new[] { "dashboard:read", "balance_sheet:read", "balance_sheet:export", "cash_flow:read", "cash_flow:export", "journal:read", "journal:write", "ecf:read", "finance:read", "finance:write" }),
            ("General Accountant", new[] { "dashboard:read", "balance_sheet:read", "cash_flow:read", "journal:read", "journal:write", "ecf:read", "finance:read" }),
            ("Senior Accountant", new[] { "dashboard:read", "balance_sheet:read", "journal:read", "journal:write", "finance:read" }),
            ("Assistant Accountant", new[] { "dashboard:read", "journal:read", "journal:write", "finance:read" }),
            ("Bookkeeper", new[] { "dashboard:read", "journal:read", "journal:write" }),
            ("Accounts Payable Lead", new[] { "dashboard:read", "journal:read", "journal:write", "finance:read", "finance:write" }),
            ("Accounts Receivable Lead", new[] { "dashboard:read", "balance_sheet:read", "journal:read", "journal:write", "finance:read" }),
            ("Treasury & Banking", new[] { "dashboard:read", "cash_flow:read", "cash_flow:export", "finance:read", "finance:write", "journal:read" }),
            ("Tax & ECF / Statutory Filing", new[] { "dashboard:read", "balance_sheet:read", "journal:read", "ecf:read", "ecf:write", "finance:read" }),
            ("Internal Auditor (read)", ReadStack),
            ("Executive Read-only", ReadStack),
            ("Financial Analyst (reports)", new[] { "dashboard:read", "balance_sheet:read", "balance_sheet:export", "cash_flow:read", "cash_flow:export", "journal:read", "finance:read" }),
            ("Cost / Project Accountant", new[] { "dashboard:read", "journal:read", "journal:write", "finance:read", "finance:write" }),
            ("Inventory & Operations", new[] { "dashboard:read", "journal:read", "finance:read" }),
            ("Sales / Commercial Finance", new[] { "dashboard:read", "journal:read", "balance_sheet:read" }),
            ("Procurement & Purchasing", new[] { "dashboard:read", "journal:read", "journal:write", "finance:read" }),
            ("ECF Filing Officer", new[] { "dashboard:read", "ecf:read", "ecf:write", "journal:read" }),
            ("Data Entry (journal only)", new[] { "dashboard:read", "journal:read", "journal:write" }),
            ("Compliance & Reporting Viewer", new[] { "dashboard:read", "balance_sheet:read", "balance_sheet:export", "ecf:read", "cash_flow:read" })
        };

        public static IReadOnlySet<string> StandardRoleNameSet { get; } = StandardRoles
            .Select(x => x.Name)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        /// <summary>Idempotent: ensure permissions, then all 22 roles and their <see cref="RolePermission"/> rows.</summary>
        public static async Task SeedStandard22Async(AppDbContext db)
        {
            await DbSeeder.EnsureCorePermissionsGrantedAsync(db);
            var byKey = (await db.Permissions.AsNoTracking()
                    .ToListAsync())
                .ToDictionary(p => $"{p.Resource}:{p.Action}", p => p.Id, StringComparer.OrdinalIgnoreCase);

            foreach (var (name, keys) in StandardRoles)
            {
                var role = await db.Roles.FirstOrDefaultAsync(r => r.Name == name);
                if (role == null)
                {
                    role = new Role { Name = name };
                    await db.Roles.AddAsync(role);
                    await db.SaveChangesAsync();
                }

                var have = await db.RolePermissions.AsNoTracking()
                    .Where(rp => rp.RoleId == role.Id)
                    .Select(rp => rp.PermissionId)
                    .ToListAsync();
                var haveSet = have.ToHashSet();

                foreach (var key in keys)
                {
                    if (!byKey.TryGetValue(key, out var pid)) continue;
                    if (haveSet.Contains(pid)) continue;
                    await db.RolePermissions.AddAsync(new RolePermission { RoleId = role.Id, PermissionId = pid });
                }
            }

            await db.SaveChangesAsync();
        }

        /// <summary>
        /// Remove all <see cref="RolePermission"/> for the 22 standard roles, then delete each role
        /// that no user still references. Users with those roles get <c>RoleId = null</c> only if
        /// we need to delete — safer: reassign? User asked "unload" — we strip permissions and delete
        /// roles only when no user uses them. For users with that role, keep role row but with no
        /// permissions? That breaks login expectations. So: for unload, <b>do not remove role if
        /// any user references it</b> — only strip RolePermissions. Or set users to first Admin? Too invasive.
        /// <para/>Strategy: remove RolePermission rows; then delete Role only if <c>Users</c> count 0. If
        /// users still reference, leave empty role (no perms) — bad UX. Better: leave Role + strip perms, keep users.
        /// <para/>Final: strip all RolePermission for the 22 names; do not delete Role rows.
        /// </summary>
        public static async Task UnloadStandard22Async(AppDbContext db)
        {
            var names = StandardRoleNameSet;
            var roles = await db.Roles
                .Where(r => names.Contains(r.Name))
                .ToListAsync();
            if (roles.Count == 0) return;

            var roleIds = roles.Select(r => r.Id).ToList();
            var links = await db.RolePermissions
                .Where(rp => roleIds.Contains(rp.RoleId))
                .ToListAsync();
            if (links.Count == 0) return;
            db.RolePermissions.RemoveRange(links);
            await db.SaveChangesAsync();
        }
    }
}
