import { jest } from '@jest/globals';

const mockCreate = jest.fn();
const mockLoggerInfo = jest.fn();

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
    info: mockLoggerInfo,
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

await jest.unstable_mockModule('../src/ai/tools/index.js', () => ({
  availableTools: [],
  executeToolCall: jest.fn(),
}));

const {
  default: birdImageAnalysisService,
  normalizeBirdImageAnalysis,
} = await import('../src/services/birdImageAnalysis.service.js');

describe('birdImageAnalysisService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('analyzes an image URL with OpenAI vision and returns structured traits', async () => {
    mockCreate.mockResolvedValue({
      id: 'vision-1',
      model: 'gpt-4o',
      choices: [
        {
          message: {
            content: JSON.stringify({
              colors: [' green ', 'red'],
              beak: ' yellow ',
              size: 'medium',
              tail: ' long ',
              wingPattern: 'plain',
              headPattern: 'plain',
              bellyColor: 'red',
              habitatHint: 'forest',
              confidence: 0.82,
            }),
          },
        },
      ],
    });

    const result = await birdImageAnalysisService.analyze({
      imageUrl: 'https://example.test/quetzal.jpg',
    });

    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
      model: 'gpt-4o',
      response_format: expect.objectContaining({
        type: 'json_schema',
      }),
    }));
    expect(mockCreate.mock.calls[0][0].messages[1].content[1]).toEqual({
      type: 'image_url',
      image_url: {
        url: 'https://example.test/quetzal.jpg',
      },
    });
    expect(result).toEqual(expect.objectContaining({
      dominantColors: ['green', 'red'],
      fieldMarks: [],
      bill: {
        color: 'yellow',
        shape: 'unknown',
        length: 'unknown',
      },
      underparts: 'red',
      head: 'plain',
      colors: ['green', 'red'],
      beak: 'yellow',
      size: 'medium',
      tail: 'long',
      wingPattern: 'plain',
      headPattern: 'plain',
      bellyColor: 'red',
      habitatHint: 'forest',
      confidence: 0.82,
      promptVersion: '2.0.0',
      model: 'gpt-4o',
      providerRequestId: 'vision-1',
    }));
  });

  it('instructs the model to return beak color and dominant plumage colors', async () => {
    mockCreate.mockResolvedValue({
      id: 'vision-1',
      model: 'gpt-4o',
      choices: [
        {
          message: {
            content: JSON.stringify({
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
          },
        },
      ],
    });

    await birdImageAnalysisService.analyze({
      imageUrl: 'https://example.test/quetzal.jpg',
    });

    const systemPrompt = mockCreate.mock.calls[0][0].messages[0].content;

    expect(systemPrompt).toContain('visible field marks');
    expect(systemPrompt).toContain('Do not guess species');
    expect(systemPrompt).toContain('prefer yellow-orange or unknown');
    expect(systemPrompt).toContain('bill shape and color');
    expect(systemPrompt).toContain('apparent bird group');
    expect(systemPrompt).toContain('imageQuality');
  });

  it('rejects malformed provider analysis', () => {
    expect(() => normalizeBirdImageAnalysis({
      colors: ['green'],
      beak: 'yellow',
      size: 'medium',
      tail: 'long',
      wingPattern: 'plain',
      headPattern: 'plain',
      bellyColor: 'red',
      habitatHint: 'forest',
      confidence: 2,
    })).toThrow('Image analysis provider returned an invalid response.');
  });

  it('normalizes image analysis traits without exceeding the schema limits', () => {
    expect(normalizeBirdImageAnalysis({
      colors: [' green ', ' red ', ' gold '],
      beak: ' yellow ',
      size: 'medium',
      tail: ' long ',
      wingPattern: ' plain ',
      headPattern: ' dark cap ',
      bellyColor: ' crimson ',
      habitatHint: ' cloud forest ',
      confidence: '0.73',
    })).toEqual(expect.objectContaining({
      dominantColors: ['green', 'red', 'gold'],
      colors: ['green', 'red', 'gold'],
      bill: {
        color: 'yellow',
        shape: 'unknown',
        length: 'unknown',
      },
      beak: 'yellow',
      size: 'medium',
      tail: 'long',
      wings: 'plain',
      wingPattern: 'plain',
      head: 'dark cap',
      headPattern: 'dark cap',
      underparts: 'crimson',
      bellyColor: 'crimson',
      habitatHint: 'cloud forest',
      confidence: 0.73,
    }));
  });

  it('limits image analysis dominant colors to the richer schema maximum', () => {
    expect(normalizeBirdImageAnalysis({
      dominantColors: ['green', 'red', 'gold', 'black', 'white', 'gray', 'blue', 'tan', 'buff'],
      bill: { color: 'yellow', shape: 'short', length: 'short' },
      tail: 'long',
      wings: 'plain',
      head: 'dark cap',
      underparts: 'red',
      habitatHint: 'forest',
      confidence: 0.82,
    }).dominantColors).toHaveLength(8);
  });
});
