using System;

namespace ComptabiliteAPI.Domain.Entities
{
    /// <summary>FEC (Fichier des Écritures Comptables) generation record.</summary>
    public class FecGeneration
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid CompanyId { get; set; }
        public Company Company { get; set; } = null!;


        public int FiscalYear { get; set; }
        public DateTime GeneratedAt { get; set; } = DateTime.UtcNow;

        public Guid GeneratedById { get; set; }
        public User GeneratedBy { get; set; } = null!;

        public byte[]? FecFile { get; set; }
        public string? FecFilename { get; set; }

        /// <summary>generated | archived</summary>
        public string Status { get; set; } = "generated";
    }
}
