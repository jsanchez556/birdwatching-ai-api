# Context Trust, Freshness, and Isolation

Back to [Project Context](../CONTEXT.md). Provenance fields and prompt assembly are also described in [Architecture](./architecture.md) and [Prompting](./prompting.md).

## Normalized authority

`src/ai/context/contextTrustPolicy.js` normalizes every context candidate to this descending authority order:

1. `system_policy`
2. `business_rule`
3. `verified_database_record`
4. `validated_tool_result`
5. `current_user_statement`
6. `validated_rag_document`
7. `conversation_summary`
8. `explicit_user_memory`
9. `inferred_user_memory`
10. `unverified_external_content`
11. `model_generated_claim`

Missing or malformed trust metadata is conservative. Type and source boundaries
constrain normalization: assistant messages are always model claims, summaries
are derived evidence, and a tool result is valid only after successful context
validation. A caller cannot promote RAG or assistant content by declaring a
higher trust string.

User statements are authoritative for user intent, not for inventory, price,
availability, reservation status, or external facts. Those facts require current
database records or validated tool output.

## Conflicts

Conflicts are resolved after scope and validity checks. A uniquely higher-trust
item wins for operational or external facts. The latest explicit correction may
win only in a user-intent group containing user statements or memories. Equal
authority remains unresolved and causes clarification or authoritative refresh.

Every automated decision is attached to content-free provenance with its winner,
superseded item IDs, resolution reason, and timestamp. Superseded items are
excluded from model context but retained in trace/audit history.

## Scope boundaries

Items are global, tenant, user, or conversation scoped. Selection rejects tenant,
user, or conversation mismatches before budgeting. Conversation state stays in
its authorized conversation. Active explicit long-term memory may cross sessions
only for the same authenticated user. Anonymous context cannot become cross-
session memory.

Conversation, memory, reservation, and tool-reference ownership is also enforced
by existing query/database functions. RAG checks visibility, role, user allow/
deny lists, and optional tenant ownership. Retrieval cache keys include tenant,
user, role, filters, and pipeline version. Tool-result references are opaque,
conversation/user scoped, and expiring.

The application currently has no tenant persistence model. Tenant checks apply
when authorized `tenantId` metadata exists; an unauthenticated caller cannot
supply an authoritative tenant identity.

## Source safeguards and freshness

- Memory extraction accepts only an attributable current `user` message.
  Assistant output and summaries cannot create or strengthen memory.
- RAG applies metadata, permission, effective-date, and expiry filtering first.
  Temporary operational document types require expiration. Retrieved passages
  are quoted JSON inside data delimiters, so embedded instructions, role text,
  policies, and tool requests remain data.
- Tool output is promoted only after complete success, known-schema and required-
  identifier validation, ownership scope, retrieval timestamp, and expiry. Failed,
  cancelled, timed-out, partial, malformed, and schema-invalid output remains
  diagnostic trace metadata and is excluded from prompts and result storage.
- Search results expire after 15 minutes, availability after 2 minutes, pricing
  after 5 minutes, and transfer estimates after 15 minutes.
- Booking requires the expected structured-state version. The PostgreSQL booking
  function locks and re-reads state, current inventory, and current database
  pricing in one transaction. Stale state is retryable; insufficient inventory
  rejects booking; failure never confirms the state.

## Observability and compatibility

Internal context and LLM traces receive content-free trust, scope, expiry,
transformation, and conflict-decision provenance. Scope identifiers are hashed.
Raw context, authorization details, trust rankings, and provenance do not enter
public response envelopes.

These safeguards are request-scoped and require no migration. Existing public
HTTP envelopes and reservation contracts remain unchanged.
