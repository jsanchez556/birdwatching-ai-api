import { jest } from '@jest/globals';

const mockCreate = jest.fn();
const mockLoggerInfo = jest.fn();
const mockLoggerWarn = jest.fn();

await jest.unstable_mockModule('openai', () => ({
  default: jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: jest.fn(),
      },
    },
    embeddings: {
      create: jest.fn(),
    },
    audio: {
      transcriptions: {
        create: mockCreate,
      },
    },
  })),
}));

await jest.unstable_mockModule('../src/utils/logger.js', () => ({
  default: {
    info: mockLoggerInfo,
    warn: mockLoggerWarn,
    error: jest.fn(),
  },
}));

await jest.unstable_mockModule('../src/ai/tools/index.js', () => ({
  availableTools: [],
  executeToolCall: jest.fn(),
}));

const { default: speechToText, normalizeTranscript } = await import('../src/ai/audio/speechToText.adapter.js');

describe('speechToText audio adapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls OpenAI transcription and returns trimmed transcript', async () => {
    mockCreate.mockResolvedValue({
      id: 'transcription-1',
      text: '  Scarlet macaw overhead.  ',
    });

    const result = await speechToText.transcribe({
      buffer: Buffer.from('audio'),
      filename: 'macaw.mp3',
      mimeType: 'audio/mpeg',
    });

    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
      model: 'gpt-4o-mini-transcribe',
      file: expect.any(File),
    }));
    expect(result).toEqual({
      transcript: 'Scarlet macaw overhead.',
      providerRequestId: 'transcription-1',
      model: 'gpt-4o-mini-transcribe',
    });
  });

  it('rejects empty transcripts as provider failures', () => {
    expect(() => normalizeTranscript({ text: '   ' })).toThrow('OpenAI returned an empty transcription');
  });
});
