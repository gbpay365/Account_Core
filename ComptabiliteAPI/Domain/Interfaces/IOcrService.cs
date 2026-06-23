using System;
using System.Threading.Tasks;

namespace ComptabiliteAPI.Domain.Interfaces
{
    public interface IOcrService
    {
        Task<OcrResultDto> ProcessInvoiceAsync(Stream fileStream, string fileName);
    }

    public class OcrResultDto
    {
        public string? SupplierName { get; set; }
        public string? InvoiceNumber { get; set; }
        public DateTime? InvoiceDate { get; set; }
        public decimal TotalAmount { get; set; }
        public decimal TaxAmount { get; set; }
        public string? Currency { get; set; }
        public List<OcrLineItemDto> Lines { get; set; } = new();
    }

    public class OcrLineItemDto
    {
        public string Description { get; set; } = string.Empty;
        public decimal Quantity { get; set; }
        public decimal UnitPrice { get; set; }
        public decimal Amount { get; set; }
    }
}
