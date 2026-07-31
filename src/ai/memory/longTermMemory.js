class NoopLongTermMemory {
  async retrieve() {
    return [];
  }
}

export {
  NoopLongTermMemory,
};

export default new NoopLongTermMemory();
