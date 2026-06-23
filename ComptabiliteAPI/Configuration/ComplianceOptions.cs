namespace ComptabiliteAPI.Configuration;

/// <summary>Runtime configuration for DGI/ECF compliance features (Phases A–C).</summary>
public class ComplianceOptions
{
    public const string SectionName = "Compliance";

    /// <summary>Base URL for production DGI télédéclaration when available (stub ignores).</summary>
    public string DgiBaseUrl { get; set; } = "https://dgi-stub.local/";

    /// <summary>When true, DGI client does not call production and logs stub behaviour.</summary>
    public bool DgiStubMode { get; set; } = true;

    /// <summary>Version tag embedded in ECF XML / API responses for client alignment.</summary>
    public string EcfXmlSchemaVersion { get; set; } = "1.0-stub";

    /// <summary>Indicative tax calc disclaimer (short).</summary>
    public string IndicativeTaxDisclaimer { get; set; } =
        "Indicative only: verify against Loi de Finances, DGI forms, and your adviser; binding amounts are on official declarations.";
}
