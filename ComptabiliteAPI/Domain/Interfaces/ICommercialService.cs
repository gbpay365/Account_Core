using ComptabiliteAPI.Domain.Entities;
using ComptabiliteAPI.DTOs;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace ComptabiliteAPI.Domain.Interfaces
{
    public interface ICommercialService
    {
        // Products
        Task<IEnumerable<Product>> GetProductsAsync(Guid companyId);
        Task<Product> CreateProductAsync(Product product);
        Task<Product> UpdateProductAsync(Product product);
        Task DeleteProductAsync(Guid id);
        Task<IEnumerable<ProductFamily>> GetProductFamiliesAsync(Guid companyId);

        // Customers
        Task<IEnumerable<Customer>> GetCustomersAsync(Guid companyId);
        Task<Customer> CreateCustomerAsync(Customer customer);
        Task<Customer> UpdateCustomerAsync(Customer customer);
        Task DeleteCustomerAsync(Guid id);

        // Suppliers (AP / vendor master)
        Task<IEnumerable<Supplier>> GetSuppliersAsync(Guid companyId);
        Task<Supplier> CreateSupplierAsync(Supplier supplier);

        // Sales Documents
        Task<IEnumerable<SalesDocument>> GetSalesDocumentsAsync(Guid companyId, string? status = null);
        Task<SalesDocument> GetSalesDocumentAsync(Guid documentId);
        Task<SalesDocument> CreateQuoteAsync(SalesDocument document);
        
        // State Transitions & Integration
        Task<SalesDocument> TransformToOrderAsync(Guid quoteId);
        Task<SalesDocument> TransformToInvoiceAsync(Guid orderId, Guid performedByUserId);
        Task PostInvoiceToAccountingAsync(Guid invoiceId, Guid performedByUserId);
        Task UpdateSalesDocumentStatusAsync(Guid documentId, string status);
    }
}
