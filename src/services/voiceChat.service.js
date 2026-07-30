import audioService from './audio.service.js';
import chatService from './chat.service.js';
import voiceChatAudioStorage from './voiceChatAudioStorage.service.js';
import { withAiTrace } from '../tracing/aiTracing.middleware.js';
import HttpError from '../utils/httpError.js';
import logger from '../utils/logger.js';
import {
  UNAVAILABLE_CAPABILITIES,
  classifyCapabilityFailure,
  markCapabilityUnavailable,
  withDegradationMetadata,
} from '../utils/degradation.utils.js';

const TYPE_REQUEST_FALLBACK =
  'Voice transcription is temporarily unavailable. Please type your request so I can continue through text chat.';

function assertNonEmptyText(value, message, code) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new HttpError(502, message, { code });
  }

  return value.trim();
}

class VoiceChatService {
  async process({ audioUpload, context = {} }) {
    return withAiTrace({
      type: 'ai_execution_flow',
      name: 'voice_chat',
      metadata: {
        conversationId: context.conversationId,
        role: context.role,
        audioMimeType: audioUpload.mimeType,
        audioBytes: audioUpload.buffer.length,
        parentTraceId: context.parentTraceId,
        aiTraceId: context.aiTraceId,
      },
      traceId: context.aiTraceId,
      parentTraceId: context.parentTraceId,
      outputMetadata: (result = {}) => ({
        conversationId: result.conversationId,
        transcriptLength: result.transcript?.length || 0,
        answerLength: result.answer?.length || 0,
        hasAudioResponseUrl: Boolean(result.audioResponseUrl),
      }),
    }, async (trace) => {
      let normalizedTranscript;

      try {
        const { transcript } = await audioService.transcribe(audioUpload, {
          parentTraceId: trace.id,
          userId: context.authUser?.id,
        });
        normalizedTranscript = assertNonEmptyText(
          transcript,
          'Speech transcription returned no usable text.',
          'EMPTY_TRANSCRIPT'
        );
      } catch (error) {
        if (!classifyCapabilityFailure(error).recoverable) throw error;
        const degradation = {};
        markCapabilityUnavailable(
          degradation,
          UNAVAILABLE_CAPABILITIES.VOICE_SERVICE,
          error,
          {
            context: {
              aiTraceId: context.aiTraceId,
              traceId: trace.id,
            },
          }
        );
        return withDegradationMetadata({
          transcript: null,
          answer: TYPE_REQUEST_FALLBACK,
          audioResponseUrl: null,
          conversationId: context.conversationId || null,
        }, degradation);
      }

      const chatResult = await chatService.processMessageStream(
        normalizedTranscript,
        context.conversationId,
        context.clientIP,
        {
          onStart: () => {},
          onChunk: () => {},
          onReplace: () => {},
        },
        {
          customerContext: context.customerContext,
          conversationContext: context.conversationContext,
          authUser: context.authUser,
          role: context.role,
          responseMode: context.responseMode,
          source: 'voice',
          parentTraceId: trace.id,
          aiTraceId: context.aiTraceId || trace.id,
        }
      );

      const answer = assertNonEmptyText(
        chatResult.response,
        'Chat response returned no usable text.',
        'EMPTY_CHAT_RESPONSE'
      );
      let speech;
      let storedAudio;

      try {
        speech = await audioService.synthesizeSpeech({ text: answer }, {
          parentTraceId: trace.id,
          userId: context.authUser?.id,
        });
        storedAudio = await voiceChatAudioStorage.uploadSpeechResponse(speech);
      } catch (error) {
        if (!classifyCapabilityFailure(error).recoverable) throw error;
        const degradation = {};
        markCapabilityUnavailable(
          degradation,
          UNAVAILABLE_CAPABILITIES.VOICE_SERVICE,
          error,
          {
            context: {
              aiTraceId: context.aiTraceId,
              traceId: trace.id,
            },
          }
        );
        return withDegradationMetadata({
          transcript: normalizedTranscript,
          answer: `${answer}\n\nAudio playback is temporarily unavailable, but the text response is complete.`,
          audioResponseUrl: null,
          conversationId: chatResult.conversationId,
        }, chatResult, degradation);
      }

      logger.info('Voice chat completed', {
        event: 'voice_chat_completed',
        conversationId: chatResult.conversationId,
        transcriptLength: normalizedTranscript.length,
        answerLength: answer.length,
        audioBytes: speech.audio.length,
      });

      return withDegradationMetadata({
        transcript: normalizedTranscript,
        answer,
        audioResponseUrl: storedAudio.audioResponseUrl,
        conversationId: chatResult.conversationId,
      }, chatResult);
    });
  }
}

export { TYPE_REQUEST_FALLBACK, assertNonEmptyText };
export default new VoiceChatService();
