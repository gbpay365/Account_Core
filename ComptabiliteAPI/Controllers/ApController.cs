using ComptabiliteAPI.Domain.Entities;
using ComptabiliteAPI.Domain.Interfaces;
using ComptabiliteAPI.Filters;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace ComptabiliteAPI.Controllers
{
    [ApiController]
    [Route("api/ap")]
    [Authorize]
    [ServiceFilter(typeof(CompanyMembershipActionFilter))]
    public class ApController : ControllerBase
    {
        private readonly IApService _ap;

        public ApController(IApService ap) => _ap = ap;

        private bool TryGetUserId(out Guid userId)
        {
            userId = Guid.Empty;
            var raw = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            return !string.IsNullOrWhiteSpace(raw) && Guid.TryParse(raw, out userId) && userId != Guid.Empty;
        }

        [HttpGet("invoices")]
        public async Task<IActionResult> GetInvoices([FromQuery] Guid companyId, [FromQuery] string? status = null)
        {
            try
            {
                var invoices = await _ap.GetInvoicesAsync(companyId, status);
                return Ok(invoices.Select(MapInvoiceList));
            }
            catch (Exception ex) { return StatusCode(500, new { error = ex.Message }); }
        }

        [HttpGet("invoices/{id}")]
        public async Task<IActionResult> GetInvoice(Guid id)
        {
            try
            {
                var invoice = await _ap.GetInvoiceAsync(id);
                return Ok(MapInvoiceDetail(invoice));
            }
            catch (Exception ex) { return StatusCode(500, new { error = ex.Message }); }
        }

        [HttpPost("invoices")]
        public async Task<IActionResult> CreateInvoice([FromBody] CreateSupplierInvoiceDto dto)
        {
            try
            {
                var invoice = new SupplierInvoice
                {
                    SupplierId = dto.SupplierId,
                    InvoiceNumber = dto.InvoiceNumber ?? string.Empty,
                    IssueDate = dto.IssueDate,
                    DueDate = dto.DueDate,
                    Notes = dto.Notes ?? string.Empty,
                    Lines = dto.Lines.Select((l, i) => new SupplierInvoiceLine
                    {
                        LineNumber = i + 1,
                        Description = l.Description,
                        ExpenseAccountCode = l.ExpenseAccountCode ?? "604700",
                        AmountHt = l.AmountHt,
                        VatRate = l.VatRate,
                        WithholdingRate = l.WithholdingRate,
                        WithholdingAmount = l.WithholdingAmount,
                    }).ToList(),
                };

                var created = await _ap.CreateInvoiceAsync(invoice);
                return Ok(MapInvoiceDetail(created));
            }
            catch (Exception ex) { return StatusCode(500, new { error = ex.Message }); }
        }

        [HttpPut("invoices/{id}")]
        public async Task<IActionResult> UpdateInvoice(Guid id, [FromBody] CreateSupplierInvoiceDto dto)
        {
            try
            {
                var invoice = new SupplierInvoice
                {
                    Id = id,
                    SupplierId = dto.SupplierId,
                    InvoiceNumber = dto.InvoiceNumber ?? string.Empty,
                    IssueDate = dto.IssueDate,
                    DueDate = dto.DueDate,
                    Notes = dto.Notes ?? string.Empty,
                    Lines = dto.Lines.Select((l, i) => new SupplierInvoiceLine
                    {
                        LineNumber = i + 1,
                        Description = l.Description,
                        ExpenseAccountCode = l.ExpenseAccountCode ?? "604700",
                        AmountHt = l.AmountHt,
                        VatRate = l.VatRate,
                        WithholdingRate = l.WithholdingRate,
                        WithholdingAmount = l.WithholdingAmount,
                    }).ToList(),
                };

                var updated = await _ap.UpdateInvoiceAsync(invoice);
                return Ok(MapInvoiceDetail(updated));
            }
            catch (Exception ex) { return StatusCode(500, new { error = ex.Message }); }
        }

        [HttpDelete("invoices/{id}")]
        public async Task<IActionResult> DeleteInvoice(Guid id)
        {
            try
            {
                await _ap.DeleteInvoiceAsync(id);
                return NoContent();
            }
            catch (Exception ex) { return StatusCode(500, new { error = ex.Message }); }
        }

        [HttpPost("invoices/{id}/post")]
        public async Task<IActionResult> PostInvoice(Guid id)
        {
            try
            {
                if (!TryGetUserId(out var userId))
                    return Unauthorized();

                var posted = await _ap.PostInvoiceAsync(id, userId);
                return Ok(MapInvoiceDetail(posted));
            }
            catch (Exception ex) { return StatusCode(500, new { error = ex.Message }); }
        }

        [HttpGet("payments")]
        public async Task<IActionResult> GetPayments([FromQuery] Guid companyId, [FromQuery] string? status = null)
        {
            try
            {
                var payments = await _ap.GetPaymentsAsync(companyId, status);
                return Ok(payments.Select(MapPaymentList));
            }
            catch (Exception ex) { return StatusCode(500, new { error = ex.Message }); }
        }

        [HttpGet("payments/{id}")]
        public async Task<IActionResult> GetPayment(Guid id)
        {
            try
            {
                var payment = await _ap.GetPaymentAsync(id);
                return Ok(MapPaymentDetail(payment));
            }
            catch (Exception ex) { return StatusCode(500, new { error = ex.Message }); }
        }

        [HttpPost("payments")]
        public async Task<IActionResult> CreatePayment([FromBody] CreateSupplierPaymentDto dto)
        {
            try
            {
                var payment = new SupplierPayment
                {
                    SupplierId = dto.SupplierId,
                    PaymentDate = dto.PaymentDate,
                    Amount = dto.Amount,
                    Reference = dto.Reference ?? string.Empty,
                    PaymentMethod = dto.PaymentMethod ?? "transfer",
                    BankAccountCode = dto.BankAccountCode ?? string.Empty,
                };

                var allocations = dto.Allocations?
                    .Select(a => new SupplierPaymentAllocation
                    {
                        SupplierInvoiceId = a.SupplierInvoiceId,
                        Amount = a.Amount,
                    })
                    .ToList();

                var created = await _ap.CreatePaymentAsync(payment, allocations);
                return Ok(MapPaymentDetail(created));
            }
            catch (Exception ex) { return StatusCode(500, new { error = ex.Message }); }
        }

        [HttpPost("payments/{id}/post")]
        public async Task<IActionResult> PostPayment(Guid id)
        {
            try
            {
                if (!TryGetUserId(out var userId))
                    return Unauthorized();

                var posted = await _ap.PostPaymentAsync(id, userId);
                return Ok(MapPaymentDetail(posted));
            }
            catch (Exception ex) { return StatusCode(500, new { error = ex.Message }); }
        }

        private static object MapInvoiceList(SupplierInvoice i) => new
        {
            i.Id,
            i.InvoiceNumber,
            i.IssueDate,
            i.DueDate,
            i.Status,
            i.TotalHT,
            i.TotalTVA,
            i.AmountTtc,
            i.PaidAmount,
            OpenAmount = i.AmountTtc - i.PaidAmount,
            i.JournalEntryId,
            Supplier = i.Supplier == null ? null : new { i.Supplier.Id, i.Supplier.Name, i.Supplier.AccountCode },
        };

        private static object MapInvoiceDetail(SupplierInvoice i) => new
        {
            i.Id,
            i.SupplierId,
            i.InvoiceNumber,
            i.IssueDate,
            i.DueDate,
            i.Status,
            i.TotalHT,
            i.TotalTVA,
            i.AmountTtc,
            i.PaidAmount,
            OpenAmount = i.AmountTtc - i.PaidAmount,
            i.Notes,
            i.JournalEntryId,
            Supplier = i.Supplier == null ? null : new { i.Supplier.Id, i.Supplier.Name, i.Supplier.AccountCode },
            Lines = i.Lines.OrderBy(l => l.LineNumber).Select(l => new
            {
                l.Id,
                l.LineNumber,
                l.Description,
                l.ExpenseAccountCode,
                l.AmountHt,
                l.VatRate,
                l.VatAmount,
                l.WithholdingRate,
                l.WithholdingAmount,
            }),
        };

        private static object MapPaymentList(SupplierPayment p) => new
        {
            p.Id,
            p.PaymentDate,
            p.Amount,
            p.AllocatedAmount,
            UnallocatedAmount = p.Amount - p.AllocatedAmount,
            p.Reference,
            p.PaymentMethod,
            p.BankAccountCode,
            p.Status,
            p.JournalEntryId,
            Supplier = p.Supplier == null ? null : new { p.Supplier.Id, p.Supplier.Name, p.Supplier.AccountCode },
        };

        private static object MapPaymentDetail(SupplierPayment p) => new
        {
            p.Id,
            p.SupplierId,
            p.PaymentDate,
            p.Amount,
            p.AllocatedAmount,
            UnallocatedAmount = p.Amount - p.AllocatedAmount,
            p.Reference,
            p.PaymentMethod,
            p.BankAccountCode,
            p.Status,
            p.JournalEntryId,
            Supplier = p.Supplier == null ? null : new { p.Supplier.Id, p.Supplier.Name, p.Supplier.AccountCode },
            Allocations = p.Allocations.Select(a => new
            {
                a.Id,
                a.SupplierInvoiceId,
                a.Amount,
            }),
        };
    }

    public class CreateSupplierInvoiceDto
    {
        public Guid SupplierId { get; set; }
        public string? InvoiceNumber { get; set; }
        public DateTime IssueDate { get; set; }
        public DateTime DueDate { get; set; }
        public string? Notes { get; set; }
        public List<CreateSupplierInvoiceLineDto> Lines { get; set; } = new();
    }

    public class CreateSupplierInvoiceLineDto
    {
        public string Description { get; set; } = string.Empty;
        public string? ExpenseAccountCode { get; set; }
        public decimal AmountHt { get; set; }
        public decimal VatRate { get; set; } = 19.25m;
        public decimal WithholdingRate { get; set; }
        public decimal WithholdingAmount { get; set; }
    }

    public class CreateSupplierPaymentDto
    {
        public Guid SupplierId { get; set; }
        public DateTime PaymentDate { get; set; }
        public decimal Amount { get; set; }
        public string? Reference { get; set; }
        public string? PaymentMethod { get; set; }
        public string? BankAccountCode { get; set; }
        public List<CreatePaymentAllocationDto>? Allocations { get; set; }
    }

    public class CreatePaymentAllocationDto
    {
        public Guid SupplierInvoiceId { get; set; }
        public decimal Amount { get; set; }
    }
}
