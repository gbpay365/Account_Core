using System.Text.Json.Serialization;
using ComptabiliteAPI.Configuration;
using ComptabiliteAPI.Domain.Entities;
using ComptabiliteAPI.Domain.Interfaces;
using ComptabiliteAPI.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace ComptabiliteAPI.Infrastructure.Services
{
    public class IntegrationInboundService
    {
        private readonly AppDbContext _db;
        private readonly IJournalEntryService _journal;
        private readonly IntegrationContextResolver _ctx;
        private readonly IntegrationLinkService _links;
        private readonly IntegrationOptions _opts;
        private readonly ILogger<IntegrationInboundService> _log;

        private static readonly Dictionary<string, string> PaymentMethodAccounts = new(StringComparer.OrdinalIgnoreCase)
        {
            ["cash"] = "552601",
            ["om"] = "552602",
            ["orange money"] = "552602",
            ["momo"] = "552603",
            ["mobile money"] = "552603",
            ["bank"] = "552604",
            ["transfer"] = "552604",
            ["card"] = "552604",
            ["betterpay"] = "552605",
            ["wallet"] = "552606",
        };

        private static readonly Dictionary<string, string> ExpenseCategoryAccounts = new(StringComparer.OrdinalIgnoreCase)
        {
            ["utilities"] = "605200",
            ["general"] = "601000",
            ["payout"] = "641000",
            ["salary_advance"] = "421000",
        };

        public IntegrationInboundService(
            AppDbContext db,
            IJournalEntryService journal,
            IntegrationContextResolver ctx,
            IntegrationLinkService links,
            IOptions<IntegrationOptions> opts,
            ILogger<IntegrationInboundService> log)
        {
            _db = db;
            _journal = journal;
            _ctx = ctx;
            _links = links;
            _opts = opts.Value;
            _log = log;
        }

        public int ParseFacilityId(HttpRequest request, int bodyFacilityId = 0)
        {
            if (request.Headers.TryGetValue("X-Facility-Id", out var h) && int.TryParse(h.FirstOrDefault(), out var fid) && fid > 0)
                return fid;
            return bodyFacilityId > 0 ? bodyFacilityId : 1;
        }

        public async Task<(bool duplicate, object result)> UpsertEmployeeAsync(int facilityId, HmsEmployeeUpsertDto dto, CancellationToken ct = default)
        {
            var (emp, isNew) = await UpsertEmployeeCoreAsync(facilityId, dto, ct);
            var status = dto.Event == "deleted" || dto.IsActive == false ? "deactivated" : "upserted";
            return (false, new { employeeId = emp.Id, status, created = isNew });
        }

        public async Task<object> SyncEmployeesAsync(int facilityId, HmsEmployeeBulkSyncDto dto, CancellationToken ct = default)
        {
            var companyId = await _ctx.ResolveCompanyIdAsync(facilityId, ct);
            var items = dto.Employees ?? new List<HmsEmployeeUpsertDto>();
            var syncedHmsIds = new HashSet<int>();
            var created = 0;
            var updated = 0;

            if (dto.ReplaceAll)
                await PurgeDemoEmployeesAsync(companyId, ct);

            foreach (var item in items)
            {
                if (item.HmsEmployeeId < 1)
                    continue;

                item.FacilityId = facilityId;
                if (item.Event == "deleted" || item.IsActive == false)
                {
                    await UpsertEmployeeCoreAsync(facilityId, item, ct);
                    continue;
                }

                var (_, isNew) = await UpsertEmployeeCoreAsync(facilityId, item, ct);
                syncedHmsIds.Add(item.HmsEmployeeId);
                if (isNew) created++;
                else updated++;
            }

            var deactivated = 0;
            if (dto.ReplaceAll)
                deactivated = await DeactivateEmployeesNotInHmsAsync(companyId, syncedHmsIds, ct);

            return new
            {
                status = "synced",
                created,
                updated,
                deactivated,
                total = items.Count,
                active = syncedHmsIds.Count,
                replaceAll = dto.ReplaceAll,
            };
        }

        private async Task<(Employee employee, bool isNew)> UpsertEmployeeCoreAsync(
            int facilityId, HmsEmployeeUpsertDto dto, CancellationToken ct)
        {
            var companyId = await _ctx.ResolveCompanyIdAsync(facilityId, ct);
            var extId = dto.HmsEmployeeId.ToString();
            var existingLink = await _links.FindAsync(companyId, "HMS", "employee", extId, ct);

            Employee emp;
            bool isNew;

            if (existingLink != null && Guid.TryParse(existingLink.InternalId, out var linkedEmpId))
            {
                emp = await _db.Employees.FirstOrDefaultAsync(e => e.Id == linkedEmpId && e.CompanyId == companyId, ct);
                if (emp != null)
                {
                    isNew = false;
                }
                else
                {
                    emp = new Employee { Id = linkedEmpId, CompanyId = companyId };
                    isNew = true;
                }
            }
            else
            {
                emp = await _db.Employees.FirstOrDefaultAsync(
                    e => e.CompanyId == companyId && e.ExternalHmsEmployeeId == dto.HmsEmployeeId, ct);
                if (emp != null)
                {
                    isNew = false;
                }
                else
                {
                    emp = new Employee { CompanyId = companyId };
                    isNew = true;
                }
            }

            if (IsExcludedPayrollStaff(dto))
            {
                if (!isNew)
                {
                    emp.IsActive = false;
                    await _db.SaveChangesAsync(ct);
                }
                return (emp, false);
            }

            if (dto.Event == "deleted" || dto.IsActive == false)
            {
                if (!isNew)
                {
                    emp.IsActive = false;
                    await _db.SaveChangesAsync(ct);
                }
                await _links.UpsertAsync(companyId, "HMS", "employee", extId, emp.Id.ToString(),
                    new { facilityId, department = dto.Department }, ct);
                return (emp, false);
            }

            emp.FirstName = dto.FirstName?.Trim() ?? "";
            emp.LastName = dto.LastName?.Trim() ?? "";
            emp.Email = dto.Email?.Trim() ?? "";
            emp.Position = dto.JobTitle?.Trim() ?? "";
            emp.PositionEn = dto.JobTitle?.Trim() ?? "";
            emp.HireDate = dto.HireDate ?? (emp.HireDate == default ? DateTime.UtcNow.Date : emp.HireDate);
            emp.IsActive = dto.IsActive ?? true;
            emp.ExternalHmsEmployeeId = dto.HmsEmployeeId;
            emp.ExternalHmsFacilityId = facilityId;
            emp.Department = dto.Department?.Trim() ?? "";
            emp.ExternalEmployeeCode = dto.EmployeeCode?.Trim();
            if (!string.IsNullOrWhiteSpace(dto.IndustrySector))
                emp.IndustrySector = dto.IndustrySector.Trim();

            if (isNew)
                await _db.Employees.AddAsync(emp, ct);
            await _db.SaveChangesAsync(ct);

            await _links.UpsertAsync(companyId, "HMS", "employee", extId, emp.Id.ToString(),
                new { facilityId, department = emp.Department, employeeCode = emp.ExternalEmployeeCode }, ct);

            return (emp, isNew);
        }

        private static bool IsExcludedPayrollStaff(HmsEmployeeUpsertDto dto)
            => PayrollEmployeeRules.IsExcluded(dto);

        private async Task<int> DeactivateEmployeesNotInHmsAsync(Guid companyId, HashSet<int> syncedHmsIds, CancellationToken ct)
        {
            var stale = await _db.Employees
                .Where(e => e.CompanyId == companyId && e.IsActive)
                .Where(e => e.ExternalHmsEmployeeId == null || !syncedHmsIds.Contains(e.ExternalHmsEmployeeId.Value))
                .ToListAsync(ct);

            foreach (var emp in stale)
                emp.IsActive = false;

            var excludedActive = await _db.Employees
                .Where(e => e.CompanyId == companyId && e.IsActive)
                .ToListAsync(ct);
            foreach (var emp in excludedActive.Where(PayrollEmployeeRules.IsExcluded))
                emp.IsActive = false;

            if (stale.Count > 0 || excludedActive.Any(PayrollEmployeeRules.IsExcluded))
                await _db.SaveChangesAsync(ct);

            return stale.Count;
        }

        private async Task<int> PurgeDemoEmployeesAsync(Guid companyId, CancellationToken ct)
        {
            var demoEmployees = await _db.Employees
                .Where(e => e.CompanyId == companyId && e.ExternalHmsEmployeeId == null)
                .ToListAsync(ct);

            if (demoEmployees.Count == 0)
                return 0;

            var demoIds = demoEmployees.Select(e => e.Id).ToList();
            var withPayroll = await _db.PayrollDetails
                .Where(p => demoIds.Contains(p.EmployeeId))
                .Select(p => p.EmployeeId)
                .Distinct()
                .ToListAsync(ct);
            var payrollSet = withPayroll.ToHashSet();

            var removed = 0;
            foreach (var emp in demoEmployees)
            {
                if (payrollSet.Contains(emp.Id))
                {
                    emp.IsActive = false;
                    continue;
                }
                _db.Employees.Remove(emp);
                removed++;
            }

            if (removed > 0 || demoEmployees.Any(e => payrollSet.Contains(e.Id)))
                await _db.SaveChangesAsync(ct);

            return removed;
        }

        public async Task<object> SyncPayrollPeriodAsync(int facilityId, ZaizensPayrollPeriodSyncDto dto, CancellationToken ct = default)
        {
            if (dto.Lines == null || dto.Lines.Count == 0)
                return await ClearPayrollPeriodAsync(facilityId, dto.Year, dto.Month, ct);

            var companyId = await _ctx.ResolveCompanyIdAsync(facilityId, ct);
            var periodKey = $"{facilityId}:{dto.Year}:{dto.Month:D2}";
            var periodDate = new DateTime(dto.Year, dto.Month, 1, 0, 0, 0, DateTimeKind.Utc);

            PayrollPeriod? period = null;
            var periodLink = await _links.FindAsync(companyId, "zaizens_payroll", "payroll_period", periodKey, ct);
            if (periodLink != null && Guid.TryParse(periodLink.InternalId, out var linkedPeriodId))
            {
                period = await _db.PayrollPeriods
                    .Include(p => p.Details)
                    .FirstOrDefaultAsync(p => p.Id == linkedPeriodId && p.CompanyId == companyId, ct);
            }

            if (period == null)
            {
                period = await _db.PayrollPeriods
                    .Include(p => p.Details)
                    .FirstOrDefaultAsync(
                        p => p.CompanyId == companyId
                             && p.PeriodDate.Year == dto.Year
                             && p.PeriodDate.Month == dto.Month,
                        ct);
            }

            var isPosted = period != null
                           && string.Equals(period.Status, "posted", StringComparison.OrdinalIgnoreCase);

            if (isPosted)
            {
                return new
                {
                    status = "skipped",
                    reason = "posted",
                    periodId = period!.Id,
                    periodKey,
                };
            }

            var isNew = period == null;
            period ??= new PayrollPeriod
            {
                CompanyId = companyId,
                PeriodDate = periodDate,
                Status = "processed",
            };

            if (isNew)
                await _db.PayrollPeriods.AddAsync(period, ct);

            if (period.Details is { Count: > 0 })
                _db.PayrollDetails.RemoveRange(period.Details);

            var syncedLines = new List<(ZaizensPayrollLineSyncDto line, PayrollDetail detail)>();
            decimal totalGross = 0m;
            decimal totalNet = 0m;
            decimal totalEmployer = 0m;
            var linesSkipped = 0;

            foreach (var line in dto.Lines)
            {
                if (line.PayrollRecordId < 1 || line.HmsEmployeeId < 1)
                {
                    linesSkipped++;
                    continue;
                }

                var employee = await _db.Employees.FirstOrDefaultAsync(
                    e => e.CompanyId == companyId && e.ExternalHmsEmployeeId == line.HmsEmployeeId,
                    ct);
                if (employee == null)
                {
                    linesSkipped++;
                    continue;
                }

                var gross = line.GrossSalary ?? 0m;
                var employerCnps = line.EmployerCnpsContrib ?? Math.Round(Math.Min(gross, 750_000m) * 0.112m, 0);
                var cfcEmployer = line.CfcEmployer ?? Math.Round(gross * 0.015m, 0);
                var fneEmployer = line.FneEmployer ?? Math.Round(gross * 0.01m, 0);

                var detail = new PayrollDetail
                {
                    PayrollPeriodId = period.Id,
                    EmployeeId = employee.Id,
                    BaseSalary = line.BaseSalary ?? 0m,
                    IndemniteTransport = line.TransportAllowance ?? 0m,
                    IndemniteLogement = line.HousingAllowance ?? 0m,
                    Bonuses = line.OtherAllowances ?? 0m,
                    EmployeeCnpsContrib = line.CnpsEmployee ?? 0m,
                    EmployerCnpsContrib = employerCnps,
                    TaxableIncome = line.TaxableIncome ?? 0m,
                    IncomeTax = line.IncomeTax ?? 0m,
                    Cac = line.CouncilTax ?? 0m,
                    Rav = line.CrtvDeduction ?? 0m,
                    Tdl = line.DevelopmentTax ?? 0m,
                    CfcEmployee = line.CimrEmployee ?? 0m,
                    CfcEmployer = cfcEmployer,
                    FneEmployer = fneEmployer,
                    NetSalary = line.NetSalary ?? 0m,
                };

                await _db.PayrollDetails.AddAsync(detail, ct);
                syncedLines.Add((line, detail));

                totalGross += gross;
                totalNet += detail.NetSalary;
                totalEmployer += employerCnps + cfcEmployer + fneEmployer;
            }

            period.PeriodDate = periodDate;
            period.TotalGrossPayroll = totalGross;
            period.TotalNetPayroll = totalNet;
            period.TotalEmployerCharges = totalEmployer;

            var incomingStatus = (dto.Status ?? "processed").Trim().ToLowerInvariant();
            if (incomingStatus is "processed" or "paid")
                period.Status = incomingStatus;

            await _db.SaveChangesAsync(ct);

            await _links.UpsertAsync(
                companyId, "zaizens_payroll", "payroll_period", periodKey, period.Id.ToString(), null, ct);

            foreach (var (line, detail) in syncedLines)
            {
                await _links.UpsertAsync(
                    companyId,
                    "zaizens_payroll",
                    "payroll_detail",
                    line.PayrollRecordId.ToString(),
                    detail.Id.ToString(),
                    null,
                    ct);
            }

            return new
            {
                status = "synced",
                periodId = period.Id,
                periodKey,
                created = isNew,
                linesSynced = syncedLines.Count,
                linesSkipped,
                totalGross,
                totalNet,
                totalEmployer,
            };
        }

        public async Task<object> SyncPayrollDepartmentSummariesAsync(
            int facilityId, ZaizensPayrollDeptSummarySyncDto dto, CancellationToken ct = default)
        {
            var companyId = await _ctx.ResolveCompanyIdAsync(facilityId, ct);
            var rows = dto.Departments ?? new List<ZaizensPayrollDeptSummaryLineDto>();

            var existingRows = await _db.PayrollDepartmentSummaries
                .Where(s => s.CompanyId == companyId && s.Year == dto.Year && s.Month == dto.Month)
                .ToListAsync(ct);

            if (rows.Count == 0)
            {
                if (existingRows.Count > 0)
                    _db.PayrollDepartmentSummaries.RemoveRange(existingRows);
                await _db.SaveChangesAsync(ct);
                return new
                {
                    status = "cleared",
                    year = dto.Year,
                    month = dto.Month,
                    departments = 0,
                };
            }

            var upserted = 0;
            var incomingDepts = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            foreach (var row in rows)
            {
                var dept = (row.Department ?? "").Trim();
                if (string.IsNullOrWhiteSpace(dept))
                    dept = "Unassigned";
                incomingDepts.Add(dept);

                var existing = existingRows.FirstOrDefault(s =>
                    string.Equals(s.Department, dept, StringComparison.OrdinalIgnoreCase));

                if (existing == null)
                {
                    existing = new PayrollDepartmentSummary
                    {
                        CompanyId = companyId,
                        Year = dto.Year,
                        Month = dto.Month,
                        Department = dept,
                    };
                    await _db.PayrollDepartmentSummaries.AddAsync(existing, ct);
                }

                existing.Headcount = row.Headcount ?? 0;
                existing.GrossPayroll = row.GrossPayroll ?? 0m;
                existing.NetPayroll = row.NetPayroll ?? 0m;
                existing.EmployerCharges = row.EmployerCharges ?? 0m;
                existing.UpdatedAt = DateTime.UtcNow;
                upserted++;
            }

            foreach (var stale in existingRows)
            {
                if (!incomingDepts.Contains(stale.Department))
                    _db.PayrollDepartmentSummaries.Remove(stale);
            }

            await _db.SaveChangesAsync(ct);
            return new
            {
                status = "synced",
                year = dto.Year,
                month = dto.Month,
                departments = upserted,
            };
        }

        /// <summary>Remove a replicated payroll period when Zaizens has no lines left for that month.</summary>
        public async Task<object> ClearPayrollPeriodAsync(int facilityId, int year, int month, CancellationToken ct = default)
        {
            var companyId = await _ctx.ResolveCompanyIdAsync(facilityId, ct);
            var periodKey = $"{facilityId}:{year}:{month:D2}";

            PayrollPeriod? period = null;
            var periodLink = await _links.FindAsync(companyId, "zaizens_payroll", "payroll_period", periodKey, ct);
            if (periodLink != null && Guid.TryParse(periodLink.InternalId, out var linkedPeriodId))
            {
                period = await _db.PayrollPeriods
                    .Include(p => p.Details)
                    .FirstOrDefaultAsync(p => p.Id == linkedPeriodId && p.CompanyId == companyId, ct);
            }

            if (period == null)
            {
                period = await _db.PayrollPeriods
                    .Include(p => p.Details)
                    .FirstOrDefaultAsync(
                        p => p.CompanyId == companyId
                             && p.PeriodDate.Year == year
                             && p.PeriodDate.Month == month,
                        ct);
            }

            if (period == null)
            {
                var deptOnly = await _db.PayrollDepartmentSummaries
                    .Where(s => s.CompanyId == companyId && s.Year == year && s.Month == month)
                    .ToListAsync(ct);
                if (deptOnly.Count > 0)
                    _db.PayrollDepartmentSummaries.RemoveRange(deptOnly);
                if (deptOnly.Count > 0)
                    await _db.SaveChangesAsync(ct);
                return new { status = "cleared", periodKey, reason = "no_period" };
            }

            if (string.Equals(period.Status, "posted", StringComparison.OrdinalIgnoreCase))
            {
                return new
                {
                    status = "skipped",
                    reason = "posted",
                    periodId = period.Id,
                    periodKey,
                };
            }

            if (period.Details is { Count: > 0 })
            {
                var detailIds = period.Details.Select(d => d.Id.ToString()).ToList();
                var detailLinks = await _db.IntegrationEntityLinks
                    .Where(l => l.CompanyId == companyId
                                && l.SourceSystem == "zaizens_payroll"
                                && l.EntityType == "payroll_detail"
                                && detailIds.Contains(l.InternalId))
                    .ToListAsync(ct);
                if (detailLinks.Count > 0)
                    _db.IntegrationEntityLinks.RemoveRange(detailLinks);
                _db.PayrollDetails.RemoveRange(period.Details);
            }

            _db.PayrollPeriods.Remove(period);

            var periodLinks = await _db.IntegrationEntityLinks
                .Where(l => l.CompanyId == companyId
                            && l.SourceSystem == "zaizens_payroll"
                            && l.EntityType == "payroll_period"
                            && l.ExternalId == periodKey)
                .ToListAsync(ct);
            if (periodLinks.Count > 0)
                _db.IntegrationEntityLinks.RemoveRange(periodLinks);

            var deptSummaries = await _db.PayrollDepartmentSummaries
                .Where(s => s.CompanyId == companyId && s.Year == year && s.Month == month)
                .ToListAsync(ct);
            if (deptSummaries.Count > 0)
                _db.PayrollDepartmentSummaries.RemoveRange(deptSummaries);

            await _db.SaveChangesAsync(ct);
            return new { status = "cleared", periodKey, periodId = period.Id };
        }

        public async Task<object> SyncProductsAsync(int facilityId, HmsProductSyncDto dto, CancellationToken ct = default)
        {
            var companyId = await _ctx.ResolveCompanyIdAsync(facilityId, ct);
            var items = dto.Products ?? new List<HmsProductItemDto>();
            var syncedExtIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var created = 0;
            var updated = 0;

            if (dto.ReplaceAll)
                await RemoveDemoProductsAsync(companyId, ct);

            foreach (var item in items)
            {
                if (item.HmsId < 1 || string.IsNullOrWhiteSpace(item.Source))
                    continue;

                var source = item.Source.Trim().ToLowerInvariant();
                var extId = $"{source}:{item.HmsId}";
                syncedExtIds.Add(extId);

                var code = (item.Code ?? $"{source.ToUpperInvariant()}-{item.HmsId}").Trim();
                if (code.Length > 64)
                    code = code[..64];

                var familyId = await EnsureProductFamilyAsync(
                    companyId,
                    item.FamilyKey ?? source,
                    item.FamilyNameEn,
                    item.FamilyNameFr,
                    ct);

                Product? product = null;
                var existingLink = await _links.FindAsync(companyId, "HMS", "product", extId, ct);
                if (existingLink != null && Guid.TryParse(existingLink.InternalId, out var pid))
                    product = await _db.Products.FirstOrDefaultAsync(p => p.Id == pid && p.CompanyId == companyId, ct);

                if (product == null)
                {
                    product = await _db.Products.FirstOrDefaultAsync(
                        p => p.CompanyId == companyId && p.Code == code, ct);
                }

                var isNew = product == null;
                product ??= new Product { CompanyId = companyId };

                product.Code = code;
                product.NameEn = item.NameEn?.Trim() ?? product.NameEn;
                product.NameFr = string.IsNullOrWhiteSpace(item.NameFr) ? product.NameEn : item.NameFr.Trim();
                product.Description = item.Description?.Trim() ?? product.Description;
                product.UnitPrice = item.UnitPrice;
                product.StockQuantity = item.StockQuantity;
                product.ReorderThreshold = item.ReorderThreshold;
                product.TaxRate = item.TaxRate > 0 ? item.TaxRate : 19.25m;
                product.FamilyId = familyId;
                product.IsActive = item.IsActive ?? true;
                product.ValuationMethod = string.IsNullOrWhiteSpace(item.ValuationMethod) ? "FIFO" : item.ValuationMethod;

                if (isNew)
                {
                    await _db.Products.AddAsync(product, ct);
                    created++;
                }
                else
                {
                    updated++;
                }

                await _db.SaveChangesAsync(ct);
                await _links.UpsertAsync(
                    companyId, "HMS", "product", extId, product.Id.ToString(),
                    new { facilityId, source, hmsId = item.HmsId, code = product.Code },
                    ct);
            }

            if (dto.ReplaceAll)
            {
                var staleLinks = await _db.IntegrationEntityLinks
                    .Where(l => l.CompanyId == companyId && l.SourceSystem == "HMS" && l.EntityType == "product")
                    .ToListAsync(ct);
                foreach (var link in staleLinks.Where(l => !syncedExtIds.Contains(l.ExternalId)))
                {
                    if (!Guid.TryParse(link.InternalId, out var pid)) continue;
                    var p = await _db.Products.FirstOrDefaultAsync(x => x.Id == pid && x.CompanyId == companyId, ct);
                    if (p != null) p.IsActive = false;
                }
                await _db.SaveChangesAsync(ct);
            }

            return new
            {
                status = "synced",
                created,
                updated,
                total = items.Count,
                active = syncedExtIds.Count,
                replaceAll = dto.ReplaceAll,
            };
        }

        private async Task<Guid?> EnsureProductFamilyAsync(
            Guid companyId, string familyKey, string? nameEn, string? nameFr, CancellationToken ct)
        {
            var key = (familyKey ?? "service").Trim().ToLowerInvariant();
            if (key.Length == 0) key = "service";

            var extFamId = $"fam:{key}";
            var link = await _links.FindAsync(companyId, "HMS", "product_family", extFamId, ct);
            if (link != null && Guid.TryParse(link.InternalId, out var linkedFamId))
            {
                var linked = await _db.ProductFamilies.FirstOrDefaultAsync(f => f.Id == linkedFamId, ct);
                if (linked != null)
                {
                    if (!string.IsNullOrWhiteSpace(nameEn) && linked.NameEn != nameEn.Trim())
                        linked.NameEn = nameEn.Trim();
                    if (!string.IsNullOrWhiteSpace(nameFr) && linked.NameFr != nameFr.Trim())
                        linked.NameFr = nameFr.Trim();
                    return linked.Id;
                }
            }

            var en = string.IsNullOrWhiteSpace(nameEn) ? TitleCaseFamily(key) : nameEn.Trim();
            var fr = string.IsNullOrWhiteSpace(nameFr) ? en : nameFr.Trim();

            var fam = await _db.ProductFamilies.FirstOrDefaultAsync(
                f => f.CompanyId == companyId && f.NameEn.ToLower() == en.ToLower(), ct);
            if (fam == null)
            {
                fam = new ProductFamily { CompanyId = companyId, NameEn = en, NameFr = fr };
                await _db.ProductFamilies.AddAsync(fam, ct);
                await _db.SaveChangesAsync(ct);
            }
            else if (fam.NameFr != fr)
            {
                fam.NameFr = fr;
            }

            await _links.UpsertAsync(companyId, "HMS", "product_family", extFamId, fam.Id.ToString(), new { key }, ct);
            return fam.Id;
        }

        private static string TitleCaseFamily(string key) =>
            string.Join(' ', key.Split('_', StringSplitOptions.RemoveEmptyEntries)
                .Select(w => char.ToUpperInvariant(w[0]) + w[1..]));

        private async Task RemoveDemoProductsAsync(Guid companyId, CancellationToken ct)
        {
            var demoIds = await _db.Products
                .Where(p => p.CompanyId == companyId && p.Code.StartsWith("PRD-"))
                .Select(p => p.Id)
                .ToListAsync(ct);
            if (demoIds.Count == 0) return;

            await _db.InventoryMovements.Where(m => demoIds.Contains(m.ProductId)).ExecuteDeleteAsync(ct);
            await _db.SalesDocumentLines.Where(l => demoIds.Contains(l.ProductId)).ExecuteDeleteAsync(ct);
            await _db.Products.Where(p => demoIds.Contains(p.Id)).ExecuteDeleteAsync(ct);
        }

        public async Task<(int statusCode, object body)> IngestReceiptAsync(int facilityId, HmsCashierReceiptDto dto, CancellationToken ct = default)
        {
            var extRef = $"cashier_receipt:{facilityId}:{dto.SourceId}";
            return await IngestCashierJournalAsync(facilityId, extRef, dto, isReceipt: true, ct);
        }

        public async Task<(int statusCode, object body)> IngestExpenseAsync(int facilityId, HmsCashierExpenseDto dto, CancellationToken ct = default)
        {
            var extRef = $"cashier_expense:{facilityId}:{dto.SourceId}";
            return await IngestCashierJournalAsync(facilityId, extRef, dto, isReceipt: false, ct);
        }

        public async Task<(int statusCode, object body)> IngestJournalEntryAsync(int facilityId, HmsJournalIngestDto dto, CancellationToken ct = default)
        {
            var companyId = await _ctx.ResolveCompanyIdAsync(facilityId, ct);
            var extRef = String.IsNullOrWhiteSpace(dto.ExternalReference)
                ? $"hms_journal:{facilityId}:{dto.HmsJournalId}"
                : dto.ExternalReference.Trim();
            if (dto.HmsJournalId < 1 && string.IsNullOrWhiteSpace(dto.ExternalReference))
                return (422, new { error = "hms_journal_id or external_reference required." });

            var dup = await FindJournalDuplicateAsync(companyId, "HMS", extRef, ct);
            if (dup != null)
                return (409, new { status = "duplicate", journalEntryId = dup.Id });

            var lines = (dto.Lines ?? new List<HmsJournalLineDto>())
                .Select(l => new JournalLine
                {
                    AccountCode = (l.AccountCode ?? "").Trim(),
                    Debit = Math.Round(l.Debit, 2),
                    Credit = Math.Round(l.Credit, 2),
                    LineDescription = l.LineDescription?.Trim(),
                })
                .Where(l => !string.IsNullOrEmpty(l.AccountCode) && (l.Debit > 0 || l.Credit > 0))
                .ToList();

            if (lines.Count < 2)
                return (422, new { error = "At least 2 journal lines with account codes are required." });

            var totalDebit = lines.Sum(l => l.Debit);
            var totalCredit = lines.Sum(l => l.Credit);
            if (totalDebit != totalCredit || totalDebit <= 0)
                return (422, new { error = "Journal lines must balance with debits equal to credits." });

            var userId = await _ctx.ResolveSystemUserIdAsync(ct);
            var entryDate = ParseDate(dto.EntryDate);
            var journalType = MapJournalType(dto.JournalType);
            var entry = BuildJournalEntry(
                companyId,
                userId,
                entryDate,
                dto.Reference ?? $"HMS-J{dto.HmsJournalId}",
                dto.Description ?? dto.Narration ?? "HMS journal",
                journalType,
                "HMS",
                extRef,
                lines.ToArray());

            return await SaveAndMaybeValidateAsync(entry, ct);
        }

        public async Task<(int statusCode, object body)> IngestPurchaseOrderAsync(int facilityId, HmsPurchaseOrderDto dto, CancellationToken ct = default)
        {
            var companyId = await _ctx.ResolveCompanyIdAsync(facilityId, ct);
            var extRef = $"purchase_order:{facilityId}:{dto.PoId}";
            var dup = await FindJournalDuplicateAsync(companyId, "HMS", extRef, ct);
            if (dup != null)
                return (409, new { status = "duplicate", journalEntryId = dup.Id });

            var amount = Math.Round(dto.Amount, 2);
            if (amount <= 0)
                return (422, new { error = "Invalid PO amount." });

            var stockAccount = dto.StockKind == "pharmacy" ? "311100" : "311200";
            var userId = await _ctx.ResolveSystemUserIdAsync(ct);
            var entryDate = ParseDate(dto.EntryDate);

            var entry = BuildJournalEntry(companyId, userId, entryDate, dto.Reference ?? $"PO-{dto.PoId}",
                dto.Narration ?? $"Purchase order {dto.PoNumber}", "JNL", "HMS", extRef,
                new[]
                {
                    new JournalLine { AccountCode = stockAccount, Debit = amount, Credit = 0, LineDescription = dto.PoNumber },
                    new JournalLine { AccountCode = "401100", Debit = 0, Credit = amount, LineDescription = dto.SupplierName ?? "Supplier" },
                });

            return await SaveAndMaybeValidateAsync(entry, ct);
        }

        private async Task<(int statusCode, object body)> IngestCashierJournalAsync(
            int facilityId, string extRef, HmsCashierBaseDto dto, bool isReceipt, CancellationToken ct)
        {
            var companyId = await _ctx.ResolveCompanyIdAsync(facilityId, ct);
            var dup = await FindJournalDuplicateAsync(companyId, "HMS", extRef, ct);
            if (dup != null)
                return (409, new { status = "duplicate", journalEntryId = dup.Id });

            var amount = Math.Round(dto.AmountTtc, 2);
            if (amount <= 0)
                return (422, new { error = "Invalid amount." });

            var cashAccount = ResolvePaymentAccount(dto.PaymentMethod);
            var userId = await _ctx.ResolveSystemUserIdAsync(ct);
            var entryDate = ParseDate(dto.EntryDate);
            JournalLine debitLine;
            JournalLine creditLine;

            if (isReceipt)
            {
                var revenueAccount = ResolveRevenueAccount(dto.ServiceKey, dto.GlCreditAccount);
                debitLine = new JournalLine { AccountCode = cashAccount, Debit = amount, Credit = 0, LineDescription = dto.Narration };
                creditLine = new JournalLine { AccountCode = revenueAccount, Debit = 0, Credit = amount, LineDescription = dto.Narration };
            }
            else
            {
                var expenseAccount = ResolveExpenseAccount(dto.Category, dto.GlDebitAccount);
                debitLine = new JournalLine { AccountCode = expenseAccount, Debit = amount, Credit = 0, LineDescription = dto.Narration };
                creditLine = new JournalLine { AccountCode = cashAccount, Debit = 0, Credit = amount, LineDescription = dto.PaymentMethod };
            }

            var entry = BuildJournalEntry(companyId, userId, entryDate, dto.Reference ?? extRef,
                dto.Narration ?? (isReceipt ? "HMS receipt" : "HMS expense"), "JNL", "HMS", extRef,
                new[] { debitLine, creditLine });

            return await SaveAndMaybeValidateAsync(entry, ct);
        }

        private async Task<(int statusCode, object body)> SaveAndMaybeValidateAsync(JournalEntry entry, CancellationToken ct)
        {
            try
            {
                var created = await _journal.CreateEntryAsync(entry);
                if (_opts.AutoValidateInboundJournals)
                {
                    created = await _journal.ValidateEntryAsync(created.Id)
                              ?? created;
                }
                return (201, new { status = "created", journalEntryId = created.Id, validated = created.Validated });
            }
            catch (Exception ex)
            {
                _log.LogWarning(ex, "Integration journal ingest failed");
                return (422, new { error = ex.Message });
            }
        }

        private static JournalEntry BuildJournalEntry(
            Guid companyId, Guid userId, DateTime entryDate, string reference, string description,
            string journalType, string sourceSystem, string externalRef, JournalLine[] lines)
        {
            return new JournalEntry
            {
                CompanyId = companyId,
                CreatedById = userId,
                EntryDate = entryDate,
                Reference = reference,
                Description = description,
                JournalType = journalType,
                FiscalYear = (short)entryDate.Year,
                FiscalPeriod = (short)entryDate.Month,
                CurrencyCode = "XAF",
                ExchangeRate = 1m,
                SourceSystem = sourceSystem,
                ExternalReference = externalRef,
                JournalLines = lines.ToList()
            };
        }

        private async Task<JournalEntry?> FindJournalDuplicateAsync(Guid companyId, string source, string extRef, CancellationToken ct)
        {
            return await _db.JournalEntries.AsNoTracking().FirstOrDefaultAsync(
                e => e.CompanyId == companyId && e.SourceSystem == source && e.ExternalReference == extRef, ct);
        }

        private string ResolvePaymentAccount(string? method)
        {
            var m = (method ?? "cash").Trim().ToLowerInvariant();
            foreach (var kv in PaymentMethodAccounts)
            {
                if (m.Contains(kv.Key, StringComparison.OrdinalIgnoreCase))
                    return kv.Value;
            }
            return "552601";
        }

        private static string ResolveRevenueAccount(string? serviceKey, string? glCredit)
        {
            if (!string.IsNullOrWhiteSpace(glCredit) && glCredit.Trim().Length == 6)
                return glCredit.Trim();
            return "701601";
        }

        private static string ResolveExpenseAccount(string? category, string? glDebit)
        {
            if (!string.IsNullOrWhiteSpace(glDebit) && glDebit.Trim().Length == 6)
                return glDebit.Trim();
            var cat = (category ?? "general").Trim().ToLowerInvariant();
            return ExpenseCategoryAccounts.TryGetValue(cat, out var code) ? code : "601000";
        }

        private static DateTime ParseDate(string? raw)
        {
            if (DateTime.TryParse(raw, out var d))
                return d.Date;
            return DateTime.UtcNow.Date;
        }

        private static string MapJournalType(string? raw)
        {
            var jt = (raw ?? "JNL").Trim().ToUpperInvariant();
            return jt switch
            {
                "JNL" or "RJE" or "REV" or "AJE" or "TJE" or "SLB" or "OBL" => jt,
                "VTE" or "ACH" or "OD" or "BQ" => "JNL",
                _ => "JNL",
            };
        }
    }

    public class HmsEmployeeUpsertDto
    {
        [JsonPropertyName("event")] public string Event { get; set; } = "upsert";
        [JsonPropertyName("hms_employee_id")] public int HmsEmployeeId { get; set; }
        [JsonPropertyName("facility_id")] public int FacilityId { get; set; }
        [JsonPropertyName("first_name")] public string? FirstName { get; set; }
        [JsonPropertyName("last_name")] public string? LastName { get; set; }
        [JsonPropertyName("email")] public string? Email { get; set; }
        [JsonPropertyName("job_title")] public string? JobTitle { get; set; }
        [JsonPropertyName("hire_date")] public DateTime? HireDate { get; set; }
        [JsonPropertyName("is_active")] public bool? IsActive { get; set; }
        [JsonPropertyName("department")] public string? Department { get; set; }
        [JsonPropertyName("employee_code")] public string? EmployeeCode { get; set; }
        [JsonPropertyName("cnps_number")] public string? CnpsNumber { get; set; }
        [JsonPropertyName("tax_niu")] public string? TaxNiu { get; set; }
        [JsonPropertyName("bank_name")] public string? BankName { get; set; }
        [JsonPropertyName("bank_account_no")] public string? BankAccountNo { get; set; }
        [JsonPropertyName("base_salary")] public decimal? BaseSalary { get; set; }
        [JsonPropertyName("housing_allowance")] public decimal? HousingAllowance { get; set; }
        [JsonPropertyName("transport_allowance")] public decimal? TransportAllowance { get; set; }
        [JsonPropertyName("industry_sector")] public string? IndustrySector { get; set; }
        [JsonPropertyName("hms_role")] public string? HmsRole { get; set; }
        [JsonPropertyName("hms_username")] public string? HmsUsername { get; set; }
        [JsonPropertyName("include_in_payroll")] public bool? IncludeInPayroll { get; set; }
    }

    public class HmsEmployeeBulkSyncDto
    {
        [JsonPropertyName("facility_id")] public int FacilityId { get; set; }
        [JsonPropertyName("replace_all")] public bool ReplaceAll { get; set; }
        [JsonPropertyName("employees")] public List<HmsEmployeeUpsertDto>? Employees { get; set; }
    }

    public class ZaizensPayrollPeriodSyncDto
    {
        [JsonPropertyName("facility_id")] public int FacilityId { get; set; }
        [JsonPropertyName("year")] public int Year { get; set; }
        [JsonPropertyName("month")] public int Month { get; set; }
        [JsonPropertyName("status")] public string? Status { get; set; }
        [JsonPropertyName("lines")] public List<ZaizensPayrollLineSyncDto>? Lines { get; set; }
    }

    public class ZaizensPayrollLineSyncDto
    {
        [JsonPropertyName("payroll_record_id")] public int PayrollRecordId { get; set; }
        [JsonPropertyName("hms_employee_id")] public int HmsEmployeeId { get; set; }
        [JsonPropertyName("gross_salary")] public decimal? GrossSalary { get; set; }
        [JsonPropertyName("net_salary")] public decimal? NetSalary { get; set; }
        [JsonPropertyName("basic_salary")] public decimal? BaseSalary { get; set; }
        [JsonPropertyName("housing_allowance")] public decimal? HousingAllowance { get; set; }
        [JsonPropertyName("transport_allowance")] public decimal? TransportAllowance { get; set; }
        [JsonPropertyName("other_allowances")] public decimal? OtherAllowances { get; set; }
        [JsonPropertyName("cnps_employee")] public decimal? CnpsEmployee { get; set; }
        [JsonPropertyName("employer_cnps_contrib")] public decimal? EmployerCnpsContrib { get; set; }
        [JsonPropertyName("cimr_employee")] public decimal? CimrEmployee { get; set; }
        [JsonPropertyName("cfc_employer")] public decimal? CfcEmployer { get; set; }
        [JsonPropertyName("fne_employer")] public decimal? FneEmployer { get; set; }
        [JsonPropertyName("crtv_deduction")] public decimal? CrtvDeduction { get; set; }
        [JsonPropertyName("council_tax_deduction")] public decimal? CouncilTax { get; set; }
        [JsonPropertyName("development_tax_deduction")] public decimal? DevelopmentTax { get; set; }
        [JsonPropertyName("taxable_income")] public decimal? TaxableIncome { get; set; }
        [JsonPropertyName("income_tax")] public decimal? IncomeTax { get; set; }
        [JsonPropertyName("payout_status")] public string? PayoutStatus { get; set; }
    }

    public class ZaizensPayrollDeptSummarySyncDto
    {
        [JsonPropertyName("facility_id")] public int FacilityId { get; set; }
        [JsonPropertyName("year")] public int Year { get; set; }
        [JsonPropertyName("month")] public int Month { get; set; }
        [JsonPropertyName("departments")] public List<ZaizensPayrollDeptSummaryLineDto>? Departments { get; set; }
    }

    public class ZaizensPayrollDeptSummaryLineDto
    {
        [JsonPropertyName("department")] public string? Department { get; set; }
        [JsonPropertyName("headcount")] public int? Headcount { get; set; }
        [JsonPropertyName("gross_payroll")] public decimal? GrossPayroll { get; set; }
        [JsonPropertyName("net_payroll")] public decimal? NetPayroll { get; set; }
        [JsonPropertyName("employer_charges")] public decimal? EmployerCharges { get; set; }
    }

    public class HmsCashierBaseDto
    {
        [JsonPropertyName("source_id")] public int SourceId { get; set; }
        [JsonPropertyName("entry_date")] public string? EntryDate { get; set; }
        [JsonPropertyName("reference")] public string? Reference { get; set; }
        [JsonPropertyName("narration")] public string? Narration { get; set; }
        [JsonPropertyName("amount_ttc")] public decimal AmountTtc { get; set; }
        [JsonPropertyName("payment_method")] public string? PaymentMethod { get; set; }
        [JsonPropertyName("service_key")] public string? ServiceKey { get; set; }
        [JsonPropertyName("category")] public string? Category { get; set; }
        [JsonPropertyName("gl_debit_account")] public string? GlDebitAccount { get; set; }
        [JsonPropertyName("gl_credit_account")] public string? GlCreditAccount { get; set; }
    }

    public class HmsCashierReceiptDto : HmsCashierBaseDto { }
    public class HmsCashierExpenseDto : HmsCashierBaseDto { }

    public class HmsJournalIngestDto
    {
        [JsonPropertyName("hms_journal_id")] public int HmsJournalId { get; set; }
        [JsonPropertyName("external_reference")] public string? ExternalReference { get; set; }
        [JsonPropertyName("entry_date")] public string? EntryDate { get; set; }
        [JsonPropertyName("reference")] public string? Reference { get; set; }
        [JsonPropertyName("description")] public string? Description { get; set; }
        [JsonPropertyName("narration")] public string? Narration { get; set; }
        [JsonPropertyName("journal_type")] public string? JournalType { get; set; }
        [JsonPropertyName("lines")] public List<HmsJournalLineDto>? Lines { get; set; }
    }

    public class HmsJournalLineDto
    {
        [JsonPropertyName("account_code")] public string? AccountCode { get; set; }
        [JsonPropertyName("debit")] public decimal Debit { get; set; }
        [JsonPropertyName("credit")] public decimal Credit { get; set; }
        [JsonPropertyName("line_description")] public string? LineDescription { get; set; }
    }

    public class HmsPurchaseOrderDto
    {
        [JsonPropertyName("po_id")] public int PoId { get; set; }
        [JsonPropertyName("po_number")] public string? PoNumber { get; set; }
        [JsonPropertyName("supplier_name")] public string? SupplierName { get; set; }
        [JsonPropertyName("amount")] public decimal Amount { get; set; }
        [JsonPropertyName("stock_kind")] public string? StockKind { get; set; }
        [JsonPropertyName("entry_date")] public string? EntryDate { get; set; }
        [JsonPropertyName("reference")] public string? Reference { get; set; }
        [JsonPropertyName("narration")] public string? Narration { get; set; }
    }

    public class HmsProductSyncDto
    {
        [JsonPropertyName("facility_id")] public int FacilityId { get; set; }
        [JsonPropertyName("replace_all")] public bool ReplaceAll { get; set; }
        [JsonPropertyName("products")] public List<HmsProductItemDto>? Products { get; set; }
    }

    public class HmsProductItemDto
    {
        [JsonPropertyName("source")] public string Source { get; set; } = "service_catalog";
        [JsonPropertyName("hms_id")] public int HmsId { get; set; }
        [JsonPropertyName("code")] public string? Code { get; set; }
        [JsonPropertyName("name_en")] public string? NameEn { get; set; }
        [JsonPropertyName("name_fr")] public string? NameFr { get; set; }
        [JsonPropertyName("description")] public string? Description { get; set; }
        [JsonPropertyName("unit_price")] public decimal UnitPrice { get; set; }
        [JsonPropertyName("stock_quantity")] public decimal StockQuantity { get; set; }
        [JsonPropertyName("reorder_threshold")] public decimal? ReorderThreshold { get; set; }
        [JsonPropertyName("tax_rate")] public decimal TaxRate { get; set; }
        [JsonPropertyName("family_key")] public string? FamilyKey { get; set; }
        [JsonPropertyName("family_name_en")] public string? FamilyNameEn { get; set; }
        [JsonPropertyName("family_name_fr")] public string? FamilyNameFr { get; set; }
        [JsonPropertyName("is_active")] public bool? IsActive { get; set; }
        [JsonPropertyName("valuation_method")] public string? ValuationMethod { get; set; }
    }
}
