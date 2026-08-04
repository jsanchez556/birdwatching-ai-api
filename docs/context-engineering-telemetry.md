# Context-engineering telemetry

`ContextBuilder` is the canonical measurement boundary. Planning and generation
assemblies emit content-free metrics through the existing AI trace hierarchy;
the final LLM span carries the same normalized context telemetry. The root AI
trace ID correlates both stages. Dashboard aggregation groups by that correlation
ID and uses at most one successful generation record per request, so planning
does not double-count request metrics.

## Trace fields

All counts are non-negative integers, booleans are explicit, and a missing
summary is `null`.

| Field | Meaning |
| --- | --- |
| `candidateContextItems` | Items evaluated before validity, freshness, scope, deduplication, conflict, and budget exclusions. Conversation items replaced by compaction remain candidates for accounting. |
| `selectedContextItems` | Items included in the final provider context. |
| `discardedContextItems` | Candidates not selected for any reason; always `candidateContextItems - selectedContextItems`. |
| `inputTokens` | Selected input tokens. Context assembly reports an estimate; the successful final LLM span can replace it with provider-reported prompt usage. `inputTokenSource` is `estimated` or `actual`. |
| `tokensByContextType` | Selected estimated tokens under exactly `instructions`, `conversation`, `memories`, `rag`, `toolResults`, and `applicationState`. Provider usage does not expose section-level actuals. |
| `compactionTriggered` | Conversation-summary or tool-result compaction affected the request context. |
| `summaryVersion` | Selected validated conversation-summary version, otherwise `null`. |
| `memoriesRetrieved` | Eligible long-term memories returned before final context budgeting. |
| `ragChunksSelected` | Chunks surviving the complete RAG filter, dedupe, rerank, compression, and budget pipeline. |
| `toolResultsCompacted` | Validated tool results compacted before context selection. |
| `contextBuildLatency` | Context assembly elapsed time in milliseconds. |

Malformed values fail closed to zero/null and can never create negative counts.
Failures use one of `context_assembly`, `validation`, `scope`, `freshness`,
`compaction`, or `budgeting`.

## Admin metrics

`GET /admin/context-engineering` uses the existing JWT `requireAuth` and
`requireAdmin` middleware and the standard UTC half-open reporting window. It
returns aggregate values only in `{ success, data, meta }`.

- Average input tokens = final-generation input tokens / final-generation requests.
- Context cost per request = estimated input-token cost / priced eligible final-generation requests. The model pricing registry supplies prices; the metric is unavailable if the window cannot be priced completely.
- RAG context utilization = RAG-eligible final-generation requests with at least one selected chunk / RAG-eligible final-generation requests.
- Memory retrieval rate = authenticated memory-eligible final-generation requests with at least one eligible retrieved memory / authenticated memory-eligible final-generation requests.
- Compaction frequency = final-generation requests with conversation or tool compaction / final-generation requests.
- Context-related failure rate = correlated requests with a context failure / correlated eligible requests.

Each metric returns `status`, `numerator`, `denominator`, `value`, and `rate`.
When its denominator is empty, status is `unavailable` and numerator/value/rate
are `null`; missing observations are never displayed as zero success or failure.

## Privacy, retention, and degradation

LangSmith receives bounded numeric telemetry, stage/correlation metadata, and
content-free provenance only. Raw prompts, messages, memories, RAG text, tool
payloads, customer fields, secrets, and raw context errors are excluded by the
central tracing sanitizer. Export failures are logged as safe operational events
and never fail chat.

The dashboard reads the existing bounded in-process telemetry ring (2,000
records), so it represents the current API instance and is cleared on restart.
LangSmith remains the optional cross-request trace export, not a runtime
dependency. Multi-replica durable aggregation would require an approved shared
telemetry store and retention policy. No database migration is required by this
implementation, and existing public chat envelopes are unchanged.
