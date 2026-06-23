using System.IO.Compression;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Xml.Linq;
using ComptabiliteAPI.Domain.Entities;
using ComptabiliteAPI.Domain.Interfaces;
using ComptabiliteAPI.DTOs;
using ComptabiliteAPI.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace ComptabiliteAPI.Infrastructure.Services
{
    public class TaxDeclarationService : ITaxDeclarationService
    {
        private readonly AppDbContext _db;
        private readonly IIncomeStatementGenerator _income;
        private readonly IBalanceSheetGenerator _balance;
        private readonly ITrialBalanceService _trial;
        private readonly INotesGenerator _notes;
        private readonly IExcelExportService _excel;
        private readonly IPdfReportGenerator _pdf;
        private readonly ICitCalculationService _cit;
        private readonly IFECGenerator _fec;
        private readonly IDGIClient _dgi;

        public TaxDeclarationService(
            AppDbContext db,
            IIncomeStatementGenerator income,
            IBalanceSheetGenerator balance,
            ITrialBalanceService trial,
            INotesGenerator notes,
            IExcelExportService excel,
            IPdfReportGenerator pdf,
            ICitCalculationService cit,
            IFECGenerator fec,
            IDGIClient dgi)
        {
            _db = db;
            _income = income;
            _balance = balance;
            _trial = trial;
            _notes = notes;
            _excel = excel;
            _pdf = pdf;
            _cit = cit;
            _fec = fec;
            _dgi = dgi;
        }

        public Task<TaxDeclaration?> GetAsync(Guid id, CancellationToken cancellationToken = default) =>
            _db.TaxDeclarations.AsNoTracking().FirstOrDefaultAsync(d => d.Id == id, cancellationToken);

        public Task<List<TaxDeclaration>> ListAsync(Guid companyId, CancellationToken cancellationToken = default) =>
            _db.TaxDeclarations.AsNoTracking()
                .Where(d => d.CompanyId == companyId)
                .OrderByDescending(d => d.FiscalYear)
                .ThenByDescending(d => d.CreatedAt)
                .ToListAsync(cancellationToken);

        public Task<List<FecGeneration>> ListFecAsync(Guid companyId, CancellationToken cancellationToken = default) =>
            _db.FecGenerations.AsNoTracking()
                .Where(f => f.CompanyId == companyId)
                .OrderByDescending(f => f.GeneratedAt)
                .ToListAsync(cancellationToken);

        public async Task<byte[]?> GetFecFileAsync(Guid generationId, CancellationToken cancellationToken = default)
        {
            var row = await _db.FecGenerations.AsNoTracking().FirstOrDefaultAsync(f => f.Id == generationId, cancellationToken);
            return row?.FecFile;
        }

        public Task<FecGeneration?> GetFecGenerationAsync(Guid generationId, CancellationToken cancellationToken = default) =>
            _db.FecGenerations.AsNoTracking().FirstOrDefaultAsync(f => f.Id == generationId, cancellationToken);

        public async Task<TaxDeclaration> CalculateDeclarationAsync(
            Guid companyId, Guid userId, string declarationType, int fiscalYear, int? periodMonth, int? periodQuarter,
            CancellationToken cancellationToken = default)
        {
            var company = await _db.Companies.AsNoTracking().FirstOrDefaultAsync(c => c.Id == companyId, cancellationToken)
                ?? throw new InvalidOperationException("Company not found.");

            var declaration = new TaxDeclaration
            {
                CompanyId = companyId,
                CreatedById = userId,
                DeclarationType = declarationType,
                FiscalYear = fiscalYear,
                PeriodMonth = periodMonth,
                PeriodQuarter = periodQuarter,
                Status = "calculated"
            };

            string json;
            switch (declarationType)
            {
                case "annual_cit":
                    json = await BuildAnnualCitJsonAsync(company, fiscalYear, cancellationToken);
                    break;
                case "vat_monthly":
                    if (periodMonth is null or < 1 or > 12)
                        throw new InvalidOperationException("vat_monthly requires periodMonth 1–12.");
                    json = await BuildVatMonthlyJsonAsync(companyId, fiscalYear, periodMonth.Value, cancellationToken);
                    break;
                case "irpp_quarterly":
                    if (periodQuarter is null or < 1 or > 4)
                        throw new InvalidOperationException("irpp_quarterly requires periodQuarter 1–4.");
                    json = await BuildIrppQuarterlyJsonAsync(companyId, fiscalYear, periodQuarter.Value, cancellationToken);
                    break;
                default:
                    throw new InvalidOperationException($"Unknown declaration type: {declarationType}");
            }

            declaration.DeclarationData = json;
            _db.TaxDeclarations.Add(declaration);
            await _db.SaveChangesAsync(cancellationToken);

            // Reload from store so returned row matches persisted payload (avoids stale/null navigation side effects).
            return await _db.TaxDeclarations.AsNoTracking().FirstAsync(d => d.Id == declaration.Id, cancellationToken);
        }

        private async Task<string> BuildAnnualCitJsonAsync(Company company, int fiscalYear, CancellationToken ct)
        {
            var isData = await _income.GenerateAsync(fiscalYear, company.Id);
            var tb = await _trial.GetTrialBalanceAsync(fiscalYear, company.Id);

            decimal SumPrefix(string prefix) =>
                tb.Where(a => a.AccountCode.StartsWith(prefix, StringComparison.Ordinal)).Sum(a => Math.Abs(a.Balance));

            var purchases = SumPrefix("60");
            var salaries = tb.Where(a => a.AccountCode.StartsWith("64", StringComparison.Ordinal)
                || a.AccountCode.StartsWith("645", StringComparison.Ordinal)
                || a.AccountCode.StartsWith("641", StringComparison.Ordinal)).Sum(a => Math.Abs(a.Balance));
            var depreciation = SumPrefix("68");
            var otherExpenses = tb.Where(a => a.AccountCode.StartsWith("6", StringComparison.Ordinal)
                && !a.AccountCode.StartsWith("60", StringComparison.Ordinal)
                && !a.AccountCode.StartsWith("64", StringComparison.Ordinal)
                && !a.AccountCode.StartsWith("68", StringComparison.Ordinal)).Sum(a => Math.Abs(a.Balance));

            var domesticCa = isData.TotalRevenue;
            var netProfit = isData.NetIncome;

            var payrolls = await _db.PayrollPeriods.AsNoTracking()
                .Where(p => p.CompanyId == company.Id && p.PeriodDate.Year == fiscalYear)
                .ToListAsync(ct);

            var payrollDto = new PayrollSummaryForEcfDto
            {
                PeriodCount = payrolls.Count,
                TotalGrossPayroll = payrolls.Sum(p => p.TotalGrossPayroll),
                TotalNetPayroll = payrolls.Sum(p => p.TotalNetPayroll),
                TotalEmployerCharges = payrolls.Sum(p => p.TotalEmployerCharges)
            };

            var citReq = new CitCalculationRequest
            {
                NetProfit = netProfit,
                Turnover = domesticCa,
                TaxCredits = new List<TaxCreditDto>()
            };
            var calc = _cit.Calculate(citReq);

            var form2031 = new Form2031Dto
            {
                CompanyName = company.Name,
                TaxIdNumber = company.TaxId,
                FiscalYear = fiscalYear,
                DomesticTurnover = domesticCa,
                ExportTurnover = 0,
                Purchases = purchases,
                Salaries = salaries,
                Depreciation = depreciation,
                OtherExpenses = otherExpenses,
                NetProfit = netProfit,
                TaxRate = calc.StatutoryRate,
                CalculatedTax = Math.Max(calc.GrossTaxProgressive, calc.TaxOnProfitFlat),
                TaxCredits = calc.TaxCredits,
                FinalTaxDue = calc.TaxToPay,
                MinimumTax = calc.MinimumTax,
                TaxToPay = calc.TaxToPay
            };

            var form2035 = new Form2035Dto
            {
                CompanyName = company.Name,
                TaxIdNumber = company.TaxId,
                FiscalYear = fiscalYear,
                FinalTaxDue = calc.TaxToPay,
                FirstQuarterInstallment = citReq.FirstQuarterInstallment,
                SecondQuarterInstallment = citReq.SecondQuarterInstallment,
                ThirdQuarterInstallment = citReq.ThirdQuarterInstallment,
                FourthQuarterInstallment = citReq.FourthQuarterInstallment,
                TotalInstallmentsPaid = calc.TotalInstallmentsPaid,
                BalanceToPay = calc.BalanceToPay,
                Overpayment = calc.Overpayment
            };

            var package = new AnnualCitDeclarationDataDto
            {
                Form2031 = form2031,
                Form2035 = form2035,
                Calculation = calc,
                PayrollSummary = payrollDto
            };

            return JsonSerializer.Serialize(package, new JsonSerializerOptions { WriteIndented = true });
        }

        private async Task<string> BuildVatMonthlyJsonAsync(Guid companyId, int fiscalYear, int month, CancellationToken ct)
        {
            var entries = await _db.JournalEntries
                .AsNoTracking()
                .Include(e => e.JournalLines)
                .Where(e => e.CompanyId == companyId && e.Validated && e.EntryDate.Year == fiscalYear && e.EntryDate.Month == month)
                .ToListAsync(ct);

            decimal SumLine(string accountPrefix, bool creditSide)
        {
            decimal d = 0, c = 0;
            foreach (var line in entries.SelectMany(e => e.JournalLines!))
            {
                if (!line.AccountCode.StartsWith(accountPrefix, StringComparison.Ordinal)) continue;
                d += line.Debit;
                c += line.Credit;
            }
            return creditSide ? c : d;
        }

            var collected = SumLine("4441", true);
            var recoverable = SumLine("4442", false);
            var net = collected - recoverable;

            var dto = new VatMonthlyDeclarationDataDto
            {
                FiscalYear = fiscalYear,
                Month = month,
                VatCollected = collected,
                VatRecoverable = recoverable,
                NetVatDue = net
            };
            return JsonSerializer.Serialize(dto, new JsonSerializerOptions { WriteIndented = true });
        }

        private async Task<string> BuildIrppQuarterlyJsonAsync(Guid companyId, int fiscalYear, int quarter, CancellationToken ct)
        {
            var startMonth = (quarter - 1) * 3 + 1;
            var endMonth = startMonth + 2;
            var payrolls = await _db.PayrollPeriods.AsNoTracking()
                .Where(p => p.CompanyId == companyId && p.PeriodDate.Year == fiscalYear
                    && p.PeriodDate.Month >= startMonth && p.PeriodDate.Month <= endMonth)
                .ToListAsync(ct);

            var mass = payrolls.Sum(p => p.TotalNetPayroll);
            var estimatedBase = mass;
            var estimatedDue = Math.Max(0, estimatedBase * 0.052m);

            var dto = new IrppQuarterlyDeclarationDataDto
            {
                FiscalYear = fiscalYear,
                Quarter = quarter,
                EstimatedIrppBase = estimatedBase,
                EstimatedIrppDue = estimatedDue
            };
            return JsonSerializer.Serialize(dto, new JsonSerializerOptions { WriteIndented = true });
        }

        public async Task<(byte[] Content, string Filename, Guid GenerationId)> GenerateFECAsync(
            Guid companyId, Guid userId, int fiscalYear, CancellationToken cancellationToken = default)
        {
            var (content, filename) = await _fec.GenerateAsync(companyId, fiscalYear, cancellationToken);
            var row = new FecGeneration
            {
                CompanyId = companyId,
                FiscalYear = fiscalYear,
                GeneratedById = userId,
                FecFile = content,
                FecFilename = filename,
                Status = "generated"
            };
            _db.FecGenerations.Add(row);
            await _db.SaveChangesAsync(cancellationToken);
            return (content, filename, row.Id);
        }

        public async Task<FilingResultDto> SubmitToDGIAsync(Guid declarationId, Guid userId, CancellationToken cancellationToken = default)
        {
            var declaration = await _db.TaxDeclarations.FirstOrDefaultAsync(d => d.Id == declarationId, cancellationToken)
                ?? throw new InvalidOperationException("Declaration not found.");

            if (declaration.Status is not ("calculated" or "reviewed" or "adjusted" or "locked"))
                throw new InvalidOperationException("Only calculated, reviewed, or adjusted declarations can be submitted.");

            var xml = BuildCitEdiXmlPackage(declaration);
            declaration.CorrelationId ??= Guid.NewGuid();
            var correlation = declaration.CorrelationId.Value.ToString("N");
            var result = await _dgi.SubmitDeclarationAsync(declaration, xml, correlation, cancellationToken);

            if (result.Success)
            {
                declaration.Status = "filed";
                declaration.FiledAt = DateTime.UtcNow;
                declaration.FilingReceiptId = result.ReceiptId;
                await _db.SaveChangesAsync(cancellationToken);
            }

            return result;
        }

        public async Task<TaxDeclaration> UpdateDeclarationStatusAsync(
            Guid declarationId,
            Guid userId,
            string newStatus,
            CancellationToken cancellationToken = default)
        {
            var d = await _db.TaxDeclarations.FirstOrDefaultAsync(x => x.Id == declarationId, cancellationToken)
                ?? throw new InvalidOperationException("Declaration not found.");
            if (d.Status == "filed" || d.Status == "archived")
                throw new InvalidOperationException("Cannot change status after filing.");

            switch (newStatus)
            {
                case "reviewed" when d.Status == "calculated":
                    d.Status = "reviewed";
                    break;
                case "locked" when d.Status == "reviewed":
                    d.Status = "locked";
                    d.LockedAt = DateTime.UtcNow;
                    break;
                case "adjusted" when d.Status is "calculated" or "reviewed":
                    d.Status = "adjusted";
                    d.LockedAt = null;
                    break;
                default:
                    throw new InvalidOperationException($"Invalid transition {d.Status} -> {newStatus}.");
            }

            await _db.SaveChangesAsync(cancellationToken);
            return d;
        }

        /// <summary>Phase D: ZIP with annual CIT XML (if any) + latest FEC file for the fiscal year.</summary>
        public async Task<(byte[] Zip, string Filename)?> BuildFiscalYearComplianceZipAsync(
            Guid companyId,
            int fiscalYear,
            CancellationToken cancellationToken = default)
        {
            var cit = await _db.TaxDeclarations.AsNoTracking()
                .Where(x => x.CompanyId == companyId && x.FiscalYear == fiscalYear && x.DeclarationType == "annual_cit")
                .OrderByDescending(x => x.CreatedAt)
                .FirstOrDefaultAsync(cancellationToken);
            var fec = await _db.FecGenerations.AsNoTracking()
                .Where(f => f.CompanyId == companyId && f.FiscalYear == fiscalYear)
                .OrderByDescending(f => f.GeneratedAt)
                .FirstOrDefaultAsync(cancellationToken);
            if (cit == null && (fec == null || fec.FecFile == null || fec.FecFile.Length == 0))
                return null;

            var tb = await _trial.GetTrialBalanceAsync(fiscalYear, companyId);
            var isData = await _income.GenerateAsync(fiscalYear, companyId);
            var bsData = await _balance.GenerateAsync(fiscalYear, companyId);
            var notesJson = await _notes.GenerateAsync(fiscalYear, companyId, "fr");
            var tbXlsx = _excel.ExportTrialBalance(tb, "fr");
            var isPdf = _pdf.GenerateIncomeStatementReport(isData, "fr");
            var bsPdf = _pdf.GenerateBalanceSheetReport(bsData, "fr");

            using var ms = new MemoryStream();
            using (var zip = new ZipArchive(ms, ZipArchiveMode.Create, true))
            {
                if (cit != null)
                {
                    var full = await _db.TaxDeclarations.AsNoTracking().FirstAsync(x => x.Id == cit.Id, cancellationToken);
                    var xml = BuildCitEdiXmlPackage(full);
                    var e = zip.CreateEntry($"liasse_annual_cit_{fiscalYear}_{cit.Id:N}.xml", CompressionLevel.Optimal);
                    await using (var s = e.Open())
                    await using (var sw = new StreamWriter(s, new UTF8Encoding(false)))
                        await sw.WriteAsync(xml);
                }
                if (fec?.FecFile is { Length: > 0 } bytes)
                {
                    var name = string.IsNullOrWhiteSpace(fec.FecFilename) ? $"FEC_{fiscalYear}.txt" : fec.FecFilename;
                    var e = zip.CreateEntry(name, CompressionLevel.Optimal);
                    await using var s = e.Open();
                    await s.WriteAsync(bytes, 0, bytes.Length, cancellationToken);
                }

                var tbEntry = zip.CreateEntry($"trial_balance_FY{fiscalYear}.xlsx", CompressionLevel.Optimal);
                await using (var s = tbEntry.Open())
                    await s.WriteAsync(tbXlsx, 0, tbXlsx.Length, cancellationToken);

                var isEntry = zip.CreateEntry($"income_statement_FY{fiscalYear}.pdf", CompressionLevel.Optimal);
                await using (var s = isEntry.Open())
                    await s.WriteAsync(isPdf, 0, isPdf.Length, cancellationToken);

                var bsEntry = zip.CreateEntry($"balance_sheet_FY{fiscalYear}.pdf", CompressionLevel.Optimal);
                await using (var s = bsEntry.Open())
                    await s.WriteAsync(bsPdf, 0, bsPdf.Length, cancellationToken);

                var notesEntry = zip.CreateEntry($"notes_FY{fiscalYear}.json", CompressionLevel.Optimal);
                await using (var s = notesEntry.Open())
                await using (var sw = new StreamWriter(s, new UTF8Encoding(false)))
                    await sw.WriteAsync(string.IsNullOrWhiteSpace(notesJson) ? "{}" : notesJson);
            }
            return (ms.ToArray(), $"compliance_FY{fiscalYear}_{companyId:N}.zip");
        }

        public string BuildCitEdiXmlPackage(TaxDeclaration declaration)
        {
            if (string.IsNullOrEmpty(declaration.DeclarationData))
                return "<Liasse/>";

            if (declaration.DeclarationType != "annual_cit")
            {
                var root = new XElement("Liasse",
                    new XElement("En-tete",
                        new XElement("Type", declaration.DeclarationType),
                        new XElement("NIF", ""),
                        new XElement("Exercice", declaration.FiscalYear)),
                    new XElement("Contenu", new XCData(declaration.DeclarationData ?? "{}")));
                return root.ToString(SaveOptions.DisableFormatting);
            }

            var data = JsonSerializer.Deserialize<AnnualCitDeclarationDataDto>(
                declaration.DeclarationData,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
            if (data == null) return "<Liasse/>";

            var f1 = data.Form2031;
            var f5 = data.Form2035;
            var calc = data.Calculation;

            var decl2031 = new XElement("Declaration2031",
                new XElement("NumeroIdentificationFiscale", f1.TaxIdNumber),
                new XElement("ExerciceFiscal", f1.FiscalYear),
                new XElement("ResultatFiscal",
                    new XElement("ChiffreAffaires", f1.DomesticTurnover + f1.ExportTurnover),
                    new XElement("Achats", f1.Purchases),
                    new XElement("ChargesPersonnel", f1.Salaries),
                    new XElement("DotationsAmortissements", f1.Depreciation),
                    new XElement("AutresCharges", f1.OtherExpenses),
                    new XElement("BeneficeImposable", f1.NetProfit)),
                new XElement("CalculImpot",
                    new XElement("TauxImposition", calc.StatutoryRate),
                    new XElement("ImpotBrut", calc.TaxToPay),
                    new XElement("CreditsImpot", calc.TaxCredits),
                    new XElement("ImpotNet", calc.NetTaxLiability),
                    new XElement("ImpotMinimum", calc.MinimumTax),
                    new XElement("ImpotAPayer", calc.TaxToPay)));

            var decl2035 = new XElement("Declaration2035",
                new XElement("NumeroIdentificationFiscale", f5.TaxIdNumber),
                new XElement("ExerciceFiscal", f5.FiscalYear),
                new XElement("ImpotDu", f5.FinalTaxDue),
                new XElement("Paiements",
                    new XElement("PremierTrimestre", f5.FirstQuarterInstallment),
                    new XElement("DeuxiemeTrimestre", f5.SecondQuarterInstallment),
                    new XElement("TroisiemeTrimestre", f5.ThirdQuarterInstallment),
                    new XElement("QuatriemeTrimestre", f5.FourthQuarterInstallment)),
                new XElement("Solde",
                    new XElement("TotalVersements", f5.TotalInstallmentsPaid),
                    new XElement("ReliquatAPayer", f5.BalanceToPay),
                    new XElement("ExcedentVersements", f5.Overpayment)));

            var liasse = new XElement("Liasse",
                new XElement("En-tete",
                    new XElement("Type", "annual_cit"),
                    new XElement("DeclarationId", declaration.Id.ToString()),
                    new XElement("Exercice", declaration.FiscalYear)),
                new XElement("Contenu", decl2031, decl2035),
                new XElement("Signature",
                    new XElement("Algorithme", "rsa-sha256"),
                    new XElement("Statut", "non_signe_stub")));

            return liasse.ToString(SaveOptions.DisableFormatting);
        }
    }
}
