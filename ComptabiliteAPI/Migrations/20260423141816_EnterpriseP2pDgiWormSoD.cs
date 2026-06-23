using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ComptabiliteAPI.Migrations
{
    /// <inheritdoc />
    public partial class EnterpriseP2pDgiWormSoD : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ExpenseAccountCode",
                table: "SupplierInvoiceLines",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "GoodsReceiptLineId",
                table: "SupplierInvoiceLines",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "PurchaseOrderLineId",
                table: "SupplierInvoiceLines",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "Quantity",
                table: "SupplierInvoiceLines",
                type: "numeric",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<DateTime>(
                name: "DgiCertifiedAtUtc",
                table: "EbillingSubmissions",
                type: "timestamp without time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DgiLegalFingerprint",
                table: "EbillingSubmissions",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DgiStatusCode",
                table: "EbillingSubmissions",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "LastDgiPollUtc",
                table: "EbillingSubmissions",
                type: "timestamp without time zone",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_SupplierInvoiceLines_GoodsReceiptLineId",
                table: "SupplierInvoiceLines",
                column: "GoodsReceiptLineId");

            migrationBuilder.CreateIndex(
                name: "IX_SupplierInvoiceLines_PurchaseOrderLineId",
                table: "SupplierInvoiceLines",
                column: "PurchaseOrderLineId");

            migrationBuilder.AddForeignKey(
                name: "FK_SupplierInvoiceLines_GoodsReceiptLines_GoodsReceiptLineId",
                table: "SupplierInvoiceLines",
                column: "GoodsReceiptLineId",
                principalTable: "GoodsReceiptLines",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_SupplierInvoiceLines_PurchaseOrderLines_PurchaseOrderLineId",
                table: "SupplierInvoiceLines",
                column: "PurchaseOrderLineId",
                principalTable: "PurchaseOrderLines",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_SupplierInvoiceLines_GoodsReceiptLines_GoodsReceiptLineId",
                table: "SupplierInvoiceLines");

            migrationBuilder.DropForeignKey(
                name: "FK_SupplierInvoiceLines_PurchaseOrderLines_PurchaseOrderLineId",
                table: "SupplierInvoiceLines");

            migrationBuilder.DropIndex(
                name: "IX_SupplierInvoiceLines_GoodsReceiptLineId",
                table: "SupplierInvoiceLines");

            migrationBuilder.DropIndex(
                name: "IX_SupplierInvoiceLines_PurchaseOrderLineId",
                table: "SupplierInvoiceLines");

            migrationBuilder.DropColumn(
                name: "ExpenseAccountCode",
                table: "SupplierInvoiceLines");

            migrationBuilder.DropColumn(
                name: "GoodsReceiptLineId",
                table: "SupplierInvoiceLines");

            migrationBuilder.DropColumn(
                name: "PurchaseOrderLineId",
                table: "SupplierInvoiceLines");

            migrationBuilder.DropColumn(
                name: "Quantity",
                table: "SupplierInvoiceLines");

            migrationBuilder.DropColumn(
                name: "DgiCertifiedAtUtc",
                table: "EbillingSubmissions");

            migrationBuilder.DropColumn(
                name: "DgiLegalFingerprint",
                table: "EbillingSubmissions");

            migrationBuilder.DropColumn(
                name: "DgiStatusCode",
                table: "EbillingSubmissions");

            migrationBuilder.DropColumn(
                name: "LastDgiPollUtc",
                table: "EbillingSubmissions");
        }
    }
}
