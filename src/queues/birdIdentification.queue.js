import { QUEUE_NAMES } from '../jobs/jobTypes.js';
import queueManager from './queue.manager.js';

const registerBirdIdentificationQueue = (manager = queueManager) =>
  manager.registerQueue(QUEUE_NAMES.BIRD_IDENTIFICATION);

const birdIdentificationQueue = {
  name: QUEUE_NAMES.BIRD_IDENTIFICATION,
  register: registerBirdIdentificationQueue,
};

export {
  birdIdentificationQueue,
  registerBirdIdentificationQueue,
};
export default birdIdentificationQueue;
