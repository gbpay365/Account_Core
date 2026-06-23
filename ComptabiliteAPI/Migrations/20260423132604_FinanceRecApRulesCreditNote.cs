using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ComptabiliteAPI.Migrations
{
    /// <inheritdoc />
    public partial class FinanceRecApRulesCreditNote : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "SourceInvoiceId",
                table: "SalesDocuments",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "StatutorySalvageValue",
                table: "FixedAssets",
                type: "numeric",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "StatutoryUsefulLifeMonths",
                table: "FixedAssets",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SuggestedCounterpartAccountCode",
                table: "BankStatementLines",
                type: "text",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "BankReconciliationRules",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CompanyId = table.Column<Guid>(type: "uuid", nullable: false),
                    BankAccountId = table.Column<Guid>(type: "uuid", nullable: true),
                    ContainsText = table.Column<string>(type: "text", nullable: false),
                    Priority = table.Column<int>(type: "integer", nullable: false),
                    SuggestedCounterpartAccountCode = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp without time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BankReconciliationRules", x => x.Id);
                    table.ForeignKey(
                        name: "FK_BankReconciliationRules_BankAccounts_BankAccountId",
                        column: x => x.BankAccountId,
                        principalTable: "BankAccounts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_BankReconciliationRules_Companies_CompanyId",
                        column: x => x.CompanyId,
                        principalTable: "Companies",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "SupplierPaymentAllocations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    SupplierPaymentId = table.Column<Guid>(type: "uuid", nullable: false),
                    SupplierInvoiceId = table.Column<Guid>(type: "uuid", nullable: false),
                    Amount = table.Column<decimal>(type: "numeric", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp without time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SupplierPaymentAllocations", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SupplierPaymentAllocations_SupplierInvoices_SupplierInvoice~",
                        column: x => x.SupplierInvoiceId,
                        principalTable: "SupplierInvoices",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SupplierPaymentAllocations_SupplierPayments_SupplierPayment~",
                        column: x => x.SupplierPaymentId,
                        principalTable: "SupplierPayments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_BankReconciliationRules_BankAccountId",
                table: "BankReconciliationRules",
                column: "BankAccountId");

            migrationBuilder.CreateIndex(
                name: "IX_BankReconciliationRules_CompanyId",
                table: "BankReconciliationRules",
                column: "CompanyId");

            migrationBuilder.CreateIndex(
                name: "IX_SupplierPaymentAllocations_SupplierInvoiceId",
                table: "SupplierPaymentAllocations",
                column: "SupplierInvoiceId");

            migrationBuilder.CreateIndex(
                name: "IX_SupplierPaymentAllocations_SupplierPaymentId_SupplierInvoic~",
                table: "SupplierPaymentAllocations",
                columns: new[] { "SupplierPaymentId", "SupplierInvoiceId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "BankReconciliationRules");

            migrationBuilder.DropTable(
                name: "SupplierPaymentAllocations");

            migrationBuilder.DropColumn(
                name: "SourceInvoiceId",
                table: "SalesDocuments");

            migrationBuilder.DropColumn(
                name: "StatutorySalvageValue",
                table: "FixedAssets");

            migrationBuilder.DropColumn(
                name: "StatutoryUsefulLifeMonths",
                table: "FixedAssets");

            migrationBuilder.DropColumn(
                name: "SuggestedCounterpartAccountCode",
                table: "BankStatementLines");
        }
    }
}
