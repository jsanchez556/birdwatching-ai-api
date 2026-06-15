import { createResponseCache } from './responseCache.js';

export const createRetrievalCache = (options = {}) =>
  createResponseCache({
    namespace: 'retrieval',
    ...options,
  });

export default createRetrievalCache;
