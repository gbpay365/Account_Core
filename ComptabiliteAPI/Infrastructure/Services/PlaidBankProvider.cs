using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using ComptabiliteAPI.Domain.Interfaces;

namespace ComptabiliteAPI.Infrastructure.Services
{
    public class PlaidBankProvider : IBankProvider
    {
        public async Task<IReadOnlyList<BankTransactionDto>> GetTransactionsAsync(string accessToken, DateTime startDate, DateTime endDate)
        {
            // In a real implementation, we would call Plaid API /transactions/get
            await Task.Delay(1500);

            return new List<BankTransactionDto>
            {
                new BankTransactionDto { TransactionId = "plaid_001", Date = DateTime.Today.AddDays(-2), Description = "Amazon Web Services", Amount = -125000, Currency = "XAF" },
                new BankTransactionDto { TransactionId = "plaid_002", Date = DateTime.Today.AddDays(-1), Description = "Client Deposit: SARL BTP", Amount = 5000000, Currency = "XAF" },
                new BankTransactionDto { TransactionId = "plaid_003", Date = DateTime.Today, Description = "Office Rent - Douala", Amount = -450000, Currency = "XAF" }
            };
        }
    }
}
