import audioService from './audio.service.js';
import chatService from './chat.service.js';
import voiceChatAudioStorage from './voiceChatAudioStorage.service.js';
import { withAiTrace } from '../tracing/aiTracing.middleware.js';
import HttpError from '../utils/httpError.js';
import logger from '../utils/logger.js';

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
      },
      parentTraceId: context.parentTraceId,
      outputMetadata: (result = {}) => ({
        conversationId: result.conversationId,
        transcriptLength: result.transcript?.length || 0,
        answerLength: result.answer?.length || 0,
        hasAudioResponseUrl: Boolean(result.audioResponseUrl),
      }),
    }, async (trace) => {
      const { transcript } = await audioService.transcribe(audioUpload, {
        parentTraceId: trace.id,
        userId: context.authUser?.id,
      });
      const normalizedTranscript = assertNonEmptyText(
        transcript,
        'Speech transcription returned no usable text.',
        'EMPTY_TRANSCRIPT'
      );

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
        }
      );

      const answer = assertNonEmptyText(
        chatResult.response,
        'Chat response returned no usable text.',
        'EMPTY_CHAT_RESPONSE'
      );
      const speech = await audioService.synthesizeSpeech({ text: answer }, {
        parentTraceId: trace.id,
        userId: context.authUser?.id,
      });
      const storedAudio = await voiceChatAudioStorage.uploadSpeechResponse(speech);

      logger.info('Voice chat completed', {
        event: 'voice_chat_completed',
        conversationId: chatResult.conversationId,
        transcriptLength: normalizedTranscript.length,
        answerLength: answer.length,
        audioBytes: speech.audio.length,
      });

      return {
        transcript: normalizedTranscript,
        answer,
        audioResponseUrl: storedAudio.audioResponseUrl,
        conversationId: chatResult.conversationId,
      };
    });
  }
}

export { assertNonEmptyText };
export default new VoiceChatService();
