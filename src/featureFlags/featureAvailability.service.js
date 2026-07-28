import featureControlQueries from '../db/queries/featureControl.queries.js';
import { FEATURE_FLAGS } from './flags.js';

export const PUBLIC_AI_FEATURES = Object.freeze([
  FEATURE_FLAGS.VOICE_AI,
  FEATURE_FLAGS.MULTIMODAL_BIRD_IDENTIFICATION,
  FEATURE_FLAGS.AGENT_BOOKING,
]);

class FeatureAvailabilityService {
  constructor({ repository = featureControlQueries } = {}) {
    this.repository = repository;
  }

  async getAvailability() {
    const rows = await this.repository.getActiveDisables({ features: PUBLIC_AI_FEATURES });
    const byFeature = new Map(rows.map((row) => [row.feature, row.disabled_until]));
    return {
      features: PUBLIC_AI_FEATURES.map((name) => {
        const disabledUntil = byFeature.get(name);
        return {
          name,
          enabled: !disabledUntil,
          status: disabledUntil ? 'disabled' : 'enabled',
          disabledUntil: disabledUntil ? new Date(disabledUntil).toISOString() : null,
        };
      }),
    };
  }
}

export { FeatureAvailabilityService };
export default new FeatureAvailabilityService();
