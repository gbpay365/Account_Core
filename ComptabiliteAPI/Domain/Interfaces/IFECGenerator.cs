namespace ComptabiliteAPI.Domain.Interfaces
{
    public interface IFECGenerator
    {
        Task<(byte[] Content, string Filename)> GenerateAsync(Guid companyId, int fiscalYear, CancellationToken cancellationToken = default);
    }
}
