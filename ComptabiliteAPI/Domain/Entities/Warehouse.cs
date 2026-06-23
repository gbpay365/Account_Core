using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace ComptabiliteAPI.Domain.Entities
{
    public class Warehouse
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public Guid CompanyId { get; set; }

        [JsonIgnore] public Company Company { get; set; } = null!;

        public string Code { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public string Location { get; set; } = string.Empty;
        public bool IsActive { get; set; } = true;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        [JsonIgnore] public ICollection<InventoryMovement> Movements { get; set; } = new List<InventoryMovement>();
    }
}
