using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ComptabiliteAPI.Migrations
{
    /// <inheritdoc />
    public partial class AddCameroonPayrollLocalization : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "AvantagesNature",
                table: "PayrollDetails",
                type: "numeric",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "Cac",
                table: "PayrollDetails",
                type: "numeric",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "CfcEmployee",
                table: "PayrollDetails",
                type: "numeric",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "CfcEmployer",
                table: "PayrollDetails",
                type: "numeric",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "FneEmployer",
                table: "PayrollDetails",
                type: "numeric",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "IndemniteLogement",
                table: "PayrollDetails",
                type: "numeric",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "IndemniteRepresentation",
                table: "PayrollDetails",
                type: "numeric",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "IndemniteTransport",
                table: "PayrollDetails",
                type: "numeric",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "Mois13",
                table: "PayrollDetails",
                type: "numeric",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "PrimeAnciennete",
                table: "PayrollDetails",
                type: "numeric",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "Rav",
                table: "PayrollDetails",
                type: "numeric",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "Tdl",
                table: "PayrollDetails",
                type: "numeric",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "AvantagesNature",
                table: "Employees",
                type: "numeric",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "IndemniteLogement",
                table: "Employees",
                type: "numeric",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "IndemniteRepresentation",
                table: "Employees",
                type: "numeric",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "IndemniteTransport",
                table: "Employees",
                type: "numeric",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "Mois13",
                table: "Employees",
                type: "numeric",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "PrimeAnciennete",
                table: "Employees",
                type: "numeric",
                nullable: false,
                defaultValue: 0m);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AvantagesNature",
                table: "PayrollDetails");

            migrationBuilder.DropColumn(
                name: "Cac",
                table: "PayrollDetails");

            migrationBuilder.DropColumn(
                name: "CfcEmployee",
                table: "PayrollDetails");

            migrationBuilder.DropColumn(
                name: "CfcEmployer",
                table: "PayrollDetails");

            migrationBuilder.DropColumn(
                name: "FneEmployer",
                table: "PayrollDetails");

            migrationBuilder.DropColumn(
                name: "IndemniteLogement",
                table: "PayrollDetails");

            migrationBuilder.DropColumn(
                name: "IndemniteRepresentation",
                table: "PayrollDetails");

            migrationBuilder.DropColumn(
                name: "IndemniteTransport",
                table: "PayrollDetails");

            migrationBuilder.DropColumn(
                name: "Mois13",
                table: "PayrollDetails");

            migrationBuilder.DropColumn(
                name: "PrimeAnciennete",
                table: "PayrollDetails");

            migrationBuilder.DropColumn(
                name: "Rav",
                table: "PayrollDetails");

            migrationBuilder.DropColumn(
                name: "Tdl",
                table: "PayrollDetails");

            migrationBuilder.DropColumn(
                name: "AvantagesNature",
                table: "Employees");

            migrationBuilder.DropColumn(
                name: "IndemniteLogement",
                table: "Employees");

            migrationBuilder.DropColumn(
                name: "IndemniteRepresentation",
                table: "Employees");

            migrationBuilder.DropColumn(
                name: "IndemniteTransport",
                table: "Employees");

            migrationBuilder.DropColumn(
                name: "Mois13",
                table: "Employees");

            migrationBuilder.DropColumn(
                name: "PrimeAnciennete",
                table: "Employees");
        }
    }
}
