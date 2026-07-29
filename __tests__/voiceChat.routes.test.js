import { jest } from '@jest/globals';
import jwt from 'jsonwebtoken';
import request from 'supertest';

const mockTranscribe = jest.fn();
const mockSynthesizeSpeech = jest.fn();
const mockProcessMessageStream = jest.fn();
const mockUploadSpeechResponse = jest.fn();
const mockReserveUsage = jest.fn();

await jest.unstable_mockModule('../src/services/audio.service.js', () => ({
  default: {
    transcribe: mockTranscribe,
    synthesizeSpeech: mockSynthesizeSpeech,
  },
}));

await jest.unstable_mockModule('../src/services/chat.service.js', () => ({
  default: {
    processMessageStream: mockProcessMessageStream,
  },
}));

await jest.unstable_mockModule('../src/services/voiceChatAudioStorage.service.js', () => ({
  default: {
    uploadSpeechResponse: mockUploadSpeechResponse,
  },
}));

await jest.unstable_mockModule('../src/services/quota.service.js', () => ({
  QUOTA_FEATURES: {
    CHAT: 'chat',
    IDENTIFICATION: 'identification',
  },
  default: {
    reserveUsage: mockReserveUsage,
  },
}));

await jest.unstable_mockModule('../src/utils/logger.js', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const { default: app } = await import('../src/api/app.js');

function authHeader(userId = 'voice-quota-user') {
  const token = jwt.sign(
    { email: 'ana@example.com' },
    'test-jwt-secret',
    { subject: userId, expiresIn: '1h' }
  );

  return 'Bearer ' + token;
}

describe('voice chat endpoint', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReserveUsage.mockResolvedValue({
      allowed: true,
      plan: 'FREE',
      feature: 'chat',
      used: 1,
      max: 20,
    });
    mockTranscribe.mockResolvedValue({
      transcript: 'Where can I see quetzals?',
    });
    mockProcessMessageStream.mockResolvedValue({
      conversationId: 'conversation-123',
      response: 'Monteverde is one of the best places to see quetzals.',
      sources: [],
      meta: {},
    });
    mockSynthesizeSpeech.mockResolvedValue({
      audio: Buffer.from('voice mp3'),
      contentType: 'audio/mpeg',
      filename: 'response.mp3',
    });
    mockUploadSpeechResponse.mockResolvedValue({
      key: 'voice-chat/response-1.mp3',
      audioResponseUrl: '/files/voice-chat/response-1.mp3',
    });
  });

  it('processes an mp3 voice chat and returns text plus an audio URL', async () => {
    const res = await request(app)
      .post('/voice-chat')
      .set('Host', 'api.example.test')
      .set('Content-Type', 'audio/mpeg')
      .set('X-Filename', 'question.mp3')
      .send(Buffer.from('mp3 question'));

    expect(res.statusCode).toBe(200);
    expect(mockTranscribe).toHaveBeenCalledWith(expect.objectContaining({
      filename: 'question.mp3',
      mimeType: 'audio/mpeg',
      buffer: expect.any(Buffer),
    }), expect.any(Object));
    expect(mockProcessMessageStream).toHaveBeenCalledWith(
      'Where can I see quetzals?',
      undefined,
      expect.any(String),
      expect.objectContaining({
        onStart: expect.any(Function),
        onChunk: expect.any(Function),
        onReplace: expect.any(Function),
      }),
      expect.objectContaining({
        authUser: undefined,
        role: undefined,
        parentTraceId: expect.any(String),
        aiTraceId: res.headers['x-ai-trace-id'],
      })
    );
    expect(mockSynthesizeSpeech).toHaveBeenCalledWith({
      text: 'Monteverde is one of the best places to see quetzals.',
    }, expect.any(Object));
    expect(res.body).toMatchObject({
      success: true,
      data: {
        transcript: 'Where can I see quetzals?',
        answer: 'Monteverde is one of the best places to see quetzals.',
      },
      meta: {
        conversationId: 'conversation-123',
        aiTraceId: res.headers['x-ai-trace-id'],
      },
    });
    expect(res.headers['x-ai-trace-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
    expect(mockUploadSpeechResponse).toHaveBeenCalledWith({
      audio: Buffer.from('voice mp3'),
      contentType: 'audio/mpeg',
      filename: 'response.mp3',
    });
    expect(res.body.data.audioResponseUrl).toBe('/files/voice-chat/response-1.mp3');
  });

  it('returns 429 before transcription when daily chat quota is exceeded', async () => {
    const quotaError = new Error('Daily quota exceeded');
    quotaError.status = 429;
    quotaError.code = 'QUOTA_EXCEEDED';
    quotaError.details = {
      plan: 'FREE',
      feature: 'chat',
      used: 20,
      max: 20,
    };
    mockReserveUsage.mockRejectedValue(quotaError);

    const res = await request(app)
      .post('/voice-chat')
      .set('Authorization', authHeader())
      .set('Host', 'api.example.test')
      .set('Content-Type', 'audio/mpeg')
      .set('X-Filename', 'question.mp3')
      .send(Buffer.from('mp3 question'));

    expect(res.statusCode).toBe(429);
    expect(res.body).toEqual({
      success: false,
      error: {
        code: 'QUOTA_EXCEEDED',
        message: 'Daily quota exceeded',
        details: {
          plan: 'FREE',
          feature: 'chat',
          used: 20,
          max: 20,
        },
      },
    });
    expect(mockTranscribe).not.toHaveBeenCalled();
    expect(mockProcessMessageStream).not.toHaveBeenCalled();
  });

  it('processes a wav voice chat and forwards optional chat context headers', async () => {
    const customerContext = {
      customerName: 'Ana',
      customerEmail: 'ana@example.com',
      itineraryStartDate: '2026-07-01',
      itineraryEndDate: '2026-07-03',
    };

    const res = await request(app)
      .post('/voice-chat')
      .set('Content-Type', 'audio/wav')
      .set('X-Filename', 'question.wav')
      .set('X-Conversation-Id', 'conversation-existing')
      .set('X-Role', 'visitor')
      .set('X-Response-Mode', 'field_assistant')
      .set('X-Customer-Context', JSON.stringify(customerContext))
      .send(Buffer.from('wav question'));

    expect(res.statusCode).toBe(200);
    expect(mockProcessMessageStream).toHaveBeenCalledWith(
      'Where can I see quetzals?',
      'conversation-existing',
      expect.any(String),
      expect.any(Object),
      expect.objectContaining({
        customerContext,
        role: 'visitor',
        responseMode: 'field_assistant',
        parentTraceId: expect.any(String),
      })
    );
  });

  it('accepts the field assistant shorthand header', async () => {
    const res = await request(app)
      .post('/voice-chat')
      .set('Content-Type', 'audio/mpeg')
      .set('X-Filename', 'question.mp3')
      .set('X-Field-Assistant', 'true')
      .send(Buffer.from('mp3 question'));

    expect(res.statusCode).toBe(200);
    expect(mockProcessMessageStream).toHaveBeenCalledWith(
      'Where can I see quetzals?',
      undefined,
      expect.any(String),
      expect.any(Object),
      expect.objectContaining({
        responseMode: 'field_assistant',
      })
    );
  });

  it('rejects unsupported response modes', async () => {
    const res = await request(app)
      .post('/voice-chat')
      .set('Content-Type', 'audio/mpeg')
      .set('X-Filename', 'question.mp3')
      .set('X-Response-Mode', 'verbose')
      .send(Buffer.from('mp3 question'));

    expect(res.statusCode).toBe(422);
    expect(mockTranscribe).not.toHaveBeenCalled();
    expect(res.body.error.details).toContain('Response mode must be field_assistant when provided');
  });

  it('rejects unsupported audio filenames', async () => {
    const res = await request(app)
      .post('/voice-chat')
      .set('Content-Type', 'audio/wav')
      .set('X-Filename', 'question.txt')
      .send(Buffer.from('bad file'));

    expect(res.statusCode).toBe(422);
    expect(mockTranscribe).not.toHaveBeenCalled();
    expect(res.body).toMatchObject({
      success: false,
      error: {
        code: 'validation_error',
      },
    });
  });

  it('handles empty transcription safely', async () => {
    mockTranscribe.mockResolvedValue({ transcript: '' });

    const res = await request(app)
      .post('/voice-chat')
      .set('Content-Type', 'audio/mpeg')
      .set('X-Filename', 'question.mp3')
      .send(Buffer.from('mp3 question'));

    expect(res.statusCode).toBe(502);
    expect(mockProcessMessageStream).not.toHaveBeenCalled();
    expect(res.body).toMatchObject({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error',
      },
    });
  });

  it('does not generate speech when chat fails', async () => {
    mockProcessMessageStream.mockRejectedValue(new Error('chat failed with private internals'));

    const res = await request(app)
      .post('/voice-chat')
      .set('Content-Type', 'audio/mpeg')
      .set('X-Filename', 'question.mp3')
      .send(Buffer.from('mp3 question'));

    expect(res.statusCode).toBe(500);
    expect(mockSynthesizeSpeech).not.toHaveBeenCalled();
    expect(mockUploadSpeechResponse).not.toHaveBeenCalled();
    expect(JSON.stringify(res.body)).not.toContain('private internals');
  });

  it('handles text-to-speech failures safely', async () => {
    mockSynthesizeSpeech.mockRejectedValue(new Error('tts failed with provider details'));

    const res = await request(app)
      .post('/voice-chat')
      .set('Content-Type', 'audio/mpeg')
      .set('X-Filename', 'question.mp3')
      .send(Buffer.from('mp3 question'));

    expect(res.statusCode).toBe(500);
    expect(mockUploadSpeechResponse).not.toHaveBeenCalled();
    expect(JSON.stringify(res.body)).not.toContain('provider details');
  });
});
