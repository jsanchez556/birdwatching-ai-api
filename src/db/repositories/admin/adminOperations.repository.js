import adminOperationsQueries from '../../queries/adminOperations.queries.js';
import featureControlQueries from '../../queries/featureControl.queries.js';

class AdminOperationsRepository {
  constructor({ queries = adminOperationsQueries, featureQueries = featureControlQueries } = {}) {
    this.queries = queries;
    this.featureQueries = featureQueries;
  }

  createAuditLog(input) {
    return this.queries.createAuditLog(input);
  }

  finalizeAuditLog(input) {
    return this.queries.finalizeAuditLog(input);
  }

  getJobForAdmin(input) {
    return this.queries.getJobForAdmin(input);
  }

  suspendUser(input) {
    return this.queries.suspendUser(input);
  }

  disableAiFeature(input) {
    return this.queries.disableAiFeature(input);
  }

  enableAiFeature(input) {
    return this.queries.enableAiFeature(input);
  }

  unsuspendUser(input) {
    return this.queries.unsuspendUser(input);
  }

  getAiFeatureStates(input) {
    return this.featureQueries.getActiveDisables(input);
  }
}

export { AdminOperationsRepository };
export default new AdminOperationsRepository();
