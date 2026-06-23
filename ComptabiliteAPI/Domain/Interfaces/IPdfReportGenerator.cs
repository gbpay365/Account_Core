using ComptabiliteAPI.Domain.Entities;
using ComptabiliteAPI.DTOs;

namespace ComptabiliteAPI.Domain.Interfaces
{
    public interface IPdfReportGenerator
    {
        byte[] GenerateCashFlowReport(CashFlowStatement statement, string lang);
        byte[] GenerateIncomeStatementReport(IncomeStatement statement, string lang);
        byte[] GenerateBalanceSheetReport(BalanceSheetStatement statement, string lang);
        byte[] GeneratePayslipPdf(PayrollDetail detail, string companyName, string lang = "fr");
    }
}
