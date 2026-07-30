# Graceful Degradation

Back to [Project Context](../CONTEXT.md). The normalized envelope remains
authoritative; degradation does not introduce a second response envelope.

## Response contract

Successful AI response data includes:

```json
{
  "degradedMode": false,
  "unavailableCapabilities": []
}
```

When a truthful, useful fallback completes the request, `success` remains
`true`, `degradedMode` is `true`, and `unavailableCapabilities` contains every
capability that failed. Values are deduplicated and always ordered as listed
below. Streamed chat exposes the fields in the `done` event beside
`conversationId`, `response`, `sources`, and `meta`.

A degraded success means that the returned fallback completed a limited
operation. It does not mean that the unavailable operation succeeded. If no
meaningful fallback exists, the request uses the existing normalized error
response instead.

## Capability identifiers and policies

| Identifier | Fallback |
|---|---|
| `rag_recommendations` | Omit retrieved sources and RAG claims. Return only deterministic limited-service text or verified structured tour, pricing, availability, or reservation data already returned by platform tools. |
| `advanced_model` | Use the configured compatible model route. If all routes fail, return deterministic text only when completed structured tool results remain useful; otherwise preserve the normal model error. |
| `voice_service` | If transcription is unavailable and no transcript exists, ask the user to type. If speech generation or audio storage fails after chat completes, return the text answer without an audio URL. |
| `image_analysis` | Return no match and no candidates. Ask for size, colors, bill shape, behavior, habitat, location, and observation date. |
| `reservation_tool` | Preserve discovery, tour details, and booking guidance, but state that booking is unavailable. Remove confirmation metadata and never issue a confirmation identifier for the failed attempt. |

## Error distinction

Timeouts, connection failures, temporary provider failures, invalid provider
responses, open circuit breakers, and missing provider configuration may
activate degradation at the owning service or orchestration boundary.

Malformed client requests, authentication and authorization failures, quota
validation, and business validation such as invalid reservation fields remain
normal client errors. They are not converted into degraded successes.

Operational telemetry records one safe `capability_degraded` event (or the
existing retrieval failure event) with the stable capability identifier and a
coarse classification such as `timeout`, `connection_failure`,
`invalid_provider_response`, or `missing_configuration`. Provider messages,
prompts, customer content, credentials, and stack traces are not included.

