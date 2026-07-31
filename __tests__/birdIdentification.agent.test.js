import { jest } from '@jest/globals';

const mockCreate = jest.fn();

await jest.unstable_mockModule('openai', () => ({
  default: jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: mockCreate,
      },
    },
    embeddings: {
      create: jest.fn(),
    },
  })),
}));

await jest.unstable_mockModule('../src/utils/logger.js', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

await jest.unstable_mockModule('../src/ai/tools/index.js', () => ({
  availableTools: [],
  executeToolCall: jest.fn(),
}));

const { default: birdIdentificationAgent } = await import('../src/ai/agents/birdIdentification.agent.js');

describe('birdIdentificationAgent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls OpenAI with image analysis and a structured candidate schema', async () => {
    mockCreate.mockResolvedValue({
      id: 'identify-1',
      model: 'gpt-4o',
      choices: [
        {
          message: {
            content: JSON.stringify({
              status: 'identified',
              candidates: [
                {
                  commonName: 'Resplendent Quetzal',
                  scientificName: 'Pharomachrus mocinno',
                  confidence: 0.91,
                  reasoning: 'Green and red plumage.',
                  visualEvidence: ['green plumage', 'red belly'],
                  possibleConfusions: [],
                  missingEvidence: [],
                },
              ],
              notes: [],
            }),
          },
        },
      ],
    });

    await birdIdentificationAgent.identify({
      imageAnalysis: {
        colors: ['green', 'red'],
        beak: 'yellow',
        size: 'medium',
        confidence: 0.82,
      },
    });

    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
      model: 'gpt-4o',
      response_format: expect.objectContaining({
        type: 'json_schema',
        json_schema: expect.objectContaining({
          name: 'bird_identification',
          strict: true,
        }),
      }),
    }), expect.objectContaining({
      signal: expect.any(AbortSignal),
    }));
    expect(mockCreate.mock.calls[0][0].messages[1]).toEqual(expect.objectContaining({
      role: 'user',
      content: expect.stringContaining('"colors":["green","red"]'),
    }));
  });

  it('keeps bird identification prompt scoped to visual candidates before RAG enrichment', async () => {
    mockCreate.mockResolvedValue({
      id: 'identify-1',
      model: 'gpt-4o',
      choices: [
        {
          message: {
            content: JSON.stringify({
              status: 'identified',
              candidates: [
                {
                  commonName: 'Resplendent Quetzal',
                  scientificName: 'Pharomachrus mocinno',
                  confidence: 0.91,
                  reasoning: 'Green and red plumage.',
                  visualEvidence: ['green plumage', 'red belly'],
                  possibleConfusions: [],
                  missingEvidence: [],
                },
              ],
              notes: [],
            }),
          },
        },
      ],
    });

    await birdIdentificationAgent.identify({
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

    const systemPrompt = mockCreate.mock.calls[0][0].messages[0].content;

    expect(systemPrompt).toContain('generate conservative candidate species');
    expect(systemPrompt).toContain('visualEvidence');
    expect(systemPrompt).toContain('possibleConfusions');
    expect(systemPrompt).toContain('missingEvidence');
    expect(systemPrompt).toContain('Do not force an identification');
    expect(systemPrompt).toContain('Use 0.90 or higher only');
    expect(systemPrompt).toContain('Return only valid JSON');
  });

  it('passes the image URL to candidate generation when available', async () => {
    mockCreate.mockResolvedValue({
      id: 'identify-2',
      model: 'gpt-4o',
      choices: [
        {
          message: {
            content: JSON.stringify({
              status: 'uncertain',
              candidates: [],
              notes: ['not enough visible evidence'],
            }),
          },
        },
      ],
    });

    await birdIdentificationAgent.identify({
      imageUrl: 'https://example.test/bird.jpg',
      imageAnalysis: {
        dominantColors: ['olive', 'yellow'],
        confidence: 0.5,
      },
    });

    expect(mockCreate.mock.calls[0][0].messages[1].content).toEqual([
      expect.objectContaining({
        type: 'text',
        text: expect.stringContaining('"dominantColors":["olive","yellow"]'),
      }),
      {
        type: 'image_url',
        image_url: {
          url: 'https://example.test/bird.jpg',
        },
      },
    ]);
  });

  it('declares verifier output that cannot contain empty placeholder candidates', async () => {
    mockCreate.mockResolvedValue({
      id: 'verify-1',
      model: 'gpt-4o',
      choices: [{
        message: {
          content: JSON.stringify({
            status: 'unknown',
            bestMatch: null,
            candidates: [],
            notes: ['Insufficient visible evidence.'],
          }),
        },
      }],
    });

    await birdIdentificationAgent.verifyAndRerank({
      imageAnalysis: {
        dominantColors: ['olive'],
        fieldMarks: ['short bill'],
        confidence: 0.45,
      },
      candidates: [{
        commonName: 'Variable Seedeater',
        scientificName: 'Sporophila corvina',
        confidence: 0.5,
        reasoning: 'Small seed-eating bird.',
        visualEvidence: ['short bill'],
      }],
      retrievedProfiles: [],
    });

    const request = mockCreate.mock.calls[0][0];
    const schemaCandidate = request.response_format.json_schema.schema
      .properties.candidates.items.properties;

    expect(schemaCandidate.commonName.minLength).toBe(1);
    expect(schemaCandidate.reasoning.minLength).toBe(1);
    expect(schemaCandidate.visualEvidence.minItems).toBe(1);
    expect(schemaCandidate.visualEvidence.items.minLength).toBe(1);
    expect(request.messages[0].content).toContain(
      'never emit an empty-string placeholder candidate'
    );
    expect(request.messages[0].content).toContain(
      'preserve their commonName and scientificName exactly'
    );
  });
});
