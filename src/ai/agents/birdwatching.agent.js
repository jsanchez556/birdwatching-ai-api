import { ToolExecutor } from '../tools/tool.executor.js';
import searchTours from '../tools/searchTours.tool.js';
import calculateTransfer from '../tools/transfer.tool.js';
import calculatePricing from '../tools/calculatePricing.tool.js';
import checkAvailability from '../tools/checkAvailability.tool.js';
import createReservation from '../tools/createReservation.tool.js';
import toolPlanner from '../planners/tool.planner.js';

const birdwatchingToolHandlers = {
  searchTours,
  calculateTransfer,
  calculatePricing,
  checkAvailability,
  createReservation,
};

function createBirdwatchingAgent(options = {}) {
  return {
    planner: options.planner || toolPlanner,
    executor: options.executor || new ToolExecutor(birdwatchingToolHandlers, options),
  };
}

export default createBirdwatchingAgent();
