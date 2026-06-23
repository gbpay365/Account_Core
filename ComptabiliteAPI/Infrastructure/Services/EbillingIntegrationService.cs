using ComptabiliteAPI.Domain.Interfaces;
using ComptabiliteAPI.DTOs;

namespace ComptabiliteAPI.Infrastructure.Services
{
    /// <summary>CTC / e-billing placeholder — maps invoice to a conceptual payload and returns stub validation.</summary>
    public class EbillingIntegrationService : IEbillingIntegrationService
    {
        private readonly ICertificateService _certs;

        public EbillingIntegrationService(ICertificateService certs)
        {
            _certs = certs;
        }

        public async Task<InvoiceValidationResponseDto> SubmitInvoiceAsync(EbillingInvoiceSubmitDto invoice, CancellationToken cancellationToken = default)
        {
            var conceptual = $"{{\"nui\":\"{invoice.CustomerTaxId}\",\"doc\":\"{invoice.DocumentNumber}\",\"amount\":{invoice.TotalAmount}}}";
            _ = await _certs.SignPayloadAsync(conceptual, cancellationToken);

            return new InvoiceValidationResponseDto
            {
                Status = _certs.IsConfigured ? "stub_signed" : "stub_pending",
                ApprovalNumber = null,
                Message = "E-billing: DGI real-time API not configured. Payload prepared for future UBL/JSON submission."
            };
        }
    }
}
