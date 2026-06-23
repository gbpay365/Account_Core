using System;

namespace ComptabiliteAPI.Domain.Entities
{
    public class InventoryMovement
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        
        public Guid ProductId { get; set; }
        public Product Product { get; set; } = null!;

        // 'in', 'out', 'adjustment'
        public string MovementType { get; set; } = string.Empty;
        
        public decimal Quantity { get; set; }
        public decimal UnitCost { get; set; }
        
        public Guid? ReferenceId { get; set; } // Link to sales_document or purchase_order
        public DateTime MovementDate { get; set; } = DateTime.UtcNow;

        public Guid? WarehouseId { get; set; }
        public Warehouse? Warehouse { get; set; }

        public Guid CompanyId { get; set; }
        public Company Company { get; set; } = null!;
    }
}
