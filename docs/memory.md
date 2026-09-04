# Memory

Back to [Project Context](../CONTEXT.md). See [Prompting](./prompting.md) for role-message construction.

## Current Memory Model
Memory has two separate PostgreSQL-backed layers: owner-scoped conversation
history for short-term continuity and a conservative structured memory store
for authenticated users. Both are separate from pgvector RAG and operational
reservation state.

## Storage
Table: `conversations`

Defined in `src/db/migrations/001_schema.sql`.

Columns:
- `id`
- `conversation_id`
- `user_id`, referencing `users(id)` with `ON DELETE SET NULL`
- `title`
- `last_message_at`
- `metadata`, JSONB defaulting to `{}` and used for frontend-safe chat-level state
- `conversation_type`, defaulting to `regular`; reservation-entry chats use `reservation_entry`
- `conversation_source`, currently used for homepage/cart reservation entry sources such as `featured_tour` and `tour_cart`
- `created_at`

Table: `messages`

Defined in `src/db/migrations/001_schema.sql`.

Columns:
- `id`
- `conversation_id`, referencing `conversations(conversation_id)` with cascade delete
- `user_input`
- `ai_output`
- `created_at`

Table: `conversation_summaries`

Defined in `001_schema.sql`. Summary rows are immutable
and versioned per conversation. They store the validated structured JSON,
schema/prompt version, cumulative compacted message-row IDs, source token
count, previous summary version, and creation time. Original `messages` rows
are not deleted or rewritten by compaction.

Indexes:
- `idx_conversations_created_at`
- `idx_messages_created_at`
- `idx_messages_conversation_created_at`

SQL helper functions are defined in `src/db/migrations/003_functions.sql`.
Query modules call those functions instead of embedding persistence writes.
The owner-aware `save_message(...)` contract merges chat-level JSONB metadata
into `conversations.metadata` and copies queryable conversation type/source
values while preserving reservation-entry chat state.

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

## Durable User Memory

Reservation operational state is stored separately from transcripts and summaries as documented in [Durable Reservation Conversation State](./reservation-state.md). Conversation history may help the model converse naturally, but it is not an operational booking source of truth.

`001_schema.sql` defines `user_memories`. Each row belongs
to one authenticated user and contains an allowlisted category, concise
content, confidence, source message ID, creation/optional expiration timestamp,
and user-editable flag. An active-content fingerprint makes repeated identical
extraction idempotent. Explicit corrections create a new row and mark only
identified same-category rows inactive with `superseded_by_id`, preserving the
old record without injecting it into future prompts.

The consolidated schema includes a semantic
`conflict_key`, resolution reason, and supersession timestamp. A correction is
promoted only when incompatible memories share a category/axis and the current
message contains explicit correction language such as "actually", "now",
"instead", or "no longer" with confidence of at least `0.90`. The database
then inserts the new active row and marks the referenced rows inactive in one
transaction. Both rows remain available through the owner-scoped internal
history query with resolution `explicit_recent_correction`.

If a conflict is plausible but correction intent or confidence is insufficient,
no mutation occurs. Extraction runs before authenticated response generation,
and ContextBuilder adds a required instruction to ask one concise clarification
question before relying on either value. Already-persisted active memories with
the same conflict key receive the same unresolved treatment; recency alone
never silently chooses a winner.

The model and deterministic validator accept only direct, unambiguous
statements that are stable, safe, useful in future sessions, and at least
`0.85` confidence. Allowed categories are preferences, accessibility
requirements, recurring travel constraints, bird interests, preferred
language, and budget ranges. Greetings, weather, one-off requests,
availability, reservation values, contact details, credentials, payment data,
exact addresses, and weak behavioral inferences are rejected. One expensive
booking, for example, does not establish a luxury preference.

Extraction is prepared before generation but is committed only after the
authenticated exchange is durably saved, providing its source message ID. The
database function takes a per-user transaction lock, validates source ownership
and supersession IDs, and inserts/deactivates atomically. Optional extraction
or storage failure does not fail the chat response.

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
including message contents. The production adapter in
`src/ai/memory/longTermMemory.js` loads only active, non-expired memories for
the authenticated `userId`; visitor requests do not query the store. It removes
values below `0.85` confidence, older than 730 days, expired values, and
malformed timestamps. It embeds the request and eligible memory content in one
cached batch, requires cosine similarity of at least `0.45`, ranks by semantic
similarity, confidence, and recency, and removes normalized duplicates. At most
ten memories and 256 estimated content tokens leave the adapter; ContextBuilder
then applies its model/task memory budget including item overhead.

Returned items retain the memory row and source message IDs, category,
confidence, creation/expiration timestamps, semantic and recency scores, and
editability metadata. Context provenance exposes safe identifiers and selection
decisions without exposing memory text through public APIs or telemetry.
Memories are optional context and never reservation or booking arguments.
Optional memory failures produce an
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
state, selected tours, participants, itinerary and transfer choices,
durable confirmations, indeterminate reservation outcomes, and pending tool
operations. Structured conversation/application state is supplied separately
from message text. A new summary must cite only current source message IDs or
IDs already carried by the previous summary.
