using System;
using System.Linq;
using ComptabiliteAPI.Domain.Entities;
using ComptabiliteAPI.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ComptabiliteAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize(Roles = "Admin")] // CRITICAL: Seed endpoints restricted to Admin role only
    public class SeedController : ControllerBase
    {
        private readonly AppDbContext _db;

        public SeedController(AppDbContext db)
        {
            _db = db;
        }

        [HttpPost("products")]
        public async Task<IActionResult> SeedProducts()
        {
            var company = await _db.Companies.FirstOrDefaultAsync();
            if (company == null)
            {
                company = new Company { Name = "Zaizen Enterprise SARL", TaxId = "M0123456789" };
                await _db.Companies.AddAsync(company);
                await _db.SaveChangesAsync();
            }

            var companyId = company.Id;
            var random = new Random();
            var catalog = CameroonSeedCatalog.Products;

            // Seed Families
            var families = new Dictionary<string, ProductFamily>();
            var familyDefinitions = new[]
            {
                new { En = "Food & Beverage", Fr = "Alimentation" },
                new { En = "Construction & BTP", Fr = "BTP & Construction" },
                new { En = "Equipment & Hardware", Fr = "Matériel & Équipement" },
                new { En = "Business Services", Fr = "Services aux Entreprises" },
                new { En = "Health & Hygiene", Fr = "Santé & Hygiène" }
            };

            foreach (var fd in familyDefinitions)
            {
                var f = await _db.ProductFamilies.FirstOrDefaultAsync(x => x.CompanyId == companyId && (x.NameEn == fd.En || x.NameFr == fd.Fr));
                if (f == null)
                {
                    f = new ProductFamily { CompanyId = companyId, NameEn = fd.En, NameFr = fd.Fr };
                    await _db.ProductFamilies.AddAsync(f);
                    await _db.SaveChangesAsync();
                }
                families[fd.Fr] = f;
            }

            int addedCount = 0;
            for (int i = 0; i < 100; i++)
            {
                var p = catalog[i % catalog.Length];
                var code = $"PRD-{1000 + i}";

                if (!await _db.Products.AnyAsync(x => x.CompanyId == companyId && x.Code == code))
                {
                    // Intelligent Categorization
                    string category = "Matériel & Équipement"; // Default
                    var name = p.NameEn.ToLower();
                    
                    if (name.Contains("leaves") || name.Contains("beans") || name.Contains("rice") || name.Contains("oil") || name.Contains("maize") || name.Contains("groundnut") || name.Contains("sugar") || name.Contains("salt") || name.Contains("milk") || name.Contains("yoghurt") || name.Contains("chicken") || name.Contains("fish") || name.Contains("plantains") || name.Contains("manioc") || name.Contains("flour"))
                        category = "Alimentation";
                    else if (name.Contains("cement") || name.Contains("sheet") || name.Contains("paint") || name.Contains("rebar") || name.Contains("timber") || name.Contains("plywood") || name.Contains("concrete") || name.Contains("blocks") || name.Contains("gravel") || name.Contains("sand") || name.Contains("tiles") || name.Contains("window") || name.Contains("door"))
                        category = "BTP & Construction";
                    else if (name.Contains("training") || name.Contains("legal") || name.Contains("accounting") || name.Contains("payroll") || name.Contains("maintenance") || name.Contains("cleaning") || name.Contains("security") || name.Contains("tax") || name.Contains("audit") || name.Contains("rental") || name.Contains("transport") || name.Contains("clearing") || name.Contains("freight") || name.Contains("warehousing") || name.Contains("brokerage") || name.Contains("insurance") || name.Contains("service"))
                        category = "Services aux Entreprises";
                    else if (name.Contains("gloves") || name.Contains("bleach") || name.Contains("soap") || name.Contains("insecticide") || name.Contains("sanitizer") || name.Contains("mask") || name.Contains("hygiene") || name.Contains("kit"))
                        category = "Santé & Hygiène";

                    await _db.Products.AddAsync(new Product
                    {
                        Id = Guid.NewGuid(),
                        CompanyId = companyId,
                        Code = code,
                        NameEn = p.NameEn,
                        NameFr = p.NameFr,
                        Description = p.Description,
                        UnitPrice = random.Next(500, 250000),
                        TaxRate = 19.25m,
                        StockQuantity = random.Next(0, 1000),
                        ValuationMethod = "FIFO",
                        IsActive = true,
                        FamilyId = families[category].Id
                    });
                    addedCount++;
                }
            }

            await _db.SaveChangesAsync();

            return Ok(new
            {
                message = "Products seed successful",
                companyId = companyId,
                productsAdded = addedCount
            });
        }

        [HttpPost("partners")]
        public async Task<IActionResult> SeedPartners()
        {
            var company = await _db.Companies.FirstOrDefaultAsync();
            if (company == null)
            {
                company = new Company { Name = "Zaizen Enterprise SARL", TaxId = "M0123456789" };
                await _db.Companies.AddAsync(company);
                await _db.SaveChangesAsync();
            }

            var companyId = company.Id;
            var random = new Random();

            // 1. Seed 50 Suppliers
            string[] supplierNames = {
                "Bolloré Transport", "Eneo Cameroon", "Camtel", "Orange Cameroun", "TotalEnergies",
                "Microsoft Azure", "Amazon Web Services", "Office Depot", "CFAO Motors", "Société Générale",
                "EcoBank Cameroon", "UBA Cameroon", "MTN Cameroon", "Tradex SARL", "Ola Energy",
                "Buns SARL", "Razel Cameroon", "Sogea Satom", "Groupement Inter-Patronal", "SABC",
                "Guinness Cameroon", "Nestlé Central Africa", "Olam Cameroon", "Cimencam", "Dangote Cement",
                "Socapalm", "Safacam", "PHP Cameroon", "CDC Cameroon", "Pamol Plantations",
                "Telcar Cocoa", "Olam Cocoa", "Barry Callebaut", "Ferrero Cameroon", "Sodecoton",
                "Cicams", "SNH Cameroon", "Port de Douala", "Port de Kribi", "Camair-Co",
                "Camrail", "Bocom Petroleum", "Glocal Petroleum", "Neptune Oil", "MRS Corlay",
                "First Trust", "La Régionale", "CCA Bank", "Afriland First", "Express Union"
            };

            for (var i = 0; i < supplierNames.Length; i++)
            {
                var accountCode = $"401{100 + i}";
                if (!await _db.Suppliers.AnyAsync(x => x.CompanyId == companyId && x.AccountCode == accountCode))
                {
                    await _db.Suppliers.AddAsync(new Supplier { 
                        Id = Guid.NewGuid(), 
                        CompanyId = companyId, 
                        Name = supplierNames[i], 
                        AccountCode = accountCode 
                    });
                }
            }

            // 2. Seed 50 Customers
            string[] customerNames = {
                "Mairie de Douala 1", "Mairie de Yaoundé 2", "Ministère des Finances", "Gendarmerie Nationale", "Police Secours",
                "Université de Douala", "Hôpital Général", "Clinique de l'Espoir", "Lycée Joss", "Collège Libermann",
                "Pharmacie du Centre", "Supermarché Mahima", "Supermarché Dovv", "Boulangerie Zepol", "Hôtel Sawa",
                "Hôtel Akwa Palace", "Restaurant L'Atrium", "Imprimerie Nationale", "Garage Auto-Pro", "Quincaillerie Moderne",
                "BTP Construction", "Logistique Plus", "Transport Express", "Agence de Voyage Blue", "Consulting Group",
                "Architecture Design", "Cabinet Médical", "École Primaire ABC", "Institut Supérieur", "Fondation Humanitaire",
                "Association Sportive", "Club de Tennis", "Gymnase Central", "Cinéma Eden", "Théâtre de la Ville",
                "Radio Canal 2", "Télévision Equinoxe", "Journal Le Jour", "Magazine Business", "Startup Tech Hub",
                "Espace Coworking", "Services de Sécurité", "Nettoyage Industriel", "Entretien Espaces Verts", "Événementiel Pro",
                "Traiteur Gourmet", "Pâtisserie Royale", "Salon de Coiffure", "Centre de Beauté", "Bijouterie Eclat"
            };

            for (var i = 0; i < customerNames.Length; i++)
            {
                var accountCode = $"411{100 + i}";
                if (!await _db.Customers.AnyAsync(x => x.CompanyId == companyId && x.AccountCode == accountCode))
                {
                    await _db.Customers.AddAsync(new Customer { 
                        Id = Guid.NewGuid(), 
                        CompanyId = companyId, 
                        Name = customerNames[i], 
                        AccountCode = accountCode,
                        Email = $"{customerNames[i].Replace(" ", ".").ToLower()}@example.cm"
                    });
                }
            }

            await _db.SaveChangesAsync();

            return Ok(new 
            { 
                message = "Seed successful", 
                companyId = companyId,
                suppliersAdded = supplierNames.Length,
                customersAdded = customerNames.Length
            });
        }

        /// <summary>Ensure all 22 standard roles exist with their permission sets (idempotent).</summary>
        [HttpPost("security-roles/seed")]
        public async Task<IActionResult> SeedSecurityRoles()
        {
            await SecurityRolesSeeder.SeedStandard22Async(_db);
            return Ok(new
            {
                message = "22 standard security roles are seeded (or updated).",
                count = SecurityRolesSeeder.StandardRoleCount
            });
        }

        /// <summary>Remove all RolePermission links for the 22 catalog roles (users keep their RoleId).</summary>
        [HttpPost("security-roles/unload")]
        public async Task<IActionResult> UnloadSecurityRoles()
        {
            await SecurityRolesSeeder.UnloadStandard22Async(_db);
            return Ok(new
            {
                message = "Role permissions removed for the 22 catalog roles. Re-seed with POST .../security-roles/seed to restore.",
                count = SecurityRolesSeeder.StandardRoleCount
            });
        }
    }
}
