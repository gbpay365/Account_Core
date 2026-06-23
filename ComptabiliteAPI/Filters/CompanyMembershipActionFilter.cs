using System.Linq;
using System.Security.Claims;
using ComptabiliteAPI.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.EntityFrameworkCore;

namespace ComptabiliteAPI.Filters
{
    /// <summary>
    /// Ensures the authenticated user is linked to the company implied by the action (query <c>companyId</c> or body <c>CompanyId</c>).
    /// </summary>
    public class CompanyMembershipActionFilter : IAsyncActionFilter
    {
        public const string ResolvedCompanyIdItemKey = "CompanyMembership.ResolvedCompanyId";

        private readonly AppDbContext _db;

        public CompanyMembershipActionFilter(AppDbContext db) => _db = db;

        public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
        {
            // If the action/controller explicitly allows anonymous access, skip company membership enforcement.
            // This keeps endpoints like public PDF links functional even when the controller is otherwise protected.
            if (context.ActionDescriptor?.EndpointMetadata?.OfType<IAllowAnonymous>()?.Any() == true)
            {
                await next();
                return;
            }

            var userIdStr = context.HttpContext.User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userIdStr) || !Guid.TryParse(userIdStr, out var userId))
            {
                context.Result = new UnauthorizedResult();
                return;
            }

            if (QueryOrHeaderHasInvalidCompanyId(context))
            {
                context.Result = new BadRequestObjectResult(new
                {
                    error = "Invalid companyId. Use a valid GUID in ?companyId= or header X-Company-Id."
                });
                return;
            }

            if (!TryResolveCompanyId(context, out var companyId))
            {
                companyId = await GetDefaultCompanyIdForUserAsync(userId, context.HttpContext.RequestAborted);
                if (companyId == Guid.Empty)
                {
                    context.Result = new BadRequestObjectResult(new
                    {
                        error = "No company specified. Add ?companyId=<guid> (or X-Company-Id), and ensure your user is linked to a company."
                    });
                    return;
                }
            }

            var isMember = await _db.UserCompanies.AsNoTracking()
                .AnyAsync(uc => uc.UserId == userId && uc.CompanyId == companyId, context.HttpContext.RequestAborted);
            if (!isMember)
            {
                context.Result = new ForbidResult();
                return;
            }

            context.HttpContext.Items[ResolvedCompanyIdItemKey] = companyId;
            await next();
        }

        private async Task<Guid> GetDefaultCompanyIdForUserAsync(Guid userId, CancellationToken ct) =>
            await _db.UserCompanies.AsNoTracking()
                .Where(uc => uc.UserId == userId)
                .OrderBy(uc => uc.CompanyId)
                .Select(uc => uc.CompanyId)
                .FirstOrDefaultAsync(ct);

        private static bool QueryOrHeaderHasInvalidCompanyId(ActionExecutingContext context)
        {
            return HasInvalidId(context.HttpContext.Request.Query, "companyId", "CompanyId")
                || HasInvalidId(context.HttpContext.Request.Headers, "X-Company-Id", "Company-Id");
        }

        private static bool HasInvalidId(IQueryCollection source, params string[] keys) =>
            keys.Any(k =>
            {
                if (!source.TryGetValue(k, out var v) || string.IsNullOrWhiteSpace(v.ToString()))
                    return false;
                return !Guid.TryParse(v.ToString()!.Trim(), out var g) || g == Guid.Empty;
            });

        private static bool HasInvalidId(IHeaderDictionary source, params string[] keys) =>
            keys.Any(k =>
            {
                if (!source.TryGetValue(k, out var v) || string.IsNullOrWhiteSpace(v))
                    return false;
                return !Guid.TryParse(v.ToString()!.Trim(), out var g) || g == Guid.Empty;
            });

        private static bool TryResolveCompanyId(ActionExecutingContext context, out Guid companyId)
        {
            if (TryParseQueryCompanyId(context.HttpContext.Request.Query, out var fromQuery))
            {
                companyId = fromQuery;
                return true;
            }

            if (TryParseHeaderCompanyId(context.HttpContext.Request.Headers, out var fromHeader))
            {
                companyId = fromHeader;
                return true;
            }

            foreach (var kv in context.ActionArguments)
            {
                if (!string.Equals(kv.Key, "companyId", StringComparison.OrdinalIgnoreCase))
                    continue;
                if (kv.Value is Guid g && g != Guid.Empty)
                {
                    companyId = g;
                    return true;
                }
                if (kv.Value is string s && Guid.TryParse(s, out var gs) && gs != Guid.Empty)
                {
                    companyId = gs;
                    return true;
                }
            }

            foreach (var val in context.ActionArguments.Values)
            {
                if (val == null) continue;
                if (TryGetCompanyIdFromPoco(val, out var fromBody))
                {
                    companyId = fromBody;
                    return true;
                }
            }

            companyId = default;
            return false;
        }

        private static bool TryParseQueryCompanyId(Microsoft.AspNetCore.Http.IQueryCollection query, out Guid companyId)
        {
            foreach (var key in new[] { "companyId", "CompanyId" })
            {
                if (!query.TryGetValue(key, out var values))
                    continue;
                var raw = values.ToString();
                if (!string.IsNullOrWhiteSpace(raw) && Guid.TryParse(raw, out var qg) && qg != Guid.Empty)
                {
                    companyId = qg;
                    return true;
                }
            }

            companyId = default;
            return false;
        }

        private static bool TryGetCompanyIdFromPoco(object val, out Guid companyId)
        {
            var t = val.GetType();
            var prop = t.GetProperty("CompanyId")
                ?? t.GetProperty("companyId", System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.IgnoreCase);
            if (prop == null)
            {
                companyId = default;
                return false;
            }
            if (prop.PropertyType == typeof(Guid) && prop.GetValue(val) is Guid g && g != Guid.Empty)
            {
                companyId = g;
                return true;
            }
            if (prop.PropertyType == typeof(Guid?))
            {
                var n = (Guid?)prop.GetValue(val);
                if (n is { } ng && ng != Guid.Empty)
                {
                    companyId = ng;
                    return true;
                }
            }
            if (prop.PropertyType == typeof(string) && prop.GetValue(val) is string s
                && Guid.TryParse(s, out var ps) && ps != Guid.Empty)
            {
                companyId = ps;
                return true;
            }
            companyId = default;
            return false;
        }

        private static bool TryParseHeaderCompanyId(IHeaderDictionary headers, out Guid companyId)
        {
            foreach (var key in new[] { "X-Company-Id", "Company-Id" })
            {
                if (!headers.TryGetValue(key, out var values))
                    continue;
                var raw = values.ToString();
                if (!string.IsNullOrWhiteSpace(raw) && Guid.TryParse(raw.Trim(), out var hg) && hg != Guid.Empty)
                {
                    companyId = hg;
                    return true;
                }
            }

            companyId = default;
            return false;
        }
    }
}
