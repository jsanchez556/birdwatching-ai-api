import conversationQueries from '../db/queries/conversation.queries.js';
import logger from '../utils/logger.js';
import HttpError from '../utils/httpError.js';
import { CHAT_SYSTEM_PROMPT } from '../ai/prompts/system.prompt.js';

const RECENT_EXCHANGE_LIMIT = 10;
const CONVERSATION_LOAD_LIMIT = 100;

class ConversationMemoryService {
  async buildConversationContext(currentMessage, conversationId) {
    const messages = [
      {
        role: 'system',
        content: CHAT_SYSTEM_PROMPT,
      },
    ];

    try {
      const lastMessages = await conversationQueries.getLastMessages(
        conversationId,
        RECENT_EXCHANGE_LIMIT
      );

      for (const msg of lastMessages) {
        if (msg.user_input) {
          messages.push({ role: 'user', content: msg.user_input });
        }

        if (msg.ai_output) {
          messages.push({ role: 'assistant', content: msg.ai_output });
        }
      }
    } catch (error) {
      logger.warn('Failed to retrieve conversation history', {
        conversationId,
        error: error.message,
      });
    }

    messages.push({ role: 'user', content: currentMessage });
    return messages;
  }

  async saveExchange(conversationId, userInput, aiOutput) {
    try {
      await conversationQueries.saveMessage(conversationId, userInput, aiOutput);
    } catch (dbError) {
      logger.warn('Failed to save chat message to database', {
        conversationId,
        error: dbError.message,
      });
    }
  }

  async getConversationMessages(conversationId) {
    if (!conversationId) {
      throw new HttpError(400, 'Conversation ID is required', { code: 'VALIDATION_ERROR' });
    }

    const rows = await conversationQueries.getByConversationId(
      conversationId,
      CONVERSATION_LOAD_LIMIT
    );

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
