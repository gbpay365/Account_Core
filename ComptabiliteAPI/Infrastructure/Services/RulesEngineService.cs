using ComptabiliteAPI.Domain.Entities;
using ComptabiliteAPI.DTOs;
using ComptabiliteAPI.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace ComptabiliteAPI.Infrastructure.Services
{
    public interface IRulesEngineService
    {
        Task<RuleEvaluationResult> EvaluateAsync(JournalEntry entry, string triggerEvent, Guid userId, CancellationToken ct = default);
        Task<IReadOnlyList<ValidationRuleDto>> ListRulesAsync(Guid companyId, CancellationToken ct = default);
        Task<ValidationRuleDto> CreateRuleAsync(CreateValidationRuleRequest req, CancellationToken ct = default);
        Task<ValidationRuleDto?> UpdateRuleAsync(Guid id, CreateValidationRuleRequest req, CancellationToken ct = default);
        Task<bool> DeleteRuleAsync(Guid id, Guid companyId, CancellationToken ct = default);
        Task SeedDefaultRulesAsync(Guid companyId, CancellationToken ct = default);
    }

    public class RulesEngineService : IRulesEngineService
    {
        private readonly AppDbContext _db;

        public RulesEngineService(AppDbContext db) => _db = db;

        public async Task<RuleEvaluationResult> EvaluateAsync(
            JournalEntry entry, string triggerEvent, Guid userId, CancellationToken ct = default)
        {
            var result = new RuleEvaluationResult { Passed = true };
            var rules = await _db.ValidationRules.AsNoTracking()
                .Include(r => r.Conditions)
                .Where(r => r.CompanyId == entry.CompanyId && r.IsActive
                    && r.TriggerEvent == triggerEvent)
                .OrderBy(r => r.Priority)
                .ToListAsync(ct);

            if (rules.Count == 0) return result;

            var user = await _db.Users.AsNoTracking()
                .Include(u => u.Role)
                .FirstOrDefaultAsync(u => u.Id == userId, ct);
            var roleName = user?.Role?.Name ?? "";

            var totalDebit = entry.JournalLines?.Sum(l => l.Debit) ?? 0;
            var totalCredit = entry.JournalLines?.Sum(l => l.Credit) ?? 0;
            var lineCount = entry.JournalLines?.Count ?? 0;

            foreach (var rule in rules)
            {
                if (!EvaluateConditions(rule, entry, roleName, totalDebit, totalCredit, lineCount))
                    continue;

                if (rule.Action == "require_approval")
                {
                    result.RequiresApproval = true;
                    continue;
                }

                result.Passed = false;
                result.Errors.Add(string.IsNullOrWhiteSpace(rule.ErrorMessage)
                    ? $"Rule '{rule.Name}' violated."
                    : rule.ErrorMessage);
            }

            return result;
        }

        private static bool EvaluateConditions(
            ValidationRule rule, JournalEntry entry, string roleName,
            decimal totalDebit, decimal totalCredit, int lineCount)
        {
            foreach (var cond in rule.Conditions)
            {
                var actual = cond.Field.ToLowerInvariant() switch
                {
                    "max_amount" => Math.Max(totalDebit, totalCredit),
                    "min_amount" => Math.Max(totalDebit, totalCredit),
                    "total_debit" => totalDebit,
                    "total_credit" => totalCredit,
                    "journal_type" => 0m,
                    "line_count" => lineCount,
                    "fiscal_period" => entry.FiscalPeriod,
                    "fiscal_year" => entry.FiscalYear,
                    "required_role" => 0m,
                    "account_prefix" => 0m,
                    _ => 0m
                };

                if (cond.Field.Equals("journal_type", StringComparison.OrdinalIgnoreCase))
                {
                    if (!MatchString(entry.JournalType, cond.Operator, cond.Value)) return false;
                    continue;
                }
                if (cond.Field.Equals("required_role", StringComparison.OrdinalIgnoreCase))
                {
                    if (!MatchString(roleName, cond.Operator, cond.Value)) return false;
                    continue;
                }
                if (cond.Field.Equals("account_prefix", StringComparison.OrdinalIgnoreCase))
                {
                    var codes = entry.JournalLines?.Select(l => l.AccountCode).ToList() ?? new List<string>();
                    var prefixes = cond.Value.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
                    var op = cond.Operator.ToLowerInvariant();
                    var anyMatch = codes.Any(c => prefixes.Any(p => c.StartsWith(p, StringComparison.OrdinalIgnoreCase)));
                    if (op is "in" or "eq" && !anyMatch) return false;
                    if (op is "not_in" or "neq" && anyMatch) return false;
                    continue;
                }

                if (!MatchNumeric(Convert.ToDecimal(actual), cond.Operator, cond.Value)) return false;
            }
            return true;
        }

        private static bool MatchNumeric(decimal actual, string op, string valueStr)
        {
            if (!decimal.TryParse(valueStr, out var expected)) return false;
            return op.ToLowerInvariant() switch
            {
                "eq" => actual == expected,
                "neq" => actual != expected,
                "gt" => actual > expected,
                "gte" => actual >= expected,
                "lt" => actual < expected,
                "lte" => actual <= expected,
                _ => actual <= expected
            };
        }

        private static bool MatchString(string actual, string op, string value)
        {
            var allowed = value.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
            return op.ToLowerInvariant() switch
            {
                "eq" => allowed.Any(a => actual.Equals(a, StringComparison.OrdinalIgnoreCase)),
                "in" => allowed.Any(a => actual.Equals(a, StringComparison.OrdinalIgnoreCase)),
                "neq" => !allowed.Any(a => actual.Equals(a, StringComparison.OrdinalIgnoreCase)),
                "not_in" => !allowed.Any(a => actual.Equals(a, StringComparison.OrdinalIgnoreCase)),
                "contains" => actual.Contains(value, StringComparison.OrdinalIgnoreCase),
                _ => allowed.Any(a => actual.Equals(a, StringComparison.OrdinalIgnoreCase))
            };
        }

        public async Task<IReadOnlyList<ValidationRuleDto>> ListRulesAsync(Guid companyId, CancellationToken ct = default)
        {
            var rules = await _db.ValidationRules.AsNoTracking()
                .Include(r => r.Conditions)
                .Where(r => r.CompanyId == companyId)
                .OrderBy(r => r.Priority)
                .ToListAsync(ct);
            return rules.Select(MapRule).ToList();
        }

        public async Task<ValidationRuleDto> CreateRuleAsync(CreateValidationRuleRequest req, CancellationToken ct = default)
        {
            var rule = new ValidationRule
            {
                CompanyId = req.CompanyId,
                Name = req.Name.Trim(),
                Description = req.Description?.Trim() ?? "",
                TriggerEvent = req.TriggerEvent.Trim().ToLowerInvariant(),
                Action = req.Action.Trim().ToLowerInvariant(),
                ErrorMessage = req.ErrorMessage.Trim(),
                Priority = req.Priority,
                Conditions = req.Conditions.Select(c => new RuleCondition
                {
                    Field = c.Field.Trim().ToLowerInvariant(),
                    Operator = c.Operator.Trim().ToLowerInvariant(),
                    Value = c.Value.Trim()
                }).ToList()
            };
            await _db.ValidationRules.AddAsync(rule, ct);
            await _db.SaveChangesAsync(ct);
            return MapRule(rule);
        }

        public async Task<ValidationRuleDto?> UpdateRuleAsync(Guid id, CreateValidationRuleRequest req, CancellationToken ct = default)
        {
            var rule = await _db.ValidationRules.Include(r => r.Conditions)
                .FirstOrDefaultAsync(r => r.Id == id && r.CompanyId == req.CompanyId, ct);
            if (rule == null) return null;

            rule.Name = req.Name.Trim();
            rule.Description = req.Description?.Trim() ?? "";
            rule.TriggerEvent = req.TriggerEvent.Trim().ToLowerInvariant();
            rule.Action = req.Action.Trim().ToLowerInvariant();
            rule.ErrorMessage = req.ErrorMessage.Trim();
            rule.Priority = req.Priority;

            _db.RuleConditions.RemoveRange(rule.Conditions);
            rule.Conditions = req.Conditions.Select(c => new RuleCondition
            {
                Field = c.Field.Trim().ToLowerInvariant(),
                Operator = c.Operator.Trim().ToLowerInvariant(),
                Value = c.Value.Trim()
            }).ToList();

            await _db.SaveChangesAsync(ct);
            return MapRule(rule);
        }

        public async Task<bool> DeleteRuleAsync(Guid id, Guid companyId, CancellationToken ct = default)
        {
            var rule = await _db.ValidationRules.FirstOrDefaultAsync(r => r.Id == id && r.CompanyId == companyId, ct);
            if (rule == null) return false;
            _db.ValidationRules.Remove(rule);
            await _db.SaveChangesAsync(ct);
            return true;
        }

        public async Task SeedDefaultRulesAsync(Guid companyId, CancellationToken ct = default)
        {
            if (await _db.ValidationRules.AnyAsync(r => r.CompanyId == companyId, ct)) return;

            await CreateRuleAsync(new CreateValidationRuleRequest
            {
                CompanyId = companyId,
                Name = "Maximum entry amount",
                Description = "Reject entries exceeding 50,000,000 XAF without approval workflow",
                TriggerEvent = "validate",
                Action = "reject",
                ErrorMessage = "Entry amount exceeds the maximum allowed limit (50,000,000 XAF).",
                Priority = 10,
                Conditions = new List<RuleConditionDto>
                {
                    new() { Field = "max_amount", Operator = "gt", Value = "50000000" }
                }
            }, ct);

            await CreateRuleAsync(new CreateValidationRuleRequest
            {
                CompanyId = companyId,
                Name = "Large entry requires approval",
                Description = "Entries over 10,000,000 XAF must go through approval",
                TriggerEvent = "create",
                Action = "require_approval",
                ErrorMessage = "Large entries require validator approval.",
                Priority = 20,
                Conditions = new List<RuleConditionDto>
                {
                    new() { Field = "max_amount", Operator = "gt", Value = "10000000" }
                }
            }, ct);
        }

        private static ValidationRuleDto MapRule(ValidationRule r) => new()
        {
            Id = r.Id, CompanyId = r.CompanyId, Name = r.Name, Description = r.Description,
            TriggerEvent = r.TriggerEvent, Action = r.Action, ErrorMessage = r.ErrorMessage,
            Priority = r.Priority, IsActive = r.IsActive,
            Conditions = r.Conditions.Select(c => new RuleConditionDto
            {
                Id = c.Id, Field = c.Field, Operator = c.Operator, Value = c.Value
            }).ToList()
        };
    }
}
