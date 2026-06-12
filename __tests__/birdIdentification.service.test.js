import { jest } from '@jest/globals';

const mockIdentify = jest.fn();
const mockVerifyAndRerank = jest.fn();
const mockAnalyze = jest.fn();
const mockBuildContext = jest.fn();
const mockCreateHistory = jest.fn();
const mockUploadIdentificationImage = jest.fn();
const mockLoggerInfo = jest.fn();
const mockTraceBirdIdentificationPipeline = jest.fn();
const mockTraceImageInput = jest.fn();
const mockTraceBirdIdentificationRagRetrieval = jest.fn();
const mockTraceBirdIdentificationFinalResponse = jest.fn();

await jest.unstable_mockModule('../src/ai/agents/birdIdentification.agent.js', () => ({
  BIRD_IDENTIFICATION_PROMPT_VERSION: '2.0.0',
  BIRD_IDENTIFICATION_VERIFICATION_PROMPT_VERSION: '1.0.0',
  default: {
    identify: mockIdentify,
    verifyAndRerank: mockVerifyAndRerank,
  },
}));

await jest.unstable_mockModule('../src/services/birdImageAnalysis.service.js', () => ({
  default: {
    analyze: mockAnalyze,
  },
}));

await jest.unstable_mockModule('../src/services/birdIdentificationImageStorage.service.js', () => ({
  default: {
    uploadIdentificationImage: mockUploadIdentificationImage,
  },
}));

await jest.unstable_mockModule('../src/services/rag.service.js', () => ({
  default: {
    buildContext: mockBuildContext,
  },
}));

await jest.unstable_mockModule('../src/db/queries/birdIdentification.queries.js', () => ({
  default: {
    createHistory: mockCreateHistory,
  },
}));

await jest.unstable_mockModule('../src/utils/logger.js', () => ({
  default: {
    info: mockLoggerInfo,
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

await jest.unstable_mockModule('../src/tracing/aiTracing.middleware.js', () => ({
  traceBirdIdentificationFinalResponse: mockTraceBirdIdentificationFinalResponse,
  traceBirdIdentificationPipeline: mockTraceBirdIdentificationPipeline,
  traceBirdIdentificationRagRetrieval: mockTraceBirdIdentificationRagRetrieval,
  traceImageInput: mockTraceImageInput,
}));

const {
  default: birdIdentificationService,
  buildBirdKnowledgeQuery,
  buildIdentificationImageAnalysis,
  normalizeEnrichedCandidates,
  normalizeBirdKnowledge,
  normalizeBirdIdentification,
  normalizeBirdVerification,
  normalizeConfidence,
  normalizePrediction,
  normalizeRagTrace,
  normalizeUserId,
  recordBirdIdentificationHistory,
} = await import('../src/services/birdIdentification.service.js');

describe('birdIdentificationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTraceBirdIdentificationPipeline.mockImplementation(async (name, metadata, operation) => operation({
      id: 'bird-identification-parent-trace',
    }));
    mockTraceImageInput.mockImplementation(async (name, metadata, operation) => operation());
    mockTraceBirdIdentificationRagRetrieval.mockImplementation(async (name, metadata, operation) => operation());
    mockTraceBirdIdentificationFinalResponse.mockImplementation(async (name, metadata, operation) => operation());
    mockUploadIdentificationImage.mockResolvedValue({
      key: 'bird-identification/uploaded.jpg',
      imageUrl: 'https://cdn.example.test/bird-identification/uploaded.jpg',
    });
    mockCreateHistory.mockResolvedValue({
      id: 1,
      user_id: 7,
      image_url: 'https://example.test/bird.jpg',
      prediction: 'Resplendent Quetzal',
      confidence: '0.9100',
      created_at: new Date(),
    });
    mockBuildContext.mockResolvedValue({
      sources: [],
      birdMatches: [],
      ragTrace: {
        retrievedChunkCount: 0,
        sourceCount: 0,
        originalMessageCount: 2,
        groundedMessageCount: 2,
        contextMessageLength: 0,
      },
    });
  });

  it('returns normalized top bird candidates from the identification agent', async () => {
    mockIdentify.mockResolvedValue({
      id: 'identify-1',
      model: 'gpt-4o',
      choices: [
        {
          message: {
            content: JSON.stringify({
              candidates: [
                {
                  species: ' Resplendent Quetzal ',
                  confidence: 0.91,
                  reasoning: ' Green and red plumage fits a male quetzal. ',
                  visualEvidence: [' green plumage ', 'red belly', 'medium size'],
                },
                {
                  species: 'Green Honeycreeper',
                  confidence: 0.42,
                  reasoning: 'Green body color could fit, but red is less typical.',
                  visualEvidence: ['green plumage', 'yellow beak'],
                },
              ],
            }),
          },
        },
      ],
    });

    const result = await birdIdentificationService.identify({
      imageAnalysis: {
        colors: ['green', 'red'],
        beak: 'yellow',
        size: 'medium',
        tail: 'long',
        wingPattern: 'plain',
        headPattern: 'plain',
        bellyColor: 'red',
        habitatHint: 'forest',
        confidence: 0.82,
      },
    });

    expect(mockIdentify).toHaveBeenCalledWith(expect.objectContaining({
      imageAnalysis: expect.objectContaining({
        colors: ['green', 'red'],
        beak: 'yellow',
        size: 'medium',
        tail: 'long',
        wingPattern: 'plain',
        headPattern: 'plain',
        bellyColor: 'red',
        habitatHint: 'forest',
        confidence: 0.82,
      }),
    }));
    expect(result).toMatchObject({
      status: 'identified',
      candidates: [
        {
          species: 'Resplendent Quetzal',
          commonName: 'Resplendent Quetzal',
          confidence: 0.91,
          reasoning: 'Green and red plumage fits a male quetzal.',
          visualEvidence: ['green plumage', 'red belly', 'medium size'],
        },
        {
          species: 'Green Honeycreeper',
          commonName: 'Green Honeycreeper',
          confidence: 0.42,
          reasoning: 'Green body color could fit, but red is less typical.',
          visualEvidence: ['green plumage', 'yellow beak'],
        },
      ],
      promptVersion: '2.0.0',
      model: 'gpt-4o',
      providerRequestId: 'identify-1',
    });
  });

  it('rejects invalid JSON returned by the bird identification provider', async () => {
    mockIdentify.mockResolvedValue({
      id: 'identify-1',
      model: 'gpt-4o',
      choices: [
        {
          message: {
            content: '{not-json',
          },
        },
      ],
    });

    await expect(birdIdentificationService.identify({
      imageAnalysis: {
        colors: ['green'],
        beak: 'yellow',
        size: 'medium',
        tail: 'long',
        wingPattern: 'plain',
        headPattern: 'plain',
        bellyColor: 'red',
        habitatHint: 'forest',
        confidence: 0.82,
      },
    })).rejects.toMatchObject({
      status: 502,
      code: 'provider_malformed_response',
    });
  });

  it('runs image analysis and enriches confident bird identification with RAG knowledge', async () => {
    mockAnalyze.mockResolvedValue({
      colors: ['green', 'red'],
      beak: 'yellow',
      size: 'medium',
      tail: 'long',
      wingPattern: 'plain',
      headPattern: 'plain',
      bellyColor: 'red',
      habitatHint: 'forest',
      confidence: 0.82,
      promptVersion: '1.3.0',
      model: 'gpt-4o',
      providerRequestId: 'vision-1',
    });
    mockIdentify.mockResolvedValue({
      id: 'identify-1',
      model: 'gpt-4o',
      choices: [
        {
          message: {
            content: JSON.stringify({
              candidates: [
                {
                  species: 'Resplendent Quetzal',
                  confidence: 0.91,
                  reasoning: 'Green and red plumage fits a male quetzal.',
                  visualEvidence: ['green plumage', 'red belly', 'long tail'],
                },
              ],
            }),
          },
        },
      ],
    });
    mockBuildContext.mockResolvedValue({
      sources: [
        {
          name: 'Resplendent Quetzal',
          location: 'Monteverde',
          similarityScore: 0.94,
          scientificName: 'Pharomachrus mocinno',
          documentType: 'bird_profile',
        },
      ],
      birdMatches: [
        {
          commonName: 'Resplendent Quetzal',
          scientificName: 'Pharomachrus mocinno',
          family: 'Trogons',
          description: 'Cloud forest bird with green plumage and red belly.',
          locations: 'Monteverde',
        },
      ],
      ragTrace: {
        retrievedChunkCount: 1,
        sourceCount: 1,
        originalMessageCount: 2,
        groundedMessageCount: 3,
        contextMessageLength: 512,
        retrievedChunks: [
          {
            name: 'Internal chunk detail',
          },
        ],
        sources: [
          {
            name: 'Internal source detail',
          },
        ],
      },
    });

    const result = await birdIdentificationService.identifyFromImage({
      imageUrl: 'https://example.test/bird.jpg',
      userId: '7',
      metadata: {
        parentTraceId: 'trace-1',
      },
    });

    expect(mockAnalyze).toHaveBeenCalledWith({
      imageUrl: 'https://example.test/bird.jpg',
      metadata: {
        parentTraceId: 'bird-identification-parent-trace',
      },
    });
    expect(mockTraceBirdIdentificationPipeline).toHaveBeenCalledWith(
      'bird_identification_multimodal_pipeline',
      expect.objectContaining({
        parentTraceId: 'trace-1',
        hasImageUrl: true,
        userIdPresent: true,
      }),
      expect.any(Function)
    );
    expect(mockTraceImageInput).toHaveBeenCalledWith(
      'bird_identification_image_input',
      expect.objectContaining({
        parentTraceId: 'bird-identification-parent-trace',
        hasImageUrl: true,
        userIdPresent: true,
      }),
      expect.any(Function)
    );
    expect(mockTraceBirdIdentificationRagRetrieval).toHaveBeenCalledWith(
      'bird_identification_rag_retrieval',
      expect.objectContaining({
        parentTraceId: 'bird-identification-parent-trace',
        candidateCount: 1,
        topK: 5,
        filters: {
          documentType: 'bird_profile',
        },
      }),
      expect.any(Function)
    );
    expect(mockTraceBirdIdentificationFinalResponse).toHaveBeenCalledWith(
      'bird_identification_final_response',
      expect.objectContaining({
        parentTraceId: 'bird-identification-parent-trace',
        candidateCount: 1,
        topCandidate: 'Resplendent Quetzal',
        topConfidence: 0.91,
        retrievedChunkCount: 1,
        sourceCount: 1,
      }),
      expect.any(Function)
    );
    expect(mockIdentify).toHaveBeenCalledWith(expect.objectContaining({
      imageAnalysis: expect.objectContaining({
        colors: ['green', 'red'],
        beak: 'yellow',
        size: 'medium',
        tail: 'long',
        wingPattern: 'plain',
        headPattern: 'plain',
        bellyColor: 'red',
        habitatHint: 'forest',
        confidence: 0.82,
      }),
    }));
    expect(mockBuildContext).toHaveBeenCalledWith([
      {
        role: 'system',
        content: 'Bird image identification enrichment.',
      },
      {
        role: 'user',
        content: expect.stringContaining('likely birds: Resplendent Quetzal'),
      },
    ], expect.stringContaining('visible traits: colors: green, red; beak: yellow'), {
      parentTraceId: 'bird-identification-parent-trace',
      topK: 5,
      filters: {
        documentType: 'bird_profile',
      },
    });
    expect(mockBuildContext.mock.calls[0][1]).toContain('bill shape: unknown');
    expect(mockBuildContext.mock.calls[0][1]).toContain('underparts: red');
    expect(mockCreateHistory).toHaveBeenCalledWith({
      userId: 7,
      imageUrl: 'https://example.test/bird.jpg',
      prediction: 'Resplendent Quetzal',
      confidence: 0.91,
    });
    expect(result).toMatchObject({
      status: 'identified',
      bestMatch: expect.objectContaining({
        commonName: 'Resplendent Quetzal',
        confidence: 0.91,
      }),
      summary: expect.stringContaining('The image evidence points most strongly to Resplendent Quetzal.'),
      imageAnalysis: expect.objectContaining({
        dominantColors: ['green', 'red'],
        beak: 'yellow',
        underparts: 'red',
        confidence: 0.82,
      }),
      imageObservations: expect.objectContaining({
        colors: ['green', 'red'],
        beak: 'yellow',
        underparts: 'red',
        confidence: 0.82,
      }),
      candidates: [
        expect.objectContaining({
          species: 'Resplendent Quetzal',
          commonName: 'Resplendent Quetzal',
          confidence: 0.91,
          reasoning: 'Green and red plumage fits a male quetzal.',
          visualEvidence: ['green plumage', 'red belly', 'long tail'],
          scientificName: 'Pharomachrus mocinno',
          location: 'Monteverde',
          similarityScore: 0.94,
          documentType: 'bird_profile',
          family: 'Trogons',
          description: 'Cloud forest bird with green plumage and red belly.',
        }),
      ],
      promptVersions: {
        birdImageAnalysis: '1.3.0',
        birdIdentification: '2.0.0',
        birdVerification: '1.0.0',
      },
      model: 'gpt-4o',
      providerRequestId: 'identify-1',
      ragTrace: {
        retrievedChunkCount: 1,
        sourceCount: 1,
        originalMessageCount: 2,
        groundedMessageCount: 3,
        contextMessageLength: 512,
      },
    });
  });

  it('uploads image input before running the existing identification pipeline', async () => {
    mockAnalyze.mockResolvedValue({
      colors: ['yellow', 'brown'],
      beak: 'black',
      size: 'medium',
      tail: 'medium',
      wingPattern: 'plain',
      headPattern: 'striped',
      bellyColor: 'yellow',
      habitatHint: 'garden',
      confidence: 0.77,
      promptVersion: '1.3.0',
      model: 'gpt-4o',
      providerRequestId: 'vision-upload',
    });
    mockIdentify.mockResolvedValue({
      id: 'identify-upload',
      model: 'gpt-4o',
      choices: [
        {
          message: {
            content: JSON.stringify({
              candidates: [
                {
                  species: 'Great Kiskadee',
                  confidence: 0.8,
                  reasoning: 'Yellow belly and bold head pattern fit.',
                  visualEvidence: ['yellow belly', 'bold head pattern'],
                },
              ],
            }),
          },
        },
      ],
    });

    const imageUpload = {
      buffer: Buffer.from([1, 2, 3]),
      mimeType: 'image/jpeg',
      filename: 'kiskadee.jpg',
    };

    const result = await birdIdentificationService.identifyFromInput({
      imageUpload,
      userId: 7,
      metadata: {
        parentTraceId: 'incoming-trace',
      },
    });

    expect(mockUploadIdentificationImage).toHaveBeenCalledWith({
      imageUpload,
      userId: 7,
    });
    expect(mockAnalyze).toHaveBeenCalledWith({
      imageUrl: 'https://cdn.example.test/bird-identification/uploaded.jpg',
      metadata: expect.objectContaining({
        parentTraceId: 'bird-identification-parent-trace',
        imageUploadKey: 'bird-identification/uploaded.jpg',
        imageUploadMimeType: 'image/jpeg',
        imageUploadBytes: 3,
      }),
    });
    expect(mockCreateHistory).toHaveBeenCalledWith(expect.objectContaining({
      imageUrl: 'https://cdn.example.test/bird-identification/uploaded.jpg',
      prediction: 'Great Kiskadee',
    }));
    expect(result.candidates[0]).toMatchObject({
      species: 'Great Kiskadee',
      confidence: 0.8,
    });
  });

  it('orchestrates multimodal image analysis, bird identification, RAG enrichment, and history persistence', async () => {
    mockAnalyze.mockResolvedValue({
      colors: ['emerald green', 'red', 'gold'],
      beak: 'orange',
      size: 'medium',
      tail: 'long',
      wingPattern: 'plain',
      headPattern: 'rounded',
      bellyColor: 'red',
      habitatHint: 'cloud forest',
      confidence: 0.79,
      promptVersion: '1.3.0',
      model: 'gpt-4o',
      providerRequestId: 'vision-2',
    });
    mockIdentify.mockResolvedValue({
      id: 'identify-2',
      model: 'gpt-4o',
      choices: [
        {
          message: {
            content: JSON.stringify({
              candidates: [
                {
                  species: 'Resplendent Quetzal',
                  confidence: 0.83,
                  reasoning: 'Green body, red belly, and long tail fit a male quetzal.',
                  visualEvidence: ['emerald green body', 'red belly', 'long tail', 'yellow-orange bill'],
                },
                {
                  species: 'Golden-browed Chlorophonia',
                  confidence: 0.38,
                  reasoning: 'Bright green and yellow tones could fit, but the tail is too long.',
                  visualEvidence: ['green plumage', 'gold head color'],
                },
              ],
            }),
          },
        },
      ],
    });
    mockBuildContext.mockResolvedValue({
      sources: [
        {
          name: 'Resplendent Quetzal',
          location: 'Monteverde and San Gerardo de Dota',
          similarityScore: 0.97,
          scientificName: 'Pharomachrus mocinno',
          documentType: 'bird_profile',
        },
        {
          name: 'Golden-browed Chlorophonia',
          location: 'Highland forests',
          similarityScore: 0.66,
          scientificName: 'Chlorophonia callophrys',
          documentType: 'bird_profile',
        },
      ],
      birdMatches: [
        {
          speciesCode: 'resque1',
          commonName: 'Resplendent Quetzal',
          scientificName: 'Pharomachrus mocinno',
          family: 'Trogons',
          description: 'Cloud forest specialist with emerald upperparts and a red belly.',
          locations: 'Monteverde and San Gerardo de Dota',
          lastObservation: {
            locations: ['Monteverde'],
            obsDt: '2026-05-21 05:30',
          },
          media: {
            photoUrl: '/photos/quetzal_medium.jpg',
            squarePhotoUrl: '/photos/quetzal_square.jpg',
          },
        },
        {
          speciesCode: 'gobchl1',
          commonName: 'Golden-browed Chlorophonia',
          scientificName: 'Chlorophonia callophrys',
          family: 'Finches',
          description: 'Small green and yellow highland bird.',
          locations: 'Highland forests',
        },
      ],
      ragTrace: {
        retrievedChunkCount: 7,
        sourceCount: 2,
        originalMessageCount: 2,
        groundedMessageCount: 3,
        contextMessageLength: 4594,
        retrievedChunks: [{ id: 'internal-chunk' }],
        sources: [{ name: 'internal-source' }],
      },
    });

    const result = await birdIdentificationService.identifyFromImage({
      imageUrl: 'https://example.test/multimodal-quetzal.jpg',
      userId: 7,
      metadata: {
        parentTraceId: 'bird-identification-parent-trace',
      },
    });

    expect(mockAnalyze).toHaveBeenCalledWith({
      imageUrl: 'https://example.test/multimodal-quetzal.jpg',
      metadata: {
        parentTraceId: 'bird-identification-parent-trace',
      },
    });
    expect(mockIdentify).toHaveBeenCalledWith(expect.objectContaining({
      imageAnalysis: expect.objectContaining({
        beak: 'orange',
        beakColorInterpretation: expect.stringContaining('orange/yellow ambiguity'),
      }),
    }));
    expect(mockBuildContext).toHaveBeenCalledWith(
      expect.any(Array),
      expect.stringContaining('likely birds: Resplendent Quetzal, Golden-browed Chlorophonia'),
      {
        parentTraceId: 'bird-identification-parent-trace',
        topK: 5,
        filters: {
          documentType: 'bird_profile',
        },
      }
    );
    expect(mockBuildContext.mock.calls[0][1]).toContain('beak color interpretation: orange/yellow ambiguity');
    expect(result.candidates).toEqual([
      expect.objectContaining({
        species: 'Resplendent Quetzal',
        commonName: 'Resplendent Quetzal',
        confidence: 0.83,
        scientificName: 'Pharomachrus mocinno',
        family: 'Trogons',
        description: 'Cloud forest specialist with emerald upperparts and a red belly.',
        location: 'Monteverde and San Gerardo de Dota',
        similarityScore: 0.97,
        media: {
          photoUrl: '/photos/quetzal_medium.jpg',
          squarePhotoUrl: '/photos/quetzal_square.jpg',
        },
      }),
      expect.objectContaining({
        species: 'Golden-browed Chlorophonia',
        commonName: 'Golden-browed Chlorophonia',
        confidence: 0.38,
        scientificName: 'Chlorophonia callophrys',
        family: 'Finches',
        similarityScore: 0.66,
      }),
    ]);
    expect(result.ragTrace).toEqual({
      retrievedChunkCount: 7,
      sourceCount: 2,
      originalMessageCount: 2,
      groundedMessageCount: 3,
      contextMessageLength: 4594,
    });
    expect(result.ragTrace.retrievedChunks).toBeUndefined();
    expect(result.summary).toContain('Cloud forest specialist');
    expect(mockCreateHistory).toHaveBeenCalledWith({
      userId: 7,
      imageUrl: 'https://example.test/multimodal-quetzal.jpg',
      prediction: 'Resplendent Quetzal',
      confidence: 0.83,
    });
  });

  it('preserves uncertainty and multiple candidates when enriching identification', async () => {
    mockAnalyze.mockResolvedValue({
      colors: ['brown', 'buff'],
      beak: 'short',
      size: 'small',
      tail: 'short',
      wingPattern: 'plain',
      headPattern: 'plain',
      bellyColor: 'buff',
      habitatHint: 'garden',
      confidence: 0.55,
      promptVersion: '1.3.0',
      model: 'gpt-4o',
      providerRequestId: 'vision-1',
    });
    mockIdentify.mockResolvedValue({
      id: 'identify-1',
      model: 'gpt-4o',
      choices: [
        {
          message: {
            content: JSON.stringify({
              candidates: [
                {
                  species: 'Ruddy Ground Dove',
                  confidence: 0.58,
                  reasoning: 'Small brown bird with compact bill.',
                  visualEvidence: ['brown plumage', 'short beak', 'small size'],
                },
                {
                  species: 'Variable Seedeater',
                  confidence: 0.47,
                  reasoning: 'Small seed-eating bird shape could fit.',
                  visualEvidence: ['small size', 'short beak', 'plain wing pattern'],
                },
              ],
            }),
          },
        },
      ],
    });

    const result = await birdIdentificationService.identifyFromImage({
      imageUrl: 'https://example.test/uncertain-bird.jpg',
    });

    expect(result.summary).toContain('The image evidence is uncertain');
    expect(result.candidates).toHaveLength(2);
    expect(mockBuildContext.mock.calls[0][1]).toContain('Ruddy Ground Dove, Variable Seedeater');
    expect(mockCreateHistory).not.toHaveBeenCalled();
  });

  it('returns image identification when RAG has no useful matches', async () => {
    mockAnalyze.mockResolvedValue({
      colors: ['black'],
      beak: 'long',
      size: 'large',
      tail: 'unknown',
      wingPattern: 'unknown',
      headPattern: 'unknown',
      bellyColor: 'black',
      habitatHint: 'wetland',
      confidence: 0.7,
      promptVersion: '1.3.0',
      model: 'gpt-4o',
      providerRequestId: 'vision-1',
    });
    mockIdentify.mockResolvedValue({
      id: 'identify-1',
      model: 'gpt-4o',
      choices: [
        {
          message: {
            content: JSON.stringify({
              candidates: [
                {
                  species: 'Unknown dark wader',
                  confidence: 0.52,
                  reasoning: 'Only silhouette-level traits are visible.',
                  visualEvidence: ['black plumage', 'long beak', 'large size'],
                },
              ],
            }),
          },
        },
      ],
    });

    const result = await birdIdentificationService.identifyFromImage({
      imageUrl: 'https://example.test/no-rag.jpg',
    });

    expect(result.candidates).toEqual([
      expect.objectContaining({
        species: 'Unknown dark wader',
        commonName: 'Unknown dark wader',
        confidence: 0.52,
        reasoning: 'Only silhouette-level traits are visible.',
        visualEvidence: ['black plumage', 'long beak', 'large size'],
      }),
    ]);
    expect(result.summary).toContain('No matching bird profile was retrieved from the knowledge base');
  });

  it('continues with a safe enrichment result when RAG retrieval fails internally', async () => {
    mockAnalyze.mockResolvedValue({
      colors: ['green'],
      beak: 'short',
      size: 'medium',
      tail: 'unknown',
      wingPattern: 'plain',
      headPattern: 'plain',
      bellyColor: 'green',
      habitatHint: 'forest',
      confidence: 0.68,
      promptVersion: '1.3.0',
      model: 'gpt-4o',
      providerRequestId: 'vision-1',
    });
    mockIdentify.mockResolvedValue({
      id: 'identify-1',
      model: 'gpt-4o',
      choices: [
        {
          message: {
            content: JSON.stringify({
              candidates: [
                {
                  species: 'Emerald Toucanet',
                  confidence: 0.62,
                  reasoning: 'Green bird with compact proportions.',
                  visualEvidence: ['green plumage', 'medium size', 'forest habitat hint'],
                },
              ],
            }),
          },
        },
      ],
    });
    mockBuildContext.mockRejectedValue(new Error('PostgreSQL unavailable'));

    const result = await birdIdentificationService.identifyFromImage({
      imageUrl: 'https://example.test/retrieval-failure.jpg',
    });

    expect(result.candidates).toEqual([
      expect.objectContaining({
        species: 'Emerald Toucanet',
        commonName: 'Emerald Toucanet',
        confidence: 0.62,
        reasoning: 'Green bird with compact proportions.',
        visualEvidence: ['green plumage', 'medium size', 'forest habitat hint'],
      }),
    ]);
    expect(result.ragTrace).toEqual({
      retrievedChunkCount: 0,
      sourceCount: 0,
      originalMessageCount: 2,
      groundedMessageCount: 2,
      contextMessageLength: 0,
    });
    expect(result.summary).not.toContain('PostgreSQL');
  });

  it('rejects malformed provider candidates', () => {
    expect(() => normalizeBirdIdentification({
      candidates: [
        {
          species: 'Resplendent Quetzal',
          confidence: 1.2,
          reasoning: 'Out of range confidence.',
          visualEvidence: ['green plumage'],
        },
      ],
    })).toThrow('Bird identification provider returned an invalid response.');
  });

  it('rejects candidates without visible evidence', () => {
    expect(() => normalizeBirdIdentification({
      candidates: [
        {
          species: 'Resplendent Quetzal',
          confidence: 0.91,
          reasoning: 'Green and red plumage fits a male quetzal.',
          visualEvidence: [],
        },
      ],
    })).toThrow('Bird identification provider returned an invalid response.');
  });

  it('verification preserves strong matching RAG support as identified', () => {
    expect(normalizeBirdVerification({
      status: 'identified',
      bestMatch: null,
      candidates: [
        {
          commonName: 'Agami Heron',
          scientificName: 'Agamia agami',
          confidence: 0.88,
          reasoning: 'Long bill, chestnut neck, dark head, and blue-green wings match retrieved profile.',
          visualEvidence: ['long bill', 'chestnut neck', 'dark head', 'blue-green wings'],
          ragSupport: ['Retrieved profile describes chestnut neck and blue-green wings.'],
          contradictions: [],
          missingEvidence: [],
        },
      ],
      notes: [],
    }, {
      imageAnalysis: {
        confidence: 0.86,
        imageQuality: 'clear',
      },
    })).toMatchObject({
      status: 'identified',
      bestMatch: {
        commonName: 'Agami Heron',
        confidence: 0.88,
        ragSupport: ['Retrieved profile describes chestnut neck and blue-green wings.'],
      },
    });
  });

  it('verification returns uncertain when best candidate confidence is below 0.55', () => {
    expect(normalizeBirdVerification({
      status: 'identified',
      bestMatch: null,
      candidates: [
        {
          commonName: 'Variable Seedeater',
          scientificName: 'Sporophila corvina',
          confidence: 0.54,
          reasoning: 'Small dark seed-eating bird is plausible but not diagnostic.',
          visualEvidence: ['small bird', 'short bill'],
          ragSupport: ['Retrieved profile mentions short conical bill.'],
          contradictions: [],
          missingEvidence: ['plumage pattern not clear'],
        },
      ],
      notes: [],
    }, {
      imageAnalysis: {
        confidence: 0.7,
        imageQuality: 'usable',
      },
    }).status).toBe('uncertain');
  });

  it('verification returns unknown when best candidate confidence is below 0.40', () => {
    expect(normalizeBirdVerification({
      status: 'identified',
      bestMatch: null,
      candidates: [
        {
          commonName: 'Unknown olive/yellow bird',
          scientificName: '',
          confidence: 0.39,
          reasoning: 'Visible traits are too generic for a reliable match.',
          visualEvidence: ['olive upperparts', 'yellow underparts'],
          ragSupport: [],
          contradictions: [],
          missingEvidence: ['head pattern hidden', 'bill shape unclear'],
        },
      ],
      notes: [],
    }, {
      imageAnalysis: {
        confidence: 0.65,
        imageQuality: 'soft focus',
      },
    })).toMatchObject({
      status: 'unknown',
      bestMatch: null,
    });
  });

  it('uses tolerant fallback verification when the verifier fails with sparse candidates', async () => {
    mockVerifyAndRerank.mockRejectedValue(new Error('malformed verifier response'));

    const result = await birdIdentificationService.verifyAndRerankBirdCandidates({
      imageAnalysis: {
        dominantColors: ['green'],
        fieldMarks: ['red underparts'],
        bill: {
          color: 'yellow',
        },
        imageQuality: 'clear',
        confidence: 0.72,
      },
      candidates: [
        {
          commonName: 'Resplendent Quetzal',
          scientificName: 'Pharomachrus mocinno',
          confidence: 0.62,
        },
      ],
      retrievedProfiles: [
        {
          commonName: 'Resplendent Quetzal',
          scientificName: 'Pharomachrus mocinno',
          description: 'Retrieved profile mentions red underparts and green plumage.',
        },
      ],
    });

    expect(result).toMatchObject({
      status: 'identified',
      bestMatch: {
        commonName: 'Resplendent Quetzal',
        confidence: 0.62,
        reasoning: 'Candidate kept from the image-identification step after verifier fallback calibration.',
        visualEvidence: ['red underparts', 'green plumage', 'yellow bill'],
        ragSupport: ['Retrieved profile mentions red underparts and green plumage.'],
      },
      notes: [
        'Candidate verification used fallback confidence calibration because the verifier did not return a usable response.',
      ],
    });
  });

  it('builds a compact RAG query from candidate names and visible traits', () => {
    expect(buildBirdKnowledgeQuery({
      imageAnalysis: {
        colors: ['green', 'red'],
        beak: 'yellow',
        size: 'medium',
        tail: 'long',
        wingPattern: 'plain',
        headPattern: 'plain',
        bellyColor: 'red',
        habitatHint: 'forest',
      },
      candidates: [
        {
          species: 'Resplendent Quetzal',
        },
      ],
    })).toBe(
      'Costa Rica bird identification knowledge. likely birds: Resplendent Quetzal. visible traits: colors: green, red; beak: yellow; size: medium; tail: long; wing pattern: plain; head pattern: plain; belly color: red; habitat hint: forest'
    );
  });

  it('adds a yellow-orange ambiguity hint when image analysis reports an orange beak', () => {
    const identificationAnalysis = buildIdentificationImageAnalysis({
      colors: ['green', 'red'],
      beak: 'orange',
      size: 'medium',
      tail: 'long',
      wingPattern: 'plain',
      headPattern: 'plain',
      bellyColor: 'red',
      habitatHint: 'forest',
      confidence: 0.82,
    });

    expect(identificationAnalysis).toEqual(expect.objectContaining({
      colors: ['green', 'red'],
      beak: 'orange',
      size: 'medium',
      tail: 'long',
      wingPattern: 'plain',
      headPattern: 'plain',
      bellyColor: 'red',
      habitatHint: 'forest',
      confidence: 0.82,
      beakColorInterpretation: 'orange/yellow ambiguity: consider yellow-billed species when other visible traits support them',
    }));
    expect(buildBirdKnowledgeQuery({
      imageAnalysis: identificationAnalysis,
      candidates: [
        {
          species: 'Resplendent Quetzal',
        },
      ],
    })).toContain('beak color interpretation: orange/yellow ambiguity');
  });

  it('deduplicates bird knowledge and prefers richer bird match data', () => {
    expect(normalizeBirdKnowledge({
      sources: [
        {
          name: 'Resplendent Quetzal',
          scientificName: 'Pharomachrus mocinno',
          location: 'Monteverde',
          similarityScore: 0.94,
          documentType: 'bird_profile',
        },
      ],
      birdMatches: [
        {
          speciesCode: 'resque1',
          commonName: 'Resplendent Quetzal',
          scientificName: 'Pharomachrus mocinno',
          family: 'Trogons',
          description: 'Cloud forest bird with green plumage and red belly.',
          locations: 'Monteverde Cloud Forest',
          lastObservation: {
            locations: ['Monteverde'],
            obsDt: '2026-05-21 05:30',
          },
          media: {
            photoUrl: '/photos/quetzal.jpg',
          },
        },
      ],
    })).toEqual([
      {
        commonName: 'Resplendent Quetzal',
        scientificName: 'Pharomachrus mocinno',
        location: 'Monteverde Cloud Forest',
        similarityScore: 0.94,
        documentType: 'bird_profile',
        speciesCode: 'resque1',
        family: 'Trogons',
        description: 'Cloud forest bird with green plumage and red belly.',
        lastObservation: {
          locations: ['Monteverde'],
          obsDt: '2026-05-21 05:30',
        },
        media: {
          photoUrl: '/photos/quetzal.jpg',
        },
      },
    ]);
  });

  it('normalizes source-only bird knowledge', () => {
    expect(normalizeBirdKnowledge({
      sources: [
        {
          name: 'Lesson Motmot',
          scientificName: 'Momotus lessonii',
          location: 'Central Valley',
          similarityScore: 0.82,
          documentType: 'bird_profile',
        },
      ],
      birdMatches: [],
    })).toEqual([
      {
        commonName: 'Lesson Motmot',
        scientificName: 'Momotus lessonii',
        location: 'Central Valley',
        similarityScore: 0.82,
        documentType: 'bird_profile',
      },
    ]);
  });

  it('normalizes bird-match-only bird knowledge', () => {
    expect(normalizeBirdKnowledge({
      sources: [],
      birdMatches: [
        {
          commonName: 'Keel-billed Toucan',
          scientificName: 'Ramphastos sulfuratus',
          family: 'Toucans',
          description: 'Large colorful toucan.',
          locations: 'Caribbean lowlands',
        },
      ],
    })).toEqual([
      {
        commonName: 'Keel-billed Toucan',
        scientificName: 'Ramphastos sulfuratus',
        family: 'Toucans',
        description: 'Large colorful toucan.',
        location: 'Caribbean lowlands',
      },
    ]);
  });

  it('merges candidates and bird knowledge into one deduplicated candidates list', () => {
    expect(normalizeEnrichedCandidates({
      candidates: [
        {
          species: 'Resplendent Quetzal',
          confidence: 0.91,
          reasoning: 'Green and red plumage fits a male quetzal.',
          visualEvidence: ['green plumage', 'red belly', 'long tail'],
        },
      ],
      birdKnowledge: [
        {
          commonName: 'Resplendent Quetzal',
          scientificName: 'Pharomachrus mocinno',
          location: 'Monteverde',
          similarityScore: 0.94,
          family: 'Trogons',
          description: 'Cloud forest bird.',
        },
      ],
    })).toEqual([
      {
        species: 'Resplendent Quetzal',
        commonName: 'Resplendent Quetzal',
        confidence: 0.91,
        reasoning: 'Green and red plumage fits a male quetzal.',
        visualEvidence: ['green plumage', 'red belly', 'long tail'],
        scientificName: 'Pharomachrus mocinno',
        location: 'Monteverde',
        similarityScore: 0.94,
        family: 'Trogons',
        description: 'Cloud forest bird.',
      },
    ]);
  });

  it('includes knowledge-only entries in the enriched candidates list', () => {
    expect(normalizeEnrichedCandidates({
      candidates: [],
      birdKnowledge: [
        {
          commonName: 'Lesson Motmot',
          scientificName: 'Momotus lessonii',
          location: 'Central Valley',
          similarityScore: 0.82,
        },
      ],
    })).toEqual([
      {
        commonName: 'Lesson Motmot',
        scientificName: 'Momotus lessonii',
        location: 'Central Valley',
        similarityScore: 0.82,
      },
    ]);
  });

  it('limits enriched candidates to five birds', () => {
    expect(normalizeEnrichedCandidates({
      candidates: [
        {
          species: 'Resplendent Quetzal',
          confidence: 0.91,
          reasoning: 'Green and red plumage fits.',
          visualEvidence: ['green plumage'],
        },
        {
          species: 'Emerald Toucanet',
          confidence: 0.72,
          reasoning: 'Green plumage and forest habitat fit.',
          visualEvidence: ['green plumage'],
        },
        {
          species: 'Green Honeycreeper',
          confidence: 0.61,
          reasoning: 'Small green bird could fit.',
          visualEvidence: ['green plumage'],
        },
      ],
      birdKnowledge: [
        {
          commonName: 'Lesson Motmot',
          scientificName: 'Momotus lessonii',
          location: 'Central Valley',
          similarityScore: 0.82,
        },
        {
          commonName: 'Keel-billed Toucan',
          scientificName: 'Ramphastos sulfuratus',
          location: 'Caribbean lowlands',
          similarityScore: 0.8,
        },
      ],
    })).toHaveLength(5);
  });

  it('maps rag trace to frontend-safe aggregate fields only', () => {
    expect(normalizeRagTrace({
      retrievedChunkCount: 7,
      sourceCount: 7,
      originalMessageCount: 2,
      groundedMessageCount: 3,
      contextMessageLength: 4594,
      retrievedChunks: [
        {
          name: 'Internal chunk detail',
        },
      ],
      sources: [
        {
          name: 'Internal source detail',
        },
      ],
      error: 'rag_retrieval_failed',
    })).toEqual({
      retrievedChunkCount: 7,
      sourceCount: 7,
      originalMessageCount: 2,
      groundedMessageCount: 3,
      contextMessageLength: 4594,
    });
  });

  it('records bird identification history for authenticated users', async () => {
    await expect(recordBirdIdentificationHistory({
      userId: '7',
      imageUrl: 'https://example.test/quetzal.jpg',
      candidates: [
        {
          species: 'Resplendent Quetzal',
          commonName: 'Resplendent Quetzal',
          confidence: 0.91429,
        },
      ],
    })).resolves.toEqual(expect.objectContaining({
      id: 1,
      user_id: 7,
    }));

    expect(mockCreateHistory).toHaveBeenCalledWith({
      userId: 7,
      imageUrl: 'https://example.test/quetzal.jpg',
      prediction: 'Resplendent Quetzal',
      confidence: 0.91429,
    });
  });

  it('skips bird identification history for visitors', async () => {
    await expect(recordBirdIdentificationHistory({
      userId: null,
      imageUrl: 'https://example.test/visitor.jpg',
      candidates: [
        {
          species: 'Resplendent Quetzal',
          confidence: 0.91,
        },
      ],
    })).resolves.toBeNull();

    expect(mockCreateHistory).not.toHaveBeenCalled();
  });

  it('keeps bird identification resilient when history persistence fails', async () => {
    mockCreateHistory.mockRejectedValue(new Error('Database unavailable'));

    await expect(recordBirdIdentificationHistory({
      userId: 7,
      imageUrl: 'https://example.test/quetzal.jpg',
      candidates: [
        {
          species: 'Resplendent Quetzal',
          confidence: 0.91,
        },
      ],
    })).resolves.toBeNull();
  });

  it('normalizes user ids and history prediction fields', () => {
    expect(normalizeUserId('7')).toBe(7);
    expect(normalizeUserId('not-a-number')).toBeNull();
    expect(normalizePrediction({
      commonName: ' Resplendent Quetzal ',
      species: 'Pharomachrus mocinno',
    })).toBe('Resplendent Quetzal');
    expect(normalizeConfidence(0.91)).toBe(0.91);
    expect(normalizeConfidence(1.2)).toBeNull();
  });
});
