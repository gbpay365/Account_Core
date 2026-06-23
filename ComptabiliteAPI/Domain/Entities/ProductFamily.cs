using System;
using System.Collections.Generic;

namespace ComptabiliteAPI.Domain.Entities
{
    public class ProductFamily
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public string NameEn { get; set; } = string.Empty;
        public string NameFr { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
        public Guid CompanyId { get; set; }
        public Company Company { get; set; } = null!;

        public ICollection<Product> Products { get; set; } = new List<Product>();
    }
}
