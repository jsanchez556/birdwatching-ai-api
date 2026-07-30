import { routeModel } from '../../ai/routing/modelRouter.js';

class ModelRoutingService {
  constructor({ router = routeModel } = {}) {
    this.router = router;
  }

  preview(input) {
    const route = this.router(input);

    return {
      task: route.task,
      route: route.route,
      reasonCode: route.reasonCode,
      reason: route.reason,
      primaryModelKey: route.primaryModel.key,
      fallbackCount: route.fallbackModels.length,
      reasoningEffort: route.reasoningEffort,
      timeoutMs: route.timeoutMs,
      maxRetries: route.maxRetries,
    };
  }
}

export { ModelRoutingService };
export default new ModelRoutingService();
