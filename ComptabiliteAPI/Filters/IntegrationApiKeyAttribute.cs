using ComptabiliteAPI.Configuration;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.Extensions.Options;

namespace ComptabiliteAPI.Filters
{
    /// <summary>Validates X-API-Key for machine-to-machine integration endpoints.</summary>
    [AttributeUsage(AttributeTargets.Class | AttributeTargets.Method)]
    public class IntegrationApiKeyAttribute : Attribute, IAsyncActionFilter
    {
        public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
        {
            var opts = context.HttpContext.RequestServices.GetRequiredService<IOptions<IntegrationOptions>>().Value;
            if (!opts.Enabled)
            {
                context.Result = new ObjectResult(new { error = "Integrations disabled." }) { StatusCode = 503 };
                return;
            }

            var key = context.HttpContext.Request.Headers["X-API-Key"].FirstOrDefault()?.Trim();
            if (string.IsNullOrEmpty(key) || !string.Equals(key, opts.ApiKey, StringComparison.Ordinal))
            {
                context.Result = new UnauthorizedObjectResult(new { error = "Invalid integration API key." });
                return;
            }

            await next();
        }
    }
}
