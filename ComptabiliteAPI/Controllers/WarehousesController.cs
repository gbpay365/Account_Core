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
    public class WarehousesController : ControllerBase
    {
        private readonly AppDbContext _db;

        public WarehousesController(AppDbContext db) => _db = db;

        [HttpGet]
        public async Task<IActionResult> List(CancellationToken cancellationToken = default)
        {
            if (!HttpContext.Items.TryGetValue(CompanyMembershipActionFilter.ResolvedCompanyIdItemKey, out var o) || !(o is Guid cid))
                return BadRequest(new { error = "companyId is required (use ?companyId=... or X-Company-Id)." });
            return Ok(await _db.Warehouses.AsNoTracking().Where(w => w.CompanyId == cid).ToListAsync(cancellationToken));
        }



        [HttpPost]
        public async Task<IActionResult> Create([FromBody] CreateWarehouseRequest? dto)
        {
            if (dto == null)
                return BadRequest(new { error = "Request body is required." });
            if (!HttpContext.Items.TryGetValue(CompanyMembershipActionFilter.ResolvedCompanyIdItemKey, out var o) || !(o is Guid cid))
                return BadRequest(new { error = "companyId is required (use ?companyId=... or X-Company-Id)." });
            var companyId = cid;

            if (string.IsNullOrWhiteSpace(dto.Name))
                return BadRequest(new { error = "Name is required." });

            var warehouse = new Warehouse
            {
                Code = (dto.Code ?? string.Empty).Trim(),
                Name = dto.Name.Trim(),
                Location = (dto.Location ?? string.Empty).Trim(),
                IsActive = dto.IsActive,
                CompanyId = companyId
            };
            warehouse.Id = Guid.NewGuid();
            warehouse.CreatedAt = DateTime.UtcNow;
            await _db.Warehouses.AddAsync(warehouse);
            await _db.SaveChangesAsync();
            return Ok(warehouse);
        }
    }

    public class CreateWarehouseRequest
    {
        public string? Code { get; set; }
        public string? Name { get; set; }
        public string? Location { get; set; }
        public bool IsActive { get; set; } = true;
        public Guid? CompanyId { get; set; }
    }
}
