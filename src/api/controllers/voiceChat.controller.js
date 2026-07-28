import voiceChatService from '../../services/voiceChat.service.js';
import { sendSuccess } from '../../utils/apiResponse.js';

class VoiceChatController {
  async handleVoiceChat(req, res) {
    const result = await voiceChatService.process({
      audioUpload: req.audioUpload,
      context: {
        ...req.voiceChatContext,
        clientIP: req.ip || req.connection.remoteAddress,
        authUser: req.user,
        usageEventId: req.usageQuota?.usageEventId,
        parentTraceId: req.headers['x-ai-trace-id'],
        aiTraceId: req.aiTraceId,
      },
    });

    return sendSuccess(res, {
      transcript: result.transcript,
      answer: result.answer,
      audioResponseUrl: result.audioResponseUrl,
    }, {
      conversationId: result.conversationId,
      aiTraceId: req.aiTraceId,
    });
  }
}

export default new VoiceChatController();
