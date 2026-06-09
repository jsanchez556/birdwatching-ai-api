import openaiClient from '../openai.client.js';
import { traceLlmCall } from '../../tracing/aiTracing.middleware.js';
import { asyncRetry } from '../../utils/async.utils.js';
import logger from '../../utils/logger.js';

const SPEECH_MODEL = 'gpt-4o-mini-tts';
const SPEECH_VOICE = 'alloy';
const RETRYABLE_STATUSES = new Set([408, 409, 429, 500, 502, 503, 504]);

function isRetryableOpenAIError(error) {
  return RETRYABLE_STATUSES.has(error?.status) || error?.code === 'ETIMEDOUT';
}

async function responseToBuffer(response) {
  if (Buffer.isBuffer(response)) {
    return response;
  }

  if (response?.arrayBuffer) {
    return Buffer.from(await response.arrayBuffer());
  }

  if (response?.body && Buffer.isBuffer(response.body)) {
    return response.body;
  }

  throw new Error('OpenAI returned an invalid speech response');
}

function assertAudioBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error('OpenAI returned an empty speech response');
  }

  return buffer;
}

class TextToSpeech {
  async synthesize({ text, metadata = {} }) {
    const response = await traceLlmCall('audio_speech_generation', {
      model: SPEECH_MODEL,
      voice: SPEECH_VOICE,
      textLength: text.length,
      parentTraceId: metadata.parentTraceId,
    }, () => asyncRetry(() => openaiClient.client.audio.speech.create({
      model: SPEECH_MODEL,
      voice: SPEECH_VOICE,
      input: text,
      response_format: 'mp3',
    }), {
      retries: 2,
      shouldRetry: isRetryableOpenAIError,
    }), {
      tokenUsage: null,
      outputMetadata: () => ({
        model: SPEECH_MODEL,
        voice: SPEECH_VOICE,
        responseFormat: 'mp3',
      }),
    });

    const audio = assertAudioBuffer(await responseToBuffer(response));

    logger.info('OpenAI speech generation finished', {
      event: 'audio_speech_generation',
      model: SPEECH_MODEL,
      voice: SPEECH_VOICE,
      audioBytes: audio.length,
      textLength: text.length,
    });

    return {
      audio,
      contentType: 'audio/mpeg',
      filename: 'response.mp3',
      model: SPEECH_MODEL,
    };
  }
}

export {
  assertAudioBuffer,
  responseToBuffer,
};
export default new TextToSpeech();
