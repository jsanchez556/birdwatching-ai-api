import { randomUUID } from 'crypto';
import S3BucketService from '../storage/s3Bucket.service.js';

const VOICE_CHAT_AUDIO_PREFIX = 'voice-chat';

function buildVoiceChatAudioKey(id = randomUUID()) {
  return `${VOICE_CHAT_AUDIO_PREFIX}/${id}.mp3`;
}

function buildMediaRoutePath(key) {
  return `/files/${String(key || '').replace(/^\/+/, '')}`;
}

class VoiceChatAudioStorageService {
  constructor(options = {}) {
    this.bucketService = options.bucketService;
  }

  getBucketService() {
    if (!this.bucketService) {
      this.bucketService = new S3BucketService();
    }

    return this.bucketService;
  }

  async uploadSpeechResponse({ audio, contentType = 'audio/mpeg' }) {
    const key = buildVoiceChatAudioKey();

    await this.getBucketService().uploadObject({
      key,
      body: audio,
      contentType,
      metadata: {
        source: 'voice-chat',
        entityType: 'voice-response',
      },
      skipIfExists: false,
    });

    return {
      key,
      audioResponseUrl: buildMediaRoutePath(key),
    };
  }
}

export {
  VOICE_CHAT_AUDIO_PREFIX,
  VoiceChatAudioStorageService,
  buildMediaRoutePath,
  buildVoiceChatAudioKey,
};
export default new VoiceChatAudioStorageService();
