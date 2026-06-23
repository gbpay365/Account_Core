using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Mvc.ModelBinding.Validation;

namespace ComptabiliteAPI.Domain.Entities
{
    public class SalesDocument
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        
        // 'quote', 'order', 'invoice', 'delivery_slip'
        public string DocumentType { get; set; } = string.Empty;
        public string DocumentNumber { get; set; } = string.Empty;

        public Guid CustomerId { get; set; }
        [JsonIgnore]
        [ValidateNever]
        public Customer? Customer { get; set; }

        public DateTime IssueDate { get; set; }

        // 'draft', 'sent', 'confirmed', 'delivered', 'invoiced'
        public string Status { get; set; } = "draft";

        public decimal TotalHT { get; set; }
        public decimal TotalTVA { get; set; }
        public decimal TotalTTC { get; set; }
        public decimal PaidAmount { get; set; }
        public string Notes { get; set; } = string.Empty;

        public Guid CompanyId { get; set; }
        [JsonIgnore]
        [ValidateNever]
        public Company? Company { get; set; }

        public ICollection<SalesDocumentLine> Lines { get; set; } = new List<SalesDocumentLine>();
    }
}
