import { jest } from '@jest/globals';

const mockSpeechCreate = jest.fn();
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
      speech: {
        create: mockSpeechCreate,
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

const {
  default: textToSpeech,
  assertAudioBuffer,
  responseToBuffer,
} = await import('../src/ai/audio/textToSpeech.adapter.js');

describe('textToSpeech audio adapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls OpenAI speech generation and returns mp3 audio', async () => {
    const audio = Buffer.from('mp3 bytes');
    mockSpeechCreate.mockResolvedValue({
      arrayBuffer: async () => audio.buffer.slice(audio.byteOffset, audio.byteOffset + audio.byteLength),
    });

    const result = await textToSpeech.synthesize({
      text: 'A toucan is calling nearby.',
    });

    expect(mockSpeechCreate).toHaveBeenCalledWith({
      model: 'gpt-4o-mini-tts',
      voice: 'alloy',
      input: 'A toucan is calling nearby.',
      response_format: 'mp3',
    });
    expect(result).toEqual({
      audio,
      contentType: 'audio/mpeg',
      filename: 'response.mp3',
      model: 'gpt-4o-mini-tts',
    });
  });

  it('converts a speech response arrayBuffer to a Buffer', async () => {
    const audio = Buffer.from('audio');

    await expect(responseToBuffer({
      arrayBuffer: async () => audio.buffer.slice(audio.byteOffset, audio.byteOffset + audio.byteLength),
    })).resolves.toEqual(audio);
  });

  it('rejects empty audio responses as provider failures', () => {
    expect(() => assertAudioBuffer(Buffer.alloc(0))).toThrow('OpenAI returned an empty speech response');
  });
});
