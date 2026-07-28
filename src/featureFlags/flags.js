const FEATURE_FLAGS = Object.freeze({
  VOICE_AI: 'voice_ai',
  ADVANCED_RAG: 'advanced_rag',
  MULTIMODAL_BIRD_IDENTIFICATION: 'multimodal_bird_identification',
  AGENT_BOOKING: 'agent_booking',
});

const RETRIEVAL_VARIANTS = Object.freeze({
  CURRENT: 'current_retrieval',
  NEW: 'new_retrieval',
});

const FEATURE_FLAG_DEFAULTS = Object.freeze({
  [FEATURE_FLAGS.VOICE_AI]: true,
  [FEATURE_FLAGS.ADVANCED_RAG]: RETRIEVAL_VARIANTS.CURRENT,
  [FEATURE_FLAGS.MULTIMODAL_BIRD_IDENTIFICATION]: true,
  [FEATURE_FLAGS.AGENT_BOOKING]: true,
});

export {
  FEATURE_FLAGS,
  FEATURE_FLAG_DEFAULTS,
  RETRIEVAL_VARIANTS,
};
