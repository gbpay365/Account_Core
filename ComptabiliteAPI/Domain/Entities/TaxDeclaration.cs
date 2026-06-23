using System;
using System.Collections.Generic;

namespace ComptabiliteAPI.Domain.Entities
{
    /// <summary>Liasse / tax declaration (CIT annual, VAT monthly, IRPP quarterly, etc.).</summary>
    public class TaxDeclaration
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid CompanyId { get; set; }
        public Company Company { get; set; } = null!;

        /// <summary>annual_cit | vat_monthly | irpp_quarterly</summary>
        public string DeclarationType { get; set; } = string.Empty;

        public int FiscalYear { get; set; }
        public int? PeriodMonth { get; set; }
        public int? PeriodQuarter { get; set; }

        /// <summary>draft | calculated | reviewed | adjusted | locked | filed | archived</summary>
        public string Status { get; set; } = "draft";

        /// <summary>Structured declaration payload (JSON).</summary>
        public string? DeclarationData { get; set; }

        /// <summary>End-to-end id for DGI stub / logs (Phase C).</summary>
        public Guid? CorrelationId { get; set; }

        /// <summary>When set, declaration is frozen in-app (Phase B workflow).</summary>
        public DateTime? LockedAt { get; set; }

        public DateTime? FiledAt { get; set; }
        public string? FilingReceiptId { get; set; }

        public Guid CreatedById { get; set; }
        public User CreatedBy { get; set; } = null!;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        public ICollection<TaxDeclarationAttachment> Attachments { get; set; } = new List<TaxDeclarationAttachment>();
    }

    public class TaxDeclarationAttachment
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid TaxDeclarationId { get; set; }
        public TaxDeclaration TaxDeclaration { get; set; } = null!;
        public DateTime UploadedAt { get; set; } = DateTime.UtcNow;
        public string FileName { get; set; } = string.Empty;
        public string ContentType { get; set; } = "application/octet-stream";
        public long SizeBytes { get; set; }
        public byte[] Content { get; set; } = Array.Empty<byte>();
    }
}
