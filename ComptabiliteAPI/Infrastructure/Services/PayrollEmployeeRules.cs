using System.Text.RegularExpressions;
using ComptabiliteAPI.Domain.Entities;

namespace ComptabiliteAPI.Infrastructure.Services
{
    internal static class PayrollEmployeeRules
    {
        private static readonly Regex VisitingDoctorEmail = new(@"^vd\d+@visiting\.local$", RegexOptions.IgnoreCase | RegexOptions.Compiled);
        private static readonly Regex VisitingDoctorUsername = new(@"^VD\d+$", RegexOptions.IgnoreCase | RegexOptions.Compiled);

        public static bool IsExcluded(HmsEmployeeUpsertDto dto)
        {
            if (dto.IncludeInPayroll == false)
                return true;

            var role = dto.HmsRole?.Trim() ?? "";
            if (role is "1" or "99")
                return true;

            var email = (dto.Email ?? "").Trim().ToLowerInvariant();
            if (VisitingDoctorEmail.IsMatch(email))
                return true;

            var username = (dto.HmsUsername ?? "").Trim();
            if (VisitingDoctorUsername.IsMatch(username))
                return true;

            var job = (dto.JobTitle ?? "").ToLowerInvariant();
            if (job.Contains("visiting doctor"))
                return true;

            return false;
        }

        public static bool IsExcluded(Employee employee)
        {
            var email = (employee.Email ?? "").Trim().ToLowerInvariant();
            if (email is "admin@hms.com" or "super@localhost")
                return true;
            if (VisitingDoctorEmail.IsMatch(email))
                return true;

            var job = $"{employee.Position} {employee.PositionEn}".ToLowerInvariant();
            if (job.Contains("visiting doctor"))
                return true;

            return false;
        }
    }
}
