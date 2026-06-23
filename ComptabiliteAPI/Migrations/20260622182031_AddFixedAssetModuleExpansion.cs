using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ComptabiliteAPI.Migrations
{
    /// <inheritdoc />
    public partial class AddFixedAssetModuleExpansion : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_FixedAssetDepreciationLines_FixedAssetId_PeriodYearMonth",
                table: "FixedAssetDepreciationLines");

            migrationBuilder.AddColumn<Guid>(
                name: "AcquisitionJournalEntryId",
                table: "FixedAssets",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "ActiveCost",
                table: "FixedAssets",
                type: "numeric",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<Guid>(
                name: "AnalyticAccountId",
                table: "FixedAssets",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Category",
                table: "FixedAssets",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<Guid>(
                name: "CostCenterId",
                table: "FixedAssets",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CreditAccountCode",
                table: "FixedAssets",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "Custodian",
                table: "FixedAssets",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<DateTime>(
                name: "DisposalApprovedAt",
                table: "FixedAssets",
                type: "timestamp without time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "DisposalApprovedByUserId",
                table: "FixedAssets",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "DisposalJournalEntryId",
                table: "FixedAssets",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DisposalNotes",
                table: "FixedAssets",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<DateTime>(
                name: "DisposalRequestedAt",
                table: "FixedAssets",
                type: "timestamp without time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "DisposalRequestedByUserId",
                table: "FixedAssets",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ExternalHmsRef",
                table: "FixedAssets",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "Location",
                table: "FixedAssets",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<decimal>(
                name: "RevaluationAmount",
                table: "FixedAssets",
                type: "numeric",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<string>(
                name: "SerialNumber",
                table: "FixedAssets",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "Status",
                table: "FixedAssets",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<Guid>(
                name: "SupplierInvoiceId",
                table: "FixedAssets",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "FixedAssetComponentId",
                table: "FixedAssetDepreciationLines",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "FixedAssetComponents",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    FixedAssetId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "text", nullable: false),
                    Cost = table.Column<decimal>(type: "numeric", nullable: false),
                    SalvageValue = table.Column<decimal>(type: "numeric", nullable: false),
                    UsefulLifeMonths = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FixedAssetComponents", x => x.Id);
                    table.ForeignKey(
                        name: "FK_FixedAssetComponents_FixedAssets_FixedAssetId",
                        column: x => x.FixedAssetId,
                        principalTable: "FixedAssets",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "FixedAssetEvents",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    FixedAssetId = table.Column<Guid>(type: "uuid", nullable: false),
                    EventType = table.Column<string>(type: "text", nullable: false),
                    EventDate = table.Column<DateTime>(type: "timestamp without time zone", nullable: false),
                    Amount = table.Column<decimal>(type: "numeric", nullable: false),
                    JournalEntryId = table.Column<Guid>(type: "uuid", nullable: true),
                    Notes = table.Column<string>(type: "text", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp without time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FixedAssetEvents", x => x.Id);
                    table.ForeignKey(
                        name: "FK_FixedAssetEvents_FixedAssets_FixedAssetId",
                        column: x => x.FixedAssetId,
                        principalTable: "FixedAssets",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_FixedAssets_CompanyId_ExternalHmsRef",
                table: "FixedAssets",
                columns: new[] { "CompanyId", "ExternalHmsRef" },
                unique: true,
                filter: "\"ExternalHmsRef\" IS NOT NULL AND \"ExternalHmsRef\" <> ''");

            migrationBuilder.CreateIndex(
                name: "IX_FixedAssetDepreciationLines_FixedAssetComponentId",
                table: "FixedAssetDepreciationLines",
                column: "FixedAssetComponentId");

            migrationBuilder.CreateIndex(
                name: "IX_FixedAssetDepreciationLines_FixedAssetId_PeriodYearMonth",
                table: "FixedAssetDepreciationLines",
                columns: new[] { "FixedAssetId", "PeriodYearMonth" },
                unique: true,
                filter: "\"FixedAssetComponentId\" IS NULL");

            migrationBuilder.CreateIndex(
                name: "IX_FixedAssetComponents_FixedAssetId",
                table: "FixedAssetComponents",
                column: "FixedAssetId");

            migrationBuilder.CreateIndex(
                name: "IX_FixedAssetEvents_FixedAssetId",
                table: "FixedAssetEvents",
                column: "FixedAssetId");

            migrationBuilder.AddForeignKey(
                name: "FK_FixedAssetDepreciationLines_FixedAssetComponents_FixedAsset~",
                table: "FixedAssetDepreciationLines",
                column: "FixedAssetComponentId",
                principalTable: "FixedAssetComponents",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_FixedAssetDepreciationLines_FixedAssetComponents_FixedAsset~",
                table: "FixedAssetDepreciationLines");

            migrationBuilder.DropTable(
                name: "FixedAssetComponents");

            migrationBuilder.DropTable(
                name: "FixedAssetEvents");

            migrationBuilder.DropIndex(
                name: "IX_FixedAssets_CompanyId_ExternalHmsRef",
                table: "FixedAssets");

            migrationBuilder.DropIndex(
                name: "IX_FixedAssetDepreciationLines_FixedAssetComponentId",
                table: "FixedAssetDepreciationLines");

            migrationBuilder.DropIndex(
                name: "IX_FixedAssetDepreciationLines_FixedAssetId_PeriodYearMonth",
                table: "FixedAssetDepreciationLines");

            migrationBuilder.DropColumn(
                name: "AcquisitionJournalEntryId",
                table: "FixedAssets");

            migrationBuilder.DropColumn(
                name: "ActiveCost",
                table: "FixedAssets");

            migrationBuilder.DropColumn(
                name: "AnalyticAccountId",
                table: "FixedAssets");

            migrationBuilder.DropColumn(
                name: "Category",
                table: "FixedAssets");

            migrationBuilder.DropColumn(
                name: "CostCenterId",
                table: "FixedAssets");

            migrationBuilder.DropColumn(
                name: "CreditAccountCode",
                table: "FixedAssets");

            migrationBuilder.DropColumn(
                name: "Custodian",
                table: "FixedAssets");

            migrationBuilder.DropColumn(
                name: "DisposalApprovedAt",
                table: "FixedAssets");

            migrationBuilder.DropColumn(
                name: "DisposalApprovedByUserId",
                table: "FixedAssets");

            migrationBuilder.DropColumn(
                name: "DisposalJournalEntryId",
                table: "FixedAssets");

            migrationBuilder.DropColumn(
                name: "DisposalNotes",
                table: "FixedAssets");

            migrationBuilder.DropColumn(
                name: "DisposalRequestedAt",
                table: "FixedAssets");

            migrationBuilder.DropColumn(
                name: "DisposalRequestedByUserId",
                table: "FixedAssets");

            migrationBuilder.DropColumn(
                name: "ExternalHmsRef",
                table: "FixedAssets");

            migrationBuilder.DropColumn(
                name: "Location",
                table: "FixedAssets");

            migrationBuilder.DropColumn(
                name: "RevaluationAmount",
                table: "FixedAssets");

            migrationBuilder.DropColumn(
                name: "SerialNumber",
                table: "FixedAssets");

            migrationBuilder.DropColumn(
                name: "Status",
                table: "FixedAssets");

            migrationBuilder.DropColumn(
                name: "SupplierInvoiceId",
                table: "FixedAssets");

            migrationBuilder.DropColumn(
                name: "FixedAssetComponentId",
                table: "FixedAssetDepreciationLines");

            migrationBuilder.CreateIndex(
                name: "IX_FixedAssetDepreciationLines_FixedAssetId_PeriodYearMonth",
                table: "FixedAssetDepreciationLines",
                columns: new[] { "FixedAssetId", "PeriodYearMonth" },
                unique: true);
        }
    }
}
