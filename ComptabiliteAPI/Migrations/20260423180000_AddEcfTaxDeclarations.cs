using System;
using ComptabiliteAPI.Infrastructure.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ComptabiliteAPI.Migrations
{
    [DbContext(typeof(AppDbContext))]
    [Migration("20260423180000_AddEcfTaxDeclarations")]
    public partial class AddEcfTaxDeclarations : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "TaxDeclarations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CompanyId = table.Column<Guid>(type: "uuid", nullable: false),
                    DeclarationType = table.Column<string>(type: "text", nullable: false),
                    FiscalYear = table.Column<int>(type: "integer", nullable: false),
                    PeriodMonth = table.Column<int>(type: "integer", nullable: true),
                    PeriodQuarter = table.Column<int>(type: "integer", nullable: true),
                    Status = table.Column<string>(type: "text", nullable: false, defaultValue: "draft"),
                    DeclarationData = table.Column<string>(type: "jsonb", nullable: true),
                    FiledAt = table.Column<DateTime>(type: "timestamp without time zone", nullable: true),
                    FilingReceiptId = table.Column<string>(type: "text", nullable: true),
                    CreatedById = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, defaultValueSql: "NOW()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TaxDeclarations", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TaxDeclarations_Companies_CompanyId",
                        column: x => x.CompanyId,
                        principalTable: "Companies",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_TaxDeclarations_Users_CreatedById",
                        column: x => x.CreatedById,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "FecGenerations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CompanyId = table.Column<Guid>(type: "uuid", nullable: false),
                    FiscalYear = table.Column<int>(type: "integer", nullable: false),
                    GeneratedAt = table.Column<DateTime>(type: "timestamp without time zone", nullable: false, defaultValueSql: "NOW()"),
                    GeneratedById = table.Column<Guid>(type: "uuid", nullable: false),
                    FecFile = table.Column<byte[]>(type: "bytea", nullable: true),
                    FecFilename = table.Column<string>(type: "text", nullable: true),
                    Status = table.Column<string>(type: "text", nullable: false, defaultValue: "generated")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FecGenerations", x => x.Id);
                    table.ForeignKey(
                        name: "FK_FecGenerations_Companies_CompanyId",
                        column: x => x.CompanyId,
                        principalTable: "Companies",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_FecGenerations_Users_GeneratedById",
                        column: x => x.GeneratedById,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_TaxDeclarations_CompanyId",
                table: "TaxDeclarations",
                column: "CompanyId");

            migrationBuilder.CreateIndex(
                name: "IX_TaxDeclarations_CreatedById",
                table: "TaxDeclarations",
                column: "CreatedById");

            migrationBuilder.CreateIndex(
                name: "IX_FecGenerations_CompanyId",
                table: "FecGenerations",
                column: "CompanyId");

            migrationBuilder.CreateIndex(
                name: "IX_FecGenerations_GeneratedById",
                table: "FecGenerations",
                column: "GeneratedById");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "FecGenerations");
            migrationBuilder.DropTable(name: "TaxDeclarations");
        }
    }
}
