import { QUEUE_NAMES } from '../jobs/jobTypes.js';
import queueManager from './queue.manager.js';

const registerDeadLetterQueue = (manager = queueManager) =>
  manager.registerQueue(manager.config.deadLetter?.queueName || QUEUE_NAMES.DEAD_LETTER, {
    registerEvents: false,
    defaultJobOptions: {
      attempts: 1,
    },
  });

const deadLetterQueue = {
  name: QUEUE_NAMES.DEAD_LETTER,
  register: registerDeadLetterQueue,
};

export {
  deadLetterQueue,
  registerDeadLetterQueue,
};
export default deadLetterQueue;
