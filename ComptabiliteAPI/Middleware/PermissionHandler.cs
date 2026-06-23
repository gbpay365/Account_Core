using Microsoft.AspNetCore.Authorization;
using System.Security.Claims;
using ComptabiliteAPI.Domain.Interfaces;

namespace ComptabiliteAPI.Middleware
{
    [AttributeUsage(AttributeTargets.Method | AttributeTargets.Class)]
    public class RequirePermissionAttribute : AuthorizeAttribute, IAuthorizationRequirement
    {
        public string Resource { get; }
        public string Action { get; }

        public RequirePermissionAttribute(string resource, string action)
        {
            Resource = resource;
            Action = action;
            Policy = $"{resource}:{action}";
        }
    }

    public class PermissionHandler : AuthorizationHandler<RequirePermissionAttribute>
    {
        private readonly IPermissionService _permService;

        public PermissionHandler(IPermissionService permService)
        {
            _permService = permService;
        }

        protected override async Task HandleRequirementAsync(AuthorizationHandlerContext context, RequirePermissionAttribute requirement)
        {
            var userIdStr = context.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(userIdStr) || !Guid.TryParse(userIdStr, out var userId))
            {
                return;
            }

            if (await _permService.HasPermissionAsync(userId, requirement.Resource, requirement.Action))
            {
                context.Succeed(requirement);
            }
        }
    }
    
    public class PermissionPolicyProvider : IAuthorizationPolicyProvider
    {
        public Task<AuthorizationPolicy> GetDefaultPolicyAsync() => Task.FromResult(new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build());
        public Task<AuthorizationPolicy?> GetFallbackPolicyAsync() => Task.FromResult<AuthorizationPolicy?>(null);
        public Task<AuthorizationPolicy?> GetPolicyAsync(string policyName)
        {
            var parts = policyName.Split(':');
            if (parts.Length == 2)
            {
                var policy = new AuthorizationPolicyBuilder()
                    .AddRequirements(new RequirePermissionAttribute(parts[0], parts[1]))
                    .Build();
                return Task.FromResult<AuthorizationPolicy?>(policy);
            }
            return Task.FromResult<AuthorizationPolicy?>(null);
        }
    }
}
