import openaiClient from '../clients/openai.client.js';
import { traceLlmCall } from '../../tracing/aiTracing.middleware.js';
import { asyncRetry } from '../../utils/async.utils.js';
import logger from '../../utils/logger.js';
import { isRetryableOpenAIError } from '../utils/openaiRetry.utils.js';

const SPEECH_MODEL = 'gpt-4o-mini-tts';
const SPEECH_VOICE = 'alloy';

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
      promptVersion: 'not_applicable',
      voice: SPEECH_VOICE,
      textLength: text.length,
      parentTraceId: metadata.parentTraceId,
      cacheStatus: 'not_applicable',
    }, () => asyncRetry(() => openaiClient.client.audio.speech.create({
      model: SPEECH_MODEL,
      voice: SPEECH_VOICE,
      input: text,
      response_format: 'mp3',
    }), {
      retries: 2,
      shouldRetry: isRetryableOpenAIError,
    }), {
      tokenUsage: {
        promptTokens: Math.max(1, Math.ceil(text.length / 4)),
        completionTokens: 0,
        totalTokens: Math.max(1, Math.ceil(text.length / 4)),
      },
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
