using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Mvc.ModelBinding.Validation;

namespace ComptabiliteAPI.Domain.Entities
{
    public class Product
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public string Code { get; set; } = string.Empty;
        public string NameFr { get; set; } = string.Empty;
        public string NameEn { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
        
        public Guid? FamilyId { get; set; }
        [JsonIgnore]
        [ValidateNever]
        public ProductFamily? Family { get; set; }

        public decimal UnitPrice { get; set; }
        public decimal TaxRate { get; set; } = 19.25m; // Cameroonian TVA

        public decimal StockQuantity { get; set; } = 0;
        public decimal? ReorderThreshold { get; set; }
        public string ValuationMethod { get; set; } = "FIFO";

        public bool IsActive { get; set; } = true;
        
        public Guid CompanyId { get; set; }
        [JsonIgnore]
        [ValidateNever]
        public Company? Company { get; set; }

        [JsonIgnore]
        [ValidateNever]
        public ICollection<InventoryMovement> InventoryMovements { get; set; } = new List<InventoryMovement>();
        [JsonIgnore]
        [ValidateNever]
        public ICollection<SalesDocumentLine> SalesDocumentLines { get; set; } = new List<SalesDocumentLine>();
    }
}
