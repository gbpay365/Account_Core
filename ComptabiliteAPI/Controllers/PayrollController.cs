using ComptabiliteAPI.Domain.Entities;
using ComptabiliteAPI.Infrastructure.Data;
using ComptabiliteAPI.Infrastructure.Services;
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
    public class PayrollController : ControllerBase
    {
        private readonly AppDbContext _dbContext;

        public PayrollController(AppDbContext dbContext)
        {
            _dbContext = dbContext;
        }

        private const string HmsEmployeeSourceMessage =
            "Employees are managed in HMS. Changes replicate one-way via the integration API.";

        [HttpGet("employees")]
        public async Task<IActionResult> GetEmployees([FromQuery] Guid companyId)
        {
            try
            {
                var employees = await _dbContext.Employees
                    .Where(e => e.CompanyId == companyId && e.IsActive && e.ExternalHmsEmployeeId != null)
                    .OrderBy(e => e.LastName)
                    .ToListAsync();

                employees = employees.Where(e => !PayrollEmployeeRules.IsExcluded(e)).ToList();

                var result = employees.Select(e => new
                {
                    e.Id,
                    e.FirstName,
                    e.LastName,
                    e.Email,
                    e.Position,
                    positionEn = e.PositionEn,
                    department = e.Department,
                    e.IndustrySector,
                    e.EmploymentType,
                    e.HireDate,
                    e.IsActive,
                    e.CompanyId,
                    e.ExternalEmployeeCode,
                });
                return Ok(result);
            }
            catch (Exception ex) { return StatusCode(500, new { error = ex.Message }); }
        }

        [HttpPost("employees")]
        public IActionResult CreateEmployee([FromBody] Employee employee)
        {
            return StatusCode(403, new { error = HmsEmployeeSourceMessage, source = "HMS" });
        }

        [HttpPut("employees/{id}")]
        public IActionResult UpdateEmployee(Guid id, [FromBody] object req)
        {
            return StatusCode(403, new { error = HmsEmployeeSourceMessage, source = "HMS" });
        }

        [HttpGet("department-summaries")]
        public async Task<IActionResult> GetDepartmentSummaries(
            [FromQuery] Guid companyId,
            [FromQuery] int? year = null,
            [FromQuery] int? month = null)
        {
            try
            {
                var query = _dbContext.PayrollDepartmentSummaries
                    .Where(s => s.CompanyId == companyId);

                if (year is > 0)
                    query = query.Where(s => s.Year == year);
                if (month is >= 1 and <= 12)
                    query = query.Where(s => s.Month == month);

                var rows = await query
                    .OrderByDescending(s => s.Year)
                    .ThenByDescending(s => s.Month)
                    .ThenBy(s => s.Department)
                    .Select(s => new
                    {
                        s.Id,
                        s.Year,
                        s.Month,
                        s.Department,
                        s.Headcount,
                        s.GrossPayroll,
                        s.NetPayroll,
                        s.EmployerCharges,
                        s.UpdatedAt,
                    })
                    .ToListAsync();

                return Ok(rows);
            }
            catch (Exception ex) { return StatusCode(500, new { error = ex.Message }); }
        }
    }
}
