import { jest } from '@jest/globals';

const mockGetDefaultPlanMapping = jest.fn();
const mockGetDefaultTourMapping = jest.fn();

await jest.unstable_mockModule('../src/db/queries/providerMapping.queries.js', () => ({
  default: {
    getDefaultPlanMapping: mockGetDefaultPlanMapping,
    getDefaultTourMapping: mockGetDefaultTourMapping,
  },
}));

const providerMappingService = await import('../src/services/providerMapping.service.js');

describe('ProviderMappingService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('resolves default plan mappings through the provider mapping query module', async () => {
    mockGetDefaultPlanMapping.mockResolvedValue({
      providerMappingId: 11,
      planId: 2,
      planName: 'PRO',
      provider: 'Stripe',
      providerPriceId: 'price_pro_database',
      isDefault: true,
    });

    await expect(providerMappingService.default.getDefaultPlanMapping({
      planName: 'PRO',
      provider: 'stripe',
    })).resolves.toMatchObject({
      providerMappingId: 11,
      planName: 'PRO',
      providerPriceId: 'price_pro_database',
    });

    expect(mockGetDefaultPlanMapping).toHaveBeenCalledWith({
      planName: 'PRO',
      provider: 'Stripe',
    });
  });

  it('resolves default tour mappings through the provider mapping query module', async () => {
    mockGetDefaultTourMapping.mockResolvedValue({
      providerMappingId: 21,
      tourId: 5,
      tourName: 'Monteverde Dawn Walk',
      provider: 'Stripe',
      providerPriceId: 'price_tour_adult',
      isDefault: true,
    });

    await expect(providerMappingService.default.getDefaultTourMapping({
      tourId: 5,
      provider: 'stripe',
    })).resolves.toMatchObject({
      providerMappingId: 21,
      tourId: 5,
      providerPriceId: 'price_tour_adult',
    });

    expect(mockGetDefaultTourMapping).toHaveBeenCalledWith({
      tourId: 5,
      provider: 'Stripe',
    });
  });
});
