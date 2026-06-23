using System.Collections.Generic;

namespace ComptabiliteAPI.Domain.Entities
{
    public class User
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public string Email { get; set; } = string.Empty;
        public string PasswordHash { get; set; } = string.Empty;
        public string FullName { get; set; } = string.Empty;
        public Guid? RoleId { get; set; }
        public Role? Role { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        public ICollection<UserCompany> UserCompanies { get; set; } = new List<UserCompany>();
    }

    public class UserCompany
    {
        public Guid UserId { get; set; }
        public User User { get; set; } = null!;
        
        public Guid CompanyId { get; set; }
        public Company Company { get; set; } = null!;
        
        public string AccessLevel { get; set; } = "view"; // 'view' or 'edit'
    }
}
