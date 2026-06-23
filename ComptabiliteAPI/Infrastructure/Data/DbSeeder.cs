using System.Text.RegularExpressions;
using ComptabiliteAPI.Domain.Entities;
using ComptabiliteAPI.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;

namespace ComptabiliteAPI.Infrastructure.Data
{
    public static class DbSeeder
    {
        /// <summary>
        /// Ensures admin@comptabilite.cm can sign in. Default: Admin@123.
        /// Set RESET_ADMIN_PASSWORD=1 on Railway once to force-reset existing bcrypt hash.
        /// </summary>
        public static async Task EnsureAdminPasswordHashAsync(AppDbContext dbContext)
        {
            const string adminEmail = "admin@comptabilite.cm";
            var defaultPassword = Environment.GetEnvironmentVariable("ADMIN_DEFAULT_PASSWORD") ?? "Admin@123";
            var forceReset = string.Equals(
                Environment.GetEnvironmentVariable("RESET_ADMIN_PASSWORD"),
                "1",
                StringComparison.OrdinalIgnoreCase);

            var admin = await dbContext.Users.FirstOrDefaultAsync(u => u.Email == adminEmail);
            if (admin == null) return;

            var isBcrypt = admin.PasswordHash.StartsWith("$2");
            var needsReset = !isBcrypt
                || admin.PasswordHash == "hashed_password_123"
                || forceReset;

            if (isBcrypt && !forceReset)
            {
                try
                {
                    if (BCrypt.Net.BCrypt.Verify(defaultPassword, admin.PasswordHash))
                        return;
                }
                catch
                {
                    needsReset = true;
                }
            }

            if (!needsReset) return;

            admin.PasswordHash = BCrypt.Net.BCrypt.HashPassword(defaultPassword, 12);
            await dbContext.SaveChangesAsync();
            Console.WriteLine($"[AUTH] Admin password set for {adminEmail}.");
        }

        /// <summary>
        /// Ensures canonical permission rows exist and the Admin role has them.
        /// Idempotent — fixes databases created before journal:* (or other) permissions were added.
        /// </summary>
        public static async Task EnsureCorePermissionsGrantedAsync(AppDbContext dbContext)
        {
            var definitions = new (string Resource, string Action)[]
            {
                ("dashboard", "read"),
                ("dashboard", "edit"),
                ("balance_sheet", "read"),
                ("balance_sheet", "export"),
                ("cash_flow", "read"),
                ("cash_flow", "export"),
                ("journal", "read"),
                ("journal", "write"),
                ("ecf", "read"),
                ("ecf", "write"),
                ("finance", "read"),
                ("finance", "write"),
                ("billing", "read"),
                ("billing", "write"),
                ("rules", "read"),
                ("rules", "write"),
            };

            foreach (var (resource, action) in definitions)
            {
                if (!await dbContext.Permissions.AnyAsync(p => p.Resource == resource && p.Action == action))
                    await dbContext.Permissions.AddAsync(new Permission { Resource = resource, Action = action });
            }

            await dbContext.SaveChangesAsync();

            var adminRole = await dbContext.Roles.FirstOrDefaultAsync(r =>
                r.Name != null && r.Name.ToLower() == "admin");
            if (adminRole == null) return;

            var wanted = definitions.ToHashSet();
            var permissionIds = (await dbContext.Permissions.AsNoTracking().ToListAsync())
                .Where(p => wanted.Contains((p.Resource, p.Action)))
                .Select(p => p.Id)
                .ToList();

            var linked = (await dbContext.RolePermissions
                    .Where(rp => rp.RoleId == adminRole.Id)
                    .Select(rp => rp.PermissionId)
                    .ToListAsync())
                .ToHashSet();

            foreach (var pid in permissionIds)
            {
                if (!linked.Contains(pid))
                    dbContext.RolePermissions.Add(new RolePermission { RoleId = adminRole.Id, PermissionId = pid });
            }

            if (dbContext.ChangeTracker.HasChanges())
                await dbContext.SaveChangesAsync();
        }

        /// <summary>Versioned CM tax rules placeholder for production pipelines (VAT rates, account hints).</summary>
        public static async Task EnsureDefaultTaxRulePackAsync(AppDbContext dbContext)
        {
            if (await dbContext.TaxRulePacks.AnyAsync(p => p.Code == "CM-VAT" && p.Version == "1.0.0"))
                return;
            await dbContext.TaxRulePacks.AddAsync(new TaxRulePack
            {
                Code = "CM-VAT",
                Version = "1.0.0",
                Title = "Cameroun TVA / retenues (base)",
                JsonRules = """{"vatStandardRate":19.25,"currency":"XAF","notes":"Replace with official DGI mapping when specs are fixed."}""",
                EffectiveFrom = new DateTime(2020, 1, 1, 0, 0, 0, DateTimeKind.Utc),
                EffectiveTo = null,
                IsActive = true
            });
            await dbContext.SaveChangesAsync();
        }

        public static async Task SeedSYSCOHADAAsync(AppDbContext dbContext)
        {
            // Full 6-digit OHADA chart (shared with HMS) — preferred when JSON is present
            if (await OhadaSixDigitCoaSeeder.SeedFromJsonAsync(dbContext))
            {
                // Skip legacy short-code skeleton; journal demo uses 6-digit leaves below.
            }
            else
            {
            // Additive account seeding — only insert codes that don't exist yet
            {
                var existingCodes = (await dbContext.Accounts.Select(a => a.Code).ToListAsync()).ToHashSet();

                var allAccounts = new List<Account>
                {
                    // ── CLASS 1: Permanent Resources (Equity & Long-term Liabilities) ──────
                    new Account { Code = "1",   NameEn = "Permanent Resources",          NameFr = "Ressources Durables",              Class = 1, AccountType = "equity",    NormalBalance = "credit", IsLeaf = false },
                    new Account { Code = "10",  NameEn = "Capital",                       NameFr = "Capital",                          Class = 1, AccountType = "equity",    NormalBalance = "credit", IsLeaf = false },
                    new Account { Code = "101", NameEn = "Share Capital",                 NameFr = "Capital Social",                   Class = 1, AccountType = "equity",    NormalBalance = "credit", IsLeaf = true  },
                    new Account { Code = "11",  NameEn = "Reserves",                      NameFr = "Réserves",                         Class = 1, AccountType = "equity",    NormalBalance = "credit", IsLeaf = false },
                    new Account { Code = "111", NameEn = "Legal Reserve",                 NameFr = "Réserve Légale",                   Class = 1, AccountType = "equity",    NormalBalance = "credit", IsLeaf = true  },
                    new Account { Code = "12",  NameEn = "Retained Earnings / Deficit",   NameFr = "Report à Nouveau",                 Class = 1, AccountType = "equity",    NormalBalance = "credit", IsLeaf = true  },
                    new Account { Code = "13",  NameEn = "Investment Subsidies",          NameFr = "Subventions d'Investissement",     Class = 1, AccountType = "equity",    NormalBalance = "credit", IsLeaf = true  },
                    new Account { Code = "16",  NameEn = "Long-term Borrowings",          NameFr = "Emprunts et Dettes Financières",   Class = 1, AccountType = "liability", NormalBalance = "credit", IsLeaf = true  },
                    new Account { Code = "17",  NameEn = "Lease Obligations",             NameFr = "Dettes de Location-financement",   Class = 1, AccountType = "liability", NormalBalance = "credit", IsLeaf = true  },

                    // ── CLASS 2: Fixed Assets ──────────────────────────────────────────────
                    new Account { Code = "2",   NameEn = "Fixed Assets",                  NameFr = "Actif Immobilisé",                 Class = 2, AccountType = "asset",     NormalBalance = "debit",  IsLeaf = false },
                    new Account { Code = "20",  NameEn = "Formation & Preliminary Costs", NameFr = "Charges Immobilisées",             Class = 2, AccountType = "asset",     NormalBalance = "debit",  IsLeaf = true  },
                    new Account { Code = "21",  NameEn = "Intangible Assets",             NameFr = "Immobilisations Incorporelles",    Class = 2, AccountType = "asset",     NormalBalance = "debit",  IsLeaf = false },
                    new Account { Code = "211", NameEn = "Research & Development Costs",  NameFr = "Frais de Recherche et Développement", Class = 2, AccountType = "asset", NormalBalance = "debit",  IsLeaf = true  },
                    new Account { Code = "212", NameEn = "Patents & Licences",            NameFr = "Brevets et Licences",              Class = 2, AccountType = "asset",     NormalBalance = "debit",  IsLeaf = true  },
                    new Account { Code = "22",  NameEn = "Land",                          NameFr = "Terrains",                         Class = 2, AccountType = "asset",     NormalBalance = "debit",  IsLeaf = true  },
                    new Account { Code = "23",  NameEn = "Buildings & Constructions",     NameFr = "Bâtiments",                        Class = 2, AccountType = "asset",     NormalBalance = "debit",  IsLeaf = true  },
                    new Account { Code = "24",  NameEn = "Plant & Equipment",             NameFr = "Matériel & Outillage",             Class = 2, AccountType = "asset",     NormalBalance = "debit",  IsLeaf = true  },
                    new Account { Code = "25",  NameEn = "Office Furniture & Equipment",  NameFr = "Mobilier & Matériel de Bureau",    Class = 2, AccountType = "asset",     NormalBalance = "debit",  IsLeaf = true  },
                    new Account { Code = "28",  NameEn = "Accumulated Depreciation",      NameFr = "Amortissements",                   Class = 2, AccountType = "asset",     NormalBalance = "credit", IsLeaf = true  },

                    // ── CLASS 3: Inventories ───────────────────────────────────────────────
                    new Account { Code = "3",   NameEn = "Inventories",                   NameFr = "Stocks",                           Class = 3, AccountType = "asset",     NormalBalance = "debit",  IsLeaf = false },
                    new Account { Code = "31",  NameEn = "Merchandise",                   NameFr = "Marchandises",                     Class = 3, AccountType = "asset",     NormalBalance = "debit",  IsLeaf = true  },
                    new Account { Code = "32",  NameEn = "Raw Materials & Supplies",      NameFr = "Matières Premières",               Class = 3, AccountType = "asset",     NormalBalance = "debit",  IsLeaf = true  },
                    new Account { Code = "35",  NameEn = "Finished Goods",                NameFr = "Produits Finis",                   Class = 3, AccountType = "asset",     NormalBalance = "debit",  IsLeaf = true  },
                    new Account { Code = "37",  NameEn = "Goods in Transit",              NameFr = "Marchandises en Transit",          Class = 3, AccountType = "asset",     NormalBalance = "debit",  IsLeaf = true  },

                    // ── CLASS 4: Third Parties (Receivables & Payables) ───────────────────
                    new Account { Code = "4",   NameEn = "Third Parties",                 NameFr = "Tiers",                            Class = 4, AccountType = "asset",     NormalBalance = "debit",  IsLeaf = false },
                    new Account { Code = "40",  NameEn = "Suppliers",                     NameFr = "Fournisseurs",                     Class = 4, AccountType = "liability", NormalBalance = "credit", IsLeaf = false },
                    new Account { Code = "401", NameEn = "Trade Suppliers",               NameFr = "Fournisseurs, Achats de Biens",    Class = 4, AccountType = "liability", NormalBalance = "credit", IsLeaf = true  },
                    new Account { Code = "41",  NameEn = "Customers",                     NameFr = "Clients",                          Class = 4, AccountType = "asset",     NormalBalance = "debit",  IsLeaf = false },
                    new Account { Code = "411", NameEn = "Trade Customers",               NameFr = "Clients, Ventes de Biens",         Class = 4, AccountType = "asset",     NormalBalance = "debit",  IsLeaf = true  },
                    new Account { Code = "42",   NameEn = "Staff & Related Accounts",      NameFr = "Personnel",                        Class = 4, AccountType = "liability", NormalBalance = "credit", IsLeaf = false },
                    new Account { Code = "421",  NameEn = "Advances to Staff",              NameFr = "Avances et Acomptes au Personnel", Class = 4, AccountType = "liability", NormalBalance = "credit", IsLeaf = true  },
                    new Account { Code = "422",  NameEn = "Personnel Remuneration Due",     NameFr = "Rémunérations Dues au Personnel",  Class = 4, AccountType = "liability", NormalBalance = "credit", IsLeaf = true  },
                    new Account { Code = "43",   NameEn = "Social Security Bodies",         NameFr = "Organismes Sociaux",               Class = 4, AccountType = "liability", NormalBalance = "credit", IsLeaf = false },
                    new Account { Code = "431",  NameEn = "CNPS Contributions Payable",     NameFr = "CNPS à Payer",                     Class = 4, AccountType = "liability", NormalBalance = "credit", IsLeaf = true  },
                    new Account { Code = "44",   NameEn = "State & Tax Authorities",        NameFr = "État et Collectivités Publiques",  Class = 4, AccountType = "liability", NormalBalance = "credit", IsLeaf = false },
                    new Account { Code = "441",  NameEn = "Corporate Income Tax Payable",   NameFr = "Impôts sur les Bénéfices",         Class = 4, AccountType = "liability", NormalBalance = "credit", IsLeaf = true  },
                    new Account { Code = "442",  NameEn = "Income Tax (IRPP) Payable",      NameFr = "IRPP à Payer",                     Class = 4, AccountType = "liability", NormalBalance = "credit", IsLeaf = true  },
                    new Account { Code = "4441", NameEn = "VAT Collected (TVA 19.25%)",     NameFr = "TVA Collectée (19.25%)",           Class = 4, AccountType = "liability", NormalBalance = "credit", IsLeaf = true  },
                    new Account { Code = "4442", NameEn = "VAT Recoverable",                NameFr = "TVA Récupérable",                  Class = 4, AccountType = "asset",     NormalBalance = "debit",  IsLeaf = true  },
                    new Account { Code = "45",   NameEn = "Group & Associates",             NameFr = "Associés et Groupe",               Class = 4, AccountType = "asset",     NormalBalance = "debit",  IsLeaf = true  },
                    new Account { Code = "49",   NameEn = "Provisions for Bad Debts",       NameFr = "Provisions pour Créances Douteuses", Class = 4, AccountType = "asset",   NormalBalance = "credit", IsLeaf = true  },

                    // ── CLASS 5: Treasury ──────────────────────────────────────────────────
                    new Account { Code = "5",   NameEn = "Treasury",                      NameFr = "Trésorerie",                       Class = 5, AccountType = "asset",     NormalBalance = "debit",  IsLeaf = false },
                    new Account { Code = "51",  NameEn = "Short-term Investments",        NameFr = "Valeurs Mobilières de Placement",  Class = 5, AccountType = "asset",     NormalBalance = "debit",  IsLeaf = true  },
                    new Account { Code = "52",  NameEn = "Banks",                         NameFr = "Banques",                          Class = 5, AccountType = "asset",     NormalBalance = "debit",  IsLeaf = false },
                    new Account { Code = "521", NameEn = "Local Bank Accounts",           NameFr = "Banques Locales",                  Class = 5, AccountType = "asset",     NormalBalance = "debit",  IsLeaf = true  },
                    new Account { Code = "57",  NameEn = "Cash on Hand (Petty Cash)",     NameFr = "Caisse",                           Class = 5, AccountType = "asset",     NormalBalance = "debit",  IsLeaf = true  },
                    new Account { Code = "59",  NameEn = "Provisions on Treasury",        NameFr = "Provisions sur Trésorerie",        Class = 5, AccountType = "asset",     NormalBalance = "credit", IsLeaf = true  },

                    // ── CLASS 6: Operating Expenses ────────────────────────────────────────
                    new Account { Code = "6",   NameEn = "Operating Expenses",            NameFr = "Charges des Activités Ordinaires", Class = 6, AccountType = "expense",   NormalBalance = "debit",  IsLeaf = false },
                    new Account { Code = "60",  NameEn = "Purchases",                     NameFr = "Achats",                           Class = 6, AccountType = "expense",   NormalBalance = "debit",  IsLeaf = false },
                    new Account { Code = "601", NameEn = "Purchases of Merchandise",      NameFr = "Achats de Marchandises",           Class = 6, AccountType = "expense",   NormalBalance = "debit",  IsLeaf = true  },
                    new Account { Code = "602", NameEn = "Purchases of Raw Materials",    NameFr = "Achats de Matières Premières",     Class = 6, AccountType = "expense",   NormalBalance = "debit",  IsLeaf = true  },
                    new Account { Code = "61",  NameEn = "External Services",             NameFr = "Services Extérieurs",              Class = 6, AccountType = "expense",   NormalBalance = "debit",  IsLeaf = true  },
                    new Account { Code = "62",  NameEn = "Other External Services",       NameFr = "Autres Services Extérieurs",       Class = 6, AccountType = "expense",   NormalBalance = "debit",  IsLeaf = true  },
                    new Account { Code = "63",  NameEn = "Taxes & Duties",                NameFr = "Impôts et Taxes",                  Class = 6, AccountType = "expense",   NormalBalance = "debit",  IsLeaf = true  },
                    new Account { Code = "64",  NameEn = "Staff Costs (Salaries)",        NameFr = "Charges de Personnel",             Class = 6, AccountType = "expense",   NormalBalance = "debit",  IsLeaf = false },
                    new Account { Code = "641", NameEn = "Wages & Salaries",              NameFr = "Salaires et Traitements",          Class = 6, AccountType = "expense",   NormalBalance = "debit",  IsLeaf = true  },
                    new Account { Code = "645", NameEn = "Employer Social Charges",       NameFr = "Charges Sociales Patronales",      Class = 6, AccountType = "expense",   NormalBalance = "debit",  IsLeaf = true  },
                    new Account { Code = "66",  NameEn = "Financial Charges",             NameFr = "Charges Financières",              Class = 6, AccountType = "expense",   NormalBalance = "debit",  IsLeaf = false },
                    new Account { Code = "661", NameEn = "Salaries Expense",              NameFr = "Charges de Salaires",              Class = 6, AccountType = "expense",   NormalBalance = "debit",  IsLeaf = true  },
                    new Account { Code = "664", NameEn = "Employer CNPS Contributions",   NameFr = "Charges CNPS Patronales",          Class = 6, AccountType = "expense",   NormalBalance = "debit",  IsLeaf = true  },
                    new Account { Code = "65",  NameEn = "Other Operating Charges",       NameFr = "Autres Charges",                   Class = 6, AccountType = "expense",   NormalBalance = "debit",  IsLeaf = true  },
                    new Account { Code = "68",  NameEn = "Depreciation & Amortisation",   NameFr = "Dotations aux Amortissements",     Class = 6, AccountType = "expense",   NormalBalance = "debit",  IsLeaf = true  },
                    new Account { Code = "69",  NameEn = "Corporate Income Tax (IS)",     NameFr = "Impôt sur les Bénéfices (IS)",     Class = 6, AccountType = "expense",   NormalBalance = "debit",  IsLeaf = true  },

                    // ── CLASS 7: Operating Revenues ────────────────────────────────────────
                    new Account { Code = "7",   NameEn = "Operating Revenues",            NameFr = "Produits des Activités Ordinaires", Class = 7, AccountType = "revenue",  NormalBalance = "credit", IsLeaf = false },
                    new Account { Code = "70",  NameEn = "Sales",                         NameFr = "Ventes",                           Class = 7, AccountType = "revenue",   NormalBalance = "credit", IsLeaf = false },
                    new Account { Code = "701", NameEn = "Sales of Merchandise",          NameFr = "Ventes de Marchandises",           Class = 7, AccountType = "revenue",   NormalBalance = "credit", IsLeaf = true  },
                    new Account { Code = "702", NameEn = "Sales of Finished Goods",       NameFr = "Ventes de Produits Finis",         Class = 7, AccountType = "revenue",   NormalBalance = "credit", IsLeaf = true  },
                    new Account { Code = "706", NameEn = "Service Revenue",               NameFr = "Prestations de Services",          Class = 7, AccountType = "revenue",   NormalBalance = "credit", IsLeaf = true  },
                    new Account { Code = "71",  NameEn = "Change in Inventories",         NameFr = "Variation de Stocks",              Class = 7, AccountType = "revenue",   NormalBalance = "credit", IsLeaf = true  },
                    new Account { Code = "75",  NameEn = "Other Operating Income",        NameFr = "Autres Produits",                  Class = 7, AccountType = "revenue",   NormalBalance = "credit", IsLeaf = true  },
                    new Account { Code = "78",  NameEn = "Provisions Written Back",       NameFr = "Reprises de Provisions",           Class = 7, AccountType = "revenue",   NormalBalance = "credit", IsLeaf = true  },

                    // ── CLASS 8: Other Charges & Revenues ──────────────────────────────────
                    new Account { Code = "8",   NameEn = "Other Charges & Revenues",      NameFr = "Autres Charges et Produits",       Class = 8, AccountType = "expense",   NormalBalance = "debit",  IsLeaf = false },
                    new Account { Code = "81",  NameEn = "Exceptional Expenses",          NameFr = "Charges Exceptionnelles",          Class = 8, AccountType = "expense",   NormalBalance = "debit",  IsLeaf = true  },
                    new Account { Code = "82",  NameEn = "Exceptional Income",            NameFr = "Produits Exceptionnels",           Class = 8, AccountType = "revenue",   NormalBalance = "credit", IsLeaf = true  },
                    new Account { Code = "85",  NameEn = "Employee Profit Sharing",       NameFr = "Participation des Salariés",       Class = 8, AccountType = "expense",   NormalBalance = "debit",  IsLeaf = true  },
                    new Account { Code = "88",  NameEn = "Net Income for the Year",       NameFr = "Résultat de l'Exercice",           Class = 8, AccountType = "equity",    NormalBalance = "credit", IsLeaf = true  },

                    // ── CLASS 9: Analytical Accounting ────────────────────────────────────
                    new Account { Code = "9",   NameEn = "Analytical Accounting",         NameFr = "Comptabilité Analytique",          Class = 9, AccountType = "cost",      NormalBalance = "debit",  IsLeaf = false },
                    new Account { Code = "91",  NameEn = "Cost Centres",                  NameFr = "Centres de Coûts",                 Class = 9, AccountType = "cost",      NormalBalance = "debit",  IsLeaf = true  },
                    new Account { Code = "92",  NameEn = "Cost of Production",            NameFr = "Coût de Production",               Class = 9, AccountType = "cost",      NormalBalance = "debit",  IsLeaf = true  },
                };

                var missing = allAccounts.Where(a => !existingCodes.Contains(a.Code)).ToList();
                if (missing.Any())
                {
                    await dbContext.Accounts.AddRangeAsync(missing);
                    await dbContext.SaveChangesAsync();
                }
            }
            }

            // Remove retired synthetic accounts 6001–6004; remap any cost centre refs to standard comptes 601/602/61/62
            {
                var codeMap = new Dictionary<string, string>
                {
                    ["6001"] = "601",
                    ["6002"] = "602",
                    ["6003"] = "61",
                    ["6004"] = "62",
                };
                var retired = codeMap.Keys.ToList();
                var ccs = await dbContext.CostCenters
                    .Where(c => c.RelatedAccountCode != null && retired.Contains(c.RelatedAccountCode))
                    .ToListAsync();
                foreach (var cc in ccs)
                {
                    if (cc.RelatedAccountCode != null && codeMap.TryGetValue(cc.RelatedAccountCode, out var n))
                        cc.RelatedAccountCode = n;
                }
                if (ccs.Count > 0)
                    await dbContext.SaveChangesAsync();

                var toDrop = await dbContext.Accounts.Where(a => retired.Contains(a.Code)).ToListAsync();
                if (toDrop.Count > 0)
                {
                    dbContext.Accounts.RemoveRange(toDrop);
                    await dbContext.SaveChangesAsync();
                }
            }

            // ─── Seed Default Company & Admin User ──────────────────────────────────────
            var company = await dbContext.Companies.FirstOrDefaultAsync(c => c.Name == "Zaizen Enterprise SARL" || c.Name == "Default Company");
            
            if (company == null)
            {
                company = new Company { Name = "Zaizen Enterprise SARL", TaxId = "M0123456789" };
                await dbContext.Companies.AddAsync(company);
                await dbContext.SaveChangesAsync();
            }

            if (!await dbContext.Users.AnyAsync(u => u.Email == "admin@comptabilite.cm"))
            {
                var adminRole = new Role { Name = "Admin" };

                var permissions = new List<Permission>
                {
                    new Permission { Resource = "dashboard",     Action = "read"   },
                    new Permission { Resource = "balance_sheet", Action = "read"   },
                    new Permission { Resource = "balance_sheet", Action = "export" },
                    new Permission { Resource = "cash_flow",     Action = "read"   },
                    new Permission { Resource = "cash_flow",     Action = "export" },
                    new Permission { Resource = "journal",       Action = "read"   },
                    new Permission { Resource = "journal",       Action = "write"  },
                };

                await dbContext.Permissions.AddRangeAsync(permissions);
                await dbContext.SaveChangesAsync();

                adminRole.RolePermissions = permissions
                    .Select(p => new RolePermission { PermissionId = p.Id })
                    .ToList();

                await dbContext.Roles.AddAsync(adminRole);
                await dbContext.SaveChangesAsync();

                var adminUser = new User
                {
                    Email    = "admin@comptabilite.cm",
                    PasswordHash = BCrypt.Net.BCrypt.HashPassword("Admin@123", 12),
                    FullName = "System Administrator",
                    RoleId   = adminRole.Id,
                    UserCompanies = new List<UserCompany>
                    {
                        new UserCompany { CompanyId = company.Id, AccessLevel = "admin" }
                    }
                };

                await dbContext.Users.AddAsync(adminUser);
                await dbContext.SaveChangesAsync();
            }
            else
            {
                await EnsureAdminPasswordHashAsync(dbContext);
            }

            await EnsureCorePermissionsGrantedAsync(dbContext);
            await EnsureDefaultTaxRulePackAsync(dbContext);

            // ─── Seed ERP & HR Data (100 Records Each) ──────────────────────
            var random = new Random();
            var allCompanies = await dbContext.Companies.ToListAsync();

            foreach (var comp in allCompanies)
            {
                // Products are owned by HMS — synced via POST /api/v1/integrations/products

                if (!await dbContext.Customers.AnyAsync(c => c.CompanyId == company.Id))
                {
                    var customers = new List<Customer>();
                    var names = CameroonSeedCatalog.CustomerNames;
                    var cities = new[]
                    {
                        "Akwa, Douala", "Bastos, Yaoundé", "Bonabéri, Douala", "Nlongkak, Yaoundé",
                        "Bonamoussadi, Douala", "Mvan, Yaoundé", "Bonapriso, Douala", "Essos, Yaoundé",
                        "Bafoussam Centre", "Garoua Deuk-Jérémie", "Limbé Down Beach", "Kribi Centre",
                        "Maroua Pitoaré", "Bertoua", "Ébolowa", "Nkongsamba", "Édéa", "Obala", "Mbankomo", "Mvog-Ada, Yaoundé"
                    };
                    for (int i = 1; i <= 100; i++)
                    {
                        var name = names[(i - 1) % names.Length];
                        customers.Add(new Customer
                        {
                            CompanyId = company.Id,
                            AccountCode = $"411{i:D3}",
                            Name = name,
                            Email = $"compta{i:000}@client-demo.cm",
                            Phone = $"+237 6{random.Next(50, 89)}{random.Next(100000, 999999)}",
                            Address = $"{cities[(i - 1) % cities.Length]}, Cameroun",
                            CurrentOutstanding = 0
                        });
                    }
                    await dbContext.Customers.AddRangeAsync(customers);
                }

                if (!await dbContext.Suppliers.AnyAsync(s => s.CompanyId == company.Id))
                {
                    var suppliers = new List<Supplier>();
                    var bases = new[]
                    {
                        "ETS Fournitures Générales", "SARL Import-Export", "Quincaillerie & BTP", "Matériel Informatique Pro",
                        "Transport & Logistique", "Services de Nettoyage", "Gardiennage & Sécurité", "Imprimerie Centrale",
                        "Maintenance Industrielle", "Électricité & Câblage", "Plomberie & Sanitaire", "Agro-distribution",
                        "Emballage & Conditionnement", "Équipements & Mobiliers", "Textile & EPI", "Énergie & Éclairage",
                        "Cabinet Conseil", "Location Engins", "Fournitures Médicales", "Restauration & Traiteur"
                    };
                    var contactNames = new[] 
                    { 
                        "Jean-Pierre Nguema", "Marie-Claire Ngo", "Paul Biya", "Alice Mbarga", 
                        "Samuel Eto'o", "Dieudonné Happi", "Françoise Foning", "Emmanuel Ndoumbe" 
                    };
                    var cities = new[] { "Douala", "Yaoundé", "Bafoussam", "Garoua", "Kribi", "Bertoua", "Maroua", "Limbé", "Nkongsamba", "Édéa" };
                    
                    for (int i = 1; i <= 100; i++)
                    {
                        var baseName = bases[(i - 1) % bases.Length];
                        var city = cities[random.Next(cities.Length)];
                        var contact = contactNames[random.Next(contactNames.Length)];
                        
                        suppliers.Add(new Supplier
                        {
                            CompanyId = company.Id,
                            AccountCode = $"401{i:D4}",
                            Name = $"{baseName} {city}",
                            ContactPerson = contact,
                            Phone = $"+237 6{random.Next(70, 99)}{random.Next(100, 999)}{random.Next(100, 999)}",
                            Email = $"contact{i}@{(baseName.Replace(" ", "").ToLower())}.cm",
                            Address = $"{city}, Cameroun",
                            TaxId = $"M{random.Next(1000, 9999)}{random.Next(1000, 9999)}P",
                            CurrentBalance = i % 5 == 0 ? random.Next(50000, 2000000) : 0,
                            CreatedAt = DateTime.UtcNow.AddDays(-random.Next(1, 100))
                        });
                    }
                    await dbContext.Suppliers.AddRangeAsync(suppliers);
                }

                if (!await dbContext.Employees.AnyAsync(e => e.CompanyId == company.Id))
                {
                    var employees = new List<Employee>();
                    var sectors = new[] { "office", "industry", "construction" };
                    var staff = CameroonSeedCatalog.Employees;
                    for (int i = 1; i <= 100; i++)
                    {
                        var e = staff[(i - 1) % staff.Length];
                        employees.Add(new Employee
                        {
                            CompanyId = company.Id,
                            FirstName = e.FirstName,
                            LastName = e.LastName,
                            Email = $"personnel{i:000}@ets-demo.cm",
                            Position = e.PositionFr,
                            PositionEn = e.PositionEn,
                            BaseSalary = random.Next(100000, 1500000),
                            IndustrySector = sectors[random.Next(sectors.Length)],
                            HireDate = new DateTime(2020 + random.Next(0, 5), random.Next(1, 13), random.Next(1, 28), 0, 0, 0, DateTimeKind.Utc),
                            EmploymentType = "CDI",
                            BankAccountInfo = $"CM21 10001 06870 {random.Next(1000000, 9999999)} {random.Next(10, 99)}",
                            IsActive = true
                        });
                    }
                    await dbContext.Employees.AddRangeAsync(employees);
                }

                await dbContext.SaveChangesAsync();

                // ─── Seed Sales Documents (100 Records) ──────────────────────
                if (!await dbContext.SalesDocuments.AnyAsync(d => d.CompanyId == company.Id))
                {
                    var dbCustomers = await dbContext.Customers.Where(c => c.CompanyId == company.Id).Take(100).ToListAsync();
                    var dbProducts = await dbContext.Products.Where(p => p.CompanyId == company.Id).Take(100).ToListAsync();

                    if (dbCustomers.Any() && dbProducts.Any())
                    {
                        var docTypes = new[] { "invoice", "order", "quote" };
                        var statuses = new[] { "draft", "sent", "confirmed", "delivered", "invoiced" };
                        var salesDocuments = new List<SalesDocument>();

                        for (int i = 1; i <= 100; i++)
                        {
                            var randomCustomer = dbCustomers[random.Next(dbCustomers.Count)];
                            var lines = new List<SalesDocumentLine>();
                            
                            int numLines = random.Next(1, 4);
                            decimal docTotalHt = 0;
                            
                            for (int j = 0; j < numLines; j++)
                            {
                                var randomProduct = dbProducts[random.Next(dbProducts.Count)];
                                decimal qty = random.Next(1, 10);
                                decimal lineHt = randomProduct.UnitPrice * qty;
                                docTotalHt += lineHt;
                                
                                lines.Add(new SalesDocumentLine
                                {
                                    ProductId = randomProduct.Id,
                                    Quantity = qty,
                                    UnitPrice = randomProduct.UnitPrice,
                                    DiscountRate = 0,
                                    TotalLine = lineHt
                                });
                            }

                            decimal docTotalTva = docTotalHt * 0.1925m;
                            decimal docTotalTtc = docTotalHt + docTotalTva;

                            salesDocuments.Add(new SalesDocument
                            {
                                CompanyId = company.Id,
                                CustomerId = randomCustomer.Id,
                                DocumentType = docTypes[random.Next(docTypes.Length)],
                                DocumentNumber = $"DOC-2025-{i:D4}",
                                IssueDate = new DateTime(2025, random.Next(1, 4), random.Next(1, 28), 0, 0, 0, DateTimeKind.Utc),
                                Status = statuses[random.Next(statuses.Length)],
                                TotalHT = docTotalHt,
                                TotalTVA = docTotalTva,
                                TotalTTC = docTotalTtc,
                                Notes = "Autogenerated by seeder",
                                Lines = lines
                            });
                        }
                        
                        await dbContext.SalesDocuments.AddRangeAsync(salesDocuments);
                        await dbContext.SaveChangesAsync();
                    }
                }

                // ─── Seed Product Families (10 Records) ──────────────────────
                if (!await dbContext.ProductFamilies.AnyAsync())
                {
                    var families = new[]
                    {
                        ("Agroalimentaire & boissons", "Céréales, conserves, boissons, produits frais"),
                        ("Quincaillerie & BTP", "Ciment, fer, tôles, peinture, plomberie"),
                        ("Équipements & mobiliers", "Bureaux, rayonnages, mobilier professionnel"),
                        ("Informatique & télécoms", "Matériel IT, réseau, consommables"),
                        ("Textile & habillement", "Vêtements pro, EPI, chaussures de sécurité"),
                        ("Énergie & éclairage", "Groupes, solaire, lampes, câbles électriques"),
                        ("Transport & logistique", "Location engins, palettes, prestations fret"),
                        ("Services aux entreprises", "Comptabilité, RH, juridique, formation"),
                        ("Santé & hygiène", "Consommables médicaux, produits d'entretien"),
                        ("Emballage & conditionnement", "Films, cartons, étiquettes, fûts")
                    };
                    var productFamilies = families.Select(f => new ProductFamily
                    {
                        NameEn      = f.Item1,
                        NameFr      = f.Item1,
                        Description = f.Item2,
                        CompanyId   = company.Id
                    }).ToList();
                    await dbContext.ProductFamilies.AddRangeAsync(productFamilies);
                    await dbContext.SaveChangesAsync();
                }

                // Demo journal seed removed — use HMS sync or manual journal entry instead.

                // ─── Seed Payroll Periods + Details (12 months × ~8 employees) ──
                var cnpsCalc = new CnpsCalculationService();
                var payrollTax = new CameroonTaxService();

                if (!await dbContext.PayrollPeriods.AnyAsync(p => p.CompanyId == company.Id))
                {
                    var dbEmployees = await dbContext.Employees.Where(e => e.CompanyId == company.Id).Take(8).ToListAsync();
                    if (dbEmployees.Any())
                    {
                        for (int month = 1; month <= 12; month++)
                        {
                            var periodDate = new DateTime(2025, month, 1, 0, 0, 0, DateTimeKind.Utc);
                            decimal totalGross = 0, totalNet = 0, totalEmployer = 0;

                            var details = dbEmployees.Select(emp =>
                            {
                                var gross = emp.BaseSalary
                                    + emp.IndemniteTransport
                                    + emp.IndemniteLogement
                                    + emp.PrimeAnciennete
                                    + emp.Mois13
                                    + emp.AvantagesNature
                                    + emp.IndemniteRepresentation;

                                var cnps = cnpsCalc.Calculate(gross, emp.IndustrySector);

                                var baseTaxable = gross - cnps.EmployeeContribution;
                                var abatedTaxable = baseTaxable * 0.70m;
                                var annualTaxable = abatedTaxable * 12;
                                var annualTax = payrollTax.CalculateIncomeTax(annualTaxable);
                                var irpp = annualTax / 12;

                                var cac = payrollTax.CalculateCac(irpp);
                                var rav = payrollTax.CalculateRav(gross);
                                var tdl = payrollTax.CalculateTdl(emp.BaseSalary);
                                var cfcEmployee = payrollTax.CalculateCfcEmployee(gross);
                                var cfcEmployer = payrollTax.CalculateCfcEmployer(gross);
                                var fneEmployer = payrollTax.CalculateFneEmployer(gross);

                                var net = gross
                                    - cnps.EmployeeContribution
                                    - irpp
                                    - cac
                                    - rav
                                    - tdl
                                    - cfcEmployee;

                                totalGross    += gross;
                                totalNet      += net;
                                totalEmployer += cnps.EmployerContribution + cfcEmployer + fneEmployer;

                                return new PayrollDetail
                                {
                                    EmployeeId          = emp.Id,
                                    BaseSalary          = emp.BaseSalary,
                                    IndemniteTransport  = emp.IndemniteTransport,
                                    IndemniteLogement   = emp.IndemniteLogement,
                                    PrimeAnciennete     = emp.PrimeAnciennete,
                                    Mois13              = emp.Mois13,
                                    AvantagesNature     = emp.AvantagesNature,
                                    IndemniteRepresentation = emp.IndemniteRepresentation,
                                    OvertimePay         = 0,
                                    Bonuses             = 0,
                                    Advances            = 0,
                                    EmployeeCnpsContrib = cnps.EmployeeContribution,
                                    EmployerCnpsContrib = cnps.EmployerContribution,
                                    TaxableIncome       = abatedTaxable,
                                    IncomeTax           = irpp,
                                    Cac                 = cac,
                                    Rav                 = rav,
                                    Tdl                 = tdl,
                                    CfcEmployee         = cfcEmployee,
                                    CfcEmployer         = cfcEmployer,
                                    FneEmployer         = fneEmployer,
                                    NetSalary           = net,
                                    CreatedAt           = periodDate
                                };
                            }).ToList();

                            var period = new PayrollPeriod
                            {
                                CompanyId            = company.Id,
                                PeriodDate           = periodDate,
                                Status               = "processed",  // 'processed' so the UI can post to ledger
                                TotalGrossPayroll    = totalGross,
                                TotalNetPayroll      = totalNet,
                                TotalEmployerCharges = totalEmployer,
                                CreatedAt            = periodDate,
                                Details              = details
                            };

                            await dbContext.PayrollPeriods.AddAsync(period);
                        }
                        await dbContext.SaveChangesAsync();
                    }
                }

                var periodsMissingDetails = await dbContext.PayrollPeriods
                    .Where(p => p.CompanyId == company.Id && !dbContext.PayrollDetails.Any(d => d.PayrollPeriodId == p.Id))
                    .ToListAsync();

                if (periodsMissingDetails.Count > 0)
                {
                    var activeEmployees = await dbContext.Employees
                        .Where(e => e.CompanyId == company.Id && e.IsActive)
                        .Take(8)
                        .ToListAsync();

                    if (activeEmployees.Count > 0)
                    {
                        foreach (var period in periodsMissingDetails)
                        {
                            decimal totalGross = 0, totalNet = 0, totalEmployer = 0;
                            var details = new List<PayrollDetail>();

                            foreach (var emp in activeEmployees)
                            {
                                var gross = emp.BaseSalary
                                    + emp.IndemniteTransport
                                    + emp.IndemniteLogement
                                    + emp.PrimeAnciennete
                                    + emp.Mois13
                                    + emp.AvantagesNature
                                    + emp.IndemniteRepresentation;

                                var cnps = cnpsCalc.Calculate(gross, emp.IndustrySector);

                                var baseTaxable = gross - cnps.EmployeeContribution;
                                var abatedTaxable = baseTaxable * 0.70m;
                                var annualTaxable = abatedTaxable * 12;
                                var annualTax = payrollTax.CalculateIncomeTax(annualTaxable);
                                var irpp = annualTax / 12;

                                var cac = payrollTax.CalculateCac(irpp);
                                var rav = payrollTax.CalculateRav(gross);
                                var tdl = payrollTax.CalculateTdl(emp.BaseSalary);
                                var cfcEmployee = payrollTax.CalculateCfcEmployee(gross);
                                var cfcEmployer = payrollTax.CalculateCfcEmployer(gross);
                                var fneEmployer = payrollTax.CalculateFneEmployer(gross);

                                var net = gross
                                    - cnps.EmployeeContribution
                                    - irpp
                                    - cac
                                    - rav
                                    - tdl
                                    - cfcEmployee;

                                totalGross += gross;
                                totalNet += net;
                                totalEmployer += cnps.EmployerContribution + cfcEmployer + fneEmployer;

                                details.Add(new PayrollDetail
                                {
                                    PayrollPeriodId      = period.Id,
                                    EmployeeId           = emp.Id,
                                    BaseSalary           = emp.BaseSalary,
                                    IndemniteTransport   = emp.IndemniteTransport,
                                    IndemniteLogement    = emp.IndemniteLogement,
                                    PrimeAnciennete      = emp.PrimeAnciennete,
                                    Mois13               = emp.Mois13,
                                    AvantagesNature      = emp.AvantagesNature,
                                    IndemniteRepresentation = emp.IndemniteRepresentation,
                                    EmployeeCnpsContrib  = cnps.EmployeeContribution,
                                    EmployerCnpsContrib  = cnps.EmployerContribution,
                                    TaxableIncome        = abatedTaxable,
                                    IncomeTax            = irpp,
                                    Cac                  = cac,
                                    Rav                  = rav,
                                    Tdl                  = tdl,
                                    CfcEmployee          = cfcEmployee,
                                    CfcEmployer          = cfcEmployer,
                                    FneEmployer          = fneEmployer,
                                    NetSalary            = net,
                                    CreatedAt            = period.PeriodDate
                                });
                            }

                            if (details.Count > 0)
                            {
                                await dbContext.PayrollDetails.AddRangeAsync(details);
                                period.TotalGrossPayroll = totalGross;
                                period.TotalNetPayroll = totalNet;
                                period.TotalEmployerCharges = totalEmployer;
                                if (string.IsNullOrWhiteSpace(period.Status)) period.Status = "processed";
                            }
                        }

                        await dbContext.SaveChangesAsync();
                    }
                }

                var periodsNeedingDeductionRepair = await dbContext.PayrollPeriods
                    .Where(p => p.CompanyId == company.Id)
                    .Include(p => p.Details)
                        .ThenInclude(d => d.Employee)
                    .Where(p => p.Details.Any(d =>
                        (d.BaseSalary > 0 || d.IndemniteTransport > 0 || d.IndemniteLogement > 0 || d.PrimeAnciennete > 0 || d.Mois13 > 0 || d.AvantagesNature > 0 || d.IndemniteRepresentation > 0 || d.OvertimePay > 0 || d.Bonuses > 0)
                        && d.CfcEmployee == 0))
                    .ToListAsync();

                if (periodsNeedingDeductionRepair.Count > 0)
                {
                    foreach (var period in periodsNeedingDeductionRepair)
                    {
                        var changed = false;
                        decimal totalGross = 0, totalNet = 0, totalEmployer = 0;

                        foreach (var detail in period.Details)
                        {
                            var gross = detail.BaseSalary
                                + detail.IndemniteTransport
                                + detail.IndemniteLogement
                                + detail.PrimeAnciennete
                                + detail.Mois13
                                + detail.AvantagesNature
                                + detail.IndemniteRepresentation
                                + detail.OvertimePay
                                + detail.Bonuses;

                            if (gross > 0 && detail.CfcEmployee == 0)
                            {
                                var industry = detail.Employee?.IndustrySector ?? "office";
                                var cnps = cnpsCalc.Calculate(gross, industry);

                                var baseTaxable = gross - cnps.EmployeeContribution;
                                var abatedTaxable = baseTaxable * 0.70m;
                                var annualTaxable = abatedTaxable * 12;
                                var annualTax = payrollTax.CalculateIncomeTax(annualTaxable);
                                var irpp = annualTax / 12;

                                detail.EmployeeCnpsContrib = cnps.EmployeeContribution;
                                detail.EmployerCnpsContrib = cnps.EmployerContribution;
                                detail.TaxableIncome = abatedTaxable;
                                detail.IncomeTax = irpp;

                                detail.Cac = payrollTax.CalculateCac(irpp);
                                detail.Rav = payrollTax.CalculateRav(gross);
                                detail.Tdl = payrollTax.CalculateTdl(detail.BaseSalary);
                                detail.CfcEmployee = payrollTax.CalculateCfcEmployee(gross);
                                detail.CfcEmployer = payrollTax.CalculateCfcEmployer(gross);
                                detail.FneEmployer = payrollTax.CalculateFneEmployer(gross);

                                detail.NetSalary = gross
                                    - detail.EmployeeCnpsContrib
                                    - detail.IncomeTax
                                    - detail.Cac
                                    - detail.Rav
                                    - detail.Tdl
                                    - detail.CfcEmployee;

                                changed = true;
                            }

                            totalGross += gross;
                            totalNet += detail.NetSalary;
                            totalEmployer += detail.EmployerCnpsContrib + detail.CfcEmployer + detail.FneEmployer;
                        }

                        if (changed)
                        {
                            period.TotalGrossPayroll = totalGross;
                            period.TotalNetPayroll = totalNet;
                            period.TotalEmployerCharges = totalEmployer;
                            if (string.IsNullOrWhiteSpace(period.Status)) period.Status = "processed";
                        }
                    }

                    await dbContext.SaveChangesAsync();
                }

                // ─── Seed Inventory Movements (100 Records) ──────────────────
                if (!await dbContext.InventoryMovements.AnyAsync(m => m.CompanyId == company.Id))
                {
                    var dbProducts = await dbContext.Products.Where(p => p.CompanyId == company.Id).Take(50).ToListAsync();
                    if (dbProducts.Any())
                    {
                        var movementTypes = new[] { "in", "out", "adjustment" };
                        var movements = new List<InventoryMovement>();
                        for (int i = 0; i < 100; i++)
                        {
                            var prod = dbProducts[random.Next(dbProducts.Count)];
                            movements.Add(new InventoryMovement
                            {
                                ProductId    = prod.Id,
                                CompanyId    = company.Id,
                                MovementType = movementTypes[random.Next(movementTypes.Length)],
                                Quantity     = random.Next(1, 50),
                                UnitCost     = prod.UnitPrice,
                                MovementDate = new DateTime(2025, random.Next(1, 13), random.Next(1, 28), 0, 0, 0, DateTimeKind.Utc)
                            });
                        }
                        await dbContext.InventoryMovements.AddRangeAsync(movements);
                        await dbContext.SaveChangesAsync();
                    }
                }

            }

            await RefreshSeededDisplayNamesAsync(dbContext, company.Id);
            await EnsureProjectProfitabilityAsync(dbContext);
        }

        /// <summary>
        /// Ensures project cost centres exist and tags validated P&amp;L journal lines so project profitability is live.
        /// Idempotent — safe on every startup.
        /// </summary>
        public static async Task EnsureProjectProfitabilityAsync(AppDbContext dbContext)
        {
            var projectDefs = new (string Code, string Name, byte OhadaClass)[]
            {
                ("PRJ-CLIN", "Clinical Services", 7),
                ("PRJ-PHRM", "Pharmacy & Retail", 7),
                ("PRJ-GAOV", "General & Overheads", 6),
            };

            var companies = await dbContext.Companies.AsNoTracking().Select(c => c.Id).ToListAsync();
            foreach (var companyId in companies)
            {
                var existingCodes = (await dbContext.CostCenters
                    .Where(c => c.CompanyId == companyId)
                    .Select(c => c.Code)
                    .ToListAsync())
                    .ToHashSet(StringComparer.OrdinalIgnoreCase);

                var sort = await dbContext.CostCenters
                    .Where(c => c.CompanyId == companyId)
                    .Select(c => (int?)c.SortOrder)
                    .MaxAsync() ?? -1;

                foreach (var (code, name, ohadaClass) in projectDefs)
                {
                    if (existingCodes.Contains(code)) continue;
                    sort++;
                    await dbContext.CostCenters.AddAsync(new CostCenter
                    {
                        CompanyId = companyId,
                        Code = code,
                        Name = name,
                        OhadaClass = ohadaClass,
                        SortOrder = sort,
                        IsActive = true
                    });
                    existingCodes.Add(code);
                }
            }

            if (dbContext.ChangeTracker.HasChanges())
                await dbContext.SaveChangesAsync();

            foreach (var companyId in companies)
            {
                var lines = await dbContext.JournalLines
                    .Include(l => l.Entry)
                    .Where(l => l.Entry!.CompanyId == companyId
                        && l.Entry.Validated
                        && !l.Entry.Voided
                        && (l.CostCentre == null || l.CostCentre == ""))
                    .ToListAsync();

                var changed = false;
                foreach (var line in lines)
                {
                    var projectCode = ResolveProjectCode(line);
                    if (projectCode == null) continue;
                    line.CostCentre = projectCode;
                    changed = true;
                }

                if (changed)
                    await dbContext.SaveChangesAsync();
            }
        }

        private static string? ResolveProjectCode(JournalLine line)
        {
            var accountCode = (line.AccountCode ?? string.Empty).Trim();
            if (!IsProfitabilityRevenueAccount(accountCode) && !IsProfitabilityExpenseAccount(accountCode))
                return null;

            var desc = (line.LineDescription ?? string.Empty).ToUpperInvariant();
            var entryDesc = (line.Entry?.Description ?? string.Empty).ToUpperInvariant();

            if (accountCode.StartsWith("706", StringComparison.Ordinal)
                || desc.Contains("HEALTHCARE", StringComparison.Ordinal)
                || desc.Contains("PATIENT", StringComparison.Ordinal)
                || entryDesc.Contains("PATIENT", StringComparison.Ordinal)
                || entryDesc.Contains("SOINS", StringComparison.Ordinal))
                return "PRJ-CLIN";

            if (accountCode.StartsWith("700", StringComparison.Ordinal)
                || accountCode.StartsWith("701", StringComparison.Ordinal)
                || desc.Contains("PHARMAC", StringComparison.Ordinal)
                || entryDesc.Contains("PHARMAC", StringComparison.Ordinal)
                || entryDesc.Contains("FACTURE Q-", StringComparison.Ordinal))
                return "PRJ-PHRM";

            if (IsProfitabilityExpenseAccount(accountCode))
                return "PRJ-GAOV";

            if (IsProfitabilityRevenueAccount(accountCode))
                return "PRJ-CLIN";

            return null;
        }

        private static bool IsProfitabilityRevenueAccount(string accountCode)
        {
            var code = accountCode.TrimStart('0');
            return code.Length > 0 && (code[0] == '7' || code.StartsWith("82", StringComparison.Ordinal));
        }

        private static bool IsProfitabilityExpenseAccount(string accountCode)
        {
            var code = accountCode.TrimStart('0');
            return code.Length > 0 && (code[0] == '6' || code.StartsWith("81", StringComparison.Ordinal));
        }

        /// <summary>Re-applies catalog names to demo-seeded rows so payroll / PDFs pick up updates without wiping the DB.</summary>
        public static async Task RefreshSeededDisplayNamesAsync(AppDbContext dbContext, Guid companyId)
        {
            var staff = CameroonSeedCatalog.Employees;
            var productsCat = CameroonSeedCatalog.Products;
            var customerNames = CameroonSeedCatalog.CustomerNames;

            // Demo rows: current seeder uses @ets-demo.cm; older / alternate seeds used @company.cm or "EmployeeN" / "NameN".
            var employeeCandidates = await dbContext.Employees
                .Where(e => e.CompanyId == companyId
                    && e.Email != null
                    && (e.Email.EndsWith("@ets-demo.cm")
                        || e.Email.EndsWith("@company.cm")
                        || (e.FirstName.StartsWith("Employee") && e.LastName.StartsWith("Name"))))
                .ToListAsync();

            static int DemoEmployeeSortOrder(Employee e)
            {
                var em = Regex.Match(e.Email ?? "", @"^emp(\d+)@", RegexOptions.IgnoreCase);
                if (em.Success && int.TryParse(em.Groups[1].Value, out var empN)) return empN;
                var pers = Regex.Match(e.Email ?? "", @"personnel(\d+)@", RegexOptions.IgnoreCase);
                if (pers.Success && int.TryParse(pers.Groups[1].Value, out var pN)) return pN;
                var fn = Regex.Match(e.FirstName ?? "", @"^Employee(\d+)$", RegexOptions.IgnoreCase);
                if (fn.Success && int.TryParse(fn.Groups[1].Value, out var fN)) return fN;
                return int.MaxValue;
            }

            static bool IsLegacyPlaceholderEmployee(Employee e) =>
                (e.Email != null && e.Email.EndsWith("@company.cm", StringComparison.OrdinalIgnoreCase))
                || (e.FirstName.StartsWith("Employee", StringComparison.Ordinal)
                    && e.LastName.StartsWith("Name", StringComparison.Ordinal));

            var employees = employeeCandidates
                .OrderBy(e => IsLegacyPlaceholderEmployee(e) ? 0 : 1)
                .ThenBy(DemoEmployeeSortOrder)
                .ThenBy(e => e.Id)
                .Take(100)
                .ToList();

            for (var i = 0; i < employees.Count; i++)
            {
                var s = staff[i % staff.Length];
                employees[i].FirstName = s.FirstName;
                employees[i].LastName = s.LastName;
                employees[i].Position = s.PositionFr;
                employees[i].PositionEn = s.PositionEn;
                if (IsLegacyPlaceholderEmployee(employees[i]))
                {
                    var n = DemoEmployeeSortOrder(employees[i]);
                    if (n == int.MaxValue) n = i + 1;
                    employees[i].Email = $"personnel{n:000}@ets-demo.cm";
                }
            }

            var products = await dbContext.Products
                .Where(p => p.CompanyId == companyId && p.Code.StartsWith("PRD-"))
                .OrderBy(p => p.Id)
                .Take(100)
                .ToListAsync();
            for (var i = 0; i < products.Count; i++)
            {
                var p = productsCat[i % productsCat.Length];
                products[i].NameEn = p.NameEn;
                products[i].NameFr = p.NameFr;
                products[i].Description = p.Description;
            }

            // Use ILike (translatable); EndsWith(..., StringComparison) is not supported by EF for PostgreSQL.
            var emailCustomerHits = await dbContext.Customers
                .Where(c => c.CompanyId == companyId && c.Email != null && (
                    EF.Functions.ILike(c.Email, "%@client-demo.cm")
                    || EF.Functions.ILike(c.Email, "%@company.cm")
                    || EF.Functions.ILike(c.Email, "%@customer.cm")))
                .ToListAsync();

            var nameCustomerHits = await dbContext.Customers
                .Where(c => c.CompanyId == companyId
                    && (EF.Functions.ILike(c.Name, "Customer%")
                        || EF.Functions.ILike(c.Name, "Client%")))
                .ToListAsync();
            var nameCustomerFiltered = nameCustomerHits.Where(c => IsPlaceholderCustomerNameForRefresh(c.Name)).ToList();

            var customerCandidates = emailCustomerHits
                .UnionBy(nameCustomerFiltered, c => c.Id)
                .ToList();

            var customers = customerCandidates
                .OrderBy(c => IsLegacyCustomerDemoPlaceholder(c) ? 0 : 1)
                .ThenBy(DemoCustomerSortOrderForRefresh)
                .ThenBy(c => c.Id)
                .Take(200)
                .ToList();

            for (var i = 0; i < customers.Count; i++)
            {
                var legacy = IsLegacyCustomerDemoPlaceholder(customers[i]);
                var n = DemoCustomerSortOrderForRefresh(customers[i]);
                if (n == int.MaxValue) n = i + 1;
                customers[i].Name = customerNames[i % customerNames.Length];
                if (legacy)
                    customers[i].Email = $"compta{n:000}@client-demo.cm";
            }

            if (dbContext.ChangeTracker.HasChanges())
                await dbContext.SaveChangesAsync();
        }

        private static bool IsPlaceholderCustomerNameForRefresh(string? name)
        {
            if (string.IsNullOrWhiteSpace(name)) return false;
            return Regex.IsMatch(name, @"^Customer\d+$", RegexOptions.IgnoreCase)
                || Regex.IsMatch(name, @"^Customer\s*#?\d+\s*$", RegexOptions.IgnoreCase)
                || Regex.IsMatch(name, @"^Customer\s+Corp\s+\d+\s*$", RegexOptions.IgnoreCase)
                || Regex.IsMatch(name, @"^Client\d+$", RegexOptions.IgnoreCase)
                || Regex.IsMatch(name, @"^Client\s*#?\d+\s*$", RegexOptions.IgnoreCase);
        }

        private static bool IsLegacyCustomerDemoPlaceholder(Customer c) =>
            (c.Email != null && (
                c.Email.EndsWith("@company.cm", StringComparison.OrdinalIgnoreCase)
                || c.Email.EndsWith("@customer.cm", StringComparison.OrdinalIgnoreCase)))
            || IsPlaceholderCustomerNameForRefresh(c.Name);

        private static int DemoCustomerSortOrderForRefresh(Customer c)
        {
            var m = Regex.Match(c.Email ?? "", @"^compta(\d+)@", RegexOptions.IgnoreCase);
            if (m.Success && int.TryParse(m.Groups[1].Value, out var comptaN)) return comptaN;
            m = Regex.Match(c.Email ?? "", @"^contact(\d+)@", RegexOptions.IgnoreCase);
            if (m.Success && int.TryParse(m.Groups[1].Value, out var contactN)) return contactN;
            m = Regex.Match(c.Email ?? "", @"^cust(\d+)@", RegexOptions.IgnoreCase);
            if (m.Success && int.TryParse(m.Groups[1].Value, out var custN)) return custN;
            m = Regex.Match(c.Name ?? "", @"^Customer\s+Corp\s+(\d+)\s*$", RegexOptions.IgnoreCase);
            if (m.Success && int.TryParse(m.Groups[1].Value, out var corpN)) return corpN;
            m = Regex.Match(c.Name ?? "", @"^Customer\s*#?(\d+)\s*$", RegexOptions.IgnoreCase);
            if (m.Success && int.TryParse(m.Groups[1].Value, out var cn)) return cn;
            m = Regex.Match(c.Name ?? "", @"^Customer(\d+)$", RegexOptions.IgnoreCase);
            if (m.Success && int.TryParse(m.Groups[1].Value, out var cn2)) return cn2;
            m = Regex.Match(c.Name ?? "", @"^Client\s*#?(\d+)\s*$", RegexOptions.IgnoreCase);
            if (m.Success && int.TryParse(m.Groups[1].Value, out var cl)) return cl;
            m = Regex.Match(c.Name ?? "", @"^Client(\d+)$", RegexOptions.IgnoreCase);
            if (m.Success && int.TryParse(m.Groups[1].Value, out var cl2)) return cl2;
            return int.MaxValue;
        }
    }
}
