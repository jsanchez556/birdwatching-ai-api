# Memory

Back to [Project Context](../CONTEXT.md). See [Prompting](./prompting.md) for role-message construction.

## Current Memory Model
Conversation memory is PostgreSQL-backed short-term chat history. It is separate from the pgvector RAG knowledge store and does not currently store user profiles, preferences, embeddings, or long-term semantic memory.

## Storage
Table: `conversations`

Defined in `src/db/migrations/001_create_chat_interactions.sql` and extended
by later migrations.

Columns:
- `id`
- `conversation_id`
- `user_id`, converted to `BIGINT` in `006_add_user_ownership.sql` and referencing `users(id)` with `ON DELETE SET NULL`
- `title`
- `last_message_at`
- `metadata`, JSONB defaulting to `{}` and used for frontend-safe chat-level state
- `conversation_type`, defaulting to `regular`; reservation-entry chats use `reservation_entry`
- `conversation_source`, currently used for homepage/cart reservation entry sources such as `featured_tour` and `tour_cart`
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
`006_add_user_ownership.sql` replaces the conversation helpers with
owner-aware signatures, and `007_save_conversation_metadata.sql` replaces
`save_message(...)` again so chat-level JSONB metadata is merged into
`conversations.metadata` when an exchange is saved. `015_add_conversation_type.sql`
adds queryable conversation type/source columns and updates `save_message(...)`
to copy those values from safe metadata.

## Write Behavior
`conversation.service.saveExchange(...)` writes one row per user/assistant exchange after OpenAI returns a chat response.

`conversation.queries.saveMessage(...)` calls `save_message(...)`, which checks
conversation ownership when a user ID is supplied, calls
`ensure_conversation(...)` so the parent conversation row exists, inserts the
message, updates `last_message_at`, and merges safe metadata into
`conversations.metadata`.

Write failures are logged as warnings and do not fail the chat request. This keeps chat available during transient database issues but means memory can be incomplete.

## Read Behavior
For prompt context:
- `getLastMessages(conversationId, 10, userId)` loads up to 10 recent exchanges, optionally scoped to the authenticated owner.
- SQL limits the newest exchanges and returns them in chronological order before prompt construction.

For client retrieval:
- `getByConversationId(conversationId, 100, userId)` returns up to 100 exchanges oldest first, optionally scoped to the authenticated owner.
- The service expands each row into alternating `{ role, content, createdAt }` messages.
- `getLatestByUserId(userId)` finds the latest owned regular conversation by `last_message_at DESC NULLS LAST, created_at DESC`, then the service loads messages and returns persisted chat-level metadata.
- Reservation-entry conversations remain loadable by explicit conversation ID for the owner, but are skipped by latest-conversation hydration.

## Future Memory Extensions
If adding long-term memory or user-specific retrieval:
- keep the existing short-term exchange table as the source of chat transcript truth
- add separate tables for user preferences or user-specific memories instead of mixing them into RAG knowledge chunks
- include source references for any retrieved birding/location content
- keep reservation `conversation_id` as a linkage field for booking context, not as a replacement for chat transcript storage
- update prompt construction in `conversation.service.js`, not controllers
- add tests that prove cross-conversation leakage is impossible
