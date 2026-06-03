import conversationQueries from '../db/queries/conversation.queries.js';
import reservationService from './reservation.service.js';
import logger from '../utils/logger.js';
import HttpError from '../utils/httpError.js';
import { buildChatMessages } from '../ai/prompts/prompt.builder.js';

const RECENT_EXCHANGE_LIMIT = 10;
const CONVERSATION_LOAD_LIMIT = 100;

function normalizeUserId(userId) {
  return userId === undefined || userId === null ? null : Number(userId);
}

class ConversationMemoryService {
  async assertCanAccess(conversationId, userId) {
    if (!conversationId || userId === undefined || userId === null) {
      return;
    }

    const ownerId = await conversationQueries.getOwner(conversationId);

    if (ownerId !== null && String(ownerId) !== String(userId)) {
      throw new HttpError(404, 'Conversation not found', { code: 'NOT_FOUND' });
    }
  }

  async buildConversationContext(currentMessage, conversationId, { userId } = {}) {
    const history = [];
    const normalizedUserId = normalizeUserId(userId);
    await this.assertCanAccess(conversationId, normalizedUserId);

    try {
      const lastMessages = normalizedUserId === null
        ? await conversationQueries.getLastMessages(conversationId, RECENT_EXCHANGE_LIMIT)
        : await conversationQueries.getLastMessages(conversationId, RECENT_EXCHANGE_LIMIT, normalizedUserId);

      for (const msg of lastMessages) {
        if (msg.user_input) {
          history.push({ role: 'user', content: msg.user_input });
        }

        if (msg.ai_output) {
          history.push({ role: 'assistant', content: msg.ai_output });
        }
      }
    } catch (error) {
      logger.warn('Failed to retrieve conversation history', {
        conversationId,
        error: error.message,
      });
    }

    return buildChatMessages({
      userMessage: currentMessage,
      history,
    });
  }

  async saveExchange(conversationId, userInput, aiOutput, { userId, metadata } = {}) {
    try {
      const normalizedUserId = normalizeUserId(userId);
      const hasMetadata = metadata && typeof metadata === 'object' && Object.keys(metadata).length > 0;
      if (normalizedUserId === null) {
        if (hasMetadata) {
          await conversationQueries.saveMessage(conversationId, userInput, aiOutput, undefined, metadata);
        } else {
          await conversationQueries.saveMessage(conversationId, userInput, aiOutput);
        }
      } else {
        if (hasMetadata) {
          await conversationQueries.saveMessage(conversationId, userInput, aiOutput, normalizedUserId, metadata);
        } else {
          await conversationQueries.saveMessage(conversationId, userInput, aiOutput, normalizedUserId);
        }
      }
    } catch (dbError) {
      logger.warn('Failed to save chat message to database', {
        conversationId,
        error: dbError.message,
      });
    }
  }

  async getLatestConversationForUser(userId) {
    const normalizedUserId = normalizeUserId(userId);

    if (normalizedUserId === null || Number.isNaN(normalizedUserId)) {
      throw new HttpError(400, 'User ID is required', { code: 'VALIDATION_ERROR' });
    }

    const conversationId = await conversationQueries.getLatestByUserId(normalizedUserId);

    if (!conversationId) {
      return {
        conversationId: null,
        messages: [],
      };
    }

    const messages = await this.getConversationMessages(conversationId, { userId: normalizedUserId });
    const conversationMetadata = await conversationQueries.getMetadata(conversationId, normalizedUserId);
    const reservation = await reservationService.getLatestReservationForConversation(conversationId, {
      userId: normalizedUserId,
    });
    const meta = {
      ...(conversationMetadata || {}),
      ...(reservation ? { reservation } : {}),
    };

    return {
      conversationId,
      messages,
      ...(Object.keys(meta).length ? { meta } : {}),
    };
  }

  async getConversationForUser(conversationId, userId) {
    const normalizedUserId = normalizeUserId(userId);
    const messages = await this.getConversationMessages(conversationId, { userId: normalizedUserId });
    const conversationMetadata = await conversationQueries.getMetadata(conversationId, normalizedUserId);
    const reservation = await reservationService.getLatestReservationForConversation(conversationId, {
      userId: normalizedUserId,
    });
    const meta = {
      ...(conversationMetadata || {}),
      ...(reservation ? { reservation } : {}),
    };

    return {
      conversationId,
      messages,
      ...(Object.keys(meta).length ? { meta } : {}),
    };
  }

  async getConversationMessages(conversationId, { userId } = {}) {
    if (!conversationId) {
      throw new HttpError(400, 'Conversation ID is required', { code: 'VALIDATION_ERROR' });
    }

    const normalizedUserId = normalizeUserId(userId);
    await this.assertCanAccess(conversationId, normalizedUserId);

    const rows = normalizedUserId === null
      ? await conversationQueries.getByConversationId(conversationId, CONVERSATION_LOAD_LIMIT)
      : await conversationQueries.getByConversationId(conversationId, CONVERSATION_LOAD_LIMIT, normalizedUserId);

    return rows.flatMap((row) => [
      {
        role: 'user',
        content: row.user_input,
        createdAt: row.created_at,
      },
      {
        role: 'assistant',
        content: row.ai_output,
        createdAt: row.created_at,
      },
    ]);
  }
}

export default new ConversationMemoryService();
