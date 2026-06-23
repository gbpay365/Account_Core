using System.Text;
using ComptabiliteAPI.Configuration;
using ComptabiliteAPI.Domain.Entities;
using ComptabiliteAPI.Domain.Interfaces;
using ComptabiliteAPI.Infrastructure.Data;
using ComptabiliteAPI.Infrastructure.Repositories;
using ComptabiliteAPI.Infrastructure.Services;
using ComptabiliteAPI.Filters;
using ComptabiliteAPI.Middleware;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;

var builder = WebApplication.CreateBuilder(args);
var configuration = builder.Configuration;
bool isDev = builder.Environment.IsDevelopment();

// ─── Database connection: read individual PG* env vars ───────────────────────
// Railway injects PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE as discrete
// variables. Reading them directly avoids the ${{Ref}} resolution issue that
// occurs when a single DB_CONNECTION_STRING reference variable is used.
var pgHost     = Environment.GetEnvironmentVariable("PGHOST")     ?? "127.0.0.1";
var pgPort     = Environment.GetEnvironmentVariable("PGPORT")     ?? "5433";
var pgUser     = Environment.GetEnvironmentVariable("PGUSER")     ?? "postgres";
var pgPassword = Environment.GetEnvironmentVariable("PGPASSWORD") ?? "";
var pgDatabase = Environment.GetEnvironmentVariable("PGDATABASE") ?? "comptabilite_db";

Console.WriteLine($"[CONFIG] PGHOST={pgHost} PGPORT={pgPort} PGUSER={pgUser} PGDATABASE={pgDatabase} PGPASSWORD={(string.IsNullOrEmpty(pgPassword) ? "(empty)" : "(set)")}");

var effectiveDbConnection = $"Host={pgHost};Port={pgPort};Database={pgDatabase};Username={pgUser};Password={pgPassword};";
Console.WriteLine($"[CONFIG] Constructed connection string (password redacted): Host={pgHost};Port={pgPort};Database={pgDatabase};Username={pgUser};Password=***");

// ─── JWT key: env var takes priority over appsettings ────────────────────────
// appsettings.json may contain a literal "${JWT_KEY}" placeholder that was
// never resolved. Always check the real environment variable first.
var jwtKeyFromEnv      = Environment.GetEnvironmentVariable("JWT_KEY");
var jwtKeyFromSettings = configuration["Jwt:Key"];

// Treat Railway-style unresolved placeholders as absent
bool IsPlaceholder(string? v) => string.IsNullOrEmpty(v) || v.StartsWith("${");

var effectiveJwtKey = !IsPlaceholder(jwtKeyFromEnv)      ? jwtKeyFromEnv
                    : !IsPlaceholder(jwtKeyFromSettings)  ? jwtKeyFromSettings
                    : null;

Console.WriteLine($"[CONFIG] JWT_KEY source: env={(IsPlaceholder(jwtKeyFromEnv) ? "absent/placeholder" : "set")} appsettings={(IsPlaceholder(jwtKeyFromSettings) ? "absent/placeholder" : "set")} effective={(effectiveJwtKey is null ? "NONE" : "set")}");

// SECURITY ENFORCEMENT: JWT Key must be present and strong in non-Development
bool isWeakKey = string.IsNullOrEmpty(effectiveJwtKey) || effectiveJwtKey == "DevKeyForLocalDevelopmentOnly123456";

if (!isDev && isWeakKey)
{
    throw new InvalidOperationException("FATAL: JWT_KEY must be configured via environment variable in non-Development environments. Fallback to DevKey is prohibited.");
}

if (isWeakKey)
{
    Console.WriteLine("WARNING: JWT_KEY not set or using default - using fallback dev key (ONLY FOR LOCAL DEV)");
    effectiveJwtKey = "DevKeyForLocalDevelopmentOnly123456";
}

if (effectiveJwtKey!.Length < 32)
{
    if (!isDev) throw new InvalidOperationException("FATAL: JWT_KEY must be at least 32 characters long in Production.");
    Console.WriteLine("WARNING: JWT_KEY less than 32 characters - using padded key");
    effectiveJwtKey = effectiveJwtKey.PadRight(32, '0');
}

// Fix PostgreSQL DateTime Kind=Unspecified error
AppContext.SetSwitch("Npgsql.EnableLegacyTimestampBehavior", true);

// ─── Localization ─────────────────────────────────────────────────────────────
builder.Services.AddLocalization(options => options.ResourcesPath = "Resources");

// ─── Controllers & API Explorer ───────────────────────────────────────────────
builder.Services.AddControllers()
    .AddViewLocalization()
    .AddDataAnnotationsLocalization()
    .AddJsonOptions(options =>
    {
        // Prevent 500 errors from EF navigation-property circular references
        options.JsonSerializerOptions.ReferenceHandler = System.Text.Json.Serialization.ReferenceHandler.IgnoreCycles;
        options.JsonSerializerOptions.DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull;
    });
builder.Services.AddEndpointsApiExplorer();

// ─── Swagger with JWT ─────────────────────────────────────────────────────────
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo { Title = "Comptabilite OHADA API", Version = "v1" });
    c.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Name = "Authorization", Type = SecuritySchemeType.Http, Scheme = "Bearer",
        BearerFormat = "JWT", In = ParameterLocation.Header,
        Description = "Enter 'Bearer' [space] and then your valid JWT token."
    });
    c.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme { Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Bearer" } },
            Array.Empty<string>()
        }
    });
});

// ─── Database (PostgreSQL) ────────────────────────────────────────────────────
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(effectiveDbConnection));

// ─── JWT Authentication ───────────────────────────────────────────────────────
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true, ValidateAudience = true,
            ValidateLifetime = true, ValidateIssuerSigningKey = true,
            ValidIssuer = configuration["Jwt:Issuer"] ?? "ComptabiliteAPI",
            ValidAudience = configuration["Jwt:Audience"] ?? "ComptabiliteReact",
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(effectiveJwtKey))
        };
    });

builder.Services.AddAuthorization();

// ─── Authorization (RBAC) ────────────────────────────────────────────────────
builder.Services.AddSingleton<IAuthorizationPolicyProvider, PermissionPolicyProvider>();
builder.Services.AddScoped<IAuthorizationHandler, PermissionHandler>();

// ─── Repositories ─────────────────────────────────────────────────────────────
builder.Services.AddScoped<IAccountRepository, AccountRepository>();
builder.Services.AddScoped<IJournalEntryRepository, JournalEntryRepository>();

// ─── Compliance (FEC / DGI stub / ECF) ───────────────────────────────────────
builder.Services.Configure<ComplianceOptions>(configuration.GetSection(ComplianceOptions.SectionName));
builder.Services.AddScoped<ComplianceReconciliationService>();
builder.Services.AddScoped<ReconciliationCandidateService>();

// ─── Core Accounting Services ─────────────────────────────────────────────────
builder.Services.AddScoped<ITrialBalanceService, TrialBalanceService>();
builder.Services.AddScoped<IGeneralLedgerService, GeneralLedgerService>();
builder.Services.AddScoped<IBillingService, BillingService>();
builder.Services.AddScoped<IRulesEngineService, RulesEngineService>();
builder.Services.AddScoped<ICashFlowGenerator, CashFlowGenerator>();
builder.Services.AddScoped<IBalanceSheetGenerator, BalanceSheetGenerator>();
builder.Services.AddScoped<IIncomeStatementGenerator, IncomeStatementGenerator>();
builder.Services.AddScoped<INotesGenerator, NotesGenerator>();
builder.Services.AddScoped<ICommercialService, CommercialService>();
builder.Services.AddScoped<IApService, ApService>();

// ─── Payroll & HR ────────────────────────────────────────────────────────────
builder.Services.AddScoped<IPayrollProcessingService, PayrollProcessingService>();

// ─── Reporting & Export ───────────────────────────────────────────────────────
builder.Services.AddScoped<IPdfReportGenerator, PdfReportGenerator>();
builder.Services.AddScoped<IExcelExportService, ExcelExportService>();

// ─── Security & Audit ─────────────────────────────────────────────────────────
builder.Services.AddScoped<CompanyMembershipActionFilter>();
builder.Services.AddScoped<IPermissionService, PermissionService>();
builder.Services.AddScoped<IAuditLogService, AuditLogService>();
    builder.Services.AddScoped<IJournalEntryService, JournalEntryService>();
    builder.Services.AddScoped<IChartOfAccountsService, ChartOfAccountsService>();
    builder.Services.AddScoped<ICoaImportService, CoaImportService>();
    builder.Services.Configure<WyvernImportOptions>(builder.Configuration.GetSection(WyvernImportOptions.SectionName));
    builder.Services.Configure<HmsCatalogOptions>(builder.Configuration.GetSection(HmsCatalogOptions.SectionName));
    builder.Services.Configure<IntegrationOptions>(builder.Configuration.GetSection(IntegrationOptions.SectionName));
    builder.Services.AddSingleton<ServiceCatalogService>();
    builder.Services.AddHttpClient("WyvernImport");
    builder.Services.AddHttpClient("HmsIntegration");
    builder.Services.AddScoped<IntegrationSettingsService>();
    builder.Services.AddScoped<IntegrationContextResolver>();
    builder.Services.AddScoped<IntegrationLinkService>();
    builder.Services.AddScoped<IntegrationOutboxService>();
    builder.Services.AddScoped<IntegrationInboundService>();
    builder.Services.AddScoped<IntegrationOutboundService>();
    builder.Services.AddScoped<IntegrationNotifyService>();
    builder.Services.AddScoped<ICostCenterService, CostCenterService>();
builder.Services.AddScoped<IFiscalPeriodService, FiscalPeriodService>();
builder.Services.AddScoped<IImmutableAuditService, ImmutableAuditService>();
builder.Services.AddScoped<IBankTreasuryService, BankTreasuryService>();
builder.Services.AddScoped<IAssetService, AssetService>();
builder.Services.AddScoped<IAgingService, AgingService>();
builder.Services.AddScoped<IAnalyticAccountService, AnalyticAccountService>();
builder.Services.AddScoped<ITaxRuleCatalogService, TaxRuleCatalogService>();
builder.Services.AddScoped<ILegalWormService, LegalWormService>();

// ─── ECF / tax declarations & FEC (Sage 100 ECF-style) ───────────────────────
builder.Services.AddScoped<ICitCalculationService, CitCalculationService>();
builder.Services.AddScoped<IFECGenerator, FecGeneratorService>();
builder.Services.AddScoped<IDGIClient, DGIClientStub>();
builder.Services.AddScoped<ICertificateService, NullCertificateService>();
builder.Services.AddScoped<ITaxDeclarationService, TaxDeclarationService>();
builder.Services.AddScoped<IEbillingIntegrationService, EbillingIntegrationService>();

// ─── OHADA Compliance Validators ─────────────────────────────────────────────
builder.Services.AddScoped<IDoubleEntryValidator, DoubleEntryValidator>();
builder.Services.AddScoped<ISYSCOHADAValidator, SYSCOHADAValidator>();
builder.Services.AddScoped<TaxEngine>();

// ─── MediatR (CQRS) ──────────────────────────────────────────────────────────
builder.Services.AddMediatR(cfg => cfg.RegisterServicesFromAssembly(typeof(Program).Assembly));

// ─── CORS ─────────────────────────────────────────────────────────────────────
builder.Services.AddCors(options =>
{
    options.AddPolicy("ReactApp", policy =>
    {
        policy.WithOrigins(
                "http://localhost:5173",
                "http://localhost:5174",
                "http://localhost:3000")
              .AllowAnyHeader()
              .AllowAnyMethod()
              .WithExposedHeaders("X-CompliancePack-SHA256", "X-Worm-Entry-Id")
              .AllowCredentials();
    });
});

// ─── Health Checks ────────────────────────────────────────────────────────────
builder.Services.AddHealthChecks();

var app = builder.Build();

// ─── Middleware Pipeline ──────────────────────────────────────────────────────
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseMiddleware<GlobalExceptionMiddleware>();
app.UseMiddleware<AuditLogMiddleware>();

var supportedCultures = new[] { "en", "fr" };
var localizationOptions = new RequestLocalizationOptions()
    .SetDefaultCulture(supportedCultures[0])
    .AddSupportedCultures(supportedCultures)
    .AddSupportedUICultures(supportedCultures);

app.UseRequestLocalization(localizationOptions);

// In Development, HTTPS redirection can cause clients posting to http:// to be redirected
// to https:// without resending the Authorization header → 401. Production keeps redirection.
if (!app.Environment.IsDevelopment())
    app.UseHttpsRedirection();
app.UseStaticFiles();
app.UseCors("ReactApp");
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
app.MapHealthChecks("/health");

// FIX SCHEMA FIRST
await ComptabiliteAPI.Diagnostics.FixDatabaseSchema.Run(app.Services);

// ─── DB migrations + seed (SYSCOHADA) ─────────────────────────────────────────
await DbInitializer.InitializeAsync(app.Services);

// Products are populated from HMS via POST /api/v1/integrations/products (one-way sync).

await ComptabiliteAPI.Diagnostics.CheckProductFamilies.Run(app.Services);

app.Run();
