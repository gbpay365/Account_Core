using ComptabiliteAPI.Domain.Interfaces;

namespace ComptabiliteAPI.Infrastructure.Services
{
    public class NullCertificateService : ICertificateService
    {
        public bool IsConfigured => false;

        public Task<string> SignPayloadAsync(string payload, CancellationToken cancellationToken = default) =>
            Task.FromResult(Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes("unsigned:" + payload.Length)));
    }
}
