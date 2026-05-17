# Memory

Back to [Project Context](../CONTEXT.md). See [Prompting](./prompting.md) for role-message construction.

## Current Memory Model
Conversation memory is PostgreSQL-backed short-term chat history. It is separate from the pgvector RAG knowledge store and does not currently store user profiles, preferences, embeddings, or long-term semantic memory.

## Storage
Table: `conversations`

Defined in `src/db/migrations/001_create_chat_interactions.sql`.

Columns:
- `id`
- `conversation_id`
- `user_id`
- `title`
- `last_message_at`
- `metadata`
- `created_at`

Table: `messages`

Defined in `src/db/migrations/001_create_chat_interactions.sql`.

Columns:
- `id`
- `conversation_id`, referencing `conversations(conversation_id)` with cascade delete
- `user_input`
- `ai_output`
- `created_at`

Indexes:
- `idx_conversations_created_at`
- `idx_messages_created_at`
- `idx_messages_conversation_created_at`

SQL helper functions are defined in `src/db/migrations/002_create_functions.sql`.
Query modules call those functions instead of embedding most persistence SQL directly.

## Write Behavior
`conversation.service.saveExchange(...)` writes one row per user/assistant exchange after OpenAI returns a chat response.

`conversation.queries.saveMessage(...)` calls `save_message(...)`, which first calls
`ensure_conversation(...)` so the parent conversation row exists, inserts the
message, and updates `last_message_at`.

Write failures are logged as warnings and do not fail the chat request. This keeps chat available during transient database issues but means memory can be incomplete.

## Read Behavior
For prompt context:
- `getLastMessages(conversationId, 10)` loads up to 10 recent exchanges.
- SQL limits the newest exchanges and returns them in chronological order before prompt construction.

For client retrieval:
- `getByConversationId(conversationId, 100)` returns up to 100 exchanges oldest first.
- The service expands each row into alternating `{ role, content, createdAt }` messages.

## Future Memory Extensions
If adding long-term memory or user-specific retrieval:
- keep the existing short-term exchange table as the source of chat transcript truth
- add separate tables for user preferences or user-specific memories instead of mixing them into RAG knowledge chunks
- include source references for any retrieved birding/location content
- keep reservation `conversation_id` as a linkage field for booking context, not as a replacement for chat transcript storage
- update prompt construction in `conversation.service.js`, not controllers
- add tests that prove cross-conversation leakage is impossible
