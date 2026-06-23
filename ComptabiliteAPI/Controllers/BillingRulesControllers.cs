using ComptabiliteAPI.DTOs;
using ComptabiliteAPI.Filters;
using ComptabiliteAPI.Infrastructure.Services;
using ComptabiliteAPI.Middleware;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ComptabiliteAPI.Controllers
{
    [ApiController]
    [Route("api/billing")]
    [Authorize]
    [ServiceFilter(typeof(CompanyMembershipActionFilter))]
    public class BillingController : ControllerBase
    {
        private readonly IBillingService _billing;

        public BillingController(IBillingService billing) => _billing = billing;

        [HttpGet("plans")]
        [RequirePermission("billing", "read")]
        public async Task<IActionResult> GetPlans(CancellationToken ct)
            => Ok(await _billing.GetPlansAsync(ct));

        [HttpGet("subscription")]
        [RequirePermission("billing", "read")]
        public async Task<IActionResult> GetSubscription([FromQuery] Guid companyId, CancellationToken ct)
        {
            var sub = await _billing.GetSubscriptionAsync(companyId, ct);
            if (sub == null) return Ok(new { status = "none" });
            return Ok(sub);
        }

        [HttpPost("subscribe")]
        [RequirePermission("billing", "write")]
        public async Task<IActionResult> Subscribe([FromBody] SubscribeRequest req, CancellationToken ct)
        {
            try
            {
                var sub = await _billing.SubscribeAsync(req.CompanyId, req.PlanId, req.BillingCycle, req.Provider, ct);
                return Ok(sub);
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        [HttpPost("cancel")]
        [RequirePermission("billing", "write")]
        public async Task<IActionResult> Cancel([FromQuery] Guid companyId, CancellationToken ct)
        {
            var sub = await _billing.CancelAsync(companyId, ct);
            if (sub == null) return NotFound(new { error = "No active subscription." });
            return Ok(sub);
        }

        [HttpGet("payments")]
        [RequirePermission("billing", "read")]
        public async Task<IActionResult> GetPayments([FromQuery] Guid companyId, CancellationToken ct)
            => Ok(await _billing.GetPaymentsAsync(companyId, ct));

        [HttpPost("checkout")]
        [RequirePermission("billing", "write")]
        public async Task<IActionResult> Checkout([FromBody] CheckoutRequest req, CancellationToken ct)
        {
            try
            {
                var payment = await _billing.CreateCheckoutAsync(req.CompanyId, req.PlanId, req.BillingCycle, req.Provider, ct);
                return Ok(new
                {
                    payment,
                    checkoutUrl = $"/billing/checkout/{payment.Id}",
                    message = "Complete payment via your chosen provider. Webhook will activate subscription."
                });
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }

        [HttpPost("webhooks/stripe")]
        [AllowAnonymous]
        public async Task<IActionResult> StripeWebhook([FromBody] WebhookPayload body, CancellationToken ct)
        {
            await _billing.HandleWebhookAsync("Stripe", body.EventType ?? "payment.completed",
                body.ExternalId ?? "", body.Amount, ct);
            return Ok(new { received = true });
        }

        [HttpPost("webhooks/paypal")]
        [AllowAnonymous]
        public async Task<IActionResult> PayPalWebhook([FromBody] WebhookPayload body, CancellationToken ct)
        {
            await _billing.HandleWebhookAsync("PayPal", body.EventType ?? "payment.completed",
                body.ExternalId ?? "", body.Amount, ct);
            return Ok(new { received = true });
        }

        public class WebhookPayload
        {
            public string? EventType { get; set; }
            public string? ExternalId { get; set; }
            public decimal? Amount { get; set; }
        }
    }

    [ApiController]
    [Route("api/rules")]
    [Authorize]
    [ServiceFilter(typeof(CompanyMembershipActionFilter))]
    public class RulesController : ControllerBase
    {
        private readonly IRulesEngineService _rules;

        public RulesController(IRulesEngineService rules) => _rules = rules;

        [HttpGet]
        [RequirePermission("rules", "read")]
        public async Task<IActionResult> List([FromQuery] Guid companyId, CancellationToken ct)
            => Ok(await _rules.ListRulesAsync(companyId, ct));

        [HttpPost]
        [RequirePermission("rules", "write")]
        public async Task<IActionResult> Create([FromBody] CreateValidationRuleRequest req, CancellationToken ct)
            => Ok(await _rules.CreateRuleAsync(req, ct));

        [HttpPut("{id:guid}")]
        [RequirePermission("rules", "write")]
        public async Task<IActionResult> Update(Guid id, [FromBody] CreateValidationRuleRequest req, CancellationToken ct)
        {
            var updated = await _rules.UpdateRuleAsync(id, req, ct);
            if (updated == null) return NotFound();
            return Ok(updated);
        }

        [HttpDelete("{id:guid}")]
        [RequirePermission("rules", "write")]
        public async Task<IActionResult> Delete(Guid id, [FromQuery] Guid companyId, CancellationToken ct)
        {
            var ok = await _rules.DeleteRuleAsync(id, companyId, ct);
            if (!ok) return NotFound();
            return NoContent();
        }

        [HttpPost("seed-defaults")]
        [RequirePermission("rules", "write")]
        public async Task<IActionResult> SeedDefaults([FromQuery] Guid companyId, CancellationToken ct)
        {
            await _rules.SeedDefaultRulesAsync(companyId, ct);
            return Ok(new { seeded = true });
        }

        [HttpGet("field-catalog")]
        [RequirePermission("rules", "read")]
        public IActionResult GetFieldCatalog()
        {
            return Ok(new[]
            {
                new { field = "max_amount", label = "Maximum entry amount", operators = new[] { "gt", "gte", "lt", "lte", "eq" } },
                new { field = "min_amount", label = "Minimum entry amount", operators = new[] { "gt", "gte", "lt", "lte", "eq" } },
                new { field = "journal_type", label = "Journal type", operators = new[] { "eq", "in", "neq", "not_in" } },
                new { field = "required_role", label = "Required role", operators = new[] { "eq", "in", "neq" } },
                new { field = "account_prefix", label = "Account prefix", operators = new[] { "in", "not_in" } },
                new { field = "line_count", label = "Number of lines", operators = new[] { "gt", "gte", "lt", "lte", "eq" } },
                new { field = "fiscal_period", label = "Fiscal period", operators = new[] { "eq", "gt", "lt" } },
            });
        }
    }
}
