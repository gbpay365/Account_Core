using System;

namespace ComptabiliteAPI.Domain.Entities
{
    public class PortalAccessLink
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid CompanyId { get; set; }
        public Company Company { get; set; } = null!;
        
        // Link to either a Customer or a Supplier
        public Guid? CustomerId { get; set; }
        public Customer? Customer { get; set; }
        public Guid? SupplierId { get; set; }
        public Supplier? Supplier { get; set; }

        public string SecureToken { get; set; } = string.Empty; // Unique GUID or random string
        public string PortalType { get; set; } = string.Empty; // 'customer' or 'supplier'
        
        public DateTime ExpiresAt { get; set; }
        public bool IsActive { get; set; } = true;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}
