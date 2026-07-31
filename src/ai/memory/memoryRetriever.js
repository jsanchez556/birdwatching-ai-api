class MemoryRetriever {
  constructor({ store } = {}) {
    this.store = store;
  }

  async retrieve({ userId, query, signal, parentTraceId, excludedMemoryIds } = {}) {
    if (userId === undefined || userId === null || !this.store?.retrieve) {
      return [];
    }

    return this.store.retrieve({
      userId,
      query,
      signal,
      parentTraceId,
      excludedMemoryIds,
    });
  }
}

export {
  MemoryRetriever,
};
