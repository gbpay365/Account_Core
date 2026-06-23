using ComptabiliteAPI.Infrastructure.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ComptabiliteAPI.Migrations
{
    [DbContext(typeof(AppDbContext))]
    [Migration("20260424000001_TaxDeclarationComplianceLifecycle")]
    public partial class TaxDeclarationComplianceLifecycle : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                ALTER TABLE "TaxDeclarations" ADD COLUMN IF NOT EXISTS "CorrelationId" uuid NULL;
                ALTER TABLE "TaxDeclarations" ADD COLUMN IF NOT EXISTS "LockedAt" timestamp without time zone NULL;

                CREATE TABLE IF NOT EXISTS "TaxDeclarationAttachments" (
                    "Id" uuid NOT NULL,
                    "TaxDeclarationId" uuid NOT NULL,
                    "UploadedAt" timestamp without time zone NOT NULL DEFAULT (now() at time zone 'utc'),
                    "FileName" text NOT NULL DEFAULT '',
                    "ContentType" text NOT NULL DEFAULT 'application/octet-stream',
                    "SizeBytes" bigint NOT NULL DEFAULT 0,
                    "Content" bytea NOT NULL,
                    CONSTRAINT "PK_TaxDeclarationAttachments" PRIMARY KEY ("Id"),
                    CONSTRAINT "FK_TaxDeclarationAttachments_TaxDeclarations_TaxDeclarationId" FOREIGN KEY ("TaxDeclarationId") REFERENCES "TaxDeclarations" ("Id") ON DELETE CASCADE
                );

                CREATE INDEX IF NOT EXISTS "IX_TaxDeclarationAttachments_TaxDeclarationId"
                    ON "TaxDeclarationAttachments" ("TaxDeclarationId");
                """);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                DROP TABLE IF EXISTS "TaxDeclarationAttachments";
                ALTER TABLE "TaxDeclarations" DROP COLUMN IF EXISTS "CorrelationId";
                ALTER TABLE "TaxDeclarations" DROP COLUMN IF EXISTS "LockedAt";
                """);
        }
    }
}

