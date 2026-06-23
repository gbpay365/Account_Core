using ComptabiliteAPI.Domain.Interfaces;
using ComptabiliteAPI.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace ComptabiliteAPI.Infrastructure.Services
{
    public class PermissionService : IPermissionService
    {
        private readonly AppDbContext _context;

        public PermissionService(AppDbContext context)
        {
            _context = context;
        }

        public async Task<bool> HasPermissionAsync(Guid userId, string resource, string action)
        {
            var user = await _context.Users
                .Include(u => u.Role!)
                .ThenInclude(r => r.RolePermissions)
                .ThenInclude(rp => rp.Permission)
                .FirstOrDefaultAsync(u => u.Id == userId);

            if (user == null || user.Role == null) return false;

            return user.Role.RolePermissions.Any(rp => 
                rp.Permission.Resource == resource && 
                rp.Permission.Action == action);
        }
    }
}
