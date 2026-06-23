namespace ComptabiliteAPI.Domain.Enums
{
    /// <summary>SYSCOHADA account classes (1–9)</summary>
    public enum AccountClass
    {
        PermanentResources = 1,
        FixedAssets = 2,
        Inventories = 3,
        ThirdParties = 4,
        Treasury = 5,
        OperatingExpenses = 6,
        OperatingRevenues = 7,
        OtherChargesAndRevenues = 8,
        AnalyticalAccounting = 9
    }

    /// <summary>Normal balance side for double-entry bookkeeping</summary>
    public enum NormalBalance
    {
        Debit,
        Credit
    }

    /// <summary>OHADA account types</summary>
    public enum AccountType
    {
        Asset,
        Liability,
        Equity,
        Expense,
        Revenue,
        Cost
    }

    /// <summary>Cameroonian tax types per OHADA compliance</summary>
    public enum TaxType
    {
        CorporateTax,       // IS: 30% standard / 27.5% large enterprise
        VAT,                // TVA: 19.25%
        MinimumTax,         // Impôt minimum forfaitaire
        Withholding         // Retenue à la source
    }

    /// <summary>Report export format</summary>
    public enum ExportFormat
    {
        Pdf,
        Excel
    }

    /// <summary>User company access level</summary>
    public enum AccessLevel
    {
        View,
        Edit,
        Admin
    }
}
