import queueManager from './queue.manager.js';
import { registerBirdIdentificationQueue } from './birdIdentification.queue.js';
import { registerDeadLetterQueue } from './deadLetter.queue.js';
import { registerEmbeddingQueue } from './embedding.queue.js';
import { registerIngestionQueue } from './ingestion.queue.js';

const registerQueues = (manager = queueManager) => ({
  birdIdentificationQueue: registerBirdIdentificationQueue(manager),
  deadLetterQueue: registerDeadLetterQueue(manager),
  embeddingQueue: registerEmbeddingQueue(manager),
  ingestionQueue: registerIngestionQueue(manager),
});

export {
  registerQueues,
};
export default queueManager;
