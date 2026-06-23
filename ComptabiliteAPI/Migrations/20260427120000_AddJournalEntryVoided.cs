using ComptabiliteAPI.Infrastructure.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ComptabiliteAPI.Migrations
{
    [DbContext(typeof(AppDbContext))]
    [Migration("20260427120000_AddJournalEntryVoided")]
    public partial class AddJournalEntryVoided : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Idempotent: FixDatabaseSchema may have added this column on startup, or a prior run may have created it.
            migrationBuilder.Sql(
                """
                ALTER TABLE "JournalEntries" ADD COLUMN IF NOT EXISTS "Voided" boolean NOT NULL DEFAULT false;
                """);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                ALTER TABLE "JournalEntries" DROP COLUMN IF EXISTS "Voided";
                """);
        }
    }
}
