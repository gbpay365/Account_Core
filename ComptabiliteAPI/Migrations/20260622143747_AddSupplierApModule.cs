using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ComptabiliteAPI.Migrations
{
    /// <inheritdoc />
    public partial class AddSupplierApModule : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                DO $$ BEGIN
                  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='SupplierPayments' AND column_name='AllocatedAmount') THEN
                    ALTER TABLE "SupplierPayments" ADD "AllocatedAmount" numeric NOT NULL DEFAULT 0;
                  END IF;
                  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='SupplierPayments' AND column_name='BankAccountCode') THEN
                    ALTER TABLE "SupplierPayments" ADD "BankAccountCode" text NOT NULL DEFAULT '521100';
                  END IF;
                  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='SupplierPayments' AND column_name='PaymentMethod') THEN
                    ALTER TABLE "SupplierPayments" ADD "PaymentMethod" text NOT NULL DEFAULT 'transfer';
                  END IF;
                  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='SupplierPayments' AND column_name='Status') THEN
                    ALTER TABLE "SupplierPayments" ADD "Status" text NOT NULL DEFAULT 'draft';
                  END IF;
                  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='SupplierInvoices' AND column_name='Notes') THEN
                    ALTER TABLE "SupplierInvoices" ADD "Notes" text NOT NULL DEFAULT '';
                  END IF;
                  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='SupplierInvoices' AND column_name='Status') THEN
                    ALTER TABLE "SupplierInvoices" ADD "Status" text NOT NULL DEFAULT 'draft';
                  END IF;
                  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='SupplierInvoices' AND column_name='TotalHT') THEN
                    ALTER TABLE "SupplierInvoices" ADD "TotalHT" numeric NOT NULL DEFAULT 0;
                  END IF;
                  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='SupplierInvoices' AND column_name='TotalTVA') THEN
                    ALTER TABLE "SupplierInvoices" ADD "TotalTVA" numeric NOT NULL DEFAULT 0;
                  END IF;
                END $$;
                """);

            migrationBuilder.Sql("""
                CREATE TABLE IF NOT EXISTS "SupplierInvoiceLines" (
                    "Id" uuid NOT NULL,
                    "SupplierInvoiceId" uuid NOT NULL,
                    "LineNumber" integer NOT NULL,
                    "Description" text NOT NULL DEFAULT '',
                    "ExpenseAccountCode" text NOT NULL DEFAULT '604700',
                    "AmountHt" numeric NOT NULL DEFAULT 0,
                    "VatRate" numeric NOT NULL DEFAULT 19.25,
                    "VatAmount" numeric NOT NULL DEFAULT 0,
                    "WithholdingRate" numeric NOT NULL DEFAULT 0,
                    "WithholdingAmount" numeric NOT NULL DEFAULT 0,
                    CONSTRAINT "PK_SupplierInvoiceLines" PRIMARY KEY ("Id"),
                    CONSTRAINT "FK_SupplierInvoiceLines_SupplierInvoices_SupplierInvoiceId"
                        FOREIGN KEY ("SupplierInvoiceId") REFERENCES "SupplierInvoices" ("Id") ON DELETE CASCADE
                );
                """);

            migrationBuilder.Sql("""
                DO $$ BEGIN
                  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='SupplierInvoiceLines' AND column_name='ExpenseAccountCode') THEN
                    ALTER TABLE "SupplierInvoiceLines" ADD "ExpenseAccountCode" text NOT NULL DEFAULT '604700';
                  END IF;
                  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='SupplierInvoiceLines' AND column_name='VatAmount') THEN
                    ALTER TABLE "SupplierInvoiceLines" ADD "VatAmount" numeric NOT NULL DEFAULT 0;
                  END IF;
                END $$;
                """);

            migrationBuilder.Sql("""
                CREATE TABLE IF NOT EXISTS "SupplierPaymentAllocations" (
                    "Id" uuid NOT NULL,
                    "SupplierPaymentId" uuid NOT NULL,
                    "SupplierInvoiceId" uuid NOT NULL,
                    "Amount" numeric NOT NULL,
                    CONSTRAINT "PK_SupplierPaymentAllocations" PRIMARY KEY ("Id"),
                    CONSTRAINT "FK_SupplierPaymentAllocations_SupplierInvoices_SupplierInvoiceId"
                        FOREIGN KEY ("SupplierInvoiceId") REFERENCES "SupplierInvoices" ("Id") ON DELETE RESTRICT,
                    CONSTRAINT "FK_SupplierPaymentAllocations_SupplierPayments_SupplierPaymentId"
                        FOREIGN KEY ("SupplierPaymentId") REFERENCES "SupplierPayments" ("Id") ON DELETE CASCADE
                );
                """);

            migrationBuilder.Sql("""
                CREATE UNIQUE INDEX IF NOT EXISTS "IX_SupplierInvoices_SupplierId_InvoiceNumber"
                    ON "SupplierInvoices" ("SupplierId", "InvoiceNumber");
                CREATE INDEX IF NOT EXISTS "IX_SupplierInvoiceLines_SupplierInvoiceId"
                    ON "SupplierInvoiceLines" ("SupplierInvoiceId");
                CREATE INDEX IF NOT EXISTS "IX_SupplierPaymentAllocations_SupplierInvoiceId"
                    ON "SupplierPaymentAllocations" ("SupplierInvoiceId");
                CREATE UNIQUE INDEX IF NOT EXISTS "IX_SupplierPaymentAllocations_SupplierPaymentId_SupplierInvoiceId"
                    ON "SupplierPaymentAllocations" ("SupplierPaymentId", "SupplierInvoiceId");
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "SupplierPaymentAllocations");
            migrationBuilder.DropTable(name: "SupplierInvoiceLines");

            migrationBuilder.DropIndex(
                name: "IX_SupplierInvoices_SupplierId_InvoiceNumber",
                table: "SupplierInvoices");

            migrationBuilder.DropColumn(name: "AllocatedAmount", table: "SupplierPayments");
            migrationBuilder.DropColumn(name: "BankAccountCode", table: "SupplierPayments");
            migrationBuilder.DropColumn(name: "PaymentMethod", table: "SupplierPayments");
            migrationBuilder.DropColumn(name: "Status", table: "SupplierPayments");
            migrationBuilder.DropColumn(name: "Notes", table: "SupplierInvoices");
            migrationBuilder.DropColumn(name: "Status", table: "SupplierInvoices");
            migrationBuilder.DropColumn(name: "TotalHT", table: "SupplierInvoices");
            migrationBuilder.DropColumn(name: "TotalTVA", table: "SupplierInvoices");
        }
    }
}
