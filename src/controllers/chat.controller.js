import chatService from '../services/chat.service.js';
import { endSse, sendSseEvent, setSseHeaders } from '../streaming/sse.js';
import { sendSuccess } from '../utils/apiResponse.js';
import logger from '../utils/logger.js';

function isAbortError(error) {
  return error?.name === 'AbortError' || error?.code === 'ABORT_ERR';
}

class ChatController {
  async handleStreamChat(req, res) {
    const clientIP = req.ip || req.connection.remoteAddress;
    const {
      message,
      conversationId,
      customerContext,
      conversationContext,
      role,
    } = req.body;
    const abortController = new AbortController();
    let streamCompleted = false;

    logger.info('Streaming chat request received', {
      ip: clientIP,
      conversationId,
      messageLength: message.length,
    });

    setSseHeaders(res);

    res.on('close', () => {
      if (streamCompleted || abortController.signal.aborted) {
        return;
      }

      logger.info('Streaming chat client disconnected', {
        conversationId,
      });
      abortController.abort();
    });

    try {
      const result = await chatService.processMessageStream(
        message,
        conversationId,
        clientIP,
        {
          onStart: (data) => sendSseEvent(res, 'start', data),
          onChunk: (content) => sendSseEvent(res, 'chunk', { content }),
          onReplace: (content) => sendSseEvent(res, 'replace', { content }),
        },
        {
          signal: abortController.signal,
          customerContext,
          conversationContext,
          authUser: req.user,
          role,
        }
      );

      sendSseEvent(res, 'done', {
        conversationId: result.conversationId,
        response: result.response,
        sources: result.sources || [],
        meta: result.meta || {},
      });
    } catch (error) {
      if (abortController.signal.aborted || isAbortError(error)) {
        logger.info('Streaming chat cancelled', {
          conversationId,
        });
        return;
      }

      logger.error('Streaming chat failed', {
        conversationId,
        error: error.message,
      });
      sendSseEvent(res, 'error', {
        code: error.code || 'STREAM_ERROR',
        message: error.status && error.status < 500
          ? error.message
          : 'Unable to stream chat response right now.',
      });
    } finally {
      streamCompleted = true;
      endSse(res);
    }
  }

  async handleGetLatestConversation(req, res) {
    logger.info('Latest conversation load requested', {
      authenticated: Boolean(req.user),
    });

    const result = await chatService.getLatestConversation(req.user);
    const { meta = {}, ...data } = result;
    return sendSuccess(res, data, meta);
  }

  async handleGetConversation(req, res) {
    const { conversationId } = req.params;

    logger.info('Conversation load requested', {
      conversationId,
      authenticated: Boolean(req.user),
    });

    const result = await chatService.getConversation(conversationId, req.user);
    const { meta = {}, ...data } = result;
    return sendSuccess(res, data, meta);
  }
}

export default new ChatController();
