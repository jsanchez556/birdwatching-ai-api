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

Table: `conversation_summaries`

Added by `026_create_conversation_summaries.sql`. Summary rows are immutable
and versioned per conversation. They store the validated structured JSON,
schema/prompt version, cumulative compacted message-row IDs, source token
count, previous summary version, and creation time. Original `messages` rows
are not deleted or rewritten by compaction.

Indexes:
- `idx_conversations_created_at`
- `idx_messages_created_at`
- `idx_messages_conversation_created_at`

SQL helper functions are defined in `src/db/migrations/002_create_functions.sql`.
Query modules call those functions instead of embedding most persistence SQL directly.
`006_add_user_ownership.sql` replaces the conversation helpers with
owner-aware signatures, and `007_save_conversation_metadata.sql` replaces
`save_message(...)` again so chat-level JSONB metadata is merged into
`conversations.metadata` when an exchange is saved. `015_reservations_refactor.sql`
adds queryable conversation type/source columns and updates `save_message(...)`
to copy those values from safe metadata while preserving reservation-entry chat
state.

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
- `getMessagesForCompaction(...)` loads a bounded chronological candidate set
  scoped to the authenticated owner (or to an unowned visitor conversation).
- Once the active summary plus uncompacted exchanges exceed
  `CONVERSATION_COMPACTION_TOKEN_THRESHOLD`, older exchanges are summarized
  and the configured recent exchanges remain verbatim.
- `getLatestSummary(...)` loads only the newest validated version. Malformed
  persisted summaries are rejected and not injected.
- If candidate loading, Structured Outputs, validation, or persistence fails,
  chat continues with the previous validated summary and uncompacted messages.

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

## ContextBuilder Memory Boundary

`src/ai/context/contextBuilder.js` is now the selection and budgeting boundary
for conversation messages and optional memory. Recent PostgreSQL exchanges
remain the transcript source of truth, but recency alone does not determine
which verbatim messages enter the prompt. Historical messages are ranked by
semantic relevance to the current request, position-based recency, business
importance, and unresolved status. Explicit user corrections, confirmed
reservation details, unresolved commitments, and safety-critical constraints
are mandatory context; the current request is always mandatory. Selection
metrics report mandatory message counts by preservation reason without
including message contents. The builder can accept a long-term
memory adapter, but the production default in
`src/ai/memory/longTermMemory.js` is deliberately a no-op.

No durable long-term user memory, profile inference, or memory-extraction write
path was added. Authenticated adapters must scope every retrieval by `userId`;
visitor requests do not call the adapter. Optional memory failures produce an
aggregate degraded-source metric and do not fail chat. Conflicting memories
are retained unless exactly one claim is verified, and unresolved conflict
counts contain no memory text.

## Structured Conversation Compaction

`conversationCompaction.service.js` coordinates threshold detection,
Structured Outputs summarization, optimistic versioned persistence, and prompt
history assembly. The summary schema preserves:

- the unresolved user goal;
- confirmed facts with stable role-specific source message IDs;
- explicit preferences and decisions;
- unresolved questions;
- pending actions and whether confirmation is required;
- the previous summary version.

The summarization prompt explicitly preserves user corrections, reservation
state, selected tours, participants, itinerary and transportation choices,
durable confirmations, indeterminate reservation outcomes, and pending tool
operations. Structured conversation/application state is supplied separately
from message text. A new summary must cite only current source message IDs or
IDs already carried by the previous summary.
