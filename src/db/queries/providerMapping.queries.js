import pool from '../pool.js';

function mapProviderMapping(row) {
  if (!row) {
    return null;
  }

  return {
    providerMappingId: row.provider_mapping_id,
    planId: row.plan_id,
    planName: row.plan_name,
    tourId: row.tour_id,
    tourName: row.tour_name,
    provider: row.provider,
    providerProductId: row.provider_product_id,
    providerPriceId: row.provider_price_id,
    providerSku: row.provider_sku,
    isDefault: row.is_default,
  };
}

class ProviderMappingQueries {
  async getDefaultPlanMapping({ planName, provider }) {
    const result = await pool.query(
      'SELECT * FROM get_default_plan_provider_mapping($1, $2)',
      [planName, provider]
    );

    return mapProviderMapping(result.rows[0]);
  }

  async getDefaultTourMapping({ tourId, provider }) {
    const result = await pool.query(
      'SELECT * FROM get_default_tour_provider_mapping($1, $2)',
      [tourId, provider]
    );

    return mapProviderMapping(result.rows[0]);
  }
}

export { ProviderMappingQueries, mapProviderMapping };
export default new ProviderMappingQueries();
