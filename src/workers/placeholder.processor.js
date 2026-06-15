const createPlaceholderProcessor = (workerName) => async () => {
  throw new Error(`${workerName} processor is not implemented`);
};

export default createPlaceholderProcessor;
