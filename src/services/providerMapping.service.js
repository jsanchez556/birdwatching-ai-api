import providerMappingQueries from '../db/queries/providerMapping.queries.js';

const PROVIDER_MAPPING_NAMES = new Map([
  ['stripe', 'Stripe'],
  ['tilopay', 'TiloPay'],
  ['tilo_pay', 'TiloPay'],
  ['bac', 'BAC'],
  ['other', 'Other'],
]);

function normalizeProviderMappingName(provider) {
  const normalizedProvider = typeof provider === 'string' ? provider.trim() : '';
  const key = normalizedProvider.toLowerCase();

  return PROVIDER_MAPPING_NAMES.get(key) || normalizedProvider;
}

class ProviderMappingService {
  async getDefaultPlanMapping({ planName, provider }) {
    return providerMappingQueries.getDefaultPlanMapping({
      planName,
      provider: normalizeProviderMappingName(provider),
    });
  }

  async getDefaultTourMapping({ tourId, provider }) {
    return providerMappingQueries.getDefaultTourMapping({
      tourId,
      provider: normalizeProviderMappingName(provider),
    });
  }
}

export { ProviderMappingService, normalizeProviderMappingName };
export default new ProviderMappingService();
