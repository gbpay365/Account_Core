using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ComptabiliteAPI.Migrations
{
    /// <inheritdoc />
    public partial class DunningSmtpEbillingFieldGuard : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "AuthorityResponseBody",
                table: "EbillingSubmissions",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "HttpStatusCode",
                table: "EbillingSubmissions",
                type: "integer",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "DunningSchedules",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CompanyId = table.Column<Guid>(type: "uuid", nullable: false),
                    Enabled = table.Column<bool>(type: "boolean", nullable: false),
                    IntervalHours = table.Column<int>(type: "integer", nullable: false),
                    MinHoursBetweenReminders = table.Column<int>(type: "integer", nullable: false),
                    LastRunUtc = table.Column<DateTime>(type: "timestamp without time zone", nullable: true),
                    NextRunUtc = table.Column<DateTime>(type: "timestamp without time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DunningSchedules", x => x.Id);
                    table.ForeignKey(
                        name: "FK_DunningSchedules_Companies_CompanyId",
                        column: x => x.CompanyId,
                        principalTable: "Companies",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "DunningTemplates",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CompanyId = table.Column<Guid>(type: "uuid", nullable: false),
                    Level = table.Column<int>(type: "integer", nullable: false),
                    SubjectTemplate = table.Column<string>(type: "text", nullable: false),
                    BodyTemplate = table.Column<string>(type: "text", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp without time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DunningTemplates", x => x.Id);
                    table.ForeignKey(
                        name: "FK_DunningTemplates_Companies_CompanyId",
                        column: x => x.CompanyId,
                        principalTable: "Companies",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_DunningSchedules_CompanyId",
                table: "DunningSchedules",
                column: "CompanyId");

            migrationBuilder.CreateIndex(
                name: "IX_DunningTemplates_CompanyId_Level",
                table: "DunningTemplates",
                columns: new[] { "CompanyId", "Level" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "DunningSchedules");

            migrationBuilder.DropTable(
                name: "DunningTemplates");

            migrationBuilder.DropColumn(
                name: "AuthorityResponseBody",
                table: "EbillingSubmissions");

            migrationBuilder.DropColumn(
                name: "HttpStatusCode",
                table: "EbillingSubmissions");
        }
    }
}
