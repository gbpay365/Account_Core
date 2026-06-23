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
    public class CrmController : ControllerBase
    {
        private readonly AppDbContext _db;

        public CrmController(AppDbContext db) => _db = db;

        [HttpGet("leads")]
        public async Task<IActionResult> ListLeads([FromQuery] Guid companyId)
        {
            return Ok(await _db.Leads.Where(l => l.CompanyId == companyId).ToListAsync());
        }

        [HttpPost("leads")]
        public async Task<IActionResult> CreateLead([FromBody] Lead lead)
        {
            lead.Id = Guid.NewGuid();
            lead.CreatedAt = DateTime.UtcNow;
            await _db.Leads.AddAsync(lead);
            await _db.SaveChangesAsync();
            return Ok(lead);
        }

        [HttpGet("quotes")]
        public async Task<IActionResult> ListQuotes([FromQuery] Guid companyId)
        {
            return Ok(await _db.SalesQuotes.Include(q => q.Customer).Where(q => q.CompanyId == companyId).ToListAsync());
        }

        [HttpPost("quotes")]
        public async Task<IActionResult> CreateQuote([FromBody] SalesQuote quote)
        {
            quote.Id = Guid.NewGuid();
            quote.CreatedAt = DateTime.UtcNow;
            foreach (var line in quote.Lines)
            {
                line.Id = Guid.NewGuid();
                line.SalesQuoteId = quote.Id;
            }
            await _db.SalesQuotes.AddAsync(quote);
            await _db.SaveChangesAsync();
            return Ok(quote);
        }
    }
}
