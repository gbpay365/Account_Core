using System;
using ComptabiliteAPI.Domain.Entities;
using ComptabiliteAPI.Domain.Interfaces;
using ComptabiliteAPI.DTOs;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace ComptabiliteAPI.Infrastructure.Services
{
    public class PdfReportGenerator : IPdfReportGenerator
    {
        public PdfReportGenerator()
        {
            QuestPDF.Settings.License = LicenseType.Community;
        }

        public byte[] GenerateCashFlowReport(CashFlowStatement data, string lang)
        {
            var document = Document.Create(container =>
            {
                container.Page(page =>
                {
                    page.Margin(50);
                    page.PageColor(Colors.White);
                    page.DefaultTextStyle(x => x.FontSize(12));

                    page.Header().Text(lang == "fr" ? "Tableau des Flux de Trésorerie" : "Cash Flow Statement")
                        .SemiBold().FontSize(20).FontColor(Colors.Blue.Darken2);

                    page.Content().Table(table =>
                    {
                        table.ColumnsDefinition(c =>
                        {
                            c.ConstantColumn(250);
                            c.RelativeColumn();
                        });

                        table.Header(h =>
                        {
                            h.Cell().Text(lang == "fr" ? "Description" : "Description").Bold();
                            h.Cell().Text(lang == "fr" ? "Montant" : "Amount").Bold();
                        });

                        foreach (var line in data.Lines)
                        {
                            var labelText = lang == "fr" ? line.LabelFr : line.LabelEn;
                            var isSub = string.Equals(line.LineKind, "subtotal", StringComparison.OrdinalIgnoreCase);
                            var isPh = string.Equals(line.LineKind, "placeholder", StringComparison.OrdinalIgnoreCase);
                            var isSec = string.Equals(line.LineKind, "section_header", StringComparison.OrdinalIgnoreCase);

                            if (isSec)
                            {
                                table.Cell().ColumnSpan(2).PaddingTop(8).Text(labelText).SemiBold().FontColor(Colors.Blue.Darken2);
                            }
                            else if (isSub)
                            {
                                table.Cell().Text(labelText).Bold();
                                table.Cell().Text(line.Amount.ToString("N0")).Bold();
                            }
                            else if (isPh)
                            {
                                table.Cell().Text(labelText).FontColor(Colors.Grey.Medium);
                                table.Cell().Text(line.Amount.ToString("N0")).FontColor(Colors.Grey.Medium);
                            }
                            else
                            {
                                table.Cell().Text(labelText);
                                table.Cell().Text(line.Amount.ToString("N0"));
                            }
                        }

                        table.Cell().Text(lang == "fr" ? "Variation nette de trésorerie (modèle)" : "Net change in cash (modeled)").Bold();
                        table.Cell().Text(data.NetCashFlow.ToString("N0")).Bold();
                        table.Cell().Text(lang == "fr" ? "Variation trésorerie (grand livre, classe 5)" : "Ledger change in cash (class 5)").Bold();
                        table.Cell().Text(data.ChangeInCashClass5Ledger.ToString("N0")).Bold();
                        table.Cell().Text(lang == "fr" ? "Écart réconciliation" : "Reconciliation variance").Bold();
                        table.Cell().Text(data.CashBridgeVariance.ToString("N0")).Bold();
                    });
                });
            });

            return document.GeneratePdf();
        }

        public byte[] GenerateIncomeStatementReport(IncomeStatement data, string lang)
        {
            var title = lang == "fr" ? "Compte de Résultat" : "Income Statement";
            
            var document = Document.Create(container =>
            {
                container.Page(page =>
                {
                    page.Size(PageSizes.A4);
                    page.Margin(2, Unit.Centimetre);
                    page.PageColor(Colors.White);
                    page.DefaultTextStyle(x => x.FontSize(11));

                    page.Header().Text(title).SemiBold().FontSize(20).FontColor(Colors.Blue.Darken2);

                    page.Content().PaddingVertical(1, Unit.Centimetre)
                        .Column(x =>
                        {
                            x.Item().Text(lang == "fr" ? "Revenus:" : "Revenues:").SemiBold();
                            foreach (var item in data.Revenues)
                            {
                                x.Item().Row(r =>
                                {
                                    r.RelativeItem().Text($"{item.Code} - {(lang == "fr" ? item.LabelFr : item.LabelEn)}");
                                    r.ConstantItem(100).AlignRight().Text(item.Amount.ToString("N2"));
                                });
                            }
                            x.Item().PaddingVertical(5).LineHorizontal(1).LineColor(Colors.Grey.Lighten2);
                            x.Item().Row(r =>
                            {
                                r.RelativeItem().Text(lang == "fr" ? "Total Revenus" : "Total Revenues").SemiBold();
                                r.ConstantItem(100).AlignRight().Text(data.TotalRevenue.ToString("N2")).SemiBold();
                            });

                            x.Item().PaddingVertical(10);
                            x.Item().Text(lang == "fr" ? "Charges:" : "Expenses:").SemiBold();
                            foreach (var item in data.Expenses)
                            {
                                x.Item().Row(r =>
                                {
                                    r.RelativeItem().Text($"{item.Code} - {(lang == "fr" ? item.LabelFr : item.LabelEn)}");
                                    r.ConstantItem(100).AlignRight().Text(item.Amount.ToString("N2"));
                                });
                            }
                            x.Item().PaddingVertical(5).LineHorizontal(1).LineColor(Colors.Grey.Lighten2);
                            x.Item().Row(r =>
                            {
                                r.RelativeItem().Text(lang == "fr" ? "Total Charges" : "Total Expenses").SemiBold();
                                r.ConstantItem(100).AlignRight().Text(data.TotalExpenses.ToString("N2")).SemiBold();
                            });

                            x.Item().PaddingVertical(15);
                            x.Item().Row(r =>
                            {
                                r.RelativeItem().Text(lang == "fr" ? "Résultat Net" : "Net Income").Bold().FontSize(14);
                                r.ConstantItem(100).AlignRight().Text(data.NetIncome.ToString("N2")).Bold().FontSize(14);
                            });
                        });
                });
            });

            return document.GeneratePdf();
        }

        public byte[] GenerateBalanceSheetReport(BalanceSheetStatement data, string lang)
        {
            var title = lang == "fr" ? "Bilan" : "Balance Sheet";
            
            var document = Document.Create(container =>
            {
                container.Page(page =>
                {
                    page.Size(PageSizes.A4);
                    page.Margin(2, Unit.Centimetre);
                    page.PageColor(Colors.White);
                    page.DefaultTextStyle(x => x.FontSize(11));

                    page.Header().Text(title).SemiBold().FontSize(20).FontColor(Colors.Blue.Darken2);

                    page.Content().PaddingVertical(1, Unit.Centimetre)
                        .Column(x =>
                        {
                            x.Item().Text(lang == "fr" ? "Actif (Assets):" : "Assets:").SemiBold();
                            foreach (var item in data.Assets)
                            {
                                x.Item().Row(r =>
                                {
                                    r.RelativeItem().Text($"{item.Code} - {(lang == "fr" ? item.LabelFr : item.LabelEn)}");
                                    r.ConstantItem(100).AlignRight().Text(item.Amount.ToString("N2"));
                                });
                            }
                            x.Item().PaddingVertical(5).LineHorizontal(1).LineColor(Colors.Grey.Lighten2);
                            x.Item().Row(r =>
                            {
                                r.RelativeItem().Text(lang == "fr" ? "Total Actif" : "Total Assets").SemiBold();
                                r.ConstantItem(100).AlignRight().Text(data.TotalAssets.ToString("N2")).SemiBold();
                            });

                            x.Item().PaddingVertical(10);
                            x.Item().Text(lang == "fr" ? "Passif (Liabilities & Equity):" : "Liabilities & Equity:").SemiBold();
                            foreach (var item in data.Equity.Concat(data.Liabilities))
                            {
                                x.Item().Row(r =>
                                {
                                    r.RelativeItem().Text($"{item.Code} - {(lang == "fr" ? item.LabelFr : item.LabelEn)}");
                                    r.ConstantItem(100).AlignRight().Text(item.Amount.ToString("N2"));
                                });
                            }
                            x.Item().PaddingVertical(5).LineHorizontal(1).LineColor(Colors.Grey.Lighten2);
                            x.Item().Row(r =>
                            {
                                r.RelativeItem().Text(lang == "fr" ? "Total Passif" : "Total Liabilities & Equity").SemiBold();
                                r.ConstantItem(100).AlignRight().Text(data.TotalLiabilitiesAndEquity.ToString("N2")).SemiBold();
                            });
                        });
                });
            });

            return document.GeneratePdf();
        }

        public byte[] GeneratePayslipPdf(PayrollDetail detail, string companyName, string lang = "fr")
        {
            // ── Precompute values ──────────────────────────────────────────────
            var emp = detail.Employee;
            var period = detail.PayrollPeriod;
            var useEn = lang.StartsWith("en", StringComparison.OrdinalIgnoreCase);
            var positionLabel = useEn
                ? (string.IsNullOrWhiteSpace(emp.PositionEn) ? emp.Position : emp.PositionEn)
                : emp.Position;
            if (string.IsNullOrWhiteSpace(positionLabel)) positionLabel = "—";

            decimal grossSalary   = detail.BaseSalary + detail.IndemniteTransport + detail.IndemniteLogement
                                  + detail.PrimeAnciennete + detail.Mois13 + detail.AvantagesNature
                                  + detail.IndemniteRepresentation + detail.OvertimePay + detail.Bonuses;
            decimal totalEmployee = detail.EmployeeCnpsContrib + detail.IncomeTax + detail.Cac
                                  + detail.Rav + detail.Tdl + detail.CfcEmployee + detail.Advances;

            // Brand colors
            var headerBg    = Color.FromHex("#0f2d40");
            var accentGreen = Color.FromHex("#00b894");
            var accentRed   = Color.FromHex("#d63031");
            var accentGold  = Color.FromHex("#f9ca24");
            var rowAlt      = Color.FromHex("#f4f8fb");
            var borderColor = Color.FromHex("#dde6ed");
            var textDark    = Color.FromHex("#1e2d3d");
            var textMuted   = Color.FromHex("#6b7c93");

            // Helper: add an earnings row
            void EarningRow(TableDescriptor t, string label, decimal amount, Color altBg, int rowIdx)
            {
                var bg = rowIdx % 2 == 0 ? Colors.White : altBg;
                t.Cell().Background(bg).PaddingHorizontal(8).PaddingVertical(6).Text(label).FontSize(9);
                t.Cell().Background(bg).PaddingHorizontal(8).PaddingVertical(6).AlignRight()
                    .Text(amount.ToString("N0")).FontSize(9).SemiBold();
            }

            void DeductionRow(TableDescriptor t, string label, decimal amount, Color altBg, int rowIdx)
            {
                var bg = rowIdx % 2 == 0 ? Colors.White : altBg;
                t.Cell().Background(bg).PaddingHorizontal(8).PaddingVertical(6).Text(label).FontSize(9);
                t.Cell().Background(bg).PaddingHorizontal(8).PaddingVertical(6).AlignRight()
                    .Text(amount.ToString("N0")).FontSize(9).FontColor(accentRed).SemiBold();
            }

            var document = Document.Create(container =>
            {
                container.Page(page =>
                {
                    page.Size(PageSizes.A4);
                    page.MarginHorizontal(0);
                    page.MarginVertical(0);
                    page.PageColor(Colors.White);
                    page.DefaultTextStyle(x => x.FontFamily("Arial").FontSize(10).FontColor(textDark));

                    // ── HEADER ─────────────────────────────────────────────────
                    page.Header().Background(headerBg).Padding(28).Row(row =>
                    {
                        row.RelativeItem().Column(col =>
                        {
                            col.Item().Text(companyName)
                                .Bold().FontSize(20).FontColor(Colors.White);
                                
                            var payslipTitle = (detail.BaseSalary == 0 && detail.Mois13 > 0)
                                ? "13TH MONTH PAYSLIP / BULLETIN DE 13ÈME MOIS"
                                : "PAYSLIP / BULLETIN DE PAIE";
                                
                            col.Item().PaddingTop(4).Text(payslipTitle)
                                .FontSize(11).FontColor(accentGold).Bold();
                            col.Item().PaddingTop(2).Text($"Pay Period: {period.PeriodDate:MMMM yyyy}")
                                .FontSize(9).FontColor(Color.FromHex("#a0b4c8"));
                        });

                        row.ConstantItem(140).AlignRight().Column(col =>
                        {
                            col.Item().AlignRight().Text("🇨🇲 Republic of Cameroon")
                                .FontSize(8).FontColor(Color.FromHex("#a0b4c8"));
                            col.Item().AlignRight().PaddingTop(4)
                                .Text($"Ref: {detail.Id.ToString()[..8].ToUpper()}")
                                .FontSize(8).FontColor(accentGold);
                            col.Item().AlignRight().PaddingTop(2)
                                .Text($"Generated: {DateTime.Now:dd MMM yyyy}")
                                .FontSize(8).FontColor(Color.FromHex("#a0b4c8"));
                        });
                    });

                    // ── CONTENT ────────────────────────────────────────────────
                    page.Content().Padding(24).Column(main =>
                    {
                        // ── Employee Info Card ─────────────────────────────────
                        main.Item().Border(1).BorderColor(borderColor).Padding(16).Row(row =>
                        {
                            row.RelativeItem().Column(col =>
                            {
                                col.Item().Text("EMPLOYEE DETAILS").FontSize(8).FontColor(textMuted).Bold();
                                col.Item().PaddingTop(6).Text($"{emp.FirstName} {emp.LastName}")
                                    .FontSize(15).Bold().FontColor(textDark);
                                col.Item().PaddingTop(2).Text(positionLabel)
                                    .FontSize(10).FontColor(textMuted);
                            });

                            row.ConstantItem(1).Background(borderColor);

                            row.RelativeItem().PaddingLeft(16).Column(col =>
                            {
                                col.Item().Text("COMPENSATION SUMMARY").FontSize(8).FontColor(textMuted).Bold();
                                col.Item().PaddingTop(6).Row(r =>
                                {
                                    r.RelativeItem().Text("Gross Salary").FontSize(9).FontColor(textMuted);
                                    r.AutoItem().Text($"{grossSalary:N0} XAF").FontSize(9).SemiBold();
                                });
                                col.Item().PaddingTop(3).Row(r =>
                                {
                                    r.RelativeItem().Text("Total Deductions").FontSize(9).FontColor(textMuted);
                                    r.AutoItem().Text($"({totalEmployee:N0} XAF)").FontSize(9).SemiBold().FontColor(accentRed);
                                });
                                col.Item().PaddingTop(6).Background(accentGreen).Padding(6).Row(r =>
                                {
                                    r.RelativeItem().Text("NET PAY").FontSize(10).Bold().FontColor(Colors.White);
                                    r.AutoItem().Text($"{detail.NetSalary:N0} XAF").FontSize(10).Bold().FontColor(Colors.White);
                                });
                            });
                        });

                        main.Item().PaddingTop(20);

                        // ── Side-by-side tables ────────────────────────────────
                        main.Item().Row(cols =>
                        {
                            // LEFT – EARNINGS
                            cols.RelativeItem().Column(col =>
                            {
                                col.Item().Background(accentGreen).Padding(8).Row(r =>
                                {
                                    r.RelativeItem().Text("EARNINGS").FontSize(10).Bold().FontColor(Colors.White);
                                    r.AutoItem().Text("AMOUNT (XAF)").FontSize(8).FontColor(Colors.White);
                                });

                                col.Item().Table(t =>
                                {
                                    t.ColumnsDefinition(c => { c.RelativeColumn(); c.ConstantColumn(80); });
                                    int i = 0;

                                    // Only render non-zero earnings — 13th Month is NEVER shown here (it's a separate payslip)
                                    if (detail.BaseSalary > 0)                EarningRow(t, "Base Salary",              detail.BaseSalary,             rowAlt, i++);
                                    if (detail.IndemniteTransport > 0)        EarningRow(t, "Transport Allowance",      detail.IndemniteTransport,      rowAlt, i++);
                                    if (detail.IndemniteLogement > 0)         EarningRow(t, "Housing Allowance",        detail.IndemniteLogement,        rowAlt, i++);
                                    if (detail.PrimeAnciennete > 0)           EarningRow(t, "Seniority Bonus",          detail.PrimeAnciennete,          rowAlt, i++);
                                    if (detail.AvantagesNature > 0)           EarningRow(t, "Benefits in Kind",         detail.AvantagesNature,          rowAlt, i++);
                                    if (detail.IndemniteRepresentation > 0)   EarningRow(t, "Representation Allowance", detail.IndemniteRepresentation,  rowAlt, i++);
                                    if (detail.OvertimePay > 0)               EarningRow(t, "Overtime Pay",             detail.OvertimePay,             rowAlt, i++);
                                    if (detail.Bonuses > 0)                   EarningRow(t, "Other Bonuses",            detail.Bonuses,                 rowAlt, i++);
                                    // 13th Month — only shown on its own separate payslip, never here
                                    if (detail.BaseSalary == 0 && detail.Mois13 > 0) EarningRow(t, "13th Month Bonus", detail.Mois13, rowAlt, i++);
                                });

                                // Earnings total bar
                                col.Item().Background(Color.FromHex("#d4f5ec")).Padding(8).Row(r =>
                                {
                                    r.RelativeItem().Text("GROSS TOTAL").FontSize(9).Bold();
                                    r.AutoItem().Text($"{grossSalary:N0}").FontSize(9).Bold().FontColor(accentGreen);
                                });
                            });

                            // GAP
                            cols.ConstantItem(12);

                            // RIGHT – DEDUCTIONS
                            cols.RelativeItem().Column(col =>
                            {
                                col.Item().Background(accentRed).Padding(8).Row(r =>
                                {
                                    r.RelativeItem().Text("DEDUCTIONS").FontSize(10).Bold().FontColor(Colors.White);
                                    r.AutoItem().Text("AMOUNT (XAF)").FontSize(8).FontColor(Colors.White);
                                });

                                col.Item().Table(t =>
                                {
                                    t.ColumnsDefinition(c => { c.RelativeColumn(); c.ConstantColumn(80); });
                                    int i = 0;

                                    if (detail.EmployeeCnpsContrib > 0) DeductionRow(t, "CNPS (Pension)", detail.EmployeeCnpsContrib, rowAlt, i++);
                                    if (detail.IncomeTax > 0)           DeductionRow(t, "IRPP (Income Tax)", detail.IncomeTax, rowAlt, i++);
                                    if (detail.Cac > 0)                 DeductionRow(t, "CAC (Council Surtax)", detail.Cac, rowAlt, i++);
                                    if (detail.Rav > 0)                 DeductionRow(t, "RAV (Audio-Visual Tax)", detail.Rav, rowAlt, i++);
                                    if (detail.Tdl > 0)                 DeductionRow(t, "TDL (Local Dev. Tax)", detail.Tdl, rowAlt, i++);
                                    if (detail.CfcEmployee > 0)         DeductionRow(t, "CFC (Housing Fund)", detail.CfcEmployee, rowAlt, i++);
                                    if (detail.Advances > 0)            DeductionRow(t, "Salary Advances", detail.Advances, rowAlt, i++);
                                });

                                // Deductions total bar
                                col.Item().Background(Color.FromHex("#fde8e8")).Padding(8).Row(r =>
                                {
                                    r.RelativeItem().Text("TOTAL DEDUCTED").FontSize(9).Bold();
                                    r.AutoItem().Text($"{totalEmployee:N0}").FontSize(9).Bold().FontColor(accentRed);
                                });
                            });
                        });

                        main.Item().PaddingTop(16);

                        // ── Employer Contributions Info Bar ────────────────────
                        main.Item().Background(Color.FromHex("#f0f7ff")).Border(1).BorderColor(borderColor)
                            .Padding(10).Row(r =>
                        {
                            r.RelativeItem().Column(c =>
                            {
                                c.Item().Text("EMPLOYER CONTRIBUTIONS & TAX BASES").FontSize(8).Bold().FontColor(textMuted);
                                c.Item().PaddingTop(4).Row(inner =>
                                {
                                    decimal cnpsBase = grossSalary - detail.IndemniteTransport - detail.IndemniteRepresentation;
                                    inner.RelativeItem().Text($"CNPS Base: {cnpsBase:N0} XAF").FontSize(8).FontColor(textMuted);
                                    inner.RelativeItem().Text($"Taxable Base: {detail.TaxableIncome:N0} XAF").FontSize(8).FontColor(textMuted);
                                    inner.RelativeItem().Text($"CNPS Employer: {detail.EmployerCnpsContrib:N0} XAF").FontSize(8);
                                    inner.RelativeItem().Text($"FNE & CFC Emp: {(detail.FneEmployer + detail.CfcEmployer):N0} XAF").FontSize(8);
                                });
                            });
                        });

                        main.Item().PaddingTop(16);

                        // ── Net Pay Banner ─────────────────────────────────────
                        main.Item().Background(headerBg).Padding(18).Row(r =>
                        {
                            r.RelativeItem().Column(c =>
                            {
                                c.Item().Text("NET TAKE-HOME PAY / SALAIRE NET À PAYER")
                                    .FontSize(11).Bold().FontColor(accentGold);
                                c.Item().PaddingTop(2).Text("Amount to be credited to employee's bank account.")
                                    .FontSize(8).FontColor(Color.FromHex("#a0b4c8"));
                            });
                            r.ConstantItem(180).AlignRight().AlignMiddle()
                                .Text($"{detail.NetSalary:N0} XAF")
                                .FontSize(22).Bold().FontColor(accentGreen);
                        });
                    });

                    // ── FOOTER ──────────────────────────────────────────────────
                    page.Footer().Background(Color.FromHex("#f4f8fb")).BorderTop(1).BorderColor(borderColor)
                        .PaddingHorizontal(24).PaddingVertical(10).Row(r =>
                    {
                        r.RelativeItem().Text($"This payslip was generated electronically by {companyName} via ZAIZEN Payroll. It is valid without a signature.")
                            .FontSize(7).FontColor(textMuted);
                        r.ConstantItem(100).AlignRight().Text($"Page 1 of 1").FontSize(7).FontColor(textMuted);
                    });
                });
            });

            return document.GeneratePdf();
        }
    }
}
