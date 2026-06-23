using ComptabiliteAPI.Configuration;
using ComptabiliteAPI.Domain.Entities;
using ComptabiliteAPI.Domain.Interfaces;
using ComptabiliteAPI.DTOs;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace ComptabiliteAPI.Infrastructure.Services
{
    /// <summary>Stub DGI client — returns a synthetic receipt until real télédéclaration API is wired (Phase C).</summary>
    public class DGIClientStub : IDGIClient
    {
        private readonly ComplianceOptions _opt;
        private readonly ILogger<DGIClientStub> _log;

        public DGIClientStub(IOptions<ComplianceOptions> opt, ILogger<DGIClientStub> log)
        {
            _opt = opt.Value;
            _log = log;
        }

        public Task<FilingResultDto> SubmitDeclarationAsync(
            TaxDeclaration declaration,
            string? ediPayload,
            string? correlationId,
            CancellationToken cancellationToken = default)
        {
            var cid = correlationId ?? declaration.Id.ToString("N");
            _log.LogInformation(
                "DGI stub submit: CorrelationId={Cid} Decl={DeclId} Stub={Stub} BaseUrl={Url}",
                cid, declaration.Id, _opt.DgiStubMode, _opt.DgiBaseUrl);
            var receipt = $"STUB-DGI-{declaration.Id:N}".ToUpperInvariant();
            var result = new FilingResultDto
            {
                Success = true,
                ReceiptId = receipt,
                CorrelationId = cid,
                Message = _opt.DgiStubMode
                    ? "Stub: no production DGI call. Set Compliance:DgiStubMode=false and implement production IDGIClient when the authority publishes the API."
                    : "Production DGI path not yet implemented.",
                RawResponse = ediPayload != null ? $"payload_length={ediPayload.Length}" : null
            };
            return Task.FromResult(result);
        }
    }
}
