import { TASK_CATEGORIES, TASK_CATEGORY_SET } from '../../ai/routing/modelPolicies.js';
import {
  COMPLEXITIES,
  MAX_ESTIMATED_INPUT_TOKENS,
} from '../../ai/routing/modelRouter.js';
import {
  isSupportedPlanName,
  normalizePlanName,
  SUPPORTED_PLAN_NAMES,
} from '../../services/subscriptions/subscription.service.js';

const ALLOWED_FIELDS = new Set([
  'task',
  'estimatedInputTokens',
  'userPlan',
  'complexity',
  'evaluatedModelKey',
]);
const MODEL_KEY_PATTERN = /^[a-z][a-z0-9_]{1,80}$/;

function validateModelRoutingPreview(req) {
  const body = req.body || {};
  const errors = [];
  const unknownFields = Object.keys(body).filter((field) => !ALLOWED_FIELDS.has(field));
  const estimatedInputTokens = body.estimatedInputTokens ?? 0;
  const complexity = body.complexity ?? 'medium';
  const userPlan = body.userPlan === undefined ? 'FREE' : normalizePlanName(body.userPlan);

  if (!TASK_CATEGORY_SET.has(body.task)) {
    errors.push(`task must be one of: ${TASK_CATEGORIES.join(', ')}`);
  }
  if (!Number.isSafeInteger(estimatedInputTokens)
    || estimatedInputTokens < 0
    || estimatedInputTokens > MAX_ESTIMATED_INPUT_TOKENS) {
    errors.push(
      `estimatedInputTokens must be an integer from 0 to ${MAX_ESTIMATED_INPUT_TOKENS}`
    );
  }
  if (!COMPLEXITIES.has(complexity)) {
    errors.push(`complexity must be one of: ${[...COMPLEXITIES].join(', ')}`);
  }
  if (body.userPlan !== undefined
    && (typeof body.userPlan !== 'string'
      || !body.userPlan.trim()
      || !isSupportedPlanName(body.userPlan))) {
    errors.push(`userPlan must be one of: ${[...SUPPORTED_PLAN_NAMES].join(', ')}`);
  }
  if (body.evaluatedModelKey !== undefined
    && (typeof body.evaluatedModelKey !== 'string'
      || !MODEL_KEY_PATTERN.test(body.evaluatedModelKey))) {
    errors.push('evaluatedModelKey must be a valid model key');
  }
  if (unknownFields.length > 0) {
    errors.push(`Model routing preview payload contains unknown fields: ${unknownFields.join(', ')}`);
  }

  return {
    message: 'Invalid model routing preview request',
    errors,
    value: {
      task: body.task,
      estimatedInputTokens,
      userPlan,
      complexity,
      ...(body.evaluatedModelKey === undefined
        ? {}
        : { evaluatedModelKey: body.evaluatedModelKey }),
    },
  };
}

export {
  ALLOWED_FIELDS,
  MODEL_KEY_PATTERN,
  validateModelRoutingPreview,
};
