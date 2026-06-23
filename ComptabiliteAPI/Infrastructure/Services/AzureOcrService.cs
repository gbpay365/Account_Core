using System;
using System.Collections.Generic;
using System.IO;
using System.Threading.Tasks;
using ComptabiliteAPI.Domain.Interfaces;

namespace ComptabiliteAPI.Infrastructure.Services
{
    public class AzureOcrService : IOcrService
    {
        // In a real implementation, we would use Azure.AI.FormRecognizer
        public async Task<OcrResultDto> ProcessInvoiceAsync(Stream fileStream, string fileName)
        {
            // Simulate processing delay
            await Task.Delay(2000);

            // Mocked result based on common invoice patterns
            return new OcrResultDto
            {
                SupplierName = "Bolloré Transport & Logistics",
                InvoiceNumber = "INV-2026-001",
                InvoiceDate = DateTime.Today,
                TotalAmount = 150000,
                TaxAmount = 28875,
                Currency = "XAF",
                Lines = new List<OcrLineItemDto>
                {
                    new OcrLineItemDto { Description = "Handling Fees", Quantity = 1, UnitPrice = 100000, Amount = 100000 },
                    new OcrLineItemDto { Description = "Storage (5 days)", Quantity = 5, UnitPrice = 10000, Amount = 50000 }
                }
            };
        }
    }
}
