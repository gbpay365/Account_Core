using ComptabiliteAPI.Infrastructure.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ComptabiliteAPI.Migrations
{
    [DbContext(typeof(AppDbContext))]
    [Migration("20260423200000_TaxDeclarationDataAsText")]
    public partial class TaxDeclarationDataAsText : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                ALTER TABLE "TaxDeclarations"
                ALTER COLUMN "DeclarationData" TYPE text
                USING CASE WHEN "DeclarationData" IS NULL THEN NULL ELSE "DeclarationData"::text END;
                """);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                ALTER TABLE "TaxDeclarations"
                ALTER COLUMN "DeclarationData" TYPE jsonb
                USING CASE WHEN "DeclarationData" IS NULL THEN NULL ELSE "DeclarationData"::jsonb END;
                """);
        }
    }
}
