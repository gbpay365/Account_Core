using ComptabiliteAPI.Domain.Entities;
using ComptabiliteAPI.Infrastructure.Data;
using ComptabiliteAPI.Filters;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ComptabiliteAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    [ServiceFilter(typeof(CompanyMembershipActionFilter))]
    public class PortalsController : ControllerBase
    {
        private readonly AppDbContext _db;

        public PortalsController(AppDbContext db) => _db = db;

        [HttpGet("links")]
        public async Task<IActionResult> ListLinks([FromQuery] Guid companyId)
        {
            return Ok(await _db.PortalAccessLinks
                .Include(p => p.Customer)
                .Include(p => p.Supplier)
                .Where(p => p.CompanyId == companyId)
                .ToListAsync());
        }

        [HttpPost("links")]
        public async Task<IActionResult> CreateLink([FromBody] PortalAccessLink link)
        {
            link.Id = Guid.NewGuid();
            link.SecureToken = Guid.NewGuid().ToString("N");
            link.CreatedAt = DateTime.UtcNow;
            link.IsActive = true;
            await _db.PortalAccessLinks.AddAsync(link);
            await _db.SaveChangesAsync();
            return Ok(link);
        }
    }
}
