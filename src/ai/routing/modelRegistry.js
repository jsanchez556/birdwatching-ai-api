import env from '../../config/env.js';
import HttpError from '../../utils/httpError.js';

const MODEL_KEYS = Object.freeze({
  ECONOMY_FAST: 'economy_fast',
  BALANCED_GENERAL: 'balanced_general',
  ADVANCED_REASONING: 'advanced_reasoning',
  STRUCTURED_RELIABLE: 'structured_reliable',
  VISION_MULTIMODAL: 'vision_multimodal',
  EVALUATION_JUDGE: 'evaluation_judge',
  EMBEDDING_GENERAL: 'embedding_general',
  AUDIO_TRANSCRIPTION: 'audio_transcription',
  AUDIO_SPEECH: 'audio_speech',
});

const DEFAULT_MODEL_IDS = Object.freeze({
  economy: 'gpt-4o-mini',
  balanced: 'gpt-4o',
  embedding: 'text-embedding-3-small',
  transcription: 'gpt-4o-mini-transcribe',
  speech: 'gpt-4o-mini-tts',
});

const VALID_TIERS = new Set(['economy', 'balanced', 'advanced', 'specialized']);
const VALID_SERVICES = new Set(['generation', 'embedding', 'transcription', 'speech']);
const VALID_LATENCY_CLASSES = new Set(['low', 'medium', 'high']);
const VALID_COST_CLASSES = new Set(['low', 'medium', 'high']);
const VALID_MODALITIES = new Set(['text', 'image', 'audio', 'embedding']);
const VALID_REASONING_EFFORTS = new Set(['none', 'low', 'medium', 'high']);
const VALID_RELIABILITY_CLASSES = new Set(['not_applicable', 'medium', 'high']);
const VALID_EVALUATION_SUITABILITY = new Set(['none', 'medium', 'high']);

function modelConfigurationError(message, details) {
  return new HttpError(500, message, {
    code: 'MODEL_REGISTRY_MISCONFIGURED',
    details,
  });
}

function resolveModelIds(configuration = {}) {
  const balanced = configuration.balanced || DEFAULT_MODEL_IDS.balanced;
  const advanced = configuration.advanced || balanced;

  return {
    economy: configuration.economy || DEFAULT_MODEL_IDS.economy,
    balanced,
    advanced,
    structured: configuration.structured || balanced,
    vision: configuration.vision || balanced,
    evaluation: configuration.evaluation || advanced,
    embedding: configuration.embedding || DEFAULT_MODEL_IDS.embedding,
    transcription: configuration.transcription || DEFAULT_MODEL_IDS.transcription,
    speech: configuration.speech || DEFAULT_MODEL_IDS.speech,
  };
}

function generationEntry({
  key,
  modelId,
  tier,
  modalities = ['text'],
  reasoningEfforts,
  structuredOutput = true,
  toolCalling = true,
  latencyClass,
  costClass,
  structuralReliability,
  evaluationSuitability,
  strengths = [],
}) {
  return {
    key,
    modelId,
    service: 'generation',
    tier,
    capabilities: {
      modalities,
      reasoningEfforts,
      structuredOutput,
      toolCalling,
      structuralReliability,
      evaluationAllowed: evaluationSuitability !== 'none',
      evaluationSuitability,
      strengths,
    },
    latencyClass,
    costClass,
    maxInputTokens: 128000,
  };
}

function validateRegistryEntry(entry, registryKey) {
  if (!entry || typeof entry !== 'object') {
    throw modelConfigurationError('Model registry contains an invalid entry.', {
      modelKey: registryKey,
    });
  }
  if (entry.key !== registryKey || typeof entry.modelId !== 'string' || !entry.modelId.trim()) {
    throw modelConfigurationError('Model registry entry is missing a valid key or model ID.', {
      modelKey: registryKey,
    });
  }
  if (!VALID_TIERS.has(entry.tier)) {
    throw modelConfigurationError('Model registry entry has an invalid service tier.', {
      modelKey: registryKey,
    });
  }
  if (!VALID_SERVICES.has(entry.service)) {
    throw modelConfigurationError('Model registry entry has an invalid service.', {
      modelKey: registryKey,
    });
  }
  if (!VALID_LATENCY_CLASSES.has(entry.latencyClass) || !VALID_COST_CLASSES.has(entry.costClass)) {
    throw modelConfigurationError('Model registry entry has an invalid latency or cost class.', {
      modelKey: registryKey,
    });
  }
  if (!Array.isArray(entry.capabilities?.modalities)
    || entry.capabilities.modalities.some((value) => !VALID_MODALITIES.has(value))) {
    throw modelConfigurationError('Model registry entry has invalid modalities.', {
      modelKey: registryKey,
    });
  }
  if (!Array.isArray(entry.capabilities?.reasoningEfforts)
    || entry.capabilities.reasoningEfforts.some((value) => !VALID_REASONING_EFFORTS.has(value))) {
    throw modelConfigurationError('Model registry entry has invalid reasoning capabilities.', {
      modelKey: registryKey,
    });
  }
  if (!VALID_RELIABILITY_CLASSES.has(entry.capabilities?.structuralReliability)
    || !VALID_EVALUATION_SUITABILITY.has(entry.capabilities?.evaluationSuitability)
    || typeof entry.capabilities?.structuredOutput !== 'boolean'
    || typeof entry.capabilities?.toolCalling !== 'boolean'
    || typeof entry.capabilities?.evaluationAllowed !== 'boolean') {
    throw modelConfigurationError('Model registry entry has invalid capability metadata.', {
      modelKey: registryKey,
    });
  }
  if (!Array.isArray(entry.capabilities?.strengths)
    || entry.capabilities.strengths.some((value) => typeof value !== 'string' || !value)) {
    throw modelConfigurationError('Model registry entry has invalid capability strengths.', {
      modelKey: registryKey,
    });
  }
  if (entry.maxInputTokens !== undefined
    && (!Number.isSafeInteger(entry.maxInputTokens) || entry.maxInputTokens <= 0)) {
    throw modelConfigurationError('Model registry entry has an invalid input-token limit.', {
      modelKey: registryKey,
    });
  }
}

function createModelRegistry(configuration = env.aiModelIds) {
  const ids = resolveModelIds(configuration);
  const entries = {
    [MODEL_KEYS.ECONOMY_FAST]: generationEntry({
      key: MODEL_KEYS.ECONOMY_FAST,
      modelId: ids.economy,
      tier: 'economy',
      modalities: ['text', 'image'],
      reasoningEfforts: ['none', 'low', 'medium', 'high'],
      latencyClass: 'low',
      costClass: 'low',
      structuralReliability: 'high',
      evaluationSuitability: 'medium',
      strengths: ['economy', 'classification'],
    }),
    [MODEL_KEYS.BALANCED_GENERAL]: generationEntry({
      key: MODEL_KEYS.BALANCED_GENERAL,
      modelId: ids.balanced,
      tier: 'balanced',
      modalities: ['text', 'image'],
      reasoningEfforts: ['none', 'low', 'medium'],
      latencyClass: 'medium',
      costClass: 'medium',
      structuralReliability: 'high',
      evaluationSuitability: 'high',
      strengths: ['general', 'grounded'],
    }),
    [MODEL_KEYS.ADVANCED_REASONING]: generationEntry({
      key: MODEL_KEYS.ADVANCED_REASONING,
      modelId: ids.advanced,
      tier: 'advanced',
      modalities: ['text', 'image'],
      reasoningEfforts: ['none', 'low', 'medium', 'high'],
      latencyClass: 'high',
      costClass: 'high',
      structuralReliability: 'high',
      evaluationSuitability: 'high',
      strengths: ['reasoning'],
    }),
    [MODEL_KEYS.STRUCTURED_RELIABLE]: generationEntry({
      key: MODEL_KEYS.STRUCTURED_RELIABLE,
      modelId: ids.structured,
      tier: 'balanced',
      modalities: ['text'],
      reasoningEfforts: ['none', 'low', 'medium'],
      latencyClass: 'medium',
      costClass: 'medium',
      structuralReliability: 'high',
      evaluationSuitability: 'medium',
      strengths: ['structured', 'tools'],
    }),
    [MODEL_KEYS.VISION_MULTIMODAL]: generationEntry({
      key: MODEL_KEYS.VISION_MULTIMODAL,
      modelId: ids.vision,
      tier: 'advanced',
      modalities: ['text', 'image'],
      reasoningEfforts: ['none', 'low', 'medium', 'high'],
      latencyClass: 'high',
      costClass: 'high',
      structuralReliability: 'high',
      evaluationSuitability: 'medium',
      strengths: ['vision'],
    }),
    [MODEL_KEYS.EVALUATION_JUDGE]: generationEntry({
      key: MODEL_KEYS.EVALUATION_JUDGE,
      modelId: ids.evaluation,
      tier: 'advanced',
      modalities: ['text', 'image'],
      reasoningEfforts: ['none', 'low', 'medium', 'high'],
      latencyClass: 'high',
      costClass: 'high',
      structuralReliability: 'high',
      evaluationSuitability: 'high',
      strengths: ['evaluation'],
    }),
    [MODEL_KEYS.EMBEDDING_GENERAL]: {
      key: MODEL_KEYS.EMBEDDING_GENERAL,
      modelId: ids.embedding,
      service: 'embedding',
      tier: 'specialized',
      capabilities: {
        modalities: ['embedding'],
        reasoningEfforts: [],
        structuredOutput: false,
        toolCalling: false,
        structuralReliability: 'not_applicable',
        evaluationAllowed: false,
        evaluationSuitability: 'none',
        strengths: [],
      },
      latencyClass: 'low',
      costClass: 'low',
      maxInputTokens: 8191,
    },
    [MODEL_KEYS.AUDIO_TRANSCRIPTION]: {
      key: MODEL_KEYS.AUDIO_TRANSCRIPTION,
      modelId: ids.transcription,
      service: 'transcription',
      tier: 'specialized',
      capabilities: {
        modalities: ['audio'],
        reasoningEfforts: [],
        structuredOutput: false,
        toolCalling: false,
        structuralReliability: 'not_applicable',
        evaluationAllowed: false,
        evaluationSuitability: 'none',
        strengths: [],
      },
      latencyClass: 'low',
      costClass: 'low',
    },
    [MODEL_KEYS.AUDIO_SPEECH]: {
      key: MODEL_KEYS.AUDIO_SPEECH,
      modelId: ids.speech,
      service: 'speech',
      tier: 'specialized',
      capabilities: {
        modalities: ['audio'],
        reasoningEfforts: [],
        structuredOutput: false,
        toolCalling: false,
        structuralReliability: 'not_applicable',
        evaluationAllowed: false,
        evaluationSuitability: 'none',
        strengths: [],
      },
      latencyClass: 'low',
      costClass: 'low',
    },
  };

  for (const [key, entry] of Object.entries(entries)) {
    validateRegistryEntry(entry, key);
    Object.freeze(entry.capabilities.modalities);
    Object.freeze(entry.capabilities.reasoningEfforts);
    Object.freeze(entry.capabilities.strengths);
    Object.freeze(entry.capabilities);
    Object.freeze(entry);
  }

  return Object.freeze(entries);
}

function getModel(registry, key) {
  const entry = registry?.[key];
  validateRegistryEntry(entry, key);
  return entry;
}

const MODEL_REGISTRY = createModelRegistry();

export {
  DEFAULT_MODEL_IDS,
  MODEL_KEYS,
  MODEL_REGISTRY,
  createModelRegistry,
  getModel,
  validateRegistryEntry,
};
