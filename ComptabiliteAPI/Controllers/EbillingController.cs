using ComptabiliteAPI.Configuration;
using ComptabiliteAPI.Domain.Interfaces;
using ComptabiliteAPI.DTOs;
using ComptabiliteAPI.Middleware;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using ComptabiliteAPI.Filters;

namespace ComptabiliteAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    [ServiceFilter(typeof(CompanyMembershipActionFilter))]
    public class EbillingController : ControllerBase
    {
        private readonly IEbillingIntegrationService _ebilling;
        private readonly ComplianceOptions _compliance;

        public EbillingController(IEbillingIntegrationService ebilling, IOptions<ComplianceOptions> compliance)
        {
            _ebilling = ebilling;
            _compliance = compliance.Value;
        }

        /// <summary>Phase C: visibility for e-invoicing integration (stub until DGI CTC API is live).</summary>
        [HttpGet("integration-status")]
        [RequirePermission("ecf", "read")]
        public ActionResult<object> GetIntegrationStatus() =>
            Ok(new
            {
                phase = "C",
                dgiStubMode = _compliance.DgiStubMode,
                dgiBaseUrl = _compliance.DgiBaseUrl,
                message = "E-billing: stub only; no production CTC call."
            });

        /// <summary>Stub CTC submission — prepares payload for future DGI e-billing API.</summary>
        [HttpPost("submit-invoice")]
        [RequirePermission("ecf", "write")]
        public async Task<IActionResult> SubmitInvoice([FromBody] EbillingInvoiceSubmitDto dto)
        {
            var res = await _ebilling.SubmitInvoiceAsync(dto);
            return Ok(res);
        }
    }
}
