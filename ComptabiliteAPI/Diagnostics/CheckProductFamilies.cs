using System;
using System.Linq;
using System.Threading.Tasks;
using ComptabiliteAPI.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace ComptabiliteAPI.Diagnostics
{
    public static class CheckProductFamilies
    {
        public static async Task Run(IServiceProvider services)
        {
            using var scope = services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            
            var products = await db.Products
                .Include(p => p.Family)
                .Take(10)
                .ToListAsync();
                
            Console.WriteLine("--- PRODUCT FAMILY DIAGNOSTIC ---");
            foreach (var p in products)
            {
                Console.WriteLine($"Code: {p.Code}, Name: {p.NameEn}, Family: {p.Family?.NameEn ?? "NONE"}, FamilyId: {p.FamilyId}");
            }
            Console.WriteLine("---------------------------------");
        }
    }
}
