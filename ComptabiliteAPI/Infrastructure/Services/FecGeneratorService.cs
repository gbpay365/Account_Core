using System.Globalization;
using System.Text;
using ComptabiliteAPI.Domain.Interfaces;
using ComptabiliteAPI.Infrastructure.Data;
using ComptabiliteAPI.Infrastructure.Reporting;
using Microsoft.EntityFrameworkCore;

namespace ComptabiliteAPI.Infrastructure.Services
{
    /// <summary>FEC-style export (18 DGFIP columns, tab-separated, UTF-8 with BOM). Only validated journal lines are included.</summary>
    public class FecGeneratorService : IFECGenerator
    {
        private readonly AppDbContext _db;

        public FecGeneratorService(AppDbContext db)
        {
            _db = db;
        }

        public async Task<(byte[] Content, string Filename)> GenerateAsync(Guid companyId, int fiscalYear, CancellationToken cancellationToken = default)
        {
            var accounts = await _db.Accounts
                .AsNoTracking()
                .Where(a => a.FiscalYear == fiscalYear || a.FiscalYear == null)
                .ToDictionaryAsync(a => a.Code, a => a, cancellationToken);

            var entries = await _db.JournalEntries
                .AsNoTracking()
                .Include(e => e.JournalLines)
                .Where(e => e.CompanyId == companyId && e.EntryDate.Year == fiscalYear && e.Validated)
                .OrderBy(e => e.EntryDate).ThenBy(e => e.Id)
                .ToListAsync(cancellationToken);

            var fr = CultureInfo.GetCultureInfo("fr-FR");
            string F(decimal d) => d.ToString("F2", fr);

            var sb = new StringBuilder();
            sb.AppendLine(FecExportSpec.HeaderLine);

            var num = 0;
            foreach (var entry in entries)
            {
                num++;
                var ecritureNum = num.ToString("D6", CultureInfo.InvariantCulture);
                var pieceRef = entry.Id.ToString("N")[..8].ToUpperInvariant();
                var dateStr = entry.EntryDate.ToString("yyyyMMdd", CultureInfo.InvariantCulture);
                var lib = (entry.Description ?? string.Empty).Replace('\t', ' ').Replace('\n', ' ');

                foreach (var line in entry.JournalLines!.OrderBy(l => l.Id))
                {
                    accounts.TryGetValue(line.AccountCode, out var acc);
                    var compteLib = acc?.NameFr ?? acc?.NameEn ?? line.AccountCode;
                    sb.AppendLine(string.Join("\t", new[]
                    {
                        "OD",
                        "Opérations diverses",
                        ecritureNum,
                        dateStr,
                        line.AccountCode,
                        compteLib,
                        "",
                        "",
                        pieceRef,
                        dateStr,
                        lib,
                        F(line.Debit),
                        F(line.Credit),
                        "",
                        "",
                        dateStr,
                        "",
                        ""
                    }));
                }
            }

            var preamble = Encoding.UTF8.GetPreamble();
            var body = Encoding.UTF8.GetBytes(sb.ToString());
            var content = new byte[preamble.Length + body.Length];
            Buffer.BlockCopy(preamble, 0, content, 0, preamble.Length);
            Buffer.BlockCopy(body, 0, content, preamble.Length, body.Length);

            var filename = $"FEC_{companyId:N}_{fiscalYear}.txt";
            return (content, filename);
        }
    }
}
