import { jest } from '@jest/globals';

await jest.unstable_mockModule('../src/utils/logger.js', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const {
  VoiceChatAudioStorageService,
  buildMediaRoutePath,
  buildVoiceChatAudioKey,
} = await import('../src/services/voiceChatAudioStorage.service.js');

describe('VoiceChatAudioStorageService', () => {
  it('builds S3 keys and relative media route paths', () => {
    expect(buildVoiceChatAudioKey('audio-123')).toBe('voice-chat/audio-123.mp3');
    expect(buildMediaRoutePath('voice-chat/audio-123.mp3')).toBe('/files/voice-chat/audio-123.mp3');
  });

  it('uploads generated speech audio to S3 and returns a relative media URL', async () => {
    const bucketService = {
      uploadObject: jest.fn().mockResolvedValue({
        bucket: 'bucket',
        key: 'voice-chat/audio-123.mp3',
        skipped: false,
      }),
    };
    const service = new VoiceChatAudioStorageService({ bucketService });

    const result = await service.uploadSpeechResponse({
      audio: Buffer.from('mp3 bytes'),
      contentType: 'audio/mpeg',
    });

    expect(bucketService.uploadObject).toHaveBeenCalledWith({
      key: expect.stringMatching(/^voice-chat\/.+\.mp3$/),
      body: Buffer.from('mp3 bytes'),
      contentType: 'audio/mpeg',
      metadata: {
        source: 'voice-chat',
        entityType: 'voice-response',
      },
      skipIfExists: false,
    });
    expect(result).toMatchObject({
      key: expect.stringMatching(/^voice-chat\/.+\.mp3$/),
      audioResponseUrl: expect.stringMatching(/^\/files\/voice-chat\/.+\.mp3$/),
    });
  });
});
