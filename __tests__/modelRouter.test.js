import { readFile } from 'node:fs/promises';
import { createModelRouter, routeModel } from '../src/ai/routing/modelRouter.js';
import {
  createModelRegistry,
  MODEL_KEYS,
} from '../src/ai/routing/modelRegistry.js';
import { MODEL_POLICIES, TASK_CATEGORIES } from '../src/ai/routing/modelPolicies.js';
import { classifyTask } from '../src/ai/routing/taskClassifier.js';

const DISTINCT_MODEL_IDS = {
  economy: 'provider-economy',
  balanced: 'provider-balanced',
  advanced: 'provider-advanced',
  structured: 'provider-structured',
  vision: 'provider-vision',
  evaluation: 'provider-evaluator',
  embedding: 'provider-embedding',
  transcription: 'provider-transcription',
  speech: 'provider-speech',
};

function mutableRegistry(configuration = DISTINCT_MODEL_IDS) {
  return Object.fromEntries(
    Object.entries(createModelRegistry(configuration)).map(([key, entry]) => [
      key,
      {
        ...entry,
        capabilities: {
          ...entry.capabilities,
          modalities: [...entry.capabilities.modalities],
          reasoningEfforts: [...entry.capabilities.reasoningEfforts],
          strengths: [...entry.capabilities.strengths],
        },
      },
    ])
  );
}

describe('model routing', () => {
  it.each(TASK_CATEGORIES)('routes supported task %s to a compatible chain', (task) => {
    const route = routeModel({ task });

    expect(route).toMatchObject({
      task,
      route: expect.stringMatching(/^(economy|balanced|advanced)$/),
      primaryModel: {
        key: expect.any(String),
        modelId: expect.any(String),
      },
      fallbackModels: expect.any(Array),
      reasoningEffort: expect.stringMatching(/^(none|low|medium|high)$/),
      timeoutMs: expect.any(Number),
      maxRetries: expect.any(Number),
      reasonCode: expect.any(String),
      reason: expect.any(String),
    });
    expect(route.fallbackModels.length).toBeGreaterThan(0);
  });

  it('selects economy, balanced, advanced, structured, and vision capabilities', () => {
    const router = createModelRouter({ registry: mutableRegistry() });

    expect(router({ task: 'intent_classification' }).primaryModel.key)
      .toBe(MODEL_KEYS.ECONOMY_FAST);
    expect(router({ task: 'general_chat' }).primaryModel.key)
      .toBe(MODEL_KEYS.BALANCED_GENERAL);
    expect(router({ task: 'reservation_planning' }).primaryModel.key)
      .toBe(MODEL_KEYS.ADVANCED_REASONING);
    expect(router({ task: 'tour_recommendation' }).primaryModel.key)
      .toBe(MODEL_KEYS.STRUCTURED_RELIABLE);
    expect(router({ task: 'bird_image_analysis' }).primaryModel.key)
      .toBe(MODEL_KEYS.VISION_MULTIMODAL);
  });

  it.each([
    {
      label: 'intent classification',
      input: { task: 'intent_classification', complexity: 'low' },
      expected: {
        task: 'intent_classification',
        route: 'economy',
        primaryModel: {
          key: MODEL_KEYS.ECONOMY_FAST,
          modelId: DISTINCT_MODEL_IDS.economy,
        },
        reasoningEffort: 'low',
        timeoutMs: 8000,
        maxRetries: 1,
        reasonCode: 'FAST_INTENT_CLASSIFICATION',
      },
    },
    {
      label: 'complex reservation',
      input: { task: 'reservation_planning', complexity: 'high' },
      expected: {
        task: 'reservation_planning',
        route: 'advanced',
        primaryModel: {
          key: MODEL_KEYS.ADVANCED_REASONING,
          modelId: DISTINCT_MODEL_IDS.advanced,
        },
        reasoningEffort: 'medium',
        timeoutMs: 30000,
        maxRetries: 2,
        reasonCode: 'MULTI_STEP_RESERVATION',
      },
    },
  ])('returns stable route metadata for $label', ({ input, expected }) => {
    const result = createModelRouter({ registry: mutableRegistry() })(input);

    expect(result).toMatchObject(expected);
    expect(result.fallbackModels).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: expect.any(String),
        modelId: expect.any(String),
      }),
    ]));
    expect(result.reason).toEqual(expect.any(String));
  });

  it('is deterministic and applies stable optional-input defaults', () => {
    const first = routeModel({ task: 'general_chat' });
    const second = routeModel({
      task: 'general_chat',
      estimatedInputTokens: 0,
      userPlan: 'FREE',
      complexity: 'medium',
    });

    expect(second).toEqual(first);
    expect(routeModel({ task: 'general_chat' })).toEqual(first);
  });

  it('uses deterministic ordered fallbacks and keeps retries separate', () => {
    const router = createModelRouter({ registry: mutableRegistry() });
    const route = router({ task: 'tour_recommendation' });

    expect(route.primaryModel.key).toBe(MODEL_KEYS.STRUCTURED_RELIABLE);
    expect(route.fallbackModels.map((model) => model.key)).toEqual([
      MODEL_KEYS.BALANCED_GENERAL,
      MODEL_KEYS.ECONOMY_FAST,
      MODEL_KEYS.ADVANCED_REASONING,
      MODEL_KEYS.EVALUATION_JUDGE,
      MODEL_KEYS.VISION_MULTIMODAL,
    ]);
    expect(route.maxRetries).toBe(MODEL_POLICIES.tour_recommendation.maxRetries);
    expect(route.fallbackModels).toHaveLength(5);
  });

  it('removes duplicate provider models and never repeats the primary', () => {
    const registry = mutableRegistry({
      ...DISTINCT_MODEL_IDS,
      balanced: 'shared-provider-model',
      advanced: 'shared-provider-model',
      structured: 'shared-provider-model',
      evaluation: 'shared-provider-model',
    });
    const route = createModelRouter({ registry })({ task: 'general_chat' });
    const allIds = [
      route.primaryModel.modelId,
      ...route.fallbackModels.map((model) => model.modelId),
    ];

    expect(new Set(allIds).size).toBe(allIds.length);
    expect(route.fallbackModels).not.toContainEqual(route.primaryModel);
  });

  it('excludes capability-incompatible structured fallbacks', () => {
    const registry = mutableRegistry();
    registry[MODEL_KEYS.BALANCED_GENERAL].capabilities.structuredOutput = false;
    registry[MODEL_KEYS.ECONOMY_FAST].capabilities.structuredOutput = false;
    const route = createModelRouter({ registry })({ task: 'tool_selection' });

    expect(route.primaryModel.key).toBe(MODEL_KEYS.STRUCTURED_RELIABLE);
    expect(route.fallbackModels.map((model) => model.key))
      .not.toContain(MODEL_KEYS.BALANCED_GENERAL);
    expect(route.fallbackModels.map((model) => model.key))
      .not.toContain(MODEL_KEYS.ECONOMY_FAST);
  });

  it('never selects a text-only primary or fallback for vision', () => {
    const registry = mutableRegistry();
    registry[MODEL_KEYS.ECONOMY_FAST].capabilities.modalities = ['text'];
    registry[MODEL_KEYS.STRUCTURED_RELIABLE].capabilities.modalities = ['text'];
    const route = createModelRouter({ registry })({ task: 'bird_image_analysis' });

    const selected = [
      route.primaryModel.key,
      ...route.fallbackModels.map((model) => model.key),
    ];
    for (const key of selected) {
      expect(registry[key].capabilities.modalities).toContain('image');
    }
  });

  it('fails with a specific error when no vision route exists', () => {
    const registry = mutableRegistry();
    for (const entry of Object.values(registry)) {
      entry.capabilities.modalities = entry.capabilities.modalities.filter(
        (modality) => modality !== 'image'
      );
    }

    expect(() => createModelRouter({ registry })({ task: 'bird_image_analysis' }))
      .toThrow(expect.objectContaining({ code: 'VISION_MODEL_UNAVAILABLE', status: 503 }));
  });

  it('avoids the evaluated model when a distinct evaluator is available', () => {
    const registry = mutableRegistry();
    const route = createModelRouter({ registry })({
      task: 'evaluation',
      evaluatedModelKey: MODEL_KEYS.ADVANCED_REASONING,
    });

    expect(route.primaryModel.key).toBe(MODEL_KEYS.EVALUATION_JUDGE);
    expect(route.fallbackModels.map((model) => model.key))
      .not.toContain(MODEL_KEYS.ADVANCED_REASONING);
  });

  it('fails predictably when evaluation has no independent alternative', () => {
    const registry = mutableRegistry();
    const evaluated = registry[MODEL_KEYS.ADVANCED_REASONING];
    const oneModelRegistry = {
      [evaluated.key]: evaluated,
    };

    expect(() => createModelRouter({ registry: oneModelRegistry })({
      task: 'evaluation',
      evaluatedModelKey: MODEL_KEYS.ADVANCED_REASONING,
    })).toThrow(expect.objectContaining({
      code: 'EVALUATION_MODEL_CONFLICT',
      status: 503,
    }));
  });

  it('rejects unsupported tasks rather than falling back to chat', () => {
    expect(() => routeModel({ task: 'unknown_task' })).toThrow(expect.objectContaining({
      code: 'MODEL_ROUTING_UNSUPPORTED_TASK',
      status: 422,
    }));
  });

  it('fails safely for empty and misconfigured registries', () => {
    expect(() => createModelRouter({ registry: {} })({ task: 'general_chat' }))
      .toThrow(expect.objectContaining({ code: 'MODEL_ROUTE_UNAVAILABLE' }));

    const registry = mutableRegistry();
    registry[MODEL_KEYS.BALANCED_GENERAL].modelId = '';
    expect(() => createModelRouter({ registry })({ task: 'general_chat' }))
      .toThrow(expect.objectContaining({ code: 'MODEL_REGISTRY_MISCONFIGURED' }));
  });

  it('upgrades high-complexity and long-context requests deterministically', () => {
    expect(routeModel({ task: 'general_chat', complexity: 'high' })).toMatchObject({
      route: 'advanced',
      reasonCode: 'HIGH_COMPLEXITY_REQUEST',
    });
    expect(routeModel({ task: 'rag_answer', estimatedInputTokens: 16000 })).toMatchObject({
      route: 'advanced',
      reasonCode: 'LONG_CONTEXT_INPUT',
    });
    expect(routeModel({
      task: 'general_chat',
      complexity: 'low',
      userPlan: 'FREE',
    })).toMatchObject({
      route: 'economy',
      reasonCode: 'ECONOMY_SIMPLE_CHAT',
    });
  });

  it('keeps provider model IDs out of migrated business and provider-call modules', async () => {
    const migratedModules = [
      '../src/ai/agents/birdIdentification.agent.js',
      '../src/ai/audio/speechToText.adapter.js',
      '../src/ai/audio/textToSpeech.adapter.js',
      '../src/ai/clients/openai.client.js',
      '../src/ai/orchestrators/agent.orchestrator.js',
      '../src/services/birdIdentification.service.js',
      '../src/services/birdImageAnalysis.service.js',
      '../src/services/chat.service.js',
    ];
    const contents = await Promise.all(migratedModules.map((path) => (
      readFile(new URL(path, import.meta.url), 'utf8')
    )));

    for (const content of contents) {
      expect(content).not.toMatch(/\b(?:gpt-|text-embedding-|whisper-)[A-Za-z0-9._-]+/);
      expect(content).not.toMatch(/env\.openAi(?:Model|EmbeddingModel)/);
    }
  });
});

describe('task classifier', () => {
  it('preserves explicit valid tasks and rejects invalid explicit tasks', () => {
    expect(classifyTask({
      explicitTask: 'evaluation',
      requiresVision: true,
    })).toBe('evaluation');
    expect(() => classifyTask({ explicitTask: 'unknown' })).toThrow(
      expect.objectContaining({ code: 'MODEL_ROUTING_UNSUPPORTED_TASK' })
    );
  });

  it('uses deterministic workflow, tool, vision, and RAG signals', () => {
    expect(classifyTask({ requiresVision: true })).toBe('bird_image_analysis');
    expect(classifyTask({
      plan: { steps: [{ tool: 'createReservation' }] },
    })).toBe('reservation_planning');
    expect(classifyTask({
      plan: { steps: [{ tool: 'searchTours', args: { recommend: true } }] },
    })).toBe('tour_recommendation');
    expect(classifyTask({
      plan: { steps: [{ tool: 'calculateTransfer' }] },
    })).toBe('tool_selection');
    expect(classifyTask({ hasRagContext: true })).toBe('rag_answer');
    expect(classifyTask()).toBe('general_chat');
  });
});
