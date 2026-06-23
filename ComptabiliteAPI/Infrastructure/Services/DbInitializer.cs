using Microsoft.EntityFrameworkCore;
using ComptabiliteAPI.Infrastructure.Data;
using ComptabiliteAPI.Domain.Entities;

namespace ComptabiliteAPI.Infrastructure.Services
{
    public static class DbInitializer
    {
        public static async Task InitializeAsync(IServiceProvider services)
        {
            using var scope = services.CreateScope();
            var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

            // 1. Apply standard EF migrations
            await dbContext.Database.MigrateAsync();

            // 2. Execute raw SQL for schema adjustments and backfills (Cameroon-specific fields)
            await dbContext.Database.ExecuteSqlRawAsync(
                """
                DO $$
                BEGIN
                  IF to_regclass('public."Employees"') IS NOT NULL THEN
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='Employees' AND column_name='PositionEn') THEN
                      ALTER TABLE "Employees" ADD COLUMN "PositionEn" text NOT NULL DEFAULT '';
                    END IF;

                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='Employees' AND column_name='OvertimePay') THEN
                      ALTER TABLE "Employees" ADD COLUMN "OvertimePay" numeric NOT NULL DEFAULT 0;
                    END IF;

                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='Employees' AND column_name='Bonuses') THEN
                      ALTER TABLE "Employees" ADD COLUMN "Bonuses" numeric NOT NULL DEFAULT 0;
                    END IF;
                  END IF;

                  IF to_regclass('public."Companies"') IS NOT NULL THEN
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='Companies' AND column_name='TransportAllowanceRate') THEN
                      ALTER TABLE "Companies" ADD COLUMN "TransportAllowanceRate" numeric NOT NULL DEFAULT 0.10;
                    END IF;

                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='Companies' AND column_name='HousingAllowanceRate') THEN
                      ALTER TABLE "Companies" ADD COLUMN "HousingAllowanceRate" numeric NOT NULL DEFAULT 0.15;
                    END IF;

                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='Companies' AND column_name='BenefitsInKindRate') THEN
                      ALTER TABLE "Companies" ADD COLUMN "BenefitsInKindRate" numeric NOT NULL DEFAULT 0.10;
                    END IF;
                    UPDATE "Companies" SET "BenefitsInKindRate" = 0.10 WHERE "BenefitsInKindRate" = 0;

                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='Companies' AND column_name='RepresentationAllowanceRate') THEN
                      ALTER TABLE "Companies" ADD COLUMN "RepresentationAllowanceRate" numeric NOT NULL DEFAULT 0.10;
                    END IF;
                    UPDATE "Companies" SET "RepresentationAllowanceRate" = 0.10 WHERE "RepresentationAllowanceRate" = 0;

                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='Companies' AND column_name='ApproveThirteenthMonth') THEN
                      ALTER TABLE "Companies" ADD COLUMN "ApproveThirteenthMonth" boolean NOT NULL DEFAULT false;
                    END IF;

                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='Companies' AND column_name='ApproveSeniorityBonus') THEN
                      ALTER TABLE "Companies" ADD COLUMN "ApproveSeniorityBonus" boolean NOT NULL DEFAULT false;
                    END IF;

                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='Companies' AND column_name='ApproveOvertimePay') THEN
                      ALTER TABLE "Companies" ADD COLUMN "ApproveOvertimePay" boolean NOT NULL DEFAULT false;
                    END IF;

                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='Companies' AND column_name='ApproveBonuses') THEN
                      ALTER TABLE "Companies" ADD COLUMN "ApproveBonuses" boolean NOT NULL DEFAULT false;
                    END IF;
                  END IF;

                  IF to_regclass('public."Suppliers"') IS NOT NULL THEN
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='Suppliers' AND column_name='Email') THEN
                      ALTER TABLE "Suppliers" ADD COLUMN "Email" text NOT NULL DEFAULT '';
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='Suppliers' AND column_name='Phone') THEN
                      ALTER TABLE "Suppliers" ADD COLUMN "Phone" text NOT NULL DEFAULT '';
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='Suppliers' AND column_name='Address') THEN
                      ALTER TABLE "Suppliers" ADD COLUMN "Address" text NOT NULL DEFAULT '';
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='Suppliers' AND column_name='ContactPerson') THEN
                      ALTER TABLE "Suppliers" ADD COLUMN "ContactPerson" text NOT NULL DEFAULT '';
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='Suppliers' AND column_name='TaxId') THEN
                      ALTER TABLE "Suppliers" ADD COLUMN "TaxId" text NOT NULL DEFAULT '';
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='Suppliers' AND column_name='CurrentBalance') THEN
                      ALTER TABLE "Suppliers" ADD COLUMN "CurrentBalance" numeric NULL;
                    END IF;

                    UPDATE "Suppliers" 
                    SET "ContactPerson" = (
                          CASE floor(random() * 8)
                            WHEN 0 THEN 'Jean-Pierre Nguema'
                            WHEN 1 THEN 'Marie-Claire Ngo'
                            WHEN 2 THEN 'Paul Biya'
                            WHEN 3 THEN 'Alice Mbarga'
                            WHEN 4 THEN 'Samuel Eto''o'
                            WHEN 5 THEN 'Dieudonné Happi'
                            WHEN 6 THEN 'Françoise Foning'
                            ELSE 'Emmanuel Ndoumbe'
                          END
                        ),
                        "Phone" = '+237 6' || (floor(random() * 89) + 10)::text || (floor(random() * 899999) + 100000)::text,
                        "TaxId" = 'M' || (floor(random() * 8999) + 1000)::text || (floor(random() * 8999) + 1000)::text || 'P',
                        "Email" = lower(replace(replace("Name", ' ', '.'), '&', '')) || '@demo.cm',
                        "Address" = (CASE floor(random() * 3) WHEN 0 THEN 'Akwa, Douala' WHEN 1 THEN 'Bastos, Yaoundé' ELSE 'Bafoussam Centre' END) || ', Cameroun',
                        "CurrentBalance" = CASE WHEN random() < 0.2 THEN (random() * 1200000)::numeric ELSE 0 END
                    WHERE "ContactPerson" LIKE 'Contact %' OR "ContactPerson" = '' OR "ContactPerson" IS NULL;
                  END IF;

                  IF to_regclass('public."ProductFamilies"') IS NOT NULL THEN
                    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ProductFamilies' AND column_name='Name') THEN
                      UPDATE "ProductFamilies" SET "NameEn" = "Name" WHERE ("NameEn" IS NULL OR "NameEn" = '') AND "Name" IS NOT NULL AND "Name" <> '';
                      UPDATE "ProductFamilies" SET "NameFr" = "Name" WHERE ("NameFr" IS NULL OR "NameFr" = '') AND "Name" IS NOT NULL AND "Name" <> '';
                      ALTER TABLE "ProductFamilies" DROP COLUMN "Name";
                    END IF;
                  END IF;

                  IF to_regclass('public."PayrollDepartmentSummaries"') IS NULL THEN
                    CREATE TABLE "PayrollDepartmentSummaries" (
                      "Id" uuid PRIMARY KEY,
                      "CompanyId" uuid NOT NULL,
                      "Year" integer NOT NULL,
                      "Month" integer NOT NULL,
                      "Department" text NOT NULL DEFAULT '',
                      "Headcount" integer NOT NULL DEFAULT 0,
                      "GrossPayroll" numeric NOT NULL DEFAULT 0,
                      "NetPayroll" numeric NOT NULL DEFAULT 0,
                      "EmployerCharges" numeric NOT NULL DEFAULT 0,
                      "UpdatedAt" timestamp NOT NULL DEFAULT NOW()
                    );
                    CREATE UNIQUE INDEX "IX_PayrollDepartmentSummaries_PeriodDept"
                      ON "PayrollDepartmentSummaries" ("CompanyId", "Year", "Month", "Department");
                  END IF;

                  IF to_regclass('public."Users"') IS NOT NULL THEN
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='Users' AND column_name='Username') THEN
                      ALTER TABLE "Users" ADD COLUMN "Username" text NOT NULL DEFAULT '';
                    END IF;
                    UPDATE "Users"
                    SET "Username" = lower(split_part("Email", '@', 1))
                    WHERE ("Username" IS NULL OR "Username" = '') AND "Email" IS NOT NULL AND "Email" <> '';
                    UPDATE "Users" SET "Username" = 'admin' WHERE "Email" = 'admin@comptabilite.cm' AND ("Username" IS NULL OR "Username" = '');
                  END IF;
                END $$;
                """);

            // 3. Seed domain-specific static data (SYSCOHADA Accounts, Security Roles)
            await DbSeeder.SeedSYSCOHADAAsync(dbContext);
            await DbSeeder.EnsureAdminPasswordHashAsync(dbContext);
            await SecurityRolesSeeder.SeedStandard22Async(dbContext);

            // 3b. Seed core config defaults (currencies, journals, fiscal years) for all companies
            var rulesEngine = scope.ServiceProvider.GetRequiredService<IRulesEngineService>();
            var companyIds = await dbContext.Companies.Select(c => c.Id).ToListAsync();
            foreach (var cid in companyIds)
            {
                await CoreConfigSeeder.SeedCompanyDefaultsAsync(dbContext, cid);
                await BillingSeeder.EnsureTrialSubscriptionAsync(dbContext, cid);
                await rulesEngine.SeedDefaultRulesAsync(cid);
            }

            await BillingSeeder.SeedPlansAsync(dbContext);

            await DbSeeder.EnsureProjectProfitabilityAsync(dbContext);

            if (string.Equals(Environment.GetEnvironmentVariable("SKIP_HEAVY_DB_INIT"), "1", StringComparison.OrdinalIgnoreCase))
            {
                Console.WriteLine("[Boot] SKIP_HEAVY_DB_INIT=1 — skipping product family backfill.");
                return;
            }

            // 4. Backfill/Correct Product Families for ALL products
            var allProducts = await dbContext.Products.ToListAsync();
            if (allProducts.Any())
            {
                var companiesWithProducts = allProducts.Select(p => p.CompanyId).Distinct().ToList();
                foreach (var cid in companiesWithProducts)
                {
                    // Ensure families exist
                    var familyDefinitions = new[]
                    {
                        new { En = "Food & Beverage", Fr = "Alimentation" },
                        new { En = "Construction & BTP", Fr = "BTP & Construction" },
                        new { En = "Equipment & Hardware", Fr = "Matériel & Équipement" },
                        new { En = "Business Services", Fr = "Services aux Entreprises" },
                        new { En = "Health & Hygiene", Fr = "Santé & Hygiène" }
                    };
                    var families = new Dictionary<string, ProductFamily>();
                    foreach (var fd in familyDefinitions)
                    {
                        var f = await dbContext.ProductFamilies.FirstOrDefaultAsync(x => x.CompanyId == cid && (x.NameEn == fd.En || x.NameFr == fd.Fr));
                        if (f == null)
                        {
                            f = new ProductFamily { CompanyId = cid, NameEn = fd.En, NameFr = fd.Fr };
                            await dbContext.ProductFamilies.AddAsync(f);
                            await dbContext.SaveChangesAsync();
                        }
                        families[fd.Fr] = f;
                    }

                    var pList = allProducts.Where(p => p.CompanyId == cid && !p.Code.StartsWith("HMS-")).ToList();
                    foreach (var p in pList)
                    {
                        string category = "Matériel & Équipement";
                        var name = p.NameEn.ToLower();
                        if (name.Contains("leaves") || name.Contains("beans") || name.Contains("rice") || name.Contains("oil") || name.Contains("maize") || name.Contains("groundnut") || name.Contains("sugar") || name.Contains("salt") || name.Contains("milk") || name.Contains("yoghurt") || name.Contains("chicken") || name.Contains("fish") || name.Contains("plantains") || name.Contains("manioc") || name.Contains("flour"))
                            category = "Alimentation";
                        else if (name.Contains("cement") || name.Contains("sheet") || name.Contains("paint") || name.Contains("rebar") || name.Contains("timber") || name.Contains("plywood") || name.Contains("concrete") || name.Contains("blocks") || name.Contains("gravel") || name.Contains("sand") || name.Contains("tiles") || name.Contains("window") || name.Contains("door"))
                            category = "BTP & Construction";
                        else if (name.Contains("training") || name.Contains("legal") || name.Contains("accounting") || name.Contains("payroll") || name.Contains("maintenance") || name.Contains("cleaning") || name.Contains("security") || name.Contains("tax") || name.Contains("audit") || name.Contains("rental") || name.Contains("transport") || name.Contains("clearing") || name.Contains("freight") || name.Contains("warehousing") || name.Contains("brokerage") || name.Contains("insurance") || name.Contains("service"))
                            category = "Services aux Entreprises";
                        else if (name.Contains("gloves") || name.Contains("bleach") || name.Contains("soap") || name.Contains("insecticide") || name.Contains("sanitizer") || name.Contains("mask") || name.Contains("hygiene") || name.Contains("kit"))
                            category = "Santé & Hygiène";

                        p.FamilyId = families[category].Id;
                    }
                }
                await dbContext.SaveChangesAsync();
            }
        }
    }
}
