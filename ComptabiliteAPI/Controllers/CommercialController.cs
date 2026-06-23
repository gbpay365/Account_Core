using ComptabiliteAPI.Domain.Entities;
using ComptabiliteAPI.Domain.Interfaces;
using ComptabiliteAPI.Filters;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System;
using System.Linq;
using System.Threading.Tasks;

namespace ComptabiliteAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    [ServiceFilter(typeof(CompanyMembershipActionFilter))]
    public class CommercialController : ControllerBase
    {
        private readonly ICommercialService _commercialService;

        private const string HmsProductSourceMessage =
            "Products are managed in HMS (service catalog & stock). Changes replicate one-way via the integration API.";

        public CommercialController(ICommercialService commercialService)
        {
            _commercialService = commercialService;
        }

        // ─── PRODUCTS (read-only in UI — master data from HMS integration) ───────
        [HttpGet("products")]
        public async Task<IActionResult> GetProducts([FromQuery] Guid companyId)
        {
            try
            {
                var products = await _commercialService.GetProductsAsync(companyId);
                var result = products.Select(p => new
                {
                    p.Id,
                    p.Code,
                    p.NameEn,
                    p.NameFr,
                    p.Description,
                    p.UnitPrice,
                    p.TaxRate,
                    p.StockQuantity,
                    p.ReorderThreshold,
                    p.ValuationMethod,
                    p.IsActive,
                    p.CompanyId,
                    Family = p.Family == null ? null : new { p.Family.Id, p.Family.NameEn, p.Family.NameFr }
                });
                return Ok(result);
            }
            catch (Exception ex) { return StatusCode(500, new { error = ex.Message }); }
        }

        [HttpPost("products")]
        public IActionResult CreateProduct([FromBody] CreateProductDto dto)
        {
            return StatusCode(403, new { error = HmsProductSourceMessage, source = "HMS" });
        }

        [HttpPut("products/{id}")]
        public IActionResult UpdateProduct(Guid id, [FromBody] Product product)
        {
            return StatusCode(403, new { error = HmsProductSourceMessage, source = "HMS" });
        }

        [HttpDelete("products/{id}")]
        public IActionResult DeleteProduct(Guid id)
        {
            return StatusCode(403, new { error = HmsProductSourceMessage, source = "HMS" });
        }

        [HttpGet("product-families")]
        public async Task<IActionResult> GetProductFamilies([FromQuery] Guid companyId)
        {
            try
            {
                var families = await _commercialService.GetProductFamiliesAsync(companyId);
                return Ok(families.Select(f => new { f.Id, f.NameEn, f.NameFr }));
            }
            catch (Exception ex) { return StatusCode(500, new { error = ex.Message }); }
        }

        // ─── CUSTOMERS ───────────────────────────────────────────────────────────
        [HttpGet("customers")]
        public async Task<IActionResult> GetCustomers([FromQuery] Guid companyId)
        {
            try
            {
                var customers = await _commercialService.GetCustomersAsync(companyId);
                var result = customers.Select(c => new
                {
                    c.Id,
                    c.AccountCode,
                    c.Name,
                    c.Email,
                    c.Phone,
                    c.Address,
                    c.CreditLimit,
                    c.CurrentOutstanding,
                    c.CompanyId
                });
                return Ok(result);
            }
            catch (Exception ex) { return StatusCode(500, new { error = ex.Message }); }
        }

        [HttpPost("customers")]
        public async Task<IActionResult> CreateCustomer([FromBody] CreateCustomerDto dto)
        {
            try
            {
                var customer = new Customer
                {
                    CompanyId = dto.CompanyId,
                    Name = dto.Name,
                    AccountCode = dto.AccountCode ?? string.Empty,
                    Email = dto.Email ?? string.Empty,
                    Phone = dto.Phone ?? string.Empty,
                    Address = dto.Address ?? string.Empty,
                    CreditLimit = dto.CreditLimit
                };
                var created = await _commercialService.CreateCustomerAsync(customer);
                return Ok(new { created.Id, created.AccountCode, created.Name, created.Email, created.Phone, created.Address, created.CreditLimit, created.CurrentOutstanding });
            }
            catch (Exception ex) { return StatusCode(500, new { error = ex.Message }); }
        }
        [HttpPut("customers/{id}")]
        public async Task<IActionResult> UpdateCustomer(Guid id, [FromBody] Customer customer)
        {
            try
            {
                customer.Id = id;
                var updated = await _commercialService.UpdateCustomerAsync(customer);
                return Ok(updated);
            }
            catch (Exception ex) { return StatusCode(500, new { error = ex.Message }); }
        }

        [HttpDelete("customers/{id}")]
        public async Task<IActionResult> DeleteCustomer(Guid id)
        {
            try
            {
                await _commercialService.DeleteCustomerAsync(id);
                return NoContent();
            }
            catch (Exception ex) { return StatusCode(500, new { error = ex.Message }); }
        }

        // ─── SUPPLIERS ───────────────────────────────────────────────────────────
        [HttpGet("suppliers")]
        public async Task<IActionResult> GetSuppliers([FromQuery] Guid companyId)
        {
            try
            {
                var suppliers = await _commercialService.GetSuppliersAsync(companyId);
                var result = suppliers.Select(s => new
                {
                    s.Id,
                    s.AccountCode,
                    s.Name,
                    s.Email,
                    s.Phone,
                    s.Address,
                    s.ContactPerson,
                    s.TaxId,
                    s.CurrentBalance,
                    s.CompanyId,
                    s.CreatedAt
                });
                return Ok(result);
            }
            catch (Exception ex) { return StatusCode(500, new { error = ex.Message }); }
        }

        [HttpPost("suppliers")]
        public async Task<IActionResult> CreateSupplier([FromBody] Supplier supplier)
        {
            try
            {
                if (supplier.CompanyId == Guid.Empty)
                    return BadRequest(new { error = "companyId is required" });
                if (string.IsNullOrWhiteSpace(supplier.Name))
                    return BadRequest(new { error = "Name is required" });
                supplier.Id = Guid.NewGuid();
                if (string.IsNullOrWhiteSpace(supplier.AccountCode))
                {
                    var list = (await _commercialService.GetSuppliersAsync(supplier.CompanyId)).ToList();
                    var n = list.Count + 1;
                    supplier.AccountCode = "401" + n.ToString("D4");
                }
                supplier.Name = supplier.Name.Trim();
                supplier.AccountCode = supplier.AccountCode.Trim();
                supplier.Email = (supplier.Email ?? string.Empty).Trim();
                supplier.Phone = (supplier.Phone ?? string.Empty).Trim();
                supplier.Address = (supplier.Address ?? string.Empty).Trim();
                supplier.ContactPerson = (supplier.ContactPerson ?? string.Empty).Trim();
                supplier.TaxId = (supplier.TaxId ?? string.Empty).Trim();
                var created = await _commercialService.CreateSupplierAsync(supplier);
                return Ok(new
                {
                    created.Id,
                    created.Name,
                    created.AccountCode,
                    created.Email,
                    created.Phone,
                    created.Address,
                    created.ContactPerson,
                    created.TaxId,
                    created.CurrentBalance,
                    created.CompanyId
                });
            }
            catch (Exception ex) { return StatusCode(500, new { error = ex.Message }); }
        }

        // ─── SALES DOCUMENTS ─────────────────────────────────────────────────────
        [HttpGet("sales")]
        public async Task<IActionResult> GetSalesDocuments([FromQuery] Guid companyId, [FromQuery] string? status = null)
        {
            try
            {
                var docs = await _commercialService.GetSalesDocumentsAsync(companyId, status);
                var result = docs.Select(d => new
                {
                    d.Id,
                    d.DocumentNumber,
                    d.DocumentType,
                    d.Status,
                    d.IssueDate,
                    d.TotalHT,
                    d.TotalTVA,
                    d.TotalTTC,
                    d.Notes,
                    d.CompanyId,
                    Customer = d.Customer == null ? null : new
                    {
                        d.Customer.Id,
                        d.Customer.Name,
                        d.Customer.Email,
                        d.Customer.Phone
                    }
                });
                return Ok(result);
            }
            catch (Exception ex) { return StatusCode(500, new { error = ex.Message }); }
        }

        [HttpGet("sales/{id}")]
        public async Task<IActionResult> GetSalesDocument(Guid id)
        {
            try
            {
                var doc = await _commercialService.GetSalesDocumentAsync(id);
                var result = new
                {
                    doc.Id,
                    doc.DocumentNumber,
                    doc.DocumentType,
                    doc.Status,
                    doc.IssueDate,
                    doc.TotalHT,
                    doc.TotalTVA,
                    doc.TotalTTC,
                    doc.Notes,
                    doc.CompanyId,
                    Customer = doc.Customer == null ? null : new { doc.Customer.Id, doc.Customer.Name, doc.Customer.Email },
                    Lines = doc.Lines?.Select(l => new
                    {
                        l.Id,
                        l.Quantity,
                        l.UnitPrice,
                        l.DiscountRate,
                        l.TotalLine,
                        Product = l.Product == null ? null : new { l.Product.Id, l.Product.NameEn, l.Product.Code }
                    })
                };
                return Ok(result);
            }
            catch (Exception ex) { return StatusCode(500, new { error = ex.Message }); }
        }

        [HttpPost("sales/quote")]
        public async Task<IActionResult> CreateQuote([FromBody] CreateQuoteDto dto)
        {
            try
            {
                var document = new SalesDocument
                {
                    CompanyId = dto.CompanyId,
                    CustomerId = dto.CustomerId,
                    DocumentNumber = dto.DocumentNumber,
                    IssueDate = dto.IssueDate,
                    Notes = dto.Notes ?? string.Empty,
                    Lines = dto.Lines.Select(l => new SalesDocumentLine
                    {
                        ProductId = l.ProductId,
                        Quantity = l.Quantity,
                        UnitPrice = l.UnitPrice,
                        DiscountRate = l.DiscountRate,
                        TotalLine = l.TotalLine
                    }).ToList()
                };

                var created = await _commercialService.CreateQuoteAsync(document);
                return Ok(new
                {
                    created.Id,
                    created.DocumentNumber,
                    created.DocumentType,
                    created.Status,
                    created.TotalHT,
                    created.TotalTVA,
                    created.TotalTTC
                });
            }
            catch (Exception ex) { return StatusCode(500, new { error = ex.Message }); }
        }

        [HttpPost("sales/{id}/transform-order")]
        public async Task<IActionResult> TransformToOrder(Guid id)
        {
            try
            {
                var doc = await _commercialService.TransformToOrderAsync(id);
                return Ok(new { doc.Id, doc.DocumentNumber, doc.DocumentType, doc.Status, doc.TotalTTC });
            }
            catch (Exception ex) { return StatusCode(500, new { error = ex.Message }); }
        }

        [HttpPost("sales/{id}/transform-invoice")]
        public async Task<IActionResult> TransformToInvoice(Guid id)
        {
            try
            {
                var userIdStr = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
                if (string.IsNullOrWhiteSpace(userIdStr) || !Guid.TryParse(userIdStr, out var userId) || userId == Guid.Empty)
                    return Unauthorized();

                var doc = await _commercialService.TransformToInvoiceAsync(id, userId);
                return Ok(new { doc.Id, doc.DocumentNumber, doc.DocumentType, doc.Status, doc.TotalTTC });
            }
            catch (Exception ex) { return StatusCode(500, new { error = ex.Message }); }
        }

        [HttpPatch("sales/{id}/status")]
        public async Task<IActionResult> PatchSalesDocumentStatus(Guid id, [FromBody] SalesStatusUpdate update)
        {
            try
            {
                await _commercialService.UpdateSalesDocumentStatusAsync(id, update.Status);
                return Ok(new { id, update.Status });
            }
            catch (Exception ex) { return StatusCode(500, new { error = ex.Message }); }
        }
    }

    public class SalesStatusUpdate
    {
        public string Status { get; set; } = string.Empty;
    }

    public class CreateQuoteDto
    {
        public Guid CompanyId { get; set; }
        public Guid CustomerId { get; set; }
        public string DocumentNumber { get; set; } = string.Empty;
        public DateTime IssueDate { get; set; }
        public string? Notes { get; set; }
        public List<CreateQuoteLineDto> Lines { get; set; } = new();
    }

    public class CreateQuoteLineDto
    {
        public Guid ProductId { get; set; }
        public decimal Quantity { get; set; }
        public decimal UnitPrice { get; set; }
        public decimal DiscountRate { get; set; }
        public decimal TotalLine { get; set; }
    }

    public class CreateCustomerDto
    {
        public Guid CompanyId { get; set; }
        public string Name { get; set; } = string.Empty;
        public string? AccountCode { get; set; }
        public string? Email { get; set; }
        public string? Phone { get; set; }
        public string? Address { get; set; }
        public decimal? CreditLimit { get; set; }
    }

    public class CreateProductDto
    {
        public Guid CompanyId { get; set; }
        public string NameEn { get; set; } = string.Empty;
        public string NameFr { get; set; } = string.Empty;
        public string? Code { get; set; }
        public decimal UnitPrice { get; set; }
        public decimal StockQuantity { get; set; }
    }
}
