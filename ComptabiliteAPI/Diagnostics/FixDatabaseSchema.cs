using System;
using System.Threading.Tasks;
using ComptabiliteAPI.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace ComptabiliteAPI.Diagnostics
{
    public static class FixDatabaseSchema
    {
        public static async Task Run(IServiceProvider services)
        {
            using var scope = services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            
            Console.WriteLine("--- FIXING DATABASE SCHEMA ---");
            try
            {
                await db.Database.ExecuteSqlRawAsync("ALTER TABLE \"JournalEntries\" ADD COLUMN IF NOT EXISTS \"Voided\" boolean NOT NULL DEFAULT false;");
                await db.Database.ExecuteSqlRawAsync("ALTER TABLE \"JournalEntries\" ADD COLUMN IF NOT EXISTS \"JournalType\" text NOT NULL DEFAULT 'JNL';");
                await db.Database.ExecuteSqlRawAsync("ALTER TABLE \"JournalEntries\" ADD COLUMN IF NOT EXISTS \"Reference\" text NULL;");
                await db.Database.ExecuteSqlRawAsync("ALTER TABLE \"JournalEntries\" ADD COLUMN IF NOT EXISTS \"FiscalYear\" smallint NOT NULL DEFAULT 0;");
                await db.Database.ExecuteSqlRawAsync("ALTER TABLE \"JournalEntries\" ADD COLUMN IF NOT EXISTS \"FiscalPeriod\" smallint NOT NULL DEFAULT 0;");
                await db.Database.ExecuteSqlRawAsync("ALTER TABLE \"JournalEntries\" ADD COLUMN IF NOT EXISTS \"CurrencyCode\" text NOT NULL DEFAULT 'XAF';");
                await db.Database.ExecuteSqlRawAsync("ALTER TABLE \"JournalEntries\" ADD COLUMN IF NOT EXISTS \"ExchangeRate\" numeric NOT NULL DEFAULT 1;");
                await db.Database.ExecuteSqlRawAsync("ALTER TABLE \"JournalLines\" ADD COLUMN IF NOT EXISTS \"LineDescription\" text NULL;");
                await db.Database.ExecuteSqlRawAsync("ALTER TABLE \"JournalLines\" ADD COLUMN IF NOT EXISTS \"CostCentre\" text NULL;");
                await db.Database.ExecuteSqlRawAsync("ALTER TABLE \"JournalLines\" ADD COLUMN IF NOT EXISTS \"TaxCode\" text NULL;");
                await db.Database.ExecuteSqlRawAsync("ALTER TABLE \"JournalLines\" ADD COLUMN IF NOT EXISTS \"TaxAmount\" numeric NOT NULL DEFAULT 0;");

                await db.Database.ExecuteSqlRawAsync("ALTER TABLE \"JournalEntries\" ADD COLUMN IF NOT EXISTS \"SourceSystem\" text NULL;");
                await db.Database.ExecuteSqlRawAsync("ALTER TABLE \"JournalEntries\" ADD COLUMN IF NOT EXISTS \"ExternalReference\" text NULL;");
                await db.Database.ExecuteSqlRawAsync(
                    "CREATE UNIQUE INDEX IF NOT EXISTS \"IX_JournalEntries_Integration\" ON \"JournalEntries\" (\"CompanyId\", \"SourceSystem\", \"ExternalReference\") WHERE \"SourceSystem\" IS NOT NULL AND \"ExternalReference\" IS NOT NULL;");

                await db.Database.ExecuteSqlRawAsync("ALTER TABLE \"Employees\" ADD COLUMN IF NOT EXISTS \"ExternalHmsEmployeeId\" integer NULL;");
                await db.Database.ExecuteSqlRawAsync("ALTER TABLE \"Employees\" ADD COLUMN IF NOT EXISTS \"ExternalHmsFacilityId\" integer NULL;");
                await db.Database.ExecuteSqlRawAsync("ALTER TABLE \"Employees\" ADD COLUMN IF NOT EXISTS \"Department\" text NOT NULL DEFAULT '';");
                await db.Database.ExecuteSqlRawAsync("ALTER TABLE \"Employees\" ADD COLUMN IF NOT EXISTS \"ExternalEmployeeCode\" text NULL;");
                await db.Database.ExecuteSqlRawAsync("ALTER TABLE \"Employees\" ADD COLUMN IF NOT EXISTS \"CnpsNumber\" text NULL;");
                await db.Database.ExecuteSqlRawAsync("ALTER TABLE \"Employees\" ADD COLUMN IF NOT EXISTS \"TaxNiu\" text NULL;");
                await db.Database.ExecuteSqlRawAsync("ALTER TABLE \"Employees\" ADD COLUMN IF NOT EXISTS \"BankName\" text NULL;");
                await db.Database.ExecuteSqlRawAsync("ALTER TABLE \"Employees\" ADD COLUMN IF NOT EXISTS \"BankAccountNo\" text NULL;");

                await db.Database.ExecuteSqlRawAsync(@"
CREATE TABLE IF NOT EXISTS ""IntegrationOutboxes"" (
  ""Id"" uuid PRIMARY KEY,
  ""Direction"" text NOT NULL DEFAULT 'outbound',
  ""EventType"" text NOT NULL DEFAULT '',
  ""PayloadJson"" text NOT NULL DEFAULT '{{}}',
  ""Status"" text NOT NULL DEFAULT 'pending',
  ""Attempts"" integer NOT NULL DEFAULT 0,
  ""LastError"" text NULL,
  ""NextRetryAt"" timestamp NULL,
  ""CreatedAt"" timestamp NOT NULL DEFAULT NOW(),
  ""SentAt"" timestamp NULL
);");

                await db.Database.ExecuteSqlRawAsync(@"
CREATE TABLE IF NOT EXISTS ""IntegrationEntityLinks"" (
  ""Id"" uuid PRIMARY KEY,
  ""CompanyId"" uuid NOT NULL,
  ""SourceSystem"" text NOT NULL DEFAULT 'HMS',
  ""EntityType"" text NOT NULL DEFAULT '',
  ""ExternalId"" text NOT NULL DEFAULT '',
  ""InternalId"" text NOT NULL DEFAULT '',
  ""MetadataJson"" text NULL,
  ""UpdatedAt"" timestamp NOT NULL DEFAULT NOW()
);");

                await db.Database.ExecuteSqlRawAsync(
                    "CREATE UNIQUE INDEX IF NOT EXISTS \"IX_IntegrationEntityLinks_Key\" ON \"IntegrationEntityLinks\" (\"CompanyId\", \"SourceSystem\", \"EntityType\", \"ExternalId\");");

                await db.Database.ExecuteSqlRawAsync(@"
CREATE TABLE IF NOT EXISTS ""PayrollDepartmentSummaries"" (
  ""Id"" uuid PRIMARY KEY,
  ""CompanyId"" uuid NOT NULL,
  ""Year"" integer NOT NULL,
  ""Month"" integer NOT NULL,
  ""Department"" text NOT NULL DEFAULT '',
  ""Headcount"" integer NOT NULL DEFAULT 0,
  ""GrossPayroll"" numeric NOT NULL DEFAULT 0,
  ""NetPayroll"" numeric NOT NULL DEFAULT 0,
  ""EmployerCharges"" numeric NOT NULL DEFAULT 0,
  ""UpdatedAt"" timestamp NOT NULL DEFAULT NOW()
);");
                await db.Database.ExecuteSqlRawAsync(
                    "CREATE UNIQUE INDEX IF NOT EXISTS \"IX_PayrollDepartmentSummaries_PeriodDept\" ON \"PayrollDepartmentSummaries\" (\"CompanyId\", \"Year\", \"Month\", \"Department\");");

                // Add NameEn and NameFr if they don't exist
                await db.Database.ExecuteSqlRawAsync("ALTER TABLE \"ProductFamilies\" ADD COLUMN IF NOT EXISTS \"NameEn\" TEXT DEFAULT '';");
                await db.Database.ExecuteSqlRawAsync("ALTER TABLE \"ProductFamilies\" ADD COLUMN IF NOT EXISTS \"NameFr\" TEXT DEFAULT '';");
                
                // Copy data from Name if it exists
                try 
                {
                    await db.Database.ExecuteSqlRawAsync("UPDATE \"ProductFamilies\" SET \"NameEn\" = \"Name\", \"NameFr\" = \"Name\" WHERE \"NameEn\" = '' OR \"NameEn\" IS NULL;");
                    
                    // Explicitly fix standard families to be bilingual
                    await db.Database.ExecuteSqlRawAsync("UPDATE \"ProductFamilies\" SET \"NameEn\" = 'Food & Beverage', \"NameFr\" = 'Alimentation' WHERE \"NameFr\" = 'Alimentation';");
                    await db.Database.ExecuteSqlRawAsync("UPDATE \"ProductFamilies\" SET \"NameEn\" = 'Construction & BTP', \"NameFr\" = 'BTP & Construction' WHERE \"NameFr\" = 'BTP & Construction';");
                    await db.Database.ExecuteSqlRawAsync("UPDATE \"ProductFamilies\" SET \"NameEn\" = 'Equipment & Hardware', \"NameFr\" = 'Matériel & Équipement' WHERE \"NameFr\" = 'Matériel & Équipement';");
                    await db.Database.ExecuteSqlRawAsync("UPDATE \"ProductFamilies\" SET \"NameEn\" = 'Business Services', \"NameFr\" = 'Services aux Entreprises' WHERE \"NameFr\" = 'Services aux Entreprises';");
                    await db.Database.ExecuteSqlRawAsync("UPDATE \"ProductFamilies\" SET \"NameEn\" = 'Health & Hygiene', \"NameFr\" = 'Santé & Hygiène' WHERE \"NameFr\" = 'Santé & Hygiène';");
                }
                catch (Exception) 
                {
                    Console.WriteLine("Warning: Could not copy from 'Name' column. It might already be gone.");
                }

                Console.WriteLine("Schema fix applied successfully.");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error fixing schema: {ex.Message}");
            }

            // Always ensure integration settings table (required for /integrations UI)
            try
            {
                await db.Database.ExecuteSqlRawAsync(@"
CREATE TABLE IF NOT EXISTS ""CompanyIntegrationSettings"" (
  ""CompanyId"" uuid PRIMARY KEY,
  ""HmsFacilityId"" integer NOT NULL DEFAULT 1,
  ""PublicBaseUrl"" text NULL,
  ""HmsBaseUrl"" text NULL,
  ""HmsWebhookKey"" text NULL,
  ""ZaizensPayrollBaseUrl"" text NULL,
  ""InboundApiKey"" text NULL,
  ""UpdatedAt"" timestamp NOT NULL DEFAULT NOW()
);");
                await db.Database.ExecuteSqlRawAsync(
                    "CREATE UNIQUE INDEX IF NOT EXISTS \"IX_CompanyIntegrationSettings_Facility\" ON \"CompanyIntegrationSettings\" (\"HmsFacilityId\");");
                Console.WriteLine("CompanyIntegrationSettings table OK.");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"CompanyIntegrationSettings schema: {ex.Message}");
            }
            Console.WriteLine("------------------------------");
        }
    }
}
