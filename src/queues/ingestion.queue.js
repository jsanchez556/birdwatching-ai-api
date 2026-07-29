import { QUEUE_NAMES } from '../jobs/jobTypes.js';
import queueManager from './queue.manager.js';

const registerIngestionQueue = (manager = queueManager) =>
  manager.registerQueue(QUEUE_NAMES.INGESTION);

const ingestionQueue = {
  name: QUEUE_NAMES.INGESTION,
  register: registerIngestionQueue,
};

export {
  ingestionQueue,
  registerIngestionQueue,
};
export default ingestionQueue;
