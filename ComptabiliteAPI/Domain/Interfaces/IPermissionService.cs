namespace ComptabiliteAPI.Domain.Interfaces
{
    public interface IPermissionService
    {
        Task<bool> HasPermissionAsync(Guid userId, string resource, string action);
    }
}
