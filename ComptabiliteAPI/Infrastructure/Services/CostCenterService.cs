using System.Linq;
using ComptabiliteAPI.Domain;
using ComptabiliteAPI.Domain.Entities;
using ComptabiliteAPI.Domain.Interfaces;
using ComptabiliteAPI.Infrastructure.CostCenters;
using ComptabiliteAPI.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace ComptabiliteAPI.Infrastructure.Services
{
    public class CostCenterService : ICostCenterService
    {
        private readonly AppDbContext _context;

        public CostCenterService(AppDbContext context) => _context = context;

        public async Task<IReadOnlyList<CostCenter>> GetByCompanyAsync(
            Guid companyId, bool includeInactive, CancellationToken ct = default)
        {
            var q = _context.CostCenters.AsNoTracking().Where(c => c.CompanyId == companyId);
            if (!includeInactive) q = q.Where(c => c.IsActive);
            return await q.OrderBy(c => c.SortOrder).ThenBy(c => c.Code).ToListAsync(ct);
        }

        public async Task<CostCenter?> GetByIdAsync(Guid id, Guid companyId, CancellationToken ct = default) =>
            await _context.CostCenters.FirstOrDefaultAsync(c => c.Id == id && c.CompanyId == companyId, ct);

        public async Task<CostCenter> CreateAsync(CostCenter entity, CancellationToken ct = default)
        {
            entity.Code = entity.Code.Trim().ToUpperInvariant();
            entity.Name = entity.Name.Trim();
            entity.RelatedAccountCode = NormalizeRelatedAccount(entity.RelatedAccountCode);
            entity.OhadaClass = entity.OhadaClass is < 1 or > 7 ? (byte)6 : entity.OhadaClass;
            entity.UpdatedAt = DateTime.UtcNow;
            _context.CostCenters.Add(entity);
            await _context.SaveChangesAsync(ct);
            return entity;
        }

        public async Task<CostCenter> UpdateAsync(CostCenter entity, Guid companyId, CancellationToken ct = default)
        {
            var existing = await _context.CostCenters
                .FirstOrDefaultAsync(c => c.Id == entity.Id && c.CompanyId == companyId, ct);
            if (existing == null)
                throw new InvalidOperationException("Cost center not found.");
            existing.Code = entity.Code.Trim().ToUpperInvariant();
            existing.Name = entity.Name.Trim();
            existing.Description = string.IsNullOrWhiteSpace(entity.Description) ? null : entity.Description.Trim();
            existing.OhadaClass = entity.OhadaClass is < 1 or > 7 ? existing.OhadaClass : entity.OhadaClass;
            existing.RelatedAccountCode = NormalizeRelatedAccount(entity.RelatedAccountCode);
            existing.SortOrder = entity.SortOrder;
            existing.IsActive = entity.IsActive;
            existing.UpdatedAt = DateTime.UtcNow;
            await _context.SaveChangesAsync(ct);
            return existing;
        }

        public async Task<bool> SetActiveAsync(Guid id, Guid companyId, bool isActive, CancellationToken ct = default)
        {
            var c = await _context.CostCenters.FirstOrDefaultAsync(x => x.Id == id && x.CompanyId == companyId, ct);
            if (c == null) return false;
            c.IsActive = isActive;
            c.UpdatedAt = DateTime.UtcNow;
            await _context.SaveChangesAsync(ct);
            return true;
        }

        public async Task<ApplyTemplateResult> ApplyTemplateAsync(
            Guid companyId,
            string templateKey,
            ApplyTemplateOptions? options,
            CancellationToken ct = default)
        {
            var opt = options ?? new ApplyTemplateOptions();
            var key = (templateKey ?? string.Empty).Trim();
            var tpl = OhadaCostCenterTemplateCatalog.All
                .FirstOrDefault(t => string.Equals(t.Key, key, StringComparison.OrdinalIgnoreCase));
            if (tpl == null)
                throw new InvalidOperationException("Unknown cost centre template.");

            var company = await _context.Companies
                .AsNoTracking()
                .FirstOrDefaultAsync(c => c.Id == companyId, ct);
            if (company == null)
                throw new InvalidOperationException("Company not found.");
            var companyName = (company.Name ?? string.Empty).Trim();
            if (string.IsNullOrEmpty(companyName)) companyName = "—";

            var allRows = await _context.CostCenters
                .Where(c => c.CompanyId == companyId)
                .ToListAsync(ct);
            var codeSet = new HashSet<string>(allRows.Select(c => c.Code), StringComparer.OrdinalIgnoreCase);
            var byCode = allRows.ToDictionary(c => c.Code, c => c, StringComparer.OrdinalIgnoreCase);

            var order = allRows.Count == 0
                ? 0
                : allRows.Max(c => c.SortOrder);
            var added = 0;
            var updated = 0;
            var ohada = (byte)6;

            foreach (var item in tpl.Items)
            {
                var finalCode = BuildTemplateCode(opt.CodePrefix, item.Code);
                if (string.IsNullOrEmpty(finalCode)) continue;

                ohada = item.OhadaClass is < 1 or > 7 ? (byte)6 : item.OhadaClass;
                var name = BuildTemplateLabel(item.Name, companyName, opt.EnrichNameWithCompany);
                var desc = BuildTemplateDescription(item.Description, companyName, opt.EnrichDescriptionWithCompany);

                if (opt.UpdateExistingFromTemplate && byCode.TryGetValue(finalCode, out var row))
                {
                    row.Name = name;
                    row.Description = desc;
                    row.OhadaClass = ohada;
                    row.RelatedAccountCode = NormalizeRelatedAccount(item.RelatedAccountCode);
                    row.UpdatedAt = DateTime.UtcNow;
                    updated++;
                    continue;
                }

                if (codeSet.Contains(finalCode)) continue;
                order += 10;
                var entity = new CostCenter
                {
                    CompanyId = companyId,
                    Code = finalCode,
                    Name = name,
                    Description = desc,
                    OhadaClass = ohada,
                    RelatedAccountCode = NormalizeRelatedAccount(item.RelatedAccountCode),
                    SortOrder = order,
                    IsActive = true
                };
                await _context.CostCenters.AddAsync(entity, ct);
                codeSet.Add(finalCode);
                byCode[entity.Code] = entity;
                added++;
            }

            if (added > 0 || updated > 0) await _context.SaveChangesAsync(ct);
            return new ApplyTemplateResult { Added = added, Updated = updated };
        }

        private static string BuildTemplateCode(string? userPrefix, string templateCode)
        {
            var code = (templateCode ?? string.Empty).Trim().ToUpperInvariant();
            if (string.IsNullOrEmpty(code)) code = "AXE";
            var p = new string(
                (userPrefix ?? string.Empty)
                    .ToUpperInvariant()
                    .Where(char.IsLetterOrDigit)
                    .ToArray());
            p = p.Length > 6 ? p[..6] : p;
            if (string.IsNullOrEmpty(p))
                return code.Length <= 20 ? code : code[..20];
            var combined = p + "-" + code;
            if (combined.Length <= 20) return combined;
            if (p.Length + code.Length <= 20) return p + code;
            var room = 20 - p.Length - 1;
            if (room < 1) return (p + code)[..20];
            return p + "-" + (code.Length <= room ? code : code[..room]);
        }

        private static string BuildTemplateLabel(string templateName, string companyName, bool enrich)
        {
            if (!enrich) return TruncateName(templateName);
            if (string.IsNullOrWhiteSpace(companyName) || companyName == "—")
                return TruncateName(templateName);
            return TruncateName($"{templateName} · {companyName}");
        }

        private static string? BuildTemplateDescription(string? templateDesc, string companyName, bool enrich)
        {
            if (!enrich) return string.IsNullOrWhiteSpace(templateDesc) ? null : TruncateDescription(templateDesc);
            if (string.IsNullOrWhiteSpace(companyName) || companyName == "—")
                return string.IsNullOrWhiteSpace(templateDesc) ? null : TruncateDescription(templateDesc);
            if (string.IsNullOrWhiteSpace(templateDesc))
                return TruncateDescription($"Axe analytique (SYSCOHADA) — entité: {companyName}.");
            return TruncateDescription($"{templateDesc} — entité: {companyName}.");
        }

        private static string? NormalizeRelatedAccount(string? s) =>
            string.IsNullOrWhiteSpace(s) ? null : s.Trim().ToUpperInvariant();

        private const int MaxNameLen = 300;
        private const int MaxDescriptionLen = 2000;

        private static string TruncateName(string s) => s.Length <= MaxNameLen ? s : s[..MaxNameLen];

        private static string? TruncateDescription(string? s)
        {
            if (string.IsNullOrEmpty(s)) return s;
            return s.Length <= MaxDescriptionLen ? s : s[..MaxDescriptionLen];
        }

        public async Task<string?> GetJournalLineCostCenterValidationErrorAsync(
            Guid companyId,
            IEnumerable<(string? costCentre, decimal debit, decimal credit)> lines,
            CancellationToken ct = default)
        {
            var activeCodes = await _context.CostCenters
                .AsNoTracking()
                .Where(c => c.CompanyId == companyId && c.IsActive)
                .Select(c => c.Code)
                .ToListAsync(ct);
            if (activeCodes.Count == 0) return null;

            var set = new HashSet<string>(activeCodes, StringComparer.OrdinalIgnoreCase);
            foreach (var (costCentre, debit, credit) in lines)
            {
                if (debit == 0m && credit == 0m) continue;
                var cc = (costCentre ?? string.Empty).Trim();
                if (string.IsNullOrEmpty(cc))
                    return "Chaque ligne avec un montant doit comporter un axe analytique (centre de coût) conforme au plan OHADA, car des centres sont définis pour l'entreprise.";
                if (!set.Contains(cc))
                    return $"Centre de coût non reconnu ou inactif: {cc}. Utilisez un code défini pour cette entreprise (SYSCOHADA).";
            }
            return null;
        }
    }
}
