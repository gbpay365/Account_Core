using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Microsoft.Extensions.Configuration;

namespace ComptabiliteAPI.Infrastructure.Data
{
    /// <summary>
    /// Used by EF Core CLI (dotnet ef migrations / database update).
    /// Loads Development settings and DB_CONNECTION_STRING when present.
    /// </summary>
    public class DesignTimeDbContextFactory : IDesignTimeDbContextFactory<AppDbContext>
    {
        public AppDbContext CreateDbContext(string[] args)
        {
            var env = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT") ?? "Development";
            var basePath = Directory.GetCurrentDirectory();

            var config = new ConfigurationBuilder()
                .SetBasePath(basePath)
                .AddJsonFile("appsettings.json", optional: false)
                .AddJsonFile($"appsettings.{env}.json", optional: true)
                .AddEnvironmentVariables()
                .Build();

            var connection = config.GetConnectionString("DefaultConnection")
                ?? Environment.GetEnvironmentVariable("DB_CONNECTION_STRING");

            if (string.IsNullOrWhiteSpace(connection) || connection.StartsWith("${"))
            {
                connection = "Host=127.0.0.1;Port=5433;Database=comptabilite_db;Username=postgres;Password=;";
            }

            var options = new DbContextOptionsBuilder<AppDbContext>()
                .UseNpgsql(connection)
                .Options;

            return new AppDbContext(options);
        }
    }
}
