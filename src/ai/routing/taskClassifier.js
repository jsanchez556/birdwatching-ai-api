import HttpError from '../../utils/httpError.js';
import { TASK_CATEGORY_SET } from './modelPolicies.js';

const RESERVATION_TOOLS = new Set(['checkAvailability', 'calculatePricing', 'createReservation']);

function classifyTask({
  explicitTask,
  operation,
  requiresVision = false,
  hasRagContext = false,
  plan,
} = {}) {
  if (explicitTask !== undefined) {
    if (!TASK_CATEGORY_SET.has(explicitTask)) {
      throw new HttpError(422, 'Unsupported model-routing task category.', {
        code: 'MODEL_ROUTING_UNSUPPORTED_TASK',
        details: { task: explicitTask },
      });
    }
    return explicitTask;
  }

  if (operation === 'evaluation') return 'evaluation';
  if (operation === 'intent_classification') return 'intent_classification';
  if (requiresVision || operation === 'bird_identification') return 'bird_image_analysis';

  const steps = Array.isArray(plan?.steps) ? plan.steps : [];
  const tools = steps.map((step) => step?.tool).filter(Boolean);

  if (tools.some((tool) => RESERVATION_TOOLS.has(tool))) return 'reservation_planning';
  if (steps.some((step) => step?.tool === 'searchTours' && step.args?.recommend === true)) {
    return 'tour_recommendation';
  }
  if (tools.length > 0) return 'tool_selection';
  if (hasRagContext) return 'rag_answer';
  return 'general_chat';
}

export {
  RESERVATION_TOOLS,
  classifyTask,
};
