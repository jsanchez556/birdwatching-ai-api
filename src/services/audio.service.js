import speechToText from '../ai/audio/speechToText.js';
import textToSpeech from '../ai/audio/textToSpeech.js';
import HttpError from '../utils/httpError.js';
import logger from '../utils/logger.js';
import { estimateCost } from '../ai/evaluations/token.usage.js';
import usageService, { USAGE_FEATURES, buildModelUsageEntry } from './usage.service.js';

function estimateTextTokens(text = '') {
  return Math.max(1, Math.ceil(String(text || '').length / 4));
}

function toProviderError(error, operation = 'transcription') {
  const action = operation === 'speech' ? 'Speech generation' : 'Speech transcription';

  if (error?.status === 429) {
    return new HttpError(503, `${action} is temporarily unavailable. Please try again later.`, {
      code: 'PROVIDER_QUOTA_EXHAUSTED',
    });
  }

  if (error?.status && error.status >= 400 && error.status < 500) {
    return new HttpError(502, `${action} failed. Please revise your request and try again.`, {
      code: operation === 'speech' ? 'PROVIDER_SPEECH_REJECTED' : 'PROVIDER_TRANSCRIPTION_REJECTED',
    });
  }

  return new HttpError(503, `${action} is temporarily unavailable. Please try again later.`, {
    code: 'PROVIDER_UNAVAILABLE',
  });
}

class AudioService {
  async transcribe(upload, options = {}) {
    try {
      const result = await speechToText.transcribe({
        buffer: upload.buffer,
        filename: upload.filename,
        mimeType: upload.mimeType,
        metadata: {
          parentTraceId: options.parentTraceId,
        },
      });
      const tokens = estimateTextTokens(result.transcript);
      await usageService.recordUsageEvent({
        userId: options.userId,
        feature: USAGE_FEATURES.VOICE,
        tokens,
        estimatedCost: estimateCost(result.model, {
          promptTokens: tokens,
          completionTokens: 0,
        }),
        traceId: options.parentTraceId,
        modelUsage: [
          buildModelUsageEntry(result.model, {
            promptTokens: tokens,
            completionTokens: 0,
            totalTokens: tokens,
            estimatedCostUsd: estimateCost(result.model, {
              promptTokens: tokens,
              completionTokens: 0,
            }),
          }),
        ],
      });

      return {
        transcript: result.transcript,
      };
    } catch (error) {
      logger.warn('Audio transcription failed', {
        event: 'audio_transcription_failed',
        code: error?.code,
        status: error?.status,
        name: error?.name,
      });

      throw toProviderError(error);
    }
  }

  async synthesizeSpeech({ text }, options = {}) {
    try {
      const result = await textToSpeech.synthesize({
        text,
        metadata: {
          parentTraceId: options.parentTraceId,
        },
      });
      const tokens = estimateTextTokens(text);
      await usageService.recordUsageEvent({
        userId: options.userId,
        feature: USAGE_FEATURES.VOICE,
        tokens,
        estimatedCost: estimateCost(result.model, {
          promptTokens: tokens,
          completionTokens: 0,
        }),
        traceId: options.parentTraceId,
        modelUsage: [
          buildModelUsageEntry(result.model, {
            promptTokens: tokens,
            completionTokens: 0,
            totalTokens: tokens,
            estimatedCostUsd: estimateCost(result.model, {
              promptTokens: tokens,
              completionTokens: 0,
            }),
          }),
        ],
      });

      return result;
    } catch (error) {
      logger.warn('Audio speech generation failed', {
        event: 'audio_speech_generation_failed',
        code: error?.code,
        status: error?.status,
        name: error?.name,
      });

      throw toProviderError(error, 'speech');
    }
  }
}

export { estimateTextTokens, toProviderError };
export default new AudioService();
