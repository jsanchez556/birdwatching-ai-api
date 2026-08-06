# Context-Engineering Test Coverage

Back to [Testing](./testing.md).

The context-engineering suite exercises deterministic application boundaries.
It uses frozen clocks, injected token estimators, in-memory reservation query
doubles, and mocked persistence/provider adapters. It does not use production
customer data, live model judgments, or booking side effects.

Run the focused suite with:

```bash
npm test -- --runInBand \
  __tests__/contextBuilder.test.js \
  __tests__/conversationCompaction.service.test.js \
  __tests__/reservationState.service.test.js \
  __tests__/reservationStateBooking.service.test.js \
  __tests__/longTermMemory.test.js \
  __tests__/userMemoryExtraction.service.test.js \
  __tests__/userMemory.service.test.js \
  __tests__/ragContextSelection.test.js \
  __tests__/contextPollutionSafeguards.test.js \
  __tests__/toolResultCompaction.test.js \
  __tests__/toolResultReference.queries.test.js \
  __tests__/contextProvenance.test.js
```

## Coverage map

| Boundary | Deterministic coverage |
| --- | --- |
| Budget limits, mandatory instructions/current request, optional prioritization, malformed counts, below/exact/over boundaries | `contextBuilder.test.js` |
| Relevant history, old-message reduction, structured summary validation and fallback | `contextBuilder.test.js`, `conversationCompaction.service.test.js`, `conversationMessageSelector.test.js` |
| Corrected participant state, proposals versus confirmed values, clearing, versions, concurrency, readiness, transitions, booking source of truth | `reservationState.service.test.js`, `reservationStateBooking.service.test.js`, `contextBuilder.test.js` |
| Active/relevant memory, inactive/expired/superseded exclusion, explicit corrections, weak inference rejection, unresolved conflict clarification | `longTermMemory.test.js`, `userMemoryExtraction.service.test.js`, `userMemory.service.test.js`, `contextBuilder.test.js` |
| RAG metadata/permission/freshness filtering, near-deduplication, reranking, citations, contradictions, prompt-injection isolation, trust precedence | `ragContextSelection.test.js`, `contextPollutionSafeguards.test.js` |
| Tool validation, failure-state exclusion, compaction, sensitive-field removal, totals/pagination/reference preservation, scoped retrieval | `toolResultCompaction.test.js`, `toolResultReference.queries.test.js`, `contextPollutionSafeguards.test.js` |
| Provenance fields, content hashes, transformations, freshness, conservative malformed metadata handling, non-serialization | `contextProvenance.test.js`, `contextPollutionSafeguards.test.js` |
| User, tenant, conversation, cache, RAG, memory, tool-reference, and anonymous/authenticated isolation | `contextPollutionSafeguards.test.js`, `toolResultReference.queries.test.js`, `conversation.service.test.js`, `userMemory.service.test.js` |

The participant correction contract is tested as both a state mutation and a
context-assembly invariant. After `We are three` followed by `Actually, make it
four`, the former value can remain in audit/compacted provenance, but the
operational application-state item contains only the latest confirmed value and
its current version. Booking tests separately assert that message-derived tool
arguments are ignored.

## Assumptions and intentional gaps

- `get_active_user_memories` is the primary persistence filter. The adapter also
  rejects inactive and superseded rows defensively if an invalid adapter result
  crosses that boundary.
- Tenant isolation is conditional because the application currently has no
  tenant persistence model; deterministic tests enforce tenant metadata when it
  is present.
- PostgreSQL row locks, transaction atomicity, and expiration predicates are
  covered by migration/query contract tests rather than a live database in the
  unit suite.
- Provider quality and live retrieval relevance are evaluation concerns, not
  assertions in this deterministic suite.
