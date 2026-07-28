import adminQueries from '../db/queries/admin.queries.js';
import queueManager from '../queues/index.js';

class AdminRepository {
  constructor({
    queries = adminQueries,
    queues = queueManager,
  } = {}) {
    this.queries = queries;
    this.queues = queues;
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

  async getQueueHealth() {
    const queues = Array.from(this.queues.queues.entries());

    return Promise.all(queues.map(async ([name, queue]) => {
      try {
        const counts = await queue.getJobCounts(
          'waiting',
          'active',
          'completed',
          'failed',
          'delayed',
          'paused',
          'waiting-children'
        );

        return {
          name,
          available: true,
          counts,
        };
      } catch {
        return {
          name,
          available: false,
          counts: null,
        };
      }
    }));
  }
}

export { AdminRepository };
export default new AdminRepository();
