import { File } from 'node:buffer';
import openaiClient from '../clients/openai.client.js';
import { traceLlmCall } from '../../tracing/aiTracing.middleware.js';
import { asyncRetry } from '../../utils/async.utils.js';
import logger from '../../utils/logger.js';
import { isRetryableOpenAIError } from '../utils/openaiRetry.utils.js';

const TRANSCRIPTION_MODEL = 'gpt-4o-mini-transcribe';

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
      fileType: mimeType,
      fileSizeBytes: buffer.length,
      parentTraceId: metadata.parentTraceId,
    }, () => asyncRetry(() => openaiClient.client.audio.transcriptions.create({
      file,
      model: TRANSCRIPTION_MODEL,
    }), {
      retries: 2,
      shouldRetry: isRetryableOpenAIError,
    }), {
      tokenUsage: null,
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
