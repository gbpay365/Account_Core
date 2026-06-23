using System.Net;
using System.Text;
using System.Xml.Linq;
using ComptabiliteAPI.DTOs;

namespace ComptabiliteAPI.Infrastructure.Services;

public static class ReportHtmlXmlSerializer
{
    public static byte[] TrialBalanceToXml(IReadOnlyList<TrialBalanceDto> rows, int fiscalYear, string lang)
    {
        var root = new XElement("TrialBalance",
            new XAttribute("FiscalYear", fiscalYear),
            new XAttribute("Language", lang),
            new XAttribute("GeneratedUtc", DateTime.UtcNow.ToString("o"))
        );
        foreach (var r in rows)
        {
            root.Add(new XElement("Line",
                new XElement("AccountCode", r.AccountCode),
                new XElement("NameFr", r.NameFr),
                new XElement("NameEn", r.NameEn),
                new XElement("AccountType", r.AccountType),
                new XElement("TotalDebit", r.TotalDebit),
                new XElement("TotalCredit", r.TotalCredit),
                new XElement("Balance", r.Balance)
            ));
        }
        return Encoding.UTF8.GetBytes("<?xml version=\"1.0\" encoding=\"utf-8\"?>\n" + root.ToString());
    }

    public static byte[] TrialBalanceToHtml(IReadOnlyList<TrialBalanceDto> rows, int fiscalYear, string lang)
    {
        var nameCol = string.Equals(lang, "fr", StringComparison.OrdinalIgnoreCase) ? "NameFr" : "NameEn";
        var sb = new StringBuilder();
        sb.Append("<!DOCTYPE html><html><head><meta charset=\"utf-8\"/><title>Trial Balance ")
            .Append(fiscalYear).Append("</title>");
        sb.Append("<style>body{font-family:system-ui,sans-serif;margin:24px;}table{border-collapse:collapse;width:100%;}th,td{border:1px solid #ccc;padding:8px;text-align:left;}th{background:#0f766e;color:#fff}</style></head><body>");
        sb.Append("<h1>").Append(Encode($"Trial balance — {fiscalYear}")).Append("</h1><table><thead><tr><th>Code</th><th>Account</th><th>Debit</th><th>Credit</th><th>Balance</th></tr></thead><tbody>");
        foreach (var r in rows)
        {
            var name = nameCol == "NameFr" ? r.NameFr : r.NameEn;
            sb.Append("<tr><td>").Append(Encode(r.AccountCode)).Append("</td><td>")
                .Append(Encode(name)).Append("</td><td>").Append(r.TotalDebit.ToString("N2"))
                .Append("</td><td>").Append(r.TotalCredit.ToString("N2"))
                .Append("</td><td>").Append(r.Balance.ToString("N2"))
                .Append("</td></tr>");
        }
        sb.Append("</tbody></table></body></html>");
        return Encoding.UTF8.GetBytes(sb.ToString());
    }

    public static byte[] IncomeStatementToXml(IncomeStatement s, int fiscalYear, string lang)
    {
        var root = new XElement("IncomeStatement", new XAttribute("FiscalYear", fiscalYear), new XAttribute("Language", lang), new XAttribute("GeneratedUtc", DateTime.UtcNow.ToString("o")));
        root.Add(new XElement("TotalRevenue", s.TotalRevenue), new XElement("TotalExpenses", s.TotalExpenses), new XElement("NetIncome", s.NetIncome));
        void AddSection(string n, IReadOnlyList<StatementLine> lines)
        {
            var e = new XElement(n);
            foreach (var l in lines) e.Add(LineEl(l));
            root.Add(e);
        }
        AddSection("Revenues", s.Revenues);
        AddSection("Expenses", s.Expenses);
        return Encoding.UTF8.GetBytes("<?xml version=\"1.0\" encoding=\"utf-8\"?>\n" + root.ToString());
    }

    public static byte[] IncomeStatementToHtml(IncomeStatement s, int fiscalYear, string lang)
    {
        var fr = string.Equals(lang, "fr", StringComparison.OrdinalIgnoreCase);
        var sb = new StringBuilder();
        sb.Append("<!DOCTYPE html><html><head><meta charset=\"utf-8\"/><title>Income Statement ")
            .Append(fiscalYear).Append("</title>");
        sb.Append("<style>body{font-family:system-ui,sans-serif;margin:24px;}h2{margin-top:24px;}table{border-collapse:collapse;width:100%;max-width:800px}td,th{border:1px solid #ccc;padding:8px}th{background:#0f766e;color:#fff}</style></head><body>");
        sb.Append("<h1>").Append(Encode($"Income statement — {fiscalYear}")).Append("</h1>");
        sb.Append("<p><strong>Net: ").Append(s.NetIncome.ToString("N2")).Append("</strong></p>");
        void Table(string title, IReadOnlyList<StatementLine> lines)
        {
            sb.Append("<h2>").Append(Encode(title)).Append("</h2><table><tbody>");
            foreach (var l in lines)
            {
                var lab = fr ? l.LabelFr : l.LabelEn;
                sb.Append("<tr><td>").Append(Encode(lab)).Append("</td><td>").Append(l.Amount.ToString("N2")).Append("</td></tr>");
            }
            sb.Append("</tbody></table>");
        }
        Table("Revenues", s.Revenues);
        Table("Expenses", s.Expenses);
        sb.Append("</body></html>");
        return Encoding.UTF8.GetBytes(sb.ToString());
    }

    public static byte[] BalanceSheetToXml(BalanceSheetStatement s, int fiscalYear, string lang)
    {
        var root = new XElement("BalanceSheet", new XAttribute("FiscalYear", fiscalYear), new XAttribute("Language", lang), new XAttribute("GeneratedUtc", DateTime.UtcNow.ToString("o")));
        root.Add(new XElement("TotalAssets", s.TotalAssets), new XElement("TotalLiabilities", s.TotalLiabilities), new XElement("TotalEquity", s.TotalEquity));
        void AddSec(string n, IReadOnlyList<StatementLine> lines)
        {
            var e = new XElement(n);
            foreach (var l in lines) e.Add(LineEl(l));
            root.Add(e);
        }
        AddSec("Assets", s.Assets);
        AddSec("Liabilities", s.Liabilities);
        AddSec("Equity", s.Equity);
        return Encoding.UTF8.GetBytes("<?xml version=\"1.0\" encoding=\"utf-8\"?>\n" + root.ToString());
    }

    public static byte[] BalanceSheetToHtml(BalanceSheetStatement s, int fiscalYear, string lang)
    {
        var fr = string.Equals(lang, "fr", StringComparison.OrdinalIgnoreCase);
        var sb = new StringBuilder();
        sb.Append("<!DOCTYPE html><html><head><meta charset=\"utf-8\"/><title>Balance Sheet ")
            .Append(fiscalYear).Append("</title>");
        sb.Append("<style>body{font-family:system-ui,sans-serif;margin:24px}table{border-collapse:collapse;max-width:800px}td,th{border:1px solid #ccc;padding:8px}th{background:#0f766e;color:#fff}</style></head><body>");
        sb.Append("<h1>").Append(Encode($"Balance sheet — {fiscalYear}")).Append("</h1>");
        void T(string t, IReadOnlyList<StatementLine> lines)
        {
            sb.Append("<h2>").Append(Encode(t)).Append("</h2><table><tbody>");
            foreach (var l in lines) { var lab = fr ? l.LabelFr : l.LabelEn; sb.Append("<tr><td>").Append(Encode(lab)).Append("</td><td>").Append(l.Amount.ToString("N2")).Append("</td></tr>"); }
            sb.Append("</tbody></table>");
        }
        T("Assets", s.Assets);
        T("Liabilities", s.Liabilities);
        T("Equity", s.Equity);
        sb.Append("</body></html>");
        return Encoding.UTF8.GetBytes(sb.ToString());
    }

    public static byte[] CashFlowToXml(CashFlowStatement s, int fiscalYear, string lang)
    {
        var root = new XElement("CashFlow", new XAttribute("FiscalYear", fiscalYear), new XAttribute("Language", lang), new XAttribute("GeneratedUtc", DateTime.UtcNow.ToString("o")));
        root.Add(new XElement("Operating", s.OperatingCF), new XElement("Investing", s.InvestingCF), new XElement("Financing", s.FinancingCF), new XElement("NetCashFlow", s.NetCashFlow));
        var lines = new XElement("Lines");
        foreach (var l in s.Lines) lines.Add(CashLineEl(l));
        root.Add(lines);
        return Encoding.UTF8.GetBytes("<?xml version=\"1.0\" encoding=\"utf-8\"?>\n" + root.ToString());
    }

    public static byte[] CashFlowToHtml(CashFlowStatement s, int fiscalYear, string lang)
    {
        var fr = string.Equals(lang, "fr", StringComparison.OrdinalIgnoreCase);
        var sb = new StringBuilder();
        sb.Append("<!DOCTYPE html><html><head><meta charset=\"utf-8\"/><title>Cash flow ").Append(fiscalYear).Append("</title>");
        sb.Append("<style>body{font-family:system-ui;margin:24px}table{max-width:900px}td,th{border:1px solid #ccc;padding:8px}.sec{font-weight:700;background:#0f766e;color:#fff}</style></head><body>");
        sb.Append("<h1>").Append(Encode($"Cash flow — {fiscalYear}")).Append("</h1><table><tbody>");
        foreach (var l in s.Lines)
        {
            if (l.LineKind == "section_header")
            {
                var lab = fr ? l.LabelFr : l.LabelEn;
                sb.Append("<tr class=\"sec\"><td colspan=\"2\">").Append(Encode(lab)).Append("</td></tr>");
            }
            else
            {
                var lab = fr ? l.LabelFr : l.LabelEn;
                sb.Append("<tr><td>").Append(Encode(lab)).Append("</td><td>").Append(l.Amount.ToString("N2")).Append("</td></tr>");
            }
        }
        sb.Append("</tbody></table></body></html>");
        return Encoding.UTF8.GetBytes(sb.ToString());
    }

    private static XElement LineEl(StatementLine l) =>
        new("Line", new XElement("Code", l.Code), new XElement("LabelFr", l.LabelFr), new XElement("LabelEn", l.LabelEn), new XElement("Amount", l.Amount));

    private static XElement CashLineEl(CashFlowLine l) =>
        new("Line",
            new XElement("LineKind", l.LineKind),
            new XElement("Section", l.Section),
            new XElement("LabelFr", l.LabelFr), new XElement("LabelEn", l.LabelEn),
            new XElement("Amount", l.Amount));

    private static string Encode(string? s) => WebUtility.HtmlEncode(s ?? string.Empty);
}
