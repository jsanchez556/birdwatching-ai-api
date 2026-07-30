import { File } from 'node:buffer';
import openaiClient from '../clients/openai.client.js';
import { traceLlmCall } from '../../tracing/aiTracing.middleware.js';
import logger from '../../utils/logger.js';
import { executeOpenAIWithRetry } from '../utils/openaiRetry.utils.js';
import { getModel, MODEL_KEYS, MODEL_REGISTRY } from '../routing/modelRegistry.js';

const TRANSCRIPTION_MODEL = getModel(MODEL_REGISTRY, MODEL_KEYS.AUDIO_TRANSCRIPTION).modelId;

function normalizeTranscript(response) {
  if (typeof response?.text !== 'string' || !response.text.trim()) {
    throw new Error('OpenAI returned an empty transcription');
  }

  return response.text.trim();
}

class SpeechToText {
  async transcribe({ buffer, filename, mimeType, metadata = {} }) {
    const file = new File([buffer], filename, { type: mimeType });

    const response = await traceLlmCall('audio_transcription', {
      model: TRANSCRIPTION_MODEL,
      promptVersion: 'not_applicable',
      fileType: mimeType,
      fileSizeBytes: buffer.length,
      parentTraceId: metadata.parentTraceId,
      cacheStatus: 'not_applicable',
    }, () => executeOpenAIWithRetry(() => openaiClient.client.audio.transcriptions.create({
      file,
      model: TRANSCRIPTION_MODEL,
    }), {
      operation: 'audio_transcription',
    }), {
      tokenUsage: (result) => {
        const completionTokens = Math.max(1, Math.ceil(String(result?.text || '').length / 4));
        return {
          promptTokens: 0,
          completionTokens,
          totalTokens: completionTokens,
        };
      },
      outputMetadata: (result) => ({
        requestId: result.id,
        model: TRANSCRIPTION_MODEL,
        transcriptLength: typeof result.text === 'string' ? result.text.length : 0,
      }),
    });

    const transcript = normalizeTranscript(response);

    logger.info('OpenAI audio transcription finished', {
      event: 'audio_transcription',
      model: TRANSCRIPTION_MODEL,
      transcriptLength: transcript.length,
      fileType: mimeType,
      fileSizeBytes: buffer.length,
    });

    return {
      transcript,
      providerRequestId: response.id,
      model: TRANSCRIPTION_MODEL,
    };
  }
}

export { normalizeTranscript };
export default new SpeechToText();
