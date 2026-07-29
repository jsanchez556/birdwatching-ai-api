import { jest } from '@jest/globals';

const mockQuery = jest.fn();

await jest.unstable_mockModule('../src/db/pool.js', () => ({
  default: {
    query: mockQuery,
  },
}));

const {
  default: providerMappingQueries,
  mapProviderMapping,
} = await import('../src/db/queries/providerMapping.queries.js');

describe('ProviderMappingQueries generic provider mapping lookup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('maps generic provider mappings for plans without provider-specific field names', () => {
    expect(mapProviderMapping({
      provider_mapping_id: 11,
      plan_id: 2,
      plan_name: 'PRO',
      provider: 'Stripe',
      provider_product_id: 'prod_pro',
      provider_price_id: 'price_pro_database',
      provider_sku: 'pro-monthly',
      is_default: true,
    })).toEqual({
      providerMappingId: 11,
      planId: 2,
      planName: 'PRO',
      tourId: undefined,
      tourName: undefined,
      provider: 'Stripe',
      providerProductId: 'prod_pro',
      providerPriceId: 'price_pro_database',
      providerSku: 'pro-monthly',
      isDefault: true,
    });
  });

  it('maps generic provider mappings for tours', () => {
    expect(mapProviderMapping({
      provider_mapping_id: 21,
      tour_id: 5,
      tour_name: 'Monteverde Dawn Walk',
      provider: 'Stripe',
      provider_product_id: 'prod_tour',
      provider_price_id: 'price_tour_adult',
      provider_sku: 'tour-adult',
      is_default: true,
    })).toEqual({
      providerMappingId: 21,
      planId: undefined,
      planName: undefined,
      tourId: 5,
      tourName: 'Monteverde Dawn Walk',
      provider: 'Stripe',
      providerProductId: 'prod_tour',
      providerPriceId: 'price_tour_adult',
      providerSku: 'tour-adult',
      isDefault: true,
    });
  });

  it('looks up the default provider mapping for a plan through the database function contract', async () => {
    mockQuery.mockResolvedValue({
      rows: [
        {
          provider_mapping_id: 11,
          plan_id: 2,
          plan_name: 'PRO',
          provider: 'Stripe',
          provider_price_id: 'price_pro_database',
          is_default: true,
        },
      ],
    });

    await expect(providerMappingQueries.getDefaultPlanMapping({
      planName: 'PRO',
      provider: 'Stripe',
    })).resolves.toMatchObject({
      providerMappingId: 11,
      planId: 2,
      planName: 'PRO',
      provider: 'Stripe',
      providerPriceId: 'price_pro_database',
      isDefault: true,
    });

    expect(mockQuery).toHaveBeenCalledWith(
      'SELECT * FROM get_default_plan_provider_mapping($1, $2)',
      ['PRO', 'Stripe']
    );
  });

  it('looks up the default provider mapping for a tour through the database function contract', async () => {
    mockQuery.mockResolvedValue({
      rows: [
        {
          provider_mapping_id: 21,
          tour_id: 5,
          tour_name: 'Monteverde Dawn Walk',
          provider: 'Stripe',
          provider_price_id: 'price_tour_adult',
          is_default: true,
        },
      ],
    });

    await expect(providerMappingQueries.getDefaultTourMapping({
      tourId: 5,
      provider: 'Stripe',
    })).resolves.toMatchObject({
      providerMappingId: 21,
      tourId: 5,
      tourName: 'Monteverde Dawn Walk',
      provider: 'Stripe',
      providerPriceId: 'price_tour_adult',
      isDefault: true,
    });

    expect(mockQuery).toHaveBeenCalledWith(
      'SELECT * FROM get_default_tour_provider_mapping($1, $2)',
      [5, 'Stripe']
    );
  });
});
