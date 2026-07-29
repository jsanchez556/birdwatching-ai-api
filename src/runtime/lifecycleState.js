let shuttingDown = false;

function isShuttingDown() {
  return shuttingDown;
}

function markShuttingDown() {
  shuttingDown = true;
}

function resetLifecycleStateForTests() {
  shuttingDown = false;
}

export {
  isShuttingDown,
  markShuttingDown,
  resetLifecycleStateForTests,
};
