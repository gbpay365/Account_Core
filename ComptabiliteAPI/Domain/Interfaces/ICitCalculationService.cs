using ComptabiliteAPI.DTOs;

namespace ComptabiliteAPI.Domain.Interfaces
{
    public interface ICitCalculationService
    {
        CitCalculationResult Calculate(CitCalculationRequest request);
    }
}
