using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace ComptabiliteAPI.Domain.Interfaces
{
    public interface IBankProvider
    {
        Task<IReadOnlyList<BankTransactionDto>> GetTransactionsAsync(string accessToken, DateTime startDate, DateTime endDate);
    }

    public class BankTransactionDto
    {
        public string TransactionId { get; set; } = string.Empty;
        public DateTime Date { get; set; }
        public string Description { get; set; } = string.Empty;
        public decimal Amount { get; set; }
        public string Currency { get; set; } = string.Empty;
    }
}
