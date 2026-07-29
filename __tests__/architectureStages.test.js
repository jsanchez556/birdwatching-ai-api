import {
  buildRetrievalCacheKey,
  normalizeRagQuery,
} from '../src/services/rag/queryNormalization.js';
import {
  buildGroundingTrace,
  summarizeRetrievedChunk,
} from '../src/services/rag/contextAssembly.js';
import {
  buildBirdMatches,
  mergeRetrievedDocuments,
} from '../src/services/rag/retrievalFiltering.js';
import {
  calibrateCandidateConfidence,
  calibrateIdentificationResult,
} from '../src/services/birdIdentification/calibration.js';
import {
  normalizeBirdIdentification,
  parseBirdProviderJson,
} from '../src/services/birdIdentification/candidateGeneration.js';
import {
  buildBirdKnowledgeQuery,
  normalizeBirdKnowledge,
} from '../src/services/birdIdentification/evidenceRetrieval.js';
import { normalizeBirdVerification } from '../src/services/birdIdentification/reranking.js';
import {
  buildEnrichedSummary,
  buildIdentificationImageAnalysis,
} from '../src/services/birdIdentification/responseAssembly.js';
import {
  compactPlanningArgs,
  extractParticipants,
  extractTransportationDecline,
} from '../src/ai/planners/planningInput.js';
import {
  isRetryableToolError,
  isRetryableToolResult,
  sanitizeToolTraceValue,
} from '../src/ai/tools/toolExecutionPolicy.js';
import {
  createExecutionContext,
  storeIntermediateResult,
} from '../src/ai/tools/toolExecutionState.js';
import { appendToolResponseMetadata } from '../src/ai/tools/toolResponseMetadata.js';
import { validateToolArguments } from '../src/ai/tools/toolArgumentValidation.js';

describe('extracted architecture stages', () => {
  test('RAG normalization produces stable cache input without changing retrieval options', () => {
    expect(normalizeRagQuery('  Río-Celeste_Birds! ')).toBe('rio celeste birds');
    expect(buildRetrievalCacheKey('Río Celeste birds', { topK: 4 }))
      .toBe(buildRetrievalCacheKey(' rio-celeste BIRDS ', { topK: 4 }));
  });

  test('RAG filtering deduplicates documents and favors identity matches', () => {
    const locationOnly = {
      documentId: 1,
      documentType: 'bird_profile',
      name: 'Generic bird',
      locations: 'Monteverde',
      metadata: { commonName: 'Generic bird' },
      score: 0.99,
    };
    const quetzal = {
      documentId: 2,
      documentType: 'bird_profile',
      name: 'Resplendent Quetzal',
      metadata: { commonName: 'Resplendent Quetzal', speciesCode: 'resque' },
      score: 0.6,
    };

    expect(mergeRetrievedDocuments([quetzal], [quetzal, locationOnly])).toEqual([quetzal, locationOnly]);
    expect(buildBirdMatches([locationOnly, quetzal], 'quetzal in Monteverde')).toEqual([
      expect.objectContaining({ commonName: 'Resplendent Quetzal', speciesCode: 'resque' }),
    ]);
  });

  test('RAG context assembly exposes compact trace contracts', () => {
    const document = { documentId: 4, chunkId: 7, text: 'grounded context', score: 0.8 };
    expect(summarizeRetrievedChunk(document)).toEqual(expect.objectContaining({
      documentId: 4,
      chunkId: 7,
      textLength: 16,
      similarityScore: 0.8,
    }));
    expect(buildGroundingTrace({
      documents: [document],
      sources: [{ name: 'Bird profile' }],
      promptMessages: [{ role: 'system', content: 'base' }],
      originalMessageCount: 1,
    })).toEqual(expect.objectContaining({
      retrievedChunkCount: 1,
      sourceCount: 1,
      groundedMessageCount: 1,
    }));
  });

  test('bird candidate generation validates provider JSON and visible evidence', () => {
    const parsed = parseBirdProviderJson({
      choices: [{ message: { content: JSON.stringify({
        status: 'identified',
        candidates: [{
          species: 'Resplendent Quetzal',
          confidence: 0.8,
          reasoning: 'Visible long tail',
          visualEvidence: ['long tail'],
        }],
      }) } }],
    });
    expect(normalizeBirdIdentification(parsed)).toEqual(expect.objectContaining({
      status: 'identified',
      candidates: [expect.objectContaining({ commonName: 'Resplendent Quetzal' })],
    }));
  });

  test('bird calibration enforces uncertainty invariants', () => {
    expect(calibrateCandidateConfidence(0.9, { confidence: 0.3 })).toBe(0.39);
    expect(calibrateIdentificationResult([{ commonName: 'Bird', confidence: 0.5 }], 'identified'))
      .toEqual(expect.objectContaining({ status: 'uncertain' }));
  });

  test('bird reranking preserves generated visual evidence when verification omits it', () => {
    expect(normalizeBirdVerification({
      status: 'identified',
      candidates: [{
        commonName: 'Resplendent Quetzal',
        confidence: 0.8,
        reasoning: 'Profile evidence supports the candidate',
        ragSupport: ['Cloud forest profile'],
      }],
    }, {
      imageAnalysis: { confidence: 0.8 },
      fallbackCandidates: [{
        commonName: 'Resplendent Quetzal',
        confidence: 0.8,
        reasoning: 'Visible long tail',
        visualEvidence: ['long tail'],
      }],
    }).candidates[0]).toEqual(expect.objectContaining({
      visualEvidence: ['long tail'],
      ragSupport: ['Cloud forest profile'],
    }));
  });

  test('bird evidence contracts build bounded queries and deduplicated knowledge', () => {
    expect(buildBirdKnowledgeQuery({
      imageAnalysis: { fieldMarks: ['red throat'] },
      candidates: [{ commonName: 'Ruby-throated Hummingbird' }],
    })).toContain('visible traits: field marks: red throat');
    expect(normalizeBirdKnowledge({
      sources: [{ name: 'Quetzal', similarityScore: 0.7 }],
      birdMatches: [{ commonName: 'Quetzal', description: 'Cloud forest bird' }],
    })).toEqual([expect.objectContaining({
      commonName: 'Quetzal',
      description: 'Cloud forest bird',
      similarityScore: 0.7,
    })]);
  });

  test('bird response assembly preserves ambiguity notes and conservative summaries', () => {
    expect(buildIdentificationImageAnalysis({ bill: { color: 'orange' } }))
      .toEqual(expect.objectContaining({ beakColorInterpretation: expect.stringContaining('ambiguity') }));
    expect(buildEnrichedSummary({
      status: 'unknown',
      imageAnalysis: {},
      candidates: [],
    })).toContain('not strong enough');
  });

  test('planning input parsing keeps normalized, explicit arguments', () => {
    expect(extractParticipants('Reserve for 4 people')).toBe(4);
    expect(extractTransportationDecline('I have my own transportation')).toBe(true);
    expect(compactPlanningArgs({ tourId: 2, location: '', participants: undefined }))
      .toEqual({ tourId: 2 });
  });

  test('tool execution policy separates retry classification from safe tracing', () => {
    expect(validateToolArguments(['not', 'an', 'object'])).toEqual(expect.objectContaining({
      valid: false,
      code: 'INVALID_TOOL_ARGUMENTS',
    }));
    expect(isRetryableToolResult({ success: false, code: 'SERVICE_UNAVAILABLE' })).toBe(true);
    expect(isRetryableToolResult({ success: false, code: 'VALIDATION_ERROR' })).toBe(false);
    expect(isRetryableToolError({ status: 503 })).toBe(true);
    expect(sanitizeToolTraceValue({ customerEmail: 'private@example.com', count: 2 }))
      .toEqual({ customerEmail: '[redacted]', count: 2 });
  });

  test('tool state transition and response metadata stages keep their output contracts', () => {
    const metadata = {};
    const context = createExecutionContext({
      status: 'ready',
      steps: [{ id: 'availability', tool: 'checkAvailability' }],
    }, metadata);
    const result = { success: true, tourId: 4, availableSlots: 3 };
    storeIntermediateResult(context, { id: 'availability', tool: 'checkAvailability' }, result, 0);
    appendToolResponseMetadata(metadata, 'checkAvailability', result, {});

    expect(context.results.availability).toBe(result);
    expect(context.debugTrace.intermediateState.availability).toEqual(expect.objectContaining({
      selectedTourId: 4,
      availableSlots: 3,
    }));
    expect(metadata).toEqual(expect.objectContaining({
      selectedTourId: 4,
      toolsCalled: ['checkAvailability'],
    }));
  });
});
