using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Mvc.ModelBinding.Validation;

namespace ComptabiliteAPI.Domain.Entities
{
    public class Customer
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid CompanyId { get; set; }
        [JsonIgnore]
        [ValidateNever]
        public Company? Company { get; set; }

        public string AccountCode { get; set; } = string.Empty; // Linked to account '411'
        public string Name { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public string Phone { get; set; } = string.Empty;
        public string Address { get; set; } = string.Empty;
        
        public decimal? CreditLimit { get; set; }
        public decimal CurrentOutstanding { get; set; } = 0;
        
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        [JsonIgnore]
        [ValidateNever]
        public ICollection<SalesDocument> SalesDocuments { get; set; } = new List<SalesDocument>();
        [JsonIgnore]
        [ValidateNever]
        public ICollection<CustomerPayment> Payments { get; set; } = new List<CustomerPayment>();
    }
}
