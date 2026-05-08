import { jest } from '@jest/globals';

const mockGenerateEmbedding = jest.fn();
const mockSearchSimilarDocuments = jest.fn();
const mockSearch = jest.fn();

await jest.unstable_mockModule('../src/ai/openai.client.js', () => ({
  default: {
    generateEmbedding: mockGenerateEmbedding,
  },
}));

await jest.unstable_mockModule('../src/services/embeddings.service.js', () => ({
  default: {
    searchSimilarDocuments: mockSearchSimilarDocuments,
  },
}));

await jest.unstable_mockModule('../src/services/vectorSearch.service.js', () => ({
  default: {
    search: mockSearch,
  },
}));

await jest.unstable_mockModule('../src/utils/logger.js', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const { default: ragService, formatRetrievedContext } = await import('../src/services/rag.service.js');
const { default: logger } = await import('../src/utils/logger.js');

describe('RagService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('formats retrieved bird context for prompt injection', () => {
    expect(formatRetrievedContext([
      {
        name: 'Resplendent Quetzal',
        locations: 'Monteverde',
        description: 'Cloud forest bird.',
        score: 0.98765,
      },
    ])).toContain(
      '1. Resplendent Quetzal\nSimilarity score: 0.9877\nLocations: Monteverde\nDescription: Cloud forest bird.'
    );
  });

  it('injects relevant retrieved context after the base system message', async () => {
    const messages = [
      { role: 'system', content: 'Base prompt' },
      { role: 'user', content: 'Where can I see quetzals?' },
    ];
    const documents = [
      {
        id: 'Resplendent Quetzal',
        name: 'Resplendent Quetzal',
        locations: 'Monteverde',
        description: 'Cloud forest bird.',
        score: 0.98,
      },
    ];

    mockGenerateEmbedding.mockResolvedValue([[1, 0]]);
    mockSearchSimilarDocuments.mockResolvedValue([{ name: 'Resplendent Quetzal' }]);
    mockSearch.mockReturnValue(documents);

    const context = await ragService.buildContext(
      messages,
      'Where can I see quetzals?',
      { conversationId: 'conversation-123' }
    );

    expect(mockGenerateEmbedding).toHaveBeenCalledWith(['Where can I see quetzals?']);
    expect(context.messages).toEqual([
      { role: 'system', content: 'Base prompt' },
      expect.objectContaining({
        role: 'system',
        content: expect.stringContaining('Resplendent Quetzal'),
      }),
      { role: 'user', content: 'Where can I see quetzals?' },
    ]);
    expect(context.sources).toEqual([
      {
        name: 'Resplendent Quetzal',
        location: 'Monteverde',
        similarityScore: 0.98,
      },
    ]);
    expect(logger.info).toHaveBeenCalledWith('RAG context retrieved for chat', {
      conversationId: 'conversation-123',
      documentCount: 1,
      topK: 3,
      results: [
        {
          name: 'Resplendent Quetzal',
          location: 'Monteverde',
          similarityScore: 0.98,
        },
      ],
    });
  });

  it('returns original messages when retrieval fails', async () => {
    const messages = [
      { role: 'system', content: 'Base prompt' },
      { role: 'user', content: 'Where can I see quetzals?' },
    ];

    mockGenerateEmbedding.mockRejectedValue(new Error('OpenAI unavailable'));

    await expect(ragService.buildContext(messages, 'Where can I see quetzals?'))
      .resolves.toEqual({
        messages,
        sources: [],
      });
  });
});
