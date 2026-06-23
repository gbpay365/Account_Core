using ComptabiliteAPI.Domain.Entities;
using ComptabiliteAPI.Domain.Interfaces;
using ComptabiliteAPI.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace ComptabiliteAPI.Infrastructure.Services
{
    public class AssetService : IAssetService
    {
        private readonly AppDbContext _db;
        private readonly IFiscalPeriodService _fiscal;
        private readonly IntegrationContextResolver _integration;

        public AssetService(AppDbContext db, IFiscalPeriodService fiscal, IntegrationContextResolver integration)
        {
            _db = db;
            _fiscal = fiscal;
            _integration = integration;
        }

        public IReadOnlyList<AssetCategoryDefaults> GetCategoryDefaults() => AssetOhadaDefaults.Categories;

        public async Task<IReadOnlyList<FixedAsset>> ListAsync(Guid companyId, string? status = null, string? category = null, CancellationToken ct = default)
        {
            var q = _db.FixedAssets.AsNoTracking().Where(a => a.CompanyId == companyId);
            if (!string.IsNullOrWhiteSpace(status)) q = q.Where(a => a.Status == status);
            if (!string.IsNullOrWhiteSpace(category)) q = q.Where(a => a.Category == category);
            return await q.OrderBy(a => a.Code).ToListAsync(ct);
        }

        public async Task<FixedAssetDetailDto> GetDetailAsync(Guid assetId, CancellationToken ct = default)
        {
            var asset = await _db.FixedAssets
                .Include(a => a.DepreciationLines)
                .Include(a => a.Components)
                .Include(a => a.Events)
                .FirstOrDefaultAsync(a => a.Id == assetId, ct)
                ?? throw new InvalidOperationException("Asset not found.");

            var accDep = asset.DepreciationLines.Sum(l => l.Amount);
            var gross = asset.ActiveCost > 0 ? asset.ActiveCost : asset.Cost;
            return new FixedAssetDetailDto
            {
                Asset = asset,
                AccumulatedDepreciation = accDep,
                NetBookValue = Math.Max(0, gross - accDep),
                DepreciationLines = asset.DepreciationLines.OrderByDescending(l => l.PeriodYearMonth).ToList(),
                Events = asset.Events.OrderByDescending(e => e.EventDate).ToList(),
                Components = asset.Components.ToList(),
            };
        }

        public async Task<FixedAsset> CreateAsync(FixedAsset asset, IReadOnlyList<FixedAssetComponent>? components = null, CancellationToken ct = default)
        {
            ApplyCategoryDefaults(asset);
            if (asset.ActiveCost <= 0) asset.ActiveCost = asset.Cost;
            asset.Status = "draft";
            asset.Code = asset.Code.Trim();
            asset.Name = asset.Name.Trim();

            if (await _db.FixedAssets.AnyAsync(a => a.CompanyId == asset.CompanyId && a.Code == asset.Code, ct))
                throw new InvalidOperationException("Fixed asset code already exists.");

            if (!string.IsNullOrWhiteSpace(asset.ExternalHmsRef))
            {
                var dup = await _db.FixedAssets.AnyAsync(a => a.CompanyId == asset.CompanyId && a.ExternalHmsRef == asset.ExternalHmsRef, ct);
                if (dup) throw new InvalidOperationException("HMS reference already capitalized.");
            }

            await _db.FixedAssets.AddAsync(asset, ct);
            if (components != null)
            {
                foreach (var c in components)
                {
                    c.FixedAssetId = asset.Id;
                    await _db.FixedAssetComponents.AddAsync(c, ct);
                }
            }

            await _db.SaveChangesAsync(ct);
            return asset;
        }

        public async Task<FixedAsset> UpdateAsync(FixedAsset asset, CancellationToken ct = default)
        {
            var existing = await _db.FixedAssets.FirstOrDefaultAsync(a => a.Id == asset.Id, ct)
                ?? throw new InvalidOperationException("Asset not found.");
            if (existing.Status is "disposed" or "written_off")
                throw new InvalidOperationException("Disposed assets cannot be edited.");

            existing.Name = asset.Name.Trim();
            existing.Category = asset.Category;
            existing.SerialNumber = asset.SerialNumber ?? string.Empty;
            existing.Location = asset.Location ?? string.Empty;
            existing.Custodian = asset.Custodian ?? string.Empty;
            existing.UsefulLifeMonths = asset.UsefulLifeMonths;
            existing.SalvageValue = asset.SalvageValue;
            existing.CostCenterId = asset.CostCenterId;
            existing.AnalyticAccountId = asset.AnalyticAccountId;
            if (existing.Status == "draft")
            {
                existing.Cost = asset.Cost;
                existing.ActiveCost = asset.Cost;
                existing.AcquisitionDate = asset.AcquisitionDate;
                ApplyCategoryDefaults(existing);
                existing.AssetAccountCode = asset.AssetAccountCode;
                existing.AccumulatedDepreciationAccountCode = asset.AccumulatedDepreciationAccountCode;
                existing.DepreciationExpenseAccountCode = asset.DepreciationExpenseAccountCode;
                existing.CreditAccountCode = asset.CreditAccountCode;
            }

            await _db.SaveChangesAsync(ct);
            return existing;
        }

        public async Task<FixedAssetComponent> AddComponentAsync(Guid assetId, FixedAssetComponent component, CancellationToken ct = default)
        {
            var asset = await _db.FixedAssets.Include(a => a.Components).FirstOrDefaultAsync(a => a.Id == assetId, ct)
                ?? throw new InvalidOperationException("Asset not found.");
            if (asset.Status is not ("draft" or "active"))
                throw new InvalidOperationException("Components can only be added to draft or active assets.");

            component.FixedAssetId = assetId;
            component.Name = component.Name.Trim();
            await _db.FixedAssetComponents.AddAsync(component, ct);
            await _db.SaveChangesAsync(ct);
            return component;
        }

        public async Task<FixedAsset> PostAcquisitionAsync(Guid assetId, Guid userId, string? creditAccountCode = null, CancellationToken ct = default)
        {
            var asset = await LoadTrackedAsync(assetId, ct);
            if (asset.AcquisitionJournalEntryId.HasValue)
                throw new InvalidOperationException("Acquisition already posted.");
            if (asset.Cost <= 0)
                throw new InvalidOperationException("Asset cost must be greater than zero.");

            var credit = string.IsNullOrWhiteSpace(creditAccountCode) ? asset.CreditAccountCode : creditAccountCode.Trim();
            await _fiscal.EnsurePeriodUnlockedForDateAsync(asset.CompanyId, asset.AcquisitionDate, ct);

            var amount = asset.ActiveCost > 0 ? asset.ActiveCost : asset.Cost;
            var entry = await CreateJournalAsync(asset.CompanyId, userId, asset.AcquisitionDate, "IMM",
                $"Acquisition {asset.Code} · {asset.Name}",
                new[]
                {
                    new JournalLine { AccountCode = asset.AssetAccountCode, Debit = amount, Credit = 0, LineDescription = asset.Name },
                    new JournalLine { AccountCode = credit, Debit = 0, Credit = amount, LineDescription = "Acquisition" },
                }, asset.AnalyticAccountId, ct);

            asset.AcquisitionJournalEntryId = entry.Id;
            asset.Status = "active";
            asset.ActiveCost = amount;
            await AddEventAsync(asset, "acquisition", asset.AcquisitionDate, amount, entry.Id, userId, null, ct);
            await _db.SaveChangesAsync(ct);
            return asset;
        }

        public async Task<FixedAssetDepreciationLine?> PostMonthlyDepreciationAsync(Guid assetId, int periodYearMonth, Guid userId, CancellationToken ct = default)
        {
            var asset = await LoadTrackedAsync(assetId, ct);
            if (asset.Status != "active") return null;
            if (asset.DisposalDate.HasValue) return null;

            var existing = await _db.FixedAssetDepreciationLines.FirstOrDefaultAsync(
                l => l.FixedAssetId == assetId && l.PeriodYearMonth == periodYearMonth && l.FixedAssetComponentId == null, ct);
            if (existing != null) return existing;

            var postingDate = PeriodEndDate(periodYearMonth);
            await _fiscal.EnsurePeriodUnlockedForDateAsync(asset.CompanyId, postingDate, ct);

            var components = await _db.FixedAssetComponents.Where(c => c.FixedAssetId == assetId).ToListAsync(ct);
            decimal totalMonthly = 0;
            if (components.Count > 0)
            {
                foreach (var comp in components)
                {
                    var compDep = await PostComponentDepreciationAsync(asset, comp, periodYearMonth, userId, postingDate, ct);
                    totalMonthly += compDep;
                }
                if (totalMonthly <= 0) return null;
            }
            else
            {
                var monthly = ComputeMonthlyAmount(asset);
                if (monthly <= 0) return null;
                var entry = await CreateDepreciationJournalAsync(asset, monthly, periodYearMonth, userId, postingDate, null, ct);
                var depLine = new FixedAssetDepreciationLine
                {
                    FixedAssetId = assetId,
                    PeriodYearMonth = periodYearMonth,
                    Amount = monthly,
                    PostedJournalEntryId = entry.Id,
                };
                await _db.FixedAssetDepreciationLines.AddAsync(depLine, ct);
                await AddEventAsync(asset, "depreciation", postingDate, monthly, entry.Id, userId, $"Period {periodYearMonth}", ct);
                totalMonthly = monthly;
            }

            await _db.SaveChangesAsync(ct);
            return await _db.FixedAssetDepreciationLines.FirstOrDefaultAsync(
                l => l.FixedAssetId == assetId && l.PeriodYearMonth == periodYearMonth && l.FixedAssetComponentId == null, ct);
        }

        public async Task<BatchDepreciationResult> RunBatchDepreciationAsync(Guid companyId, int periodYearMonth, Guid userId, CancellationToken ct = default)
        {
            var result = new BatchDepreciationResult();
            var assets = await _db.FixedAssets.Where(a => a.CompanyId == companyId && a.Status == "active").ToListAsync(ct);
            foreach (var asset in assets)
            {
                try
                {
                    var line = await PostMonthlyDepreciationAsync(asset.Id, periodYearMonth, userId, ct);
                    if (line != null) result.Posted++;
                    else { result.Skipped++; result.Messages.Add($"{asset.Code}: nothing to post"); }
                }
                catch (Exception ex)
                {
                    result.Skipped++;
                    result.Messages.Add($"{asset.Code}: {ex.Message}");
                }
            }
            return result;
        }

        public async Task<FixedAsset> RequestDisposalAsync(Guid assetId, Guid userId, DateTime disposalDate, decimal? proceeds, string? notes, CancellationToken ct = default)
        {
            var asset = await LoadTrackedAsync(assetId, ct);
            if (asset.Status != "active")
                throw new InvalidOperationException("Only active assets can be disposed.");
            asset.Status = "pending_disposal";
            asset.DisposalDate = disposalDate;
            asset.DisposalProceeds = proceeds;
            asset.DisposalNotes = notes ?? string.Empty;
            asset.DisposalRequestedByUserId = userId;
            asset.DisposalRequestedAt = DateTime.UtcNow;
            asset.DisposalApprovedByUserId = null;
            asset.DisposalApprovedAt = null;
            await AddEventAsync(asset, "approval", disposalDate, proceeds ?? 0, null, userId, "Disposal requested", ct);
            await _db.SaveChangesAsync(ct);
            return asset;
        }

        public async Task<FixedAsset> ApproveDisposalAsync(Guid assetId, Guid approverUserId, CancellationToken ct = default)
        {
            var asset = await LoadTrackedAsync(assetId, ct);
            if (asset.Status != "pending_disposal")
                throw new InvalidOperationException("Asset is not pending disposal approval.");
            asset.DisposalApprovedByUserId = approverUserId;
            asset.DisposalApprovedAt = DateTime.UtcNow;
            await AddEventAsync(asset, "approval", asset.DisposalDate ?? DateTime.UtcNow.Date, 0, null, approverUserId, "Disposal approved", ct);
            await _db.SaveChangesAsync(ct);
            return asset;
        }

        public async Task<FixedAsset> PostDisposalAsync(Guid assetId, Guid userId, decimal? partialAmount = null, CancellationToken ct = default)
        {
            var asset = await LoadTrackedAsync(assetId, ct);
            if (asset.Status is not ("active" or "pending_disposal"))
                throw new InvalidOperationException("Asset cannot be disposed in current status.");
            if (asset.Status == "pending_disposal" && !asset.DisposalApprovedByUserId.HasValue)
                throw new InvalidOperationException("Disposal must be approved before posting.");

            var disposalDate = asset.DisposalDate ?? DateTime.UtcNow.Date;
            await _fiscal.EnsurePeriodUnlockedForDateAsync(asset.CompanyId, disposalDate, ct);

            var gross = asset.ActiveCost > 0 ? asset.ActiveCost : asset.Cost;
            var disposeGross = partialAmount.HasValue && partialAmount > 0
                ? Math.Min(partialAmount.Value, gross)
                : gross;
            var ratio = gross > 0 ? disposeGross / gross : 1m;

            var totalAccDep = await _db.FixedAssetDepreciationLines.Where(l => l.FixedAssetId == assetId).SumAsync(l => l.Amount, ct);
            var accDepPortion = Math.Round(totalAccDep * ratio, 2);
            var nbv = disposeGross - accDepPortion;
            var proceeds = asset.DisposalProceeds ?? 0;
            var partialProceeds = Math.Round(proceeds * ratio, 2);
            var gainLoss = partialProceeds - nbv;

            var lines = new List<JournalLine>
            {
                new() { AccountCode = asset.AccumulatedDepreciationAccountCode, Debit = accDepPortion, Credit = 0, LineDescription = "Accumulated depreciation" },
                new() { AccountCode = asset.AssetAccountCode, Debit = 0, Credit = disposeGross, LineDescription = asset.Name },
            };
            if (partialProceeds > 0)
                lines.Add(new JournalLine { AccountCode = asset.CreditAccountCode, Debit = partialProceeds, Credit = 0, LineDescription = "Disposal proceeds" });
            if (gainLoss > 0.01m)
                lines.Add(new JournalLine { AccountCode = await ResolveAccountAsync("822000", "82"), Debit = 0, Credit = gainLoss, LineDescription = "Gain on disposal" });
            else if (gainLoss < -0.01m)
                lines.Add(new JournalLine { AccountCode = await ResolveAccountAsync("812000", "81"), Debit = -gainLoss, Credit = 0, LineDescription = "Loss on disposal" });

            var entry = await CreateJournalAsync(asset.CompanyId, userId, disposalDate, "IMM",
                $"Disposal {asset.Code}", lines, asset.AnalyticAccountId, ct);

            asset.DisposalJournalEntryId = entry.Id;
            var isPartial = partialAmount.HasValue && partialAmount < gross - 0.01m;
            if (isPartial)
            {
                asset.ActiveCost = gross - disposeGross;
                asset.Cost = asset.ActiveCost;
                asset.DisposalProceeds = null;
                asset.DisposalDate = null;
                asset.Status = "active";
                asset.DisposalApprovedByUserId = null;
                await AddEventAsync(asset, "partial_disposal", disposalDate, disposeGross, entry.Id, userId, null, ct);
            }
            else
            {
                asset.Status = "disposed";
                asset.DisposalDate = disposalDate;
                await AddEventAsync(asset, "disposal", disposalDate, disposeGross, entry.Id, userId, null, ct);
            }

            await _db.SaveChangesAsync(ct);
            return asset;
        }

        public async Task<FixedAsset> PostWriteOffAsync(Guid assetId, Guid userId, DateTime writeOffDate, string? notes, CancellationToken ct = default)
        {
            var asset = await LoadTrackedAsync(assetId, ct);
            if (asset.Status != "active")
                throw new InvalidOperationException("Only active assets can be written off.");
            asset.DisposalDate = writeOffDate;
            asset.DisposalProceeds = 0;
            asset.DisposalNotes = notes ?? "Write-off";
            asset.DisposalApprovedByUserId = userId;
            asset.DisposalApprovedAt = DateTime.UtcNow;
            asset.Status = "pending_disposal";
            await _db.SaveChangesAsync(ct);
            await PostDisposalAsync(assetId, userId, null, ct);
            asset = await LoadTrackedAsync(assetId, ct);
            asset.Status = "written_off";
            await AddEventAsync(asset, "write_off", writeOffDate, asset.ActiveCost, asset.DisposalJournalEntryId, userId, notes, ct);
            await _db.SaveChangesAsync(ct);
            return asset;
        }

        public async Task<FixedAsset> PostRevaluationAsync(Guid assetId, Guid userId, decimal newActiveCost, string? notes, CancellationToken ct = default)
        {
            var asset = await LoadTrackedAsync(assetId, ct);
            if (asset.Status != "active")
                throw new InvalidOperationException("Only active assets can be revalued.");

            var oldCost = asset.ActiveCost > 0 ? asset.ActiveCost : asset.Cost;
            var delta = newActiveCost - oldCost;
            if (Math.Abs(delta) < 0.01m)
                throw new InvalidOperationException("New value equals current active cost.");

            var entryDate = DateTime.UtcNow.Date;
            await _fiscal.EnsurePeriodUnlockedForDateAsync(asset.CompanyId, entryDate, ct);
            var reserve = await ResolveAccountAsync("105000", "105");

            List<JournalLine> lines;
            if (delta > 0)
            {
                lines = new List<JournalLine>
                {
                    new() { AccountCode = asset.AssetAccountCode, Debit = delta, Credit = 0 },
                    new() { AccountCode = reserve, Debit = 0, Credit = delta },
                };
            }
            else
            {
                var abs = -delta;
                lines = new List<JournalLine>
                {
                    new() { AccountCode = reserve, Debit = abs, Credit = 0 },
                    new() { AccountCode = asset.AssetAccountCode, Debit = 0, Credit = abs },
                };
            }

            var entry = await CreateJournalAsync(asset.CompanyId, userId, entryDate, "IMM",
                $"Revaluation {asset.Code}", lines, asset.AnalyticAccountId, ct);

            asset.ActiveCost = newActiveCost;
            asset.Cost = newActiveCost;
            asset.RevaluationAmount += delta;
            await AddEventAsync(asset, "revaluation", entryDate, delta, entry.Id, userId, notes, ct);
            await _db.SaveChangesAsync(ct);
            return asset;
        }

        public async Task<FixedAsset> CapitalizeFromSupplierInvoiceAsync(Guid companyId, Guid supplierInvoiceId, Guid userId, CapitalizeFromInvoiceRequest req, CancellationToken ct = default)
        {
            if (await _db.FixedAssets.AnyAsync(a => a.SupplierInvoiceId == supplierInvoiceId, ct))
                throw new InvalidOperationException("Invoice already capitalized.");

            var invoice = await _db.SupplierInvoices
                .Include(i => i.Supplier)
                .Include(i => i.Lines)
                .FirstOrDefaultAsync(i => i.Id == supplierInvoiceId && i.Supplier!.CompanyId == companyId, ct)
                ?? throw new InvalidOperationException("Supplier invoice not found.");
            if (invoice.Status is not ("posted" or "paid"))
                throw new InvalidOperationException("Invoice must be posted before capitalization.");

            var defaultName = invoice.Lines.OrderBy(l => l.LineNumber).FirstOrDefault()?.Description;
            if (string.IsNullOrWhiteSpace(defaultName))
                defaultName = $"Asset from {invoice.InvoiceNumber}";

            var asset = new FixedAsset
            {
                CompanyId = companyId,
                Code = string.IsNullOrWhiteSpace(req.Code) ? $"FA-{DateTime.UtcNow:yyyyMMdd}-{Guid.NewGuid().ToString()[..6].ToUpperInvariant()}" : req.Code.Trim(),
                Name = string.IsNullOrWhiteSpace(req.Name) ? defaultName.Trim() : req.Name.Trim(),
                Category = req.Category,
                AcquisitionDate = invoice.IssueDate,
                Cost = 0,
                ActiveCost = 0,
                UsefulLifeMonths = req.UsefulLifeMonths > 0 ? req.UsefulLifeMonths : AssetOhadaDefaults.Resolve(req.Category).DefaultUsefulLifeMonths,
                SupplierInvoiceId = supplierInvoiceId,
                SerialNumber = req.SerialNumber ?? string.Empty,
                Location = req.Location ?? string.Empty,
                CreditAccountCode = invoice.Supplier?.AccountCode ?? "401100",
            };

            await CreateAsync(asset, null, ct);
            var capitalizableAmount = await ResolveCapitalizableAmountAsync(invoice, req.Amount, ct);
            if (capitalizableAmount <= 0)
                throw new InvalidOperationException("No capitalizable amount found on this invoice.");

            asset.Cost = capitalizableAmount;
            asset.ActiveCost = capitalizableAmount;
            await _db.SaveChangesAsync(ct);

            return await PostCapitalizationFromInvoiceAsync(asset, invoice, userId, capitalizableAmount, ct);
        }

        private async Task<decimal> ResolveCapitalizableAmountAsync(SupplierInvoice invoice, decimal requestedAmount, CancellationToken ct)
        {
            if (requestedAmount > 0)
                return requestedAmount;

            if (invoice.JournalEntryId.HasValue)
            {
                var journalLines = await _db.JournalLines.AsNoTracking()
                    .Where(l => l.EntryId == invoice.JournalEntryId.Value)
                    .ToListAsync(ct);
                if (journalLines.Count > 0)
                {
                    var analysis = await AnalyzeInvoiceDebitsAsync(journalLines, ct);
                    var fromJournal = analysis.Class2Debit + analysis.ReclassSourceTotal;
                    if (fromJournal > 0)
                        return fromJournal;
                }
            }

            var fromLines = invoice.Lines.Sum(l => l.AmountHt);
            return fromLines > 0 ? fromLines : invoice.AmountTtc;
        }

        private async Task<FixedAsset> PostCapitalizationFromInvoiceAsync(
            FixedAsset asset, SupplierInvoice invoice, Guid userId, decimal amount, CancellationToken ct)
        {
            await _fiscal.EnsurePeriodUnlockedForDateAsync(asset.CompanyId, asset.AcquisitionDate, ct);
            var tracked = await LoadTrackedAsync(asset.Id, ct);

            if (!invoice.JournalEntryId.HasValue)
                return await PostAcquisitionAsync(tracked.Id, userId, tracked.CreditAccountCode, ct);

            var journalLines = await _db.JournalLines.AsNoTracking()
                .Where(l => l.EntryId == invoice.JournalEntryId.Value)
                .ToListAsync(ct);
            if (journalLines.Count == 0)
                return await PostAcquisitionAsync(tracked.Id, userId, tracked.CreditAccountCode, ct);

            var analysis = await AnalyzeInvoiceDebitsAsync(journalLines, ct);
            var capitalizableTotal = analysis.Class2Debit + analysis.ReclassSourceTotal;
            if (capitalizableTotal > 0 && amount > capitalizableTotal + 0.01m)
                throw new InvalidOperationException("Capitalized amount exceeds capitalizable debits on the invoice journal.");

            var targetAssetAccount = tracked.AssetAccountCode;
            var expenseToReclass = Math.Min(amount, analysis.ReclassSourceTotal);
            var class2Portion = Math.Min(amount - expenseToReclass, analysis.Class2Debit);

            if (expenseToReclass <= 0.01m)
            {
                var targetPosted = analysis.Class2ByAccount.GetValueOrDefault(targetAssetAccount, 0);
                if (targetPosted >= amount - 0.01m)
                    return await ActivateCapitalizedAssetAsync(tracked, invoice.JournalEntryId.Value, amount, userId,
                        "Capitalized from AP — GL already on class 2", ct);

                if (analysis.Class2Debit >= amount - 0.01m)
                {
                    var class2Sources = ScaleDebitAccounts(analysis.Class2ByAccount, amount, analysis.Class2Debit);
                    var entry = await PostReclassificationJournalAsync(tracked, invoice, userId, targetAssetAccount, class2Sources, amount,
                        "Reclass class 2 · capitalize from AP", ct);
                    return await ActivateCapitalizedAssetAsync(tracked, entry.Id, amount, userId,
                        "Capitalized from AP — reclassified within class 2", ct);
                }

                throw new InvalidOperationException(
                    "Invoice journal does not contain enough class 2 debits for capitalization without expense reclassification.");
            }

            var sources = ScaleDebitAccounts(analysis.ReclassSourceByAccount, expenseToReclass, analysis.ReclassSourceTotal);
            var reclassEntry = await PostReclassificationJournalAsync(tracked, invoice, userId, targetAssetAccount, sources, expenseToReclass,
                "Reclass expense/stock · capitalize from AP", ct);

            if (class2Portion >= amount - expenseToReclass - 0.01m)
            {
                return await ActivateCapitalizedAssetAsync(tracked, reclassEntry.Id, amount, userId,
                    $"Capitalized from AP — reclassified {expenseToReclass:N2}; class 2 portion on invoice journal", ct);
            }

            return await ActivateCapitalizedAssetAsync(tracked, reclassEntry.Id, amount, userId,
                "Capitalized from AP — reclassified from expense/stock", ct);
        }

        private async Task<JournalEntry> PostReclassificationJournalAsync(
            FixedAsset asset, SupplierInvoice invoice, Guid userId, string targetAssetAccount,
            IReadOnlyDictionary<string, decimal> creditByAccount, decimal amount, string lineNote, CancellationToken ct)
        {
            if (amount <= 0 || creditByAccount.Count == 0)
                throw new InvalidOperationException("Nothing to reclassify.");

            var creditTotal = creditByAccount.Values.Sum();
            if (Math.Abs(creditTotal - amount) > 0.02m)
                throw new InvalidOperationException("Reclassification amounts are unbalanced.");

            var lines = new List<JournalLine>
            {
                new()
                {
                    AccountCode = targetAssetAccount,
                    Debit = amount,
                    Credit = 0,
                    LineDescription = asset.Name,
                },
            };

            foreach (var (accountCode, credit) in creditByAccount.OrderBy(kv => kv.Key))
            {
                if (credit <= 0) continue;
                lines.Add(new JournalLine
                {
                    AccountCode = accountCode,
                    Debit = 0,
                    Credit = credit,
                    LineDescription = lineNote,
                });
            }

            return await CreateJournalAsync(
                asset.CompanyId,
                userId,
                asset.AcquisitionDate,
                "IMM",
                $"Capitalize {asset.Code} · {invoice.InvoiceNumber}",
                lines,
                asset.AnalyticAccountId,
                ct);
        }

        private async Task<FixedAsset> ActivateCapitalizedAssetAsync(
            FixedAsset asset, Guid journalEntryId, decimal amount, Guid userId, string? notes, CancellationToken ct)
        {
            if (asset.AcquisitionJournalEntryId.HasValue)
                throw new InvalidOperationException("Acquisition already posted.");

            asset.AcquisitionJournalEntryId = journalEntryId;
            asset.Status = "active";
            asset.ActiveCost = amount;
            asset.Cost = amount;
            await AddEventAsync(asset, "acquisition", asset.AcquisitionDate, amount, journalEntryId, userId, notes, ct);
            await _db.SaveChangesAsync(ct);
            return asset;
        }

        private async Task<InvoiceDebitAnalysis> AnalyzeInvoiceDebitsAsync(IReadOnlyList<JournalLine> lines, CancellationToken ct)
        {
            var class2 = new Dictionary<string, decimal>();
            var reclassSources = new Dictionary<string, decimal>();

            foreach (var line in lines.Where(l => l.Debit > 0))
            {
                if (IsVatAccount(line.AccountCode))
                    continue;

                var accountClass = await ResolveAccountClassAsync(line.AccountCode, ct);
                if (accountClass == 2)
                    class2[line.AccountCode] = class2.GetValueOrDefault(line.AccountCode) + line.Debit;
                else if (accountClass is 3 or 6)
                    reclassSources[line.AccountCode] = reclassSources.GetValueOrDefault(line.AccountCode) + line.Debit;
            }

            return new InvoiceDebitAnalysis(class2, reclassSources);
        }

        private static Dictionary<string, decimal> ScaleDebitAccounts(
            IReadOnlyDictionary<string, decimal> accounts, decimal targetTotal, decimal sourceTotal)
        {
            if (sourceTotal <= 0 || accounts.Count == 0)
                return new Dictionary<string, decimal>();

            if (Math.Abs(targetTotal - sourceTotal) < 0.01m)
                return accounts.ToDictionary(kv => kv.Key, kv => kv.Value);

            var ratio = targetTotal / sourceTotal;
            var scaled = accounts.ToDictionary(kv => kv.Key, kv => Math.Round(kv.Value * ratio, 2));
            var drift = targetTotal - scaled.Values.Sum();
            if (Math.Abs(drift) >= 0.01m && scaled.Count > 0)
            {
                var firstKey = scaled.Keys.First();
                scaled[firstKey] = Math.Round(scaled[firstKey] + drift, 2);
            }
            return scaled;
        }

        private static bool IsVatAccount(string accountCode)
            => accountCode.TrimStart().StartsWith("445", StringComparison.Ordinal);

        private async Task<int> ResolveAccountClassAsync(string accountCode, CancellationToken ct)
        {
            var code = accountCode.Trim();
            var account = await _db.Accounts.AsNoTracking().FirstOrDefaultAsync(a => a.Code == code, ct);
            if (account != null)
                return account.Class;

            return code.Length > 0 && char.IsDigit(code[0]) ? code[0] - '0' : 0;
        }

        private sealed record InvoiceDebitAnalysis(
            Dictionary<string, decimal> Class2ByAccount,
            Dictionary<string, decimal> ReclassSourceByAccount)
        {
            public decimal Class2Debit => Class2ByAccount.Values.Sum();
            public decimal ReclassSourceTotal => ReclassSourceByAccount.Values.Sum();
        }

        public async Task<(int statusCode, object body)> IngestFromHmsAsync(int facilityId, HmsFixedAssetIngestDto dto, Guid userId, CancellationToken ct = default)
        {
            if (!_integration.IsEnabled)
                return (503, new { error = "Integrations disabled." });

            var companyId = await _integration.ResolveCompanyIdAsync(facilityId, ct);
            var extRef = dto.ExternalRef.Trim();
            if (string.IsNullOrWhiteSpace(extRef))
                return (422, new { error = "external_ref required." });

            var exists = await _db.FixedAssets.AnyAsync(a => a.CompanyId == companyId && a.ExternalHmsRef == extRef, ct);
            if (exists)
                return (409, new { status = "duplicate", externalRef = extRef });

            var asset = new FixedAsset
            {
                CompanyId = companyId,
                Code = string.IsNullOrWhiteSpace(dto.Code) ? $"HMS-{extRef}" : dto.Code.Trim(),
                Name = dto.Name.Trim(),
                Category = dto.Category,
                AcquisitionDate = dto.AcquisitionDate,
                Cost = dto.Cost,
                ActiveCost = dto.Cost,
                UsefulLifeMonths = dto.UsefulLifeMonths > 0 ? dto.UsefulLifeMonths : AssetOhadaDefaults.Resolve(dto.Category).DefaultUsefulLifeMonths,
                SerialNumber = dto.SerialNumber ?? string.Empty,
                Location = dto.Location ?? string.Empty,
                Custodian = dto.Custodian ?? string.Empty,
                ExternalHmsRef = extRef,
                CreditAccountCode = dto.CreditAccountCode ?? "401100",
            };

            if (!string.IsNullOrWhiteSpace(dto.PurchaseOrderRef))
                asset.DisposalNotes = $"PO:{dto.PurchaseOrderRef}";

            await CreateAsync(asset, null, ct);
            if (dto.PostAcquisition)
                await PostAcquisitionAsync(asset.Id, userId, dto.CreditAccountCode, ct);

            return (200, new { status = "created", assetId = asset.Id, asset.Code, asset.Status });
        }

        public async Task<AssetRegisterReportDto> GetRegisterReportAsync(Guid companyId, DateTime? asOf, CancellationToken ct = default)
        {
            var asOfDate = (asOf ?? DateTime.UtcNow).Date;
            var assets = await _db.FixedAssets.AsNoTracking()
                .Where(a => a.CompanyId == companyId && a.AcquisitionDate <= asOfDate)
                .Where(a => a.Status != "draft" || a.AcquisitionJournalEntryId != null)
                .ToListAsync(ct);

            var assetIds = assets.Select(a => a.Id).ToList();
            var depByAsset = await _db.FixedAssetDepreciationLines.AsNoTracking()
                .Where(l => assetIds.Contains(l.FixedAssetId))
                .GroupBy(l => l.FixedAssetId)
                .Select(g => new { AssetId = g.Key, Total = g.Sum(x => x.Amount) })
                .ToDictionaryAsync(x => x.AssetId, x => x.Total, ct);

            var rows = new List<AssetRegisterRowDto>();
            foreach (var a in assets.OrderBy(x => x.Code))
            {
                if (a.Status is "disposed" or "written_off" && a.DisposalDate.HasValue && a.DisposalDate.Value.Date <= asOfDate)
                    continue;
                depByAsset.TryGetValue(a.Id, out var accDep);
                var gross = a.ActiveCost > 0 ? a.ActiveCost : a.Cost;
                rows.Add(new AssetRegisterRowDto
                {
                    Id = a.Id,
                    Code = a.Code,
                    Name = a.Name,
                    Category = a.Category,
                    Status = a.Status,
                    GrossCost = gross,
                    AccumulatedDepreciation = accDep,
                    NetBookValue = Math.Max(0, gross - accDep),
                    AcquisitionDate = a.AcquisitionDate,
                });
            }

            return new AssetRegisterReportDto
            {
                AsOf = asOfDate,
                Rows = rows,
                TotalGross = rows.Sum(r => r.GrossCost),
                TotalAccumulatedDepreciation = rows.Sum(r => r.AccumulatedDepreciation),
                TotalNetBookValue = rows.Sum(r => r.NetBookValue),
            };
        }

        public async Task<AssetDepreciationScheduleDto> GetDepreciationScheduleAsync(Guid companyId, int fiscalYear, CancellationToken ct = default)
        {
            var from = fiscalYear * 100 + 1;
            var to = fiscalYear * 100 + 12;
            var lines = await _db.FixedAssetDepreciationLines.AsNoTracking()
                .Include(l => l.FixedAsset)
                .Where(l => l.FixedAsset!.CompanyId == companyId && l.PeriodYearMonth >= from && l.PeriodYearMonth <= to)
                .OrderBy(l => l.PeriodYearMonth).ThenBy(l => l.FixedAsset!.Code)
                .ToListAsync(ct);

            return new AssetDepreciationScheduleDto
            {
                FiscalYear = fiscalYear,
                Periods = lines.Select(l => new AssetDepreciationPeriodRow
                {
                    PeriodYearMonth = l.PeriodYearMonth,
                    AssetCode = l.FixedAsset?.Code ?? "",
                    AssetName = l.FixedAsset?.Name ?? "",
                    Amount = l.Amount,
                }).ToList(),
            };
        }

        public async Task<AssetMovementsReportDto> GetMovementsReportAsync(Guid companyId, DateTime from, DateTime to, CancellationToken ct = default)
        {
            var events = await _db.FixedAssetEvents.AsNoTracking()
                .Include(e => e.FixedAsset)
                .Where(e => e.FixedAsset!.CompanyId == companyId && e.EventDate >= from && e.EventDate <= to)
                .OrderByDescending(e => e.EventDate)
                .ToListAsync(ct);
            return new AssetMovementsReportDto { From = from, To = to, Events = events };
        }

        public async Task<AssetGlReconciliationDto> GetGlReconciliationAsync(Guid companyId, CancellationToken ct = default)
        {
            var register = await GetRegisterReportAsync(companyId, null, ct);
            var year = DateTime.UtcNow.Year;
            var entries = await _db.JournalEntries.AsNoTracking()
                .Include(e => e.JournalLines)
                .Where(e => e.CompanyId == companyId && !e.Voided && e.Validated && e.FiscalYear == year)
                .ToListAsync(ct);

            var accounts = await _db.Accounts.AsNoTracking()
                .Where(a => a.Code.StartsWith("21") || a.Code.StartsWith("28"))
                .ToListAsync(ct);
            var glRows = new List<AssetGlAccountRow>();
            decimal grossGl = 0, accGl = 0;

            foreach (var acc in accounts.Where(a => a.Code.StartsWith("21") || a.Code.StartsWith("28")).OrderBy(a => a.Code))
            {
                var debit = entries.SelectMany(e => e.JournalLines).Where(l => l.AccountCode == acc.Code).Sum(l => l.Debit);
                var credit = entries.SelectMany(e => e.JournalLines).Where(l => l.AccountCode == acc.Code).Sum(l => l.Credit);
                var balance = acc.NormalBalance?.ToUpperInvariant() == "DEBIT" ? debit - credit : credit - debit;
                glRows.Add(new AssetGlAccountRow { AccountCode = acc.Code, Label = acc.NameEn, Balance = balance });
                if (acc.Code.StartsWith("21")) grossGl += balance;
                if (acc.Code.StartsWith("28")) accGl += balance;
            }

            var glNbv = grossGl - accGl;
            return new AssetGlReconciliationDto
            {
                RegisterNetBookValue = register.TotalNetBookValue,
                GlClass2NetBalance = glNbv,
                Variance = register.TotalNetBookValue - glNbv,
                GlAccounts = glRows,
            };
        }

        private async Task<decimal> PostComponentDepreciationAsync(
            FixedAsset asset, FixedAssetComponent comp, int periodYearMonth, Guid userId, DateTime postingDate, CancellationToken ct)
        {
            var existing = await _db.FixedAssetDepreciationLines.FirstOrDefaultAsync(
                l => l.FixedAssetId == asset.Id && l.FixedAssetComponentId == comp.Id && l.PeriodYearMonth == periodYearMonth, ct);
            if (existing != null) return existing.Amount;

            var posted = await _db.FixedAssetDepreciationLines.Where(l => l.FixedAssetComponentId == comp.Id).SumAsync(l => l.Amount, ct);
            var depreciable = Math.Max(0, comp.Cost - comp.SalvageValue);
            var remaining = depreciable - posted;
            if (remaining <= 0.01m) return 0;

            var monthly = comp.UsefulLifeMonths <= 0 ? remaining : Math.Min(remaining, depreciable / comp.UsefulLifeMonths);
            if (monthly <= 0) return 0;

            var entry = await CreateDepreciationJournalAsync(asset, monthly, periodYearMonth, userId, postingDate, comp.Name, ct);
            await _db.FixedAssetDepreciationLines.AddAsync(new FixedAssetDepreciationLine
            {
                FixedAssetId = asset.Id,
                FixedAssetComponentId = comp.Id,
                PeriodYearMonth = periodYearMonth,
                Amount = monthly,
                PostedJournalEntryId = entry.Id,
            }, ct);
            return monthly;
        }

        private decimal ComputeMonthlyAmount(FixedAsset asset)
        {
            var posted = asset.DepreciationLines?.Sum(l => l.Amount) ?? 0;
            var gross = asset.ActiveCost > 0 ? asset.ActiveCost : asset.Cost;
            var depreciable = Math.Max(0, gross - asset.SalvageValue);
            var remaining = depreciable - posted;
            if (remaining <= 0.01m) return 0;
            return asset.UsefulLifeMonths <= 0 ? remaining : Math.Min(remaining, depreciable / asset.UsefulLifeMonths);
        }

        private async Task<JournalEntry> CreateDepreciationJournalAsync(
            FixedAsset asset, decimal monthly, int periodYearMonth, Guid userId, DateTime postingDate, string? componentName, CancellationToken ct)
        {
            var desc = componentName == null
                ? $"Depreciation {asset.Code} {periodYearMonth}"
                : $"Depreciation {asset.Code} · {componentName} {periodYearMonth}";
            return await CreateJournalAsync(asset.CompanyId, userId, postingDate, "IMM", desc,
                new[]
                {
                    new JournalLine { AccountCode = asset.DepreciationExpenseAccountCode, Debit = monthly, Credit = 0 },
                    new JournalLine { AccountCode = asset.AccumulatedDepreciationAccountCode, Debit = 0, Credit = monthly },
                }, asset.AnalyticAccountId, ct);
        }

        private async Task<JournalEntry> CreateJournalAsync(
            Guid companyId, Guid userId, DateTime entryDate, string journalType, string description,
            IEnumerable<JournalLine> lines, Guid? analyticAccountId, CancellationToken ct)
        {
            var entry = new JournalEntry
            {
                CompanyId = companyId,
                CreatedById = userId,
                EntryDate = entryDate,
                Description = description,
                JournalType = journalType,
                Reference = description.Length > 64 ? description[..64] : description,
                FiscalYear = (short)entryDate.Year,
                FiscalPeriod = (short)entryDate.Month,
                Validated = true,
                JournalLines = lines.ToList(),
            };
            await _db.JournalEntries.AddAsync(entry, ct);
            await _db.SaveChangesAsync(ct);

            if (analyticAccountId.HasValue)
            {
                foreach (var jl in entry.JournalLines.Where(l => l.Debit > 0))
                {
                    await _db.JournalLineAnalytics.AddAsync(new JournalLineAnalytic
                    {
                        JournalLineId = jl.Id,
                        AnalyticAccountId = analyticAccountId.Value,
                        WeightPercent = 100m,
                    }, ct);
                }
                await _db.SaveChangesAsync(ct);
            }

            return entry;
        }

        private async Task AddEventAsync(FixedAsset asset, string type, DateTime date, decimal amount, Guid? journalId, Guid userId, string? notes, CancellationToken ct)
        {
            await _db.FixedAssetEvents.AddAsync(new FixedAssetEvent
            {
                FixedAssetId = asset.Id,
                EventType = type,
                EventDate = date,
                Amount = amount,
                JournalEntryId = journalId,
                Notes = notes ?? string.Empty,
                CreatedByUserId = userId,
            }, ct);
        }

        private async Task<FixedAsset> LoadTrackedAsync(Guid assetId, CancellationToken ct)
        {
            return await _db.FixedAssets
                .Include(a => a.DepreciationLines)
                .FirstOrDefaultAsync(a => a.Id == assetId, ct)
                ?? throw new InvalidOperationException("Asset not found.");
        }

        private static void ApplyCategoryDefaults(FixedAsset asset)
        {
            var d = AssetOhadaDefaults.Resolve(asset.Category);
            if (string.IsNullOrWhiteSpace(asset.AssetAccountCode)) asset.AssetAccountCode = d.AssetAccountCode;
            if (string.IsNullOrWhiteSpace(asset.AccumulatedDepreciationAccountCode)) asset.AccumulatedDepreciationAccountCode = d.AccumulatedDepreciationAccountCode;
            if (string.IsNullOrWhiteSpace(asset.DepreciationExpenseAccountCode)) asset.DepreciationExpenseAccountCode = d.DepreciationExpenseAccountCode;
            if (asset.UsefulLifeMonths <= 0) asset.UsefulLifeMonths = d.DefaultUsefulLifeMonths;
        }

        private static DateTime PeriodEndDate(int periodYearMonth)
        {
            var y = periodYearMonth / 100;
            var m = periodYearMonth % 100;
            return new DateTime(y, m, DateTime.DaysInMonth(y, m), 0, 0, 0, DateTimeKind.Unspecified);
        }

        private async Task<string> ResolveAccountAsync(string preferred, string prefix)
        {
            var exact = await _db.Accounts.AsNoTracking().FirstOrDefaultAsync(a => a.Code == preferred);
            if (exact != null) return exact.Code;
            var fb = await _db.Accounts.AsNoTracking().Where(a => a.Code.StartsWith(prefix)).OrderBy(a => a.Code).FirstOrDefaultAsync();
            if (fb == null) throw new InvalidOperationException($"Account {preferred} or {prefix}* missing.");
            return fb.Code;
        }
    }
}
