import adminQueries from '../db/queries/admin.queries.js';

class AdminRepository {
  constructor({
    queries = adminQueries,
  } = {}) {
    this.queries = queries;
  }

  getOverview(range) {
    return this.queries.getOverview(range);
  }

  getUsers(pagination) {
    return this.queries.getUsers(pagination);
  }

  getSubscriptions(pagination) {
    return this.queries.getSubscriptions(pagination);
  }

  getAiUsage(range) {
    return this.queries.getAiUsage(range);
  }

  getAiCosts(range) {
    return this.queries.getAiCosts(range);
  }

  getReservations(pagination) {
    return this.queries.getReservations(pagination);
  }

  getFailures(pagination) {
    return this.queries.getFailures(pagination);
  }

  getOperationalErrors(options) {
    return this.queries.getOperationalErrors(options);
  }

}

export { AdminRepository };
export default new AdminRepository();
