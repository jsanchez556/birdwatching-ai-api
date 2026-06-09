const candidateProperties = {
  commonName: { type: 'string' },
  scientificName: { type: 'string' },
  confidence: { type: 'number', minimum: 0, maximum: 1 },
  reasoning: { type: 'string' },
  visualEvidence: {
    type: 'array',
    minItems: 0,
    maxItems: 8,
    items: { type: 'string' },
  },
  possibleConfusions: {
    type: 'array',
    minItems: 0,
    maxItems: 6,
    items: { type: 'string' },
  },
  missingEvidence: {
    type: 'array',
    minItems: 0,
    maxItems: 8,
    items: { type: 'string' },
  },
};

const verifiedCandidateProperties = {
  commonName: { type: 'string' },
  scientificName: { type: 'string' },
  confidence: { type: 'number', minimum: 0, maximum: 1 },
  reasoning: { type: 'string' },
  visualEvidence: {
    type: 'array',
    minItems: 0,
    maxItems: 8,
    items: { type: 'string' },
  },
  ragSupport: {
    type: 'array',
    minItems: 0,
    maxItems: 8,
    items: { type: 'string' },
  },
  contradictions: {
    type: 'array',
    minItems: 0,
    maxItems: 8,
    items: { type: 'string' },
  },
  missingEvidence: {
    type: 'array',
    minItems: 0,
    maxItems: 8,
    items: { type: 'string' },
  },
};

export const BIRD_CANDIDATE_GENERATION_RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['status', 'candidates', 'notes'],
  properties: {
    status: { type: 'string', enum: ['identified', 'uncertain', 'unknown'] },
    candidates: {
      type: 'array',
      minItems: 0,
      maxItems: 5,
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'commonName',
          'scientificName',
          'confidence',
          'reasoning',
          'visualEvidence',
          'possibleConfusions',
          'missingEvidence',
        ],
        properties: candidateProperties,
      },
    },
    notes: {
      type: 'array',
      minItems: 0,
      maxItems: 6,
      items: { type: 'string' },
    },
  },
};

export const BIRD_IDENTIFICATION_RESPONSE_SCHEMA = BIRD_CANDIDATE_GENERATION_RESPONSE_SCHEMA;

export const BIRD_IDENTIFICATION_VERIFICATION_RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['status', 'bestMatch', 'candidates', 'notes'],
  properties: {
    status: { type: 'string', enum: ['identified', 'uncertain', 'unknown'] },
    bestMatch: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          additionalProperties: false,
          required: [
            'commonName',
            'scientificName',
            'confidence',
            'reasoning',
            'visualEvidence',
            'ragSupport',
            'contradictions',
            'missingEvidence',
          ],
          properties: verifiedCandidateProperties,
        },
      ],
    },
    candidates: {
      type: 'array',
      minItems: 0,
      maxItems: 5,
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'commonName',
          'scientificName',
          'confidence',
          'reasoning',
          'visualEvidence',
          'ragSupport',
          'contradictions',
          'missingEvidence',
        ],
        properties: verifiedCandidateProperties,
      },
    },
    notes: {
      type: 'array',
      minItems: 0,
      maxItems: 8,
      items: { type: 'string' },
    },
  },
};
