using System;
using System.Collections.Generic;

namespace ComptabiliteAPI.Domain.Entities
{
    public class Lead
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid CompanyId { get; set; }
        public Company Company { get; set; } = null!;
        public string Title { get; set; } = string.Empty;
        public string ContactName { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public string Phone { get; set; } = string.Empty;
        public string Status { get; set; } = "new"; // new, qualified, lost, converted
        public decimal ExpectedRevenue { get; set; }
        public int Probability { get; set; } // 0-100
        public string Notes { get; set; } = string.Empty;
        public Guid? AssignedToUserId { get; set; }
        public User? AssignedToUser { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }

    public class SalesQuote
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid CompanyId { get; set; }
        public Company Company { get; set; } = null!;
        public Guid? LeadId { get; set; }
        public Lead? Lead { get; set; }
        public Guid CustomerId { get; set; }
        public Customer Customer { get; set; } = null!;
        public string QuoteNumber { get; set; } = string.Empty;
        public DateTime ExpiryDate { get; set; }
        public string Status { get; set; } = "draft"; // draft, sent, accepted, declined, expired
        public decimal TotalAmount { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        public ICollection<SalesQuoteLine> Lines { get; set; } = new List<SalesQuoteLine>();
    }

    public class SalesQuoteLine
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid SalesQuoteId { get; set; }
        public SalesQuote SalesQuote { get; set; } = null!;
        public Guid ProductId { get; set; }
        public Product Product { get; set; } = null!;
        public decimal Quantity { get; set; }
        public decimal UnitPrice { get; set; }
        public decimal DiscountPercent { get; set; }
        public decimal LineTotal { get; set; }
    }
}
