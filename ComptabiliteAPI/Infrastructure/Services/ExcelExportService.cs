using ComptabiliteAPI.Domain.Interfaces;
using ComptabiliteAPI.DTOs;
using OfficeOpenXml;
using OfficeOpenXml.Style;
using System.Drawing;

namespace ComptabiliteAPI.Infrastructure.Services
{
    public class ExcelExportService : IExcelExportService
    {
        static ExcelExportService()
        {
            ExcelPackage.LicenseContext = LicenseContext.NonCommercial;
        }

        public byte[] ExportTrialBalance(List<TrialBalanceDto> data, string lang)
        {
            using var package = new ExcelPackage();
            var sheet = package.Workbook.Worksheets.Add(lang == "fr" ? "Balance de Vérification" : "Trial Balance");

            // Header row
            var headers = lang == "fr"
                ? new[] { "Code", "Libellé", "Débit", "Crédit", "Solde" }
                : new[] { "Code", "Label", "Debit", "Credit", "Balance" };

            for (int i = 0; i < headers.Length; i++)
            {
                sheet.Cells[1, i + 1].Value = headers[i];
                sheet.Cells[1, i + 1].Style.Font.Bold = true;
                sheet.Cells[1, i + 1].Style.Fill.PatternType = ExcelFillStyle.Solid;
                sheet.Cells[1, i + 1].Style.Fill.BackgroundColor.SetColor(Color.FromArgb(79, 70, 229));
                sheet.Cells[1, i + 1].Style.Font.Color.SetColor(Color.White);
            }

            int row = 2;
            foreach (var item in data)
            {
                sheet.Cells[row, 1].Value = item.AccountCode;
                sheet.Cells[row, 2].Value = lang == "fr" ? item.NameFr : item.NameEn;
                sheet.Cells[row, 3].Value = item.TotalDebit;
                sheet.Cells[row, 4].Value = item.TotalCredit;
                sheet.Cells[row, 5].Value = item.Balance;
                sheet.Cells[row, 3, row, 5].Style.Numberformat.Format = "#,##0.00";
                row++;
            }

            sheet.Cells[sheet.Dimension.Address].AutoFitColumns();
            return package.GetAsByteArray();
        }

        public byte[] ExportIncomeStatement(IncomeStatement data, string lang)
        {
            using var package = new ExcelPackage();
            var sheet = package.Workbook.Worksheets.Add(lang == "fr" ? "Compte de Résultat" : "Income Statement");

            sheet.Cells[1, 1].Value = lang == "fr" ? "Compte de Résultat" : "Income Statement";
            sheet.Cells[1, 1].Style.Font.Bold = true;
            sheet.Cells[1, 1].Style.Font.Size = 16;

            int row = 3;
            sheet.Cells[row, 1].Value = lang == "fr" ? "Revenus" : "Revenues";
            sheet.Cells[row, 1].Style.Font.Bold = true;
            row++;

            foreach (var r in data.Revenues)
            {
                sheet.Cells[row, 1].Value = r.Code;
                sheet.Cells[row, 2].Value = lang == "fr" ? r.LabelFr : r.LabelEn;
                sheet.Cells[row, 3].Value = r.Amount;
                sheet.Cells[row, 3].Style.Numberformat.Format = "#,##0.00";
                row++;
            }
            sheet.Cells[row, 2].Value = lang == "fr" ? "Total Revenus" : "Total Revenues";
            sheet.Cells[row, 3].Value = data.TotalRevenue;
            sheet.Cells[row, 2, row, 3].Style.Font.Bold = true;
            row += 2;

            sheet.Cells[row, 1].Value = lang == "fr" ? "Charges" : "Expenses";
            sheet.Cells[row, 1].Style.Font.Bold = true;
            row++;

            foreach (var e in data.Expenses)
            {
                sheet.Cells[row, 1].Value = e.Code;
                sheet.Cells[row, 2].Value = lang == "fr" ? e.LabelFr : e.LabelEn;
                sheet.Cells[row, 3].Value = e.Amount;
                sheet.Cells[row, 3].Style.Numberformat.Format = "#,##0.00";
                row++;
            }
            sheet.Cells[row, 2].Value = lang == "fr" ? "Résultat Net" : "Net Income";
            sheet.Cells[row, 3].Value = data.NetIncome;
            sheet.Cells[row, 2, row, 3].Style.Font.Bold = true;
            sheet.Cells[row, 3].Style.Font.Size = 14;

            sheet.Cells[sheet.Dimension.Address].AutoFitColumns();
            return package.GetAsByteArray();
        }

        public byte[] ExportBalanceSheet(BalanceSheetStatement data, string lang)
        {
            using var package = new ExcelPackage();
            var sheet = package.Workbook.Worksheets.Add(lang == "fr" ? "Bilan" : "Balance Sheet");

            sheet.Cells[1, 1].Value = lang == "fr" ? "Bilan" : "Balance Sheet";
            sheet.Cells[1, 1].Style.Font.Bold = true;
            sheet.Cells[1, 1].Style.Font.Size = 16;

            // Actif
            sheet.Cells[3, 1].Value = lang == "fr" ? "ACTIF" : "ASSETS";
            sheet.Cells[3, 1].Style.Font.Bold = true;
            int row = 4;
            foreach (var a in data.Assets)
            {
                sheet.Cells[row, 1].Value = a.Code;
                sheet.Cells[row, 2].Value = lang == "fr" ? a.LabelFr : a.LabelEn;
                sheet.Cells[row, 3].Value = a.Amount;
                sheet.Cells[row, 3].Style.Numberformat.Format = "#,##0.00";
                row++;
            }
            sheet.Cells[row, 2].Value = lang == "fr" ? "Total Actif" : "Total Assets";
            sheet.Cells[row, 3].Value = data.TotalAssets;
            sheet.Cells[row, 2, row, 3].Style.Font.Bold = true;

            // Passif
            row += 2;
            sheet.Cells[row, 1].Value = lang == "fr" ? "PASSIF" : "LIABILITIES & EQUITY";
            sheet.Cells[row, 1].Style.Font.Bold = true;
            row++;
            foreach (var l in data.Equity.Concat(data.Liabilities))
            {
                sheet.Cells[row, 1].Value = l.Code;
                sheet.Cells[row, 2].Value = lang == "fr" ? l.LabelFr : l.LabelEn;
                sheet.Cells[row, 3].Value = l.Amount;
                sheet.Cells[row, 3].Style.Numberformat.Format = "#,##0.00";
                row++;
            }
            sheet.Cells[row, 2].Value = lang == "fr" ? "Total Passif" : "Total Liabilities & Equity";
            sheet.Cells[row, 3].Value = data.TotalLiabilitiesAndEquity;
            sheet.Cells[row, 2, row, 3].Style.Font.Bold = true;

            sheet.Cells[sheet.Dimension.Address].AutoFitColumns();
            return package.GetAsByteArray();
        }
    }
}
