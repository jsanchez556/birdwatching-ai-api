import { QUEUE_NAMES } from '../jobs/jobTypes.js';
import queueManager from './queue.manager.js';

const registerEmbeddingQueue = (manager = queueManager) =>
  manager.registerQueue(QUEUE_NAMES.EMBEDDING);

const embeddingQueue = {
  name: QUEUE_NAMES.EMBEDDING,
  register: registerEmbeddingQueue,
};

export {
  embeddingQueue,
  registerEmbeddingQueue,
};
export default embeddingQueue;
