using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Mvc.ModelBinding.Validation;

namespace ComptabiliteAPI.Domain.Entities
{
    public class SalesDocumentLine
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        
        public Guid DocumentId { get; set; }
        [JsonIgnore]
        [ValidateNever]
        public SalesDocument? Document { get; set; }

        public Guid ProductId { get; set; }
        [JsonIgnore]
        [ValidateNever]
        public Product? Product { get; set; }

        public decimal Quantity { get; set; }
        public decimal UnitPrice { get; set; }
        public decimal DiscountRate { get; set; } = 0;
        public decimal TotalLine { get; set; }
    }
}
