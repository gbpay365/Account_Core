using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ComptabiliteAPI.Migrations
{
    /// <inheritdoc />
    public partial class AddJournalSageMetadata : Migration
    {
        /// <inheritdoc />
        /// <summary>
        /// Idempotent: uses IF NOT EXISTS so startup schema fixes (or half-applied DBs) do not fail.
        /// </summary>
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                ALTER TABLE "JournalLines" ADD COLUMN IF NOT EXISTS "CostCentre" text;
                ALTER TABLE "JournalLines" ADD COLUMN IF NOT EXISTS "LineDescription" text;
                ALTER TABLE "JournalLines" ADD COLUMN IF NOT EXISTS "TaxCode" text;
                ALTER TABLE "JournalLines" ADD COLUMN IF NOT EXISTS "TaxAmount" numeric NOT NULL DEFAULT 0;
                """
            );

            migrationBuilder.Sql(
                """
                ALTER TABLE "JournalEntries" ADD COLUMN IF NOT EXISTS "CurrencyCode" text NOT NULL DEFAULT 'XAF';
                ALTER TABLE "JournalEntries" ADD COLUMN IF NOT EXISTS "ExchangeRate" numeric NOT NULL DEFAULT 1;
                ALTER TABLE "JournalEntries" ADD COLUMN IF NOT EXISTS "FiscalPeriod" smallint NOT NULL DEFAULT 0;
                ALTER TABLE "JournalEntries" ADD COLUMN IF NOT EXISTS "FiscalYear" smallint NOT NULL DEFAULT 0;
                ALTER TABLE "JournalEntries" ADD COLUMN IF NOT EXISTS "JournalType" text NOT NULL DEFAULT 'JNL';
                ALTER TABLE "JournalEntries" ADD COLUMN IF NOT EXISTS "Reference" text;
                """
            );
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                ALTER TABLE "JournalLines" DROP COLUMN IF EXISTS "CostCentre";
                ALTER TABLE "JournalLines" DROP COLUMN IF EXISTS "LineDescription";
                ALTER TABLE "JournalLines" DROP COLUMN IF EXISTS "TaxCode";
                ALTER TABLE "JournalLines" DROP COLUMN IF EXISTS "TaxAmount";
                """
            );

            migrationBuilder.Sql(
                """
                ALTER TABLE "JournalEntries" DROP COLUMN IF EXISTS "CurrencyCode";
                ALTER TABLE "JournalEntries" DROP COLUMN IF EXISTS "ExchangeRate";
                ALTER TABLE "JournalEntries" DROP COLUMN IF EXISTS "FiscalPeriod";
                ALTER TABLE "JournalEntries" DROP COLUMN IF EXISTS "FiscalYear";
                ALTER TABLE "JournalEntries" DROP COLUMN IF EXISTS "JournalType";
                ALTER TABLE "JournalEntries" DROP COLUMN IF EXISTS "Reference";
                """
            );
        }
    }
}
