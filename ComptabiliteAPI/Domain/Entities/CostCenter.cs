using System;

namespace ComptabiliteAPI.Domain.Entities
{
    /// <summary>
    /// Analytical cost centre (axe analytique) for SYSCOHADA / OHADA reporting.
    /// Linked to an OHADA class (1–7) to align with the company chart of accounts structure.
    /// </summary>
    public class CostCenter
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid CompanyId { get; set; }
        public Company Company { get; set; } = null!;

        /// <summary>Short unique code per company (FEC / analytical dimension).</summary>
        public string Code { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public string? Description { get; set; }

        /// <summary>OHADA account class (1–7) this centre primarily maps to (charges, produits, etc.).</summary>
        public byte OhadaClass { get; set; }

        /// <summary>Optional GL / sous-compte principal (e.g. 601, 641, 521) for sector template linkage.</summary>
        public string? RelatedAccountCode { get; set; }

        public int SortOrder { get; set; }
        public bool IsActive { get; set; } = true;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    }
}
