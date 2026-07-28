import experimentAssignmentQueries from '../db/queries/experimentAssignment.queries.js';
import featureFlags from '../featureFlags/featureFlag.service.js';
import logger from '../utils/logger.js';

class ExperimentAssignmentService {
  constructor({
    queries = experimentAssignmentQueries,
    featureFlagService = featureFlags,
    log = logger,
  } = {}) {
    this.queries = queries;
    this.featureFlags = featureFlagService;
    this.logger = log;
  }

  async getPersisted({ userId, experiment, variants = [] } = {}) {
    if (userId === undefined || userId === null || !experiment) {
      return null;
    }

    try {
      const persisted = await this.queries.get({ userId, experiment });
      return persisted && variants.includes(persisted.variant) ? persisted : null;
    } catch {
      this.logger.warn('Experiment assignment lookup failed', { experiment });
      return null;
    }
  }

  async resolve({
    userId,
    anonymousId,
    experiment,
    flag,
    variants = [],
    defaultVariant,
    personProperties = {},
  } = {}) {
    if (!experiment || !flag || !variants.includes(defaultVariant)) {
      return null;
    }

    if (userId !== undefined && userId !== null) {
      const persisted = await this.getPersisted({ userId, experiment, variants });

      if (persisted) {
        return persisted;
      }
    }

    const evaluated = await this.featureFlags.getVariant({
      flag,
      userId,
      anonymousId,
      personProperties,
      defaultValue: defaultVariant,
    });
    const variant = variants.includes(evaluated) ? evaluated : defaultVariant;
    const assignment = { experiment, variant };

    if (userId === undefined || userId === null) {
      return assignment;
    }

    try {
      return await this.queries.assign({
        userId,
        experiment,
        variant,
      }) || assignment;
    } catch {
      this.logger.warn('Experiment assignment persistence failed', { experiment });
      return assignment;
    }
  }
}

const experimentAssignments = new ExperimentAssignmentService();

export {
  ExperimentAssignmentService,
};
export default experimentAssignments;
