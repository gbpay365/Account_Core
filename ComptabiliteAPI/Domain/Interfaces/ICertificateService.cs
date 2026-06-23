namespace ComptabiliteAPI.Domain.Interfaces
{
    /// <summary>Reserved for X.509 signing when DGI certificates and endpoints are configured.</summary>
    public interface ICertificateService
    {
        bool IsConfigured { get; }
        Task<string> SignPayloadAsync(string payload, CancellationToken cancellationToken = default);
    }
}
