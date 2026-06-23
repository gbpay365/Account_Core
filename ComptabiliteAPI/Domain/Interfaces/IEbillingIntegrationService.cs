using ComptabiliteAPI.DTOs;

namespace ComptabiliteAPI.Domain.Interfaces
{
    public interface IEbillingIntegrationService
    {
        Task<InvoiceValidationResponseDto> SubmitInvoiceAsync(EbillingInvoiceSubmitDto invoice, CancellationToken cancellationToken = default);
    }
}
