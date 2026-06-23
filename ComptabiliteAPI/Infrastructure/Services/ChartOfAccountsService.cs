using ComptabiliteAPI.Domain.Entities;
using ComptabiliteAPI.Domain.Interfaces;
using ComptabiliteAPI.DTOs;
using ComptabiliteAPI.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace ComptabiliteAPI.Infrastructure.Services
{
    public class ChartOfAccountsService : IChartOfAccountsService
    {
        private readonly AppDbContext _db;
        private readonly IntegrationNotifyService _integration;

        public ChartOfAccountsService(AppDbContext db, IntegrationNotifyService integration)
        {
            _db = db;
            _integration = integration;
        }

        public static string? GetParentCode(string code, IReadOnlyList<Account> all) =>
            all
                .Where(p => p.Code != code && code.StartsWith(p.Code) && code.Length > p.Code.Length)
                .OrderByDescending(p => p.Code.Length)
                .Select(p => p.Code)
                .FirstOrDefault();

        private static IQueryable<Account> CanonicalAccounts(IQueryable<Account> q) =>
            q.Where(a => a.FiscalYear == null);

        private static int OhadaClassFromCode(string code)
        {
            if (string.IsNullOrEmpty(code) || !char.IsDigit(code[0]))
                throw new ArgumentException("Invalid code.");
            return (int)char.GetNumericValue(code[0]);
        }

        public async Task<IReadOnlyList<AccountAdminDto>> GetFlatAsync(int? classNo, bool includeInactive, string? search, CancellationToken cancellationToken = default)
        {
            var q = CanonicalAccounts(_db.Accounts.AsNoTracking());
            if (!includeInactive) q = q.Where(a => a.IsActive);
            if (classNo is >= 1 and <= 9) q = q.Where(a => a.Class == classNo);
            if (!string.IsNullOrWhiteSpace(search))
            {
                var s = search.Trim();
                q = q.Where(a => a.Code.StartsWith(s) || a.NameEn.Contains(s) || a.NameFr.Contains(s));
            }
            var list = await q.OrderBy(a => a.Code).ToListAsync(cancellationToken);
            return list.Select(a => ToDto(a, list)).ToList();
        }

        public async Task<AccountAdminDto?> GetOneAsync(string code, bool includeInactive = true, CancellationToken cancellationToken = default)
        {
            if (string.IsNullOrWhiteSpace(code)) return null;
            var c = code.Trim();
            var q = CanonicalAccounts(_db.Accounts.AsNoTracking()).Where(a => a.Code == c);
            if (!includeInactive) q = q.Where(a => a.IsActive);
            var a = await q.FirstOrDefaultAsync(cancellationToken);
            if (a == null) return null;
            var all = await CanonicalAccounts(_db.Accounts.AsNoTracking()).ToListAsync(cancellationToken);
            return ToDto(a, all);
        }

        public async Task<AccountAdminDto> CreateAsync(CreateAccountRequest request, CancellationToken cancellationToken = default)
        {
            var code = (request.Code ?? string.Empty).Trim();
            if (string.IsNullOrEmpty(code) || !IsNumericCode(code))
                throw new InvalidOperationException("Compte: utiliser 1 à 20 chiffres (ex. 66, 665, 601).");
            if (code.Length is < 1 or > 20)
                throw new InvalidOperationException("Compte: longueur 1–20 chiffres.");

            if (await CanonicalAccounts(_db.Accounts).AnyAsync(a => a.Code == code, cancellationToken))
                throw new InvalidOperationException($"Le compte {code} existe déjà.");

            var all = await CanonicalAccounts(_db.Accounts).ToListAsync(cancellationToken);
            if (all.Count == 0) throw new InvalidOperationException("Plan comptable de base manquant. Réexécuter le seeder.");
            if (all.Any(a => a.Code != code && a.Code.StartsWith(code) && a.Code.Length > code.Length))
                throw new InvalidOperationException("Impossible: un compte enfant existe déjà (supprimez d’abord les sous-comptes).");

            var parentCode = code.Length == 1 ? null : GetParentCode(code, all);
            if (code.Length > 1 && string.IsNullOrEmpty(parentCode))
                throw new InvalidOperationException("Compte parent introuvable (le préfixe racine, ex. « 6 » pour 665, doit exister).");
            if (!string.IsNullOrEmpty(parentCode))
            {
                var parent = all.FirstOrDefault(p => p.Code == parentCode) ?? throw new InvalidOperationException($"Compte parent « {parentCode} » introuvable.");
                if (!parent.IsActive) throw new InvalidOperationException("Le compte parent est inactif.");
            }

            var classNo = OhadaClassFromCode(code);
            if (classNo is < 1 or > 9) throw new InvalidOperationException("La classe OHADA (1er chiffre) doit être entre 1 et 9.");

            var isLeaf = request.IsLeaf;
            var newRow = new Account
            {
                Code = code,
                NameEn = (request.NameEn ?? string.Empty).Trim(),
                NameFr = (request.NameFr ?? string.Empty).Trim(),
                Class = classNo,
                ParentId = all.FirstOrDefault(p => p.Code == parentCode)?.Id,
                AccountType = (request.AccountType ?? "expense").Trim().ToLowerInvariant(),
                NormalBalance = (request.NormalBalance ?? "debit").Trim().ToLowerInvariant() == "credit" ? "credit" : "debit",
                IsLeaf = isLeaf,
                IsActive = true,
                FiscalYear = null
            };
            if (string.IsNullOrEmpty(newRow.NameEn) && string.IsNullOrEmpty(newRow.NameFr))
                throw new InvalidOperationException("Renseignez au moins un libellé (EN ou FR).");

            await _db.Accounts.AddAsync(newRow, cancellationToken);
            if (!string.IsNullOrEmpty(parentCode))
            {
                var p = await CanonicalAccounts(_db.Accounts).FirstOrDefaultAsync(x => x.Code == parentCode, cancellationToken);
                if (p != null) p.IsLeaf = false;
            }
            await _db.SaveChangesAsync(cancellationToken);

            all = await CanonicalAccounts(_db.Accounts).AsNoTracking().ToListAsync(cancellationToken);
            var created = all.First(x => x.Code == code);
            await _integration.NotifyAccountChangedAsync(created, "account.created", cancellationToken);
            return ToDto(created, all);
        }

        public async Task<AccountAdminDto?> UpdateAsync(string code, UpdateAccountRequest request, CancellationToken cancellationToken = default)
        {
            var c = (code ?? string.Empty).Trim();
            var a = await CanonicalAccounts(_db.Accounts).FirstOrDefaultAsync(x => x.Code == c, cancellationToken);
            if (a == null) return null;

            if (request.NameEn != null) a.NameEn = request.NameEn;
            if (request.NameFr != null) a.NameFr = request.NameFr;
            if (request.AccountType != null) a.AccountType = request.AccountType.Trim().ToLowerInvariant();
            if (request.NormalBalance != null) a.NormalBalance = request.NormalBalance.Trim().ToLowerInvariant() == "credit" ? "credit" : "debit";
            if (request.IsActive.HasValue) a.IsActive = request.IsActive.Value;
            if (request.IsLeaf.HasValue)
            {
                var allChk = await CanonicalAccounts(_db.Accounts).ToListAsync(cancellationToken);
                if (request.IsLeaf.Value)
                {
                    if (allChk.Any(x => x.Code != a.Code && GetParentCode(x.Code, allChk) == a.Code && x.IsActive))
                        throw new InvalidOperationException("Impossible de marquer en postable: des sous-comptes actifs existent — supprimez-les ou repassez-les ailleurs.");
                }
                a.IsLeaf = request.IsLeaf.Value;
            }

            await _db.SaveChangesAsync(cancellationToken);
            var allOut = await CanonicalAccounts(_db.Accounts).AsNoTracking().ToListAsync(cancellationToken);
            var updated = allOut.First(x => x.Code == c);
            await _integration.NotifyAccountChangedAsync(updated, "account.updated", cancellationToken);
            return ToDto(updated, allOut);
        }

        public async Task<DeleteAccountResult> DeleteAsync(string code, bool forceSoftDeleteIfInUse, CancellationToken cancellationToken = default)
        {
            var c = (code ?? string.Empty).Trim();
            var a = await CanonicalAccounts(_db.Accounts).FirstOrDefaultAsync(x => x.Code == c, cancellationToken);
            if (a == null) return new DeleteAccountResult { Ok = false, Error = "Compte introuvable." };
            if (a.Code.Length == 1)
                return new DeleteAccountResult { Ok = false, Error = "Les comptes de racine (une classe) ne sont pas supprimables." };

            var all = await CanonicalAccounts(_db.Accounts).ToListAsync(cancellationToken);
            if (all.Any(x => x.Code != a.Code && GetParentCode(x.Code, all) == a.Code))
                return new DeleteAccountResult { Ok = false, Error = "Supprimez d’abord les sous-comptes." };

            if (await _db.CostCenters.AnyAsync(cc => cc.RelatedAccountCode == a.Code, cancellationToken))
                return new DeleteAccountResult { Ok = false, Error = "Compte lié à un centre de coût (RelatedAccountCode). Détachez-le d’abord." };

            var parentCodeBefore = GetParentCode(c, all);
            var inJournal = await _db.JournalLines
                .AsNoTracking()
                .AnyAsync(jl => jl.AccountCode == a.Code, cancellationToken);
            if (inJournal)
            {
                if (forceSoftDeleteIfInUse)
                {
                    a.IsActive = false;
                    a.IsLeaf = true;
                    await _db.SaveChangesAsync(cancellationToken);
                    if (!string.IsNullOrEmpty(parentCodeBefore))
                    {
                        await RefreshParentLeafIfNoChildrenAsync(parentCodeBefore, cancellationToken);
                    }
                    return new DeleteAccountResult { Ok = true, Deactivated = true };
                }
                return new DeleteAccountResult { Ok = false, Error = "Ce compte a des écritures. Passez ?force=true pour le désactiver, ou reclassifiez les écritures." };
            }

            _db.Accounts.Remove(a);
            await _db.SaveChangesAsync(cancellationToken);

            if (!string.IsNullOrEmpty(parentCodeBefore))
            {
                await RefreshParentLeafIfNoChildrenAsync(parentCodeBefore, cancellationToken);
            }

            return new DeleteAccountResult { Ok = true, Deactivated = false };
        }

        private async Task RefreshParentLeafIfNoChildrenAsync(string parentCode, CancellationToken cancellationToken)
        {
            var all = await CanonicalAccounts(_db.Accounts).ToListAsync(cancellationToken);
            var p = all.FirstOrDefault(x => x.Code == parentCode);
            if (p == null) return;
            var hasChild = all.Any(x => x.Code != p.Code && GetParentCode(x.Code, all) == p.Code);
            if (!hasChild) p.IsLeaf = true;
            await _db.SaveChangesAsync(cancellationToken);
        }

        private static AccountAdminDto ToDto(Account a, IReadOnlyList<Account> all) => new()
        {
            Id = a.Id,
            Code = a.Code,
            NameEn = a.NameEn,
            NameFr = a.NameFr,
            Class = a.Class,
            ParentCode = GetParentCode(a.Code, all),
            AccountType = a.AccountType,
            NormalBalance = a.NormalBalance,
            IsLeaf = a.IsLeaf,
            IsActive = a.IsActive
        };

        private static bool IsNumericCode(string code)
        {
            foreach (var ch in code)
            {
                if (ch < '0' || ch > '9') return false;
            }
            return true;
        }
    }
}
