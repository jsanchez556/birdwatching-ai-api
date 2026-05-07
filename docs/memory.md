# Memory

Back to [Project Context](../CONTEXT.md). See [Prompting](./prompting.md) for role-message construction.

## Current Memory Model
Conversation memory is PostgreSQL-backed short-term chat history. It is not a vector store and does not currently store user profiles, preferences, embeddings, or long-term semantic memory.

## Storage
Table: `messages`

Defined in `src/db/migrations/001_create_chat_interactions.sql`.

Columns:
- `id`
- `conversation_id`
- `user_input`
- `ai_output`
- `created_at`

Indexes:
- `idx_messages_created_at`
- `idx_messages_conversation_created_at`

## Write Behavior
`conversation.service.saveExchange(...)` writes one row per user/assistant exchange after OpenAI returns a chat response.

Write failures are logged as warnings and do not fail the chat request. This keeps chat available during transient database issues but means memory can be incomplete.

## Read Behavior
For prompt context:
- `getLastMessages(conversationId, 10)` loads up to 10 recent exchanges.
- SQL orders by newest first for the limit.
- The query helper reverses rows back into chronological order before prompt construction.

For client retrieval:
- `getByConversationId(conversationId, 100)` returns up to 100 exchanges oldest first.
- The service expands each row into alternating `{ role, content, createdAt }` messages.

## Future Memory Extensions
If adding long-term memory or retrieval:
- keep the existing short-term exchange table as the source of chat transcript truth
- add separate tables for user preferences or retrieved documents
- include source references for any retrieved birding/location content
- update prompt construction in `conversation.service.js`, not controllers
- add tests that prove cross-conversation leakage is impossible
