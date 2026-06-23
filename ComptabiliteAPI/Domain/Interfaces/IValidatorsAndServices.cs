namespace ComptabiliteAPI.Domain.Interfaces
{
    public interface IDoubleEntryValidator
    {
        bool Validate(Domain.Entities.JournalEntry entry);
    }

    public interface ISYSCOHADAValidator
    {
        Task<bool> ValidateAccountCodeAsync(string code);
    }

    public interface IAuditLogService
    {
        Task LogAsync(Guid userId, Guid companyId, string reportType, string action, string ipAddress, string userAgent);
    }

    public interface INotesGenerator
    {
        Task<string> GenerateAsync(int fiscalYear, Guid companyId, string lang = "fr");
    }

    public interface IExcelExportService
    {
        byte[] ExportTrialBalance(List<DTOs.TrialBalanceDto> data, string lang);
        byte[] ExportIncomeStatement(DTOs.IncomeStatement data, string lang);
        byte[] ExportBalanceSheet(DTOs.BalanceSheetStatement data, string lang);
    }
}
