using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using System.Security.Cryptography;
using ComptabiliteAPI.Domain.Entities;
using ComptabiliteAPI.DTOs;
using ComptabiliteAPI.Infrastructure.Data;
using ComptabiliteAPI.Middleware;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using ComptabiliteAPI.Filters;

namespace ComptabiliteAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class AuthController : ControllerBase
    {
        private readonly AppDbContext _context;
        private readonly IConfiguration _configuration;

        public AuthController(AppDbContext context, IConfiguration configuration)
        {
            _context = context;
            _configuration = configuration;
        }

        [HttpPost("login")]
        public async Task<IActionResult> Login([FromBody] LoginRequest request)
        {
            var loginName = (request.LoginName ?? request.Email ?? "").Trim();
            if (string.IsNullOrEmpty(loginName) || string.IsNullOrEmpty(request.Password))
                return Unauthorized("Invalid credentials.");

            var loginLower = loginName.ToLowerInvariant();
            var user = await _context.Users
                .Include(u => u.Role!)
                .ThenInclude(r => r.RolePermissions)
                .ThenInclude(rp => rp.Permission)
                .FirstOrDefaultAsync(u =>
                    u.Username.ToLower() == loginLower || u.Email.ToLower() == loginLower);

            if (user == null || !VerifyPassword(request.Password, user.PasswordHash))
                return Unauthorized("Invalid credentials.");

            return Ok(new { accessToken = CreateJwt(user) });
        }

        [HttpGet("me")]
        [Authorize]
        public async Task<IActionResult> GetMe()
        {
            var userId = GetCurrentUserId();
            if (userId == null) return Unauthorized();

            var user = await _context.Users
                .AsNoTracking()
                .Include(u => u.Role)
                .FirstOrDefaultAsync(u => u.Id == userId);
            if (user == null) return NotFound();

            return Ok(new
            {
                user.Id,
                user.Username,
                user.Email,
                user.FullName,
                user.RoleId,
                roleName = user.Role?.Name
            });
        }

        [HttpPost("change-password")]
        [Authorize]
        public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordRequest body)
        {
            if (body == null || string.IsNullOrWhiteSpace(body.CurrentPassword) || string.IsNullOrWhiteSpace(body.NewPassword))
                return BadRequest(new { error = "Current and new password are required." });
            if (body.NewPassword.Length < 8)
                return BadRequest(new { error = "New password must be at least 8 characters." });

            var userId = GetCurrentUserId();
            if (userId == null) return Unauthorized();

            var user = await _context.Users.FirstOrDefaultAsync(u => u.Id == userId);
            if (user == null) return NotFound();

            if (!VerifyPassword(body.CurrentPassword, user.PasswordHash))
                return BadRequest(new { error = "Current password is incorrect." });

            user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(body.NewPassword, 12);
            await _context.SaveChangesAsync();
            return Ok(new { message = "Password updated." });
        }

        private string CreateJwt(User user)
        {
            var tokenHandler = new JwtSecurityTokenHandler();
            var jwtKey = ResolveJwtKey();
            var key = Encoding.UTF8.GetBytes(jwtKey);

            var claims = new List<Claim>
            {
                new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
                new Claim(ClaimTypes.Email, user.Email),
                new Claim(ClaimTypes.Name, user.FullName),
                new Claim("username", user.Username)
            };

            var issuer = _configuration["Jwt:Issuer"] ?? "ComptabiliteAPI";
            var audience = _configuration["Jwt:Audience"] ?? "ComptabiliteReact";

            var tokenDescriptor = new SecurityTokenDescriptor
            {
                Subject = new ClaimsIdentity(claims),
                Expires = DateTime.UtcNow.AddHours(8),
                Issuer = issuer,
                Audience = audience,
                SigningCredentials = new SigningCredentials(new SymmetricSecurityKey(key), SecurityAlgorithms.HmacSha256Signature)
            };

            return tokenHandler.WriteToken(tokenHandler.CreateToken(tokenDescriptor));
        }

        private Guid? GetCurrentUserId()
        {
            var userIdStr = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            return Guid.TryParse(userIdStr, out var userId) ? userId : null;
        }

        private string ResolveJwtKey()
        {
            var fromConfig = _configuration["Jwt:Key"];
            if (!string.IsNullOrWhiteSpace(fromConfig) && !fromConfig.StartsWith("${"))
                return fromConfig;
            var fromEnv = Environment.GetEnvironmentVariable("JWT_KEY");
            if (!string.IsNullOrWhiteSpace(fromEnv))
                return fromEnv;
            throw new InvalidOperationException("JWT Key must be configured via environment variable");
        }

        private static bool VerifyPassword(string providedPassword, string storedPassword)
        {
            if (string.IsNullOrEmpty(storedPassword))
                return false;

            if (storedPassword.StartsWith("$2"))
                return BCrypt.Net.BCrypt.Verify(providedPassword, storedPassword);

            return CryptographicOperations.FixedTimeEquals(
                Encoding.UTF8.GetBytes(providedPassword),
                Encoding.UTF8.GetBytes(storedPassword)
            );
        }

        [HttpGet("permissions")]
        [Authorize]
        public async Task<IActionResult> GetPermissions()
        {
            var userId = GetCurrentUserId();
            if (userId == null) return Unauthorized();

            var user = await _context.Users
                .Include(u => u.Role!)
                .ThenInclude(r => r.RolePermissions)
                .ThenInclude(rp => rp.Permission)
                .FirstOrDefaultAsync(u => u.Id == userId);

            if (user?.Role == null) return Ok(new List<string>());

            var perms = user.Role.RolePermissions
                .Select(rp => $"{rp.Permission.Resource}:{rp.Permission.Action}")
                .ToList();

            return Ok(perms);
        }

        [HttpGet("users")]
        [Authorize]
        [RequirePermission("access", "read")]
        [ServiceFilter(typeof(CompanyMembershipActionFilter))]
        public async Task<IActionResult> GetUsers([FromQuery] Guid companyId)
        {
            var inCompany = await _context.UserCompanies
                .AsNoTracking()
                .Where(uc => uc.CompanyId == companyId)
                .Select(uc => uc.UserId)
                .Distinct()
                .ToListAsync();
            if (inCompany.Count == 0) return Ok(Array.Empty<object>());

            var list = await _context.Users
                .AsNoTracking()
                .Include(u => u.Role)
                .Where(u => inCompany.Contains(u.Id))
                .OrderBy(u => u.FullName)
                .ToListAsync();
            return Ok(list.Select(u => new
            {
                u.Id,
                u.Username,
                u.Email,
                u.FullName,
                u.RoleId,
                role = u.Role == null ? null : new { u.Role.Id, u.Role.Name }
            }));
        }

        [HttpGet("roles")]
        [Authorize]
        [RequirePermission("access", "read")]
        public async Task<IActionResult> GetRoles()
        {
            var roles = await _context.Roles
                .AsNoTracking()
                .Include(r => r.RolePermissions)
                .ThenInclude(rp => rp.Permission)
                .OrderBy(r => r.Name)
                .ToListAsync();
            return Ok(roles.Select(r => new
            {
                r.Id,
                r.Name,
                rolePermissions = r.RolePermissions.Select(rp => new
                {
                    rp.PermissionId,
                    rp.Permission.Resource,
                    rp.Permission.Action,
                    key = $"{rp.Permission.Resource}:{rp.Permission.Action}"
                })
            }));
        }

        [HttpGet("permissions/catalog")]
        [Authorize]
        [RequirePermission("access", "read")]
        public async Task<IActionResult> GetPermissionCatalog()
        {
            var perms = await _context.Permissions.AsNoTracking()
                .OrderBy(p => p.Resource).ThenBy(p => p.Action)
                .Select(p => new PermissionCatalogItemDto
                {
                    Id = p.Id, Resource = p.Resource, Action = p.Action,
                    Key = p.Resource + ":" + p.Action
                })
                .ToListAsync();
            return Ok(perms);
        }

        [HttpGet("roles/{roleId:guid}/permissions")]
        [Authorize]
        [RequirePermission("access", "read")]
        public async Task<IActionResult> GetRolePermissions(Guid roleId)
        {
            var role = await _context.Roles.AsNoTracking()
                .Include(r => r.RolePermissions).ThenInclude(rp => rp.Permission)
                .FirstOrDefaultAsync(r => r.Id == roleId);
            if (role == null) return NotFound();
            return Ok(new RolePermissionsDto
            {
                RoleId = role.Id,
                RoleName = role.Name,
                Permissions = role.RolePermissions.Select(rp => new PermissionCatalogItemDto
                {
                    Id = rp.Permission.Id, Resource = rp.Permission.Resource,
                    Action = rp.Permission.Action, Key = $"{rp.Permission.Resource}:{rp.Permission.Action}"
                }).ToList()
            });
        }

        [HttpPut("roles/{roleId:guid}/permissions")]
        [Authorize]
        [RequirePermission("access", "write")]
        public async Task<IActionResult> UpdateRolePermissions(Guid roleId, [FromBody] UpdateRolePermissionsRequest body)
        {
            var role = await _context.Roles.Include(r => r.RolePermissions)
                .FirstOrDefaultAsync(r => r.Id == roleId);
            if (role == null) return NotFound();

            var validIds = await _context.Permissions.AsNoTracking()
                .Where(p => body.PermissionIds.Contains(p.Id))
                .Select(p => p.Id)
                .ToListAsync();

            _context.RolePermissions.RemoveRange(role.RolePermissions);
            foreach (var pid in validIds)
                await _context.RolePermissions.AddAsync(new RolePermission { RoleId = roleId, PermissionId = pid });

            await _context.SaveChangesAsync();
            return Ok(new { roleId, permissionCount = validIds.Count });
        }

        [HttpPatch("users/{userId:guid}/role")]
        [Authorize]
        [RequirePermission("access", "write")]
        [ServiceFilter(typeof(CompanyMembershipActionFilter))]
        public async Task<IActionResult> UpdateUserRole(Guid userId, [FromBody] UpdateUserRoleRequest body, [FromQuery] Guid companyId)
        {
            if (!await _context.Roles.AnyAsync(r => r.Id == body.RoleId))
                return BadRequest(new { error = "Invalid role." });

            var inCompany = await _context.UserCompanies.AnyAsync(uc => uc.UserId == userId && uc.CompanyId == companyId);
            if (!inCompany) return BadRequest(new { error = "User is not in this company." });

            var user = await _context.Users.FirstOrDefaultAsync(u => u.Id == userId);
            if (user == null) return NotFound();

            user.RoleId = body.RoleId;
            await _context.SaveChangesAsync();
            return Ok(new { user.Id, user.RoleId });
        }

        [HttpPost("users/{userId:guid}/reset-password")]
        [Authorize]
        [RequirePermission("access", "write")]
        [ServiceFilter(typeof(CompanyMembershipActionFilter))]
        public async Task<IActionResult> ResetUserPassword(Guid userId, [FromBody] ResetPasswordRequest? body, [FromQuery] Guid companyId)
        {
            var inCompany = await _context.UserCompanies.AnyAsync(uc => uc.UserId == userId && uc.CompanyId == companyId);
            if (!inCompany) return BadRequest(new { error = "User is not in this company." });

            var user = await _context.Users.FirstOrDefaultAsync(u => u.Id == userId);
            if (user == null) return NotFound();

            var password = string.IsNullOrWhiteSpace(body?.NewPassword)
                ? Guid.NewGuid().ToString("N")[..12]
                : body!.NewPassword!;

            if (password.Length < 8)
                return BadRequest(new { error = "Password must be at least 8 characters." });

            user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(password, 12);
            await _context.SaveChangesAsync();

            return Ok(new
            {
                user.Id,
                temporaryPassword = string.IsNullOrWhiteSpace(body?.NewPassword) ? password : (string?)null,
                message = "Password reset."
            });
        }

        [HttpPost("roles")]
        [Authorize]
        [RequirePermission("access", "write")]
        public async Task<IActionResult> CreateRole([FromBody] CreateRoleRequest body)
        {
            if (body == null || string.IsNullOrWhiteSpace(body.Name))
                return BadRequest(new { error = "Name is required." });
            var name = body.Name.Trim();
            if (await _context.Roles.AnyAsync(r => r.Name == name))
                return BadRequest(new { error = "A role with this name already exists." });
            var role = new Role { Name = name };
            await _context.Roles.AddAsync(role);
            await _context.SaveChangesAsync();
            return Ok(new { role.Id, role.Name, rolePermissionCount = 0 });
        }

        [HttpPost("users")]
        [Authorize]
        [RequirePermission("access", "write")]
        [ServiceFilter(typeof(CompanyMembershipActionFilter))]
        public async Task<IActionResult> CreateUser([FromBody] CreateUserInviteRequest body)
        {
            if (body == null || string.IsNullOrWhiteSpace(body.FullName))
                return BadRequest(new { error = "Full name is required." });
            if (string.IsNullOrWhiteSpace(body.Username))
                return BadRequest(new { error = "Login name is required." });
            if (body.CompanyId == Guid.Empty || !await _context.Companies.AnyAsync(c => c.Id == body.CompanyId))
                return BadRequest(new { error = "Valid companyId is required." });
            if (body.RoleId == Guid.Empty || !await _context.Roles.AnyAsync(r => r.Id == body.RoleId))
                return BadRequest(new { error = "Valid roleId is required." });

            var username = body.Username.Trim().ToLowerInvariant();
            if (!IsValidUsername(username))
                return BadRequest(new { error = "Login name must be 3–32 characters: letters, numbers, dots, underscores, or hyphens." });

            if (await _context.Users.AnyAsync(u => u.Username.ToLower() == username))
                return BadRequest(new { error = "A user with this login name already exists." });

            var email = string.IsNullOrWhiteSpace(body.Email) ? "" : body.Email.Trim();
            if (!string.IsNullOrEmpty(email) && await _context.Users.AnyAsync(u => u.Email == email))
                return BadRequest(new { error = "A user with this email already exists." });

            var password = string.IsNullOrWhiteSpace(body.Password)
                ? Guid.NewGuid().ToString("N")[..12]
                : body.Password!;

            if (password.Length < 8)
                return BadRequest(new { error = "Password must be at least 8 characters." });

            var user = new User
            {
                Id = Guid.NewGuid(),
                Username = username,
                Email = email,
                FullName = body.FullName.Trim(),
                PasswordHash = BCrypt.Net.BCrypt.HashPassword(password, 12),
                RoleId = body.RoleId
            };
            await _context.Users.AddAsync(user);
            await _context.SaveChangesAsync();
            if (!await _context.UserCompanies.AnyAsync(uc => uc.CompanyId == body.CompanyId && uc.UserId == user.Id))
            {
                await _context.UserCompanies.AddAsync(new UserCompany
                {
                    UserId = user.Id,
                    CompanyId = body.CompanyId,
                    AccessLevel = "edit"
                });
                await _context.SaveChangesAsync();
            }
            return Ok(new
            {
                user.Id,
                user.Username,
                user.Email,
                user.FullName,
                temporaryPassword = string.IsNullOrWhiteSpace(body.Password) ? password : (string?)null
            });
        }

        private static bool IsValidUsername(string username)
        {
            if (username.Length < 3 || username.Length > 32) return false;
            foreach (var c in username)
            {
                if (char.IsLetterOrDigit(c) || c is '.' or '_' or '-') continue;
                return false;
            }
            return true;
        }
    }

    public class CreateRoleRequest
    {
        public string Name { get; set; } = "";
    }

    public class CreateUserInviteRequest
    {
        public string FullName { get; set; } = "";
        public string Username { get; set; } = "";
        public string Email { get; set; } = "";
        public Guid RoleId { get; set; }
        public Guid CompanyId { get; set; }
        public string? Password { get; set; }
    }

    public class LoginRequest
    {
        public string LoginName { get; set; } = string.Empty;
        /// <summary>Deprecated — use LoginName.</summary>
        public string Email { get; set; } = string.Empty;
        public string Password { get; set; } = string.Empty;
    }

    public class ChangePasswordRequest
    {
        public string CurrentPassword { get; set; } = "";
        public string NewPassword { get; set; } = "";
    }

    public class ResetPasswordRequest
    {
        public string? NewPassword { get; set; }
    }
}
