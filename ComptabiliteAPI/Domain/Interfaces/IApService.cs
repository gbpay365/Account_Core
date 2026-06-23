using ComptabiliteAPI.Domain.Entities;

namespace ComptabiliteAPI.Domain.Interfaces
{
    public interface IApService
    {
        Task<IEnumerable<SupplierInvoice>> GetInvoicesAsync(Guid companyId, string? status = null);
        Task<SupplierInvoice> GetInvoiceAsync(Guid invoiceId);
        Task<SupplierInvoice> CreateInvoiceAsync(SupplierInvoice invoice);
        Task<SupplierInvoice> UpdateInvoiceAsync(SupplierInvoice invoice);
        Task DeleteInvoiceAsync(Guid invoiceId);
        Task<SupplierInvoice> PostInvoiceAsync(Guid invoiceId, Guid performedByUserId);

        Task<IEnumerable<SupplierPayment>> GetPaymentsAsync(Guid companyId, string? status = null);
        Task<SupplierPayment> GetPaymentAsync(Guid paymentId);
        Task<SupplierPayment> CreatePaymentAsync(SupplierPayment payment, IReadOnlyList<SupplierPaymentAllocation>? allocations = null);
        Task<SupplierPayment> PostPaymentAsync(Guid paymentId, Guid performedByUserId);
    }
}
