# API Contracts

## Nature tour categories and admin maintenance

Tours expose two distinct fields: `type` is the required customer-facing
activity category (`Birdwatching`, `Day walk`, `Night walk`,
`Day & Night Walk`, `Adventure`, `Excursion`, `Transfer`, or `Other`), while
`tourType` remains the `scheduled`/`unscheduled` booking mode. Rows that
predate the activity-category field were backfilled to `Birdwatching`;
retired category labels are not accepted for new writes or filters.

`GET /tours` accepts an optional exact `type` query and returns
`data: { tours, tourTypes }`. Invalid categories return `422 validation_error`.

Authenticated administrators can use `GET` and `POST` on these collections and
`GET`, `PATCH`, and `DELETE` on their `/:id` records:

- `/admin/countries`
- `/admin/zones`
- `/admin/nodes`
- `/admin/birds`
- `/admin/birds-by-node` (item IDs use `nodeId:birdId`)
- `/admin/tours`

Lists accept `search`, `page`, and `limit`; relevant resources also accept
`countryId`, `zoneId`, `nodeId`, or tour `type`. Responses use `data.items`
and `meta: { page, limit, total, totalPages }`. Creates return `201` with
`data.entity`; deletes return `data: { entity, archived }`. Countries are
deleted only when unreferenced; other maintenance records are archived.
Foreign-key conflicts return `409 REFERENTIAL_INTEGRITY_CONFLICT`.

Country records expose nullable `latitude`, `longitude`, and `zoom` for the
initial node-maintenance map view. Latitude accepts `-90..90`, longitude accepts
`-180..180`, and zoom must be an integer from `0..19`. Costa Rica is backfilled
to `9.75`, `-84.2`, zoom `7`. Incomplete viewport triplets are permitted by the
API; the frontend applies its documented fallback instead of treating values as
map constraints. Legacy north/south/east/west boundary fields are not part of
the schema or API contract.

Node creates require valid `lat` and `lon`. Tour create/update bodies do not
accept coordinate fields: the server resolves the selected `nodeId`, rejects a
node without coordinates with `422 NODE_COORDINATES_REQUIRED`, and persists the
node coordinates into the backward-compatible tour coordinate columns. Database
triggers keep those columns synchronized whenever the tour changes node or the
node marker moves.

`PUT /admin/tours/:tourId/image` is administrator-only and accepts
`multipart/form-data` with exactly one `image` field. The file must be a valid
PNG no larger than 5 MB. Each upload writes a new immutable object at
`tours/{uuid}.png`. After storage succeeds, the API persists that key in the
nullable `tours.image_path` column and returns `data: { tour, image }`, with the
same key in `tour.imagePath` and `image.key`. The response also includes the
resolved image URL, byte size, MIME type, stable version derived from the
successful database update timestamp, and whether cleanup of a superseded tour
object remains pending. Upload errors leave the existing database path unchanged
and are normalized without exposing AWS details. New immutable objects use a
one-year immutable browser/CDN cache policy; replacement uploads remain immediate
because their object path changes.

Tour maintenance responses expose `imagePath` as an S3 object key such as
`tours/550e8400-e29b-41d4-a716-446655440000.png`, never as a signed, bucket, or
CloudFront URL. A valid non-empty stored numeric-ID or UUID key is authoritative. When the field is null
or empty, homepage reads derive `tours/{tourId}.png` without persisting it. The
field remains read-only on ordinary tour CRUD; only the image-upload endpoint
may persist it after a successful storage write.

The returned `image.url` carries `?v={version}` and direct CloudFront and
`/files` clients preserve it. The immutable object key is the authoritative
cache boundary, so the CloudFront behavior does not need to include `v` in its
cache key for replacements to become visible. The version remains stable for a
given successful upload and is never generated during rendering.

Cross-origin browser clients preflight this authenticated multipart request.
The API CORS policy therefore explicitly allows `PUT`, `Authorization`, and
`Content-Type`; deployments must not override those response headers with a
narrower proxy policy.

`GET /admin/location-search?q=<place>&countryCode=<ISO-2>` is admin-only and
returns `data.items: [{ name, latitude, longitude }]`. The API proxies the
configured open geocoder, bounds results to six, removes provider-specific
fields, and returns safe `400`, `502`, or `503` errors. Configure
`GEOCODING_PROVIDER_URL` and `GEOCODING_USER_AGENT` server-side; no provider key
is sent to the browser.

The same protected endpoint accepts
`GET /admin/location-search?latitude=<lat>&longitude=<lon>` for reverse
geocoding. Both coordinates are required and range-validated. A readable match
is returned as a zero-or-one-item `data.items` array so the frontend can retain
the selected coordinates even when the provider has no human-readable result.
The service forwards latitude as the provider's `lat` parameter and longitude
as `lon` without swapping or application-level rounding. Provider-returned
coordinates describe the readable match only; clients keep their validated
device or map coordinates authoritative.

## Tour ownership and My Tours

`tours.created_by_user_id` records the authenticated creator. Existing rows are
left `NULL` as legacy/system inventory so they remain publicly discoverable and
administrator-managed. Every new tour created through `/my-tours` or
`/admin/tours` receives the authenticated caller as owner; creator fields in a
request body are rejected and edits preserve ownership.

Guide (`tour guide` in storage) and administrator users can use:

- `GET /my-tours` with search, pagination, type, status, and geography filters.
- `POST /my-tours` to create a server-owned tour.
- `GET /my-tours/:id` and `PATCH /my-tours/:id` for an authorized tour.
- `GET /my-tours/references` for country, zone, and node selectors.

Administrators see all tours. Guides are owner-scoped in SQL before pagination
and receive `403 FORBIDDEN` for another owner’s direct ID. Unauthenticated
requests receive `401`; customers receive `403`.

Public discovery requires an active tour and either an active owner or a `NULL`
legacy owner. Suspended-owner tours are excluded from homepage discovery,
search, selection, AI recommendations, cart entry, and reservation preflight.

## Administrator role changes

`GET /admin/users` accepts `search`, `page`, and `limit`. `PATCH
/admin/users/:userId/role` accepts exactly `{ "role": "admin" | "customer" |
"tour guide" }`. It is audited and revokes the target’s refresh tokens. Live
access-state lookup makes the new role immediately authoritative. Self-demotion
and removal of the last active administrator return protected-account `409`s.

Back to [Project Context](../CONTEXT.md). See [Architecture](./architecture.md) for request flow details.

All responses use:

```json
{
  "success": true,
  "data": {},
  "meta": {}
}
```

Successful AI interaction requests expose a server-generated
`X-AI-Trace-Id` response header. The same UUID identifies the LangSmith root
run and is included as `aiTraceId` on correlated server-side product events.
Browsers may read this header through CORS. Client-supplied trace headers do
not override the server-generated correlation ID.

Errors use:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid chat payload",
    "details": []
  }
}
```

Successful AI responses also expose the degradation fields in their response
data:

```json
{
  "degradedMode": false,
  "unavailableCapabilities": []
}
```

When an optional capability fails but a truthful useful fallback completes,
`degradedMode` is `true` and `unavailableCapabilities` contains deterministic,
deduplicated identifiers. The supported identifiers and fallback policies are
documented in [Graceful Degradation](./graceful-degradation.md). Streamed
`POST /chat` responses place these fields in the final `done` event. A
successful degraded response never implies that retrieval, analysis, speech,
or booking succeeded; requests without a meaningful fallback keep the normal
error contract.

## Admin Operations

All `/admin/*` endpoints require a valid JWT bearer token with the server-issued
`admin` role. Missing or invalid authentication returns `401 UNAUTHORIZED`;
authenticated non-admin users receive `403 FORBIDDEN`. Responses intentionally
omit password hashes, provider customer/subscription identifiers, raw job errors,
stack traces, and billing event payloads.

List endpoints accept `page` (default `1`) and `limit` (default `25`, maximum
`100`) and return pagination fields in `meta`: `page`, `limit`, `total`, and
`totalPages`. Reporting endpoints accept optional ISO `startDate` and `endDate`
values, use an exclusive end date, default to the previous 30 days, and allow a
maximum range of 366 days.

- `GET /admin/overview` returns the platform overview cards. It accepts optional
  ISO `startDate` and exclusive `endDate` values. With neither value supplied,
  range-backed metrics cover the current UTC day. The response contains active
  users, active subscriptions, MRR, completed reservations, AI requests,
  estimated AI cost, average live AI latency, and the live AI error rate.
- `GET /admin/users` returns paginated safe user profiles and current plan
  status.
- `GET /admin/subscriptions` returns paginated plan, status, provider name, and
  period data without external provider identifiers.
- `GET /admin/ai-usage` returns request, distinct-user, and token totals grouped
  by feature for the requested UTC range.
- `GET /admin/ai-costs` returns estimated USD costs grouped by model, feature,
  current subscription plan, and user ID. Each group includes requests, tokens,
  estimated cost, average estimated cost per priced request, priced requests,
  and unpriced requests. Optional `userLimit` defaults to `25` and is capped at
  `100`; missing cost data is never treated as a measured zero-cost request.
- `GET /admin/ai-quality` returns current and previous-period grounding,
  answer-relevance, retrieval, and evaluated-tool success metrics from stored
  offline evaluation artifacts. It never runs an evaluation or contacts an AI
  or tracing provider.
- `GET /admin/context-engineering` returns privacy-safe aggregate context
  selection, input-token, retrieval, compaction, cost, and failure metrics for
  the requested range. It never returns traces or context content. Field
  semantics and formulas are documented in
  [Context-engineering telemetry](./context-engineering-telemetry.md).
- `GET /admin/reservations` returns paginated reservation, tour, participant,
  total-price, and timestamp data without customer contact details or
  confirmation codes.
- `GET /admin/queue-health` returns live BullMQ `waiting`, `active`, `completed`,
  `failed`, and `delayed` counts for bird identification, embeddings, and
  document ingestion. BullMQ or Redis failures return the standard masked
  server error rather than partial or stale queue data. `completed` means jobs
  currently retained in BullMQ, not the lifetime request or completion total.
- `GET /admin/failures` returns paginated sanitized background-job and payment
  failure records. It never returns stored exception messages or provider
  payloads.
- `GET /admin/errors` returns the normalized operational error feed described
  below. It accepts `page` and `limit` (maximum `100`), the same bounded
  `startDate`/`endDate` range used by other admin reports, and an optional
  exact `type` filter.
- `POST /admin/model-routing/preview` validates a task and optional routing
  signals, then returns a sanitized route projection with stable model keys.
- `POST /admin/jobs/:jobId/retry` retries a retained BullMQ job only when both
  its safe PostgreSQL status and current BullMQ state are `failed`.
- `POST /admin/users/:userId/suspend` suspends a non-admin user and revokes all
  active refresh tokens. Admin accounts, including the caller, cannot be
  suspended through this endpoint.
- `POST /admin/ai-features/:feature/disable` disables an allowlisted boolean AI
  feature for a bounded period.

### `POST /admin/model-routing/preview`

```http
POST /admin/model-routing/preview
Authorization: Bearer <admin token>
Content-Type: application/json

{
  "task": "reservation_planning",
  "estimatedInputTokens": 2200,
  "userPlan": "PRO"
}
```

`task` is required and must be one of the eight categories documented in
[Model Registry And Routing](./model-routing.md). Optional
`estimatedInputTokens` is an integer from `0` through `1000000`; `userPlan`
normalizes to `FREE`, `PRO`, or `GUIDE`; `complexity` accepts `low`, `medium`,
or `high`; and `evaluatedModelKey` must be a stable configured model key.
Unknown fields are rejected.

```json
{
  "success": true,
  "data": {
    "task": "reservation_planning",
    "route": "advanced",
    "reasonCode": "MULTI_STEP_RESERVATION",
    "reason": "Multi-step reservation workflow",
    "primaryModelKey": "advanced_reasoning",
    "fallbackCount": 1,
    "reasoningEffort": "medium",
    "timeoutMs": 30000,
    "maxRetries": 2
  },
  "meta": {}
}
```

The response never includes provider model IDs, environment values, API keys,
request headers, provider errors, prompts, user data, or stack traces.

### Safe admin mutations

All three mutation endpoints create an `admin_audit_logs` intent before
attempting the side effect. Audit metadata contains controlled operation
status and identifiers only; it never contains job payloads, prompts, user
content, provider responses, exception text, PII, or secrets. If the audit
intent cannot be persisted, the operation fails without performing the
mutation. Responses use the standard `{ success, data, meta }` envelope.

Retry a failed job:

```http
POST /admin/jobs/:jobId/retry
Authorization: Bearer <admin token>
Content-Type: application/json

{}
```

The job identifier must contain only letters, digits, `:`, `_`, or `-`. A
missing job returns `404 JOB_NOT_FOUND`; an unknown job type or a job that is
not currently failed returns `409 JOB_NOT_RETRYABLE`. The endpoint cannot
replace job data or options.

Suspend a user:

```http
POST /admin/users/:userId/suspend
Authorization: Bearer <admin token>
Content-Type: application/json

{ "reasonCode": "abuse" }
```

`reasonCode` is optional and defaults to `abuse`; accepted values are `abuse`,
`spam`, `security`, and `policy_violation`. Only the reason code is retained,
not free-form evidence or user content. A missing user returns
`404 USER_NOT_FOUND`, and an attempt to suspend an admin returns
`409 ADMIN_USER_SUSPENSION_FORBIDDEN`. Suspended users receive
`403 ACCOUNT_SUSPENDED` on login, refresh, and authenticated production
requests.

Temporarily disable an AI feature:

```http
POST /admin/ai-features/voice_ai/disable
Authorization: Bearer <admin token>
Content-Type: application/json

{ "durationMinutes": 60 }
```

`durationMinutes` must be an integer from `1` through `1440`. The allowlist is
`voice_ai`, `multimodal_bird_identification`, and `agent_booking`. Other
feature identifiers return `422 FEATURE_NOT_DISABLEABLE`. The database stores
an absolute `disabled_until` timestamp; the normal feature-flag service checks
this override before its configured provider and automatically resumes normal
evaluation after expiry. If the override lookup fails, the affected feature
fails closed. The PostgreSQL function targets the feature-control primary-key
constraint by name so its `feature` output parameter cannot make the upsert
ambiguous.

### `GET /admin/ai-quality`

This admin-only report accepts optional ISO `startDate` and `endDate` query
parameters through the shared admin range validation. Both the current and
previous periods use UTC half-open boundaries: `startAt <= timestamp < endAt`.
The previous period ends at the current `startAt` and has exactly the same
duration in milliseconds.

The source is `AI_EVAL_OUTPUT_FILE` (default
`tmp/ai-eval-results.json`, with `AI_EVAL_RESULTS_FILE` supported as a fallback),
written by the real-output portfolio `npm run ai:evals` flow. Only artifacts
with `evaluationType: "portfolio_regression"`,
`evidenceClass: "real_pipeline_output"`, and
`validRealPipelineOutputs: true` contribute metrics. Legacy or synthetic
artifacts return `qualityStatus: "unavailable"` with null metrics. The response
also identifies the scorer self-test as excluded and includes safe provenance
when available. Offline output retains up to 100 timestamped runs.
Dashboard requests only read and aggregate safe
numeric results; they do not expose prompts, answers, retrieved content, tool
inputs/outputs, reasoning, PII, secrets, or provider errors.

Metric definitions:

- `groundingScore`: mean usable grounding-quality score.
- `answerRelevance`: mean usable answer-relevance score.
- `retrievalQuality`: mean usable retrieval-quality score.
- `toolSuccessRate`: successful evaluated tool executions divided by all
  evaluated tool executions. Its sample size is the execution count; the other
  sample sizes count usable score observations.

All values are normalized to `0–1` and rounded to four decimal places only
after aggregation. A period without usable observations returns `null` and a
sample size of `0`. A delta is `current - previous`, and remains `null` when
either value is unavailable.

```json
{
  "success": true,
  "data": {
    "range": {
      "startAt": "2026-07-01T00:00:00.000Z",
      "endAt": "2026-08-01T00:00:00.000Z",
      "timezone": "UTC"
    },
    "previousRange": {
      "startAt": "2026-05-31T00:00:00.000Z",
      "endAt": "2026-07-01T00:00:00.000Z",
      "timezone": "UTC"
    },
    "qualityStatus": "available",
    "qualitySource": "real_pipeline_output",
    "unavailableReason": null,
    "provenance": {
      "sourceType": "staging_evaluation",
      "sourceArtifactId": "staging-2026-07-01",
      "collectedAt": "2026-07-01T12:00:00.000Z",
      "modelIdentifier": "configured-model-id",
      "promptVersion": "configured-prompt-version",
      "retrievalIndexVersion": "configured-index-version",
      "evaluatorVersion": "lexical-scorers-v1",
      "scoringVersion": "portfolio-regression-report-v1",
      "provenanceReference": null
    },
    "scorerSelfTest": {
      "label": "Synthetic scorer self-test — not model or RAG quality",
      "includedInQualityMetrics": false,
      "availableInConfiguredArtifact": false
    },
    "metrics": {
      "groundingScore": {
        "current": 0.86,
        "previous": 0.82,
        "delta": 0.04,
        "currentSampleSize": 120,
        "previousSampleSize": 110
      },
      "answerRelevance": {
        "current": null,
        "previous": null,
        "delta": null,
        "currentSampleSize": 0,
        "previousSampleSize": 0
      },
      "retrievalQuality": {
        "current": 0.79,
        "previous": 0.81,
        "delta": -0.02,
        "currentSampleSize": 75,
        "previousSampleSize": 70
      },
      "toolSuccessRate": {
        "current": 0.96,
        "previous": 0.93,
        "delta": 0.03,
        "currentSampleSize": 48,
        "previousSampleSize": 42
      }
    }
  },
  "meta": {}
}
```

### `GET /admin/errors`

The admin-only operational error feed combines these sources:

| Source | Normalized type | Durability |
|---|---|---|
| failed LLM trace or provider request | `LLM_ERROR` | current process only |
| `tool_timeout` or `tool_failed` telemetry | `TOOL_ERROR` | current process only |
| failed `rag_retrieval`/`rag_pipeline` trace or `retrieval_failed` telemetry | `RETRIEVAL_ERROR` | current process only |
| malformed provider output, `invalid_output`, `invalid_json_output`, or guardrail/hallucination rejection | `INVALID_OUTPUT` | current process only |
| failed `jobs` row or sanitized BullMQ dead-letter record | `QUEUE_FAILURE` | PostgreSQL or bounded Redis retention |
| application/AI/provider status `429` or known rate-limit code | `RATE_LIMIT` | current process only |
| failed checkout/webhook handling or `billing_events.event_name = 'payment_failed'` | `PAYMENT_FAILURE` | current process or PostgreSQL |

Unknown trace types and telemetry events are omitted instead of being assigned
an approximate type. Checkout and webhook exceptions are recorded in the
current process; only failures that produce a `payment_failed` billing event
are durable feed sources.

The response uses object data and pagination metadata:

```json
{
  "success": true,
  "data": {
    "errors": [{
      "id": "telemetry-error-123",
      "timestamp": "2026-07-28T15:42:18.000Z",
      "type": "TOOL_ERROR",
      "user": { "id": "42", "label": "User 42" },
      "traceId": "trace-uuid",
      "traceUrl": "https://smith.langchain.com/...",
      "message": "Tool execution failed",
      "status": "failed"
    }]
  },
  "meta": {
    "page": 1,
    "limit": 25,
    "total": 1,
    "totalPages": 1
  }
}
```

Messages and statuses come from a server allowlist. The endpoint never selects
or returns prompts, model output, retrieval content, tool input/output, raw job
or billing payloads, provider error text, credentials, image URLs, or stack
traces. Users are represented only by an opaque ID and `User <id>` label.

Results are newest first with ID as a deterministic secondary sort. Persisted
jobs and dead-letter records sharing an original job ID are deduplicated. The
aggregator reads at most the newest `1000` records from each source for one
request; `total` describes the normalized, filtered records inside that bounded
source window. If PostgreSQL or Redis is unavailable, the endpoint returns the
standard masked server error and no partial feed.

For records with a trace ID, the backend asks the installed LangSmith SDK for
the run URL. It never constructs a URL from the trace ID. Only HTTPS URLs on
the explicit LangSmith UI hostname allowlist are returned; otherwise
`traceUrl` is `null`. Existing `LANGCHAIN_TRACING`, `LANGCHAIN_PROJECT`, and
`LANGCHAIN_API_KEY` configuration is sufficient.

Example list metadata:

```json
{
  "success": true,
  "data": [],
  "meta": {
    "page": 1,
    "limit": 25,
    "total": 0,
    "totalPages": 0
  }
}
```

Representative `data` shapes:

```json
{
  "overview": {
    "activeUsers": 147,
    "activeSubscriptions": 63,
    "mrr": 1890,
    "reservations": 42,
    "aiRequestsToday": 1294,
    "aiCostToday": 18.72,
    "averageLatencyMs": 1840,
    "errorRate": 0.021
  },
  "user": {
    "id": "7",
    "email": "operator@example.com",
    "name": "Operator",
    "role": "admin",
    "plan": "PRO",
    "subscriptionStatus": "active",
    "createdAt": "2026-07-01T00:00:00.000Z"
  },
  "subscription": {
    "userId": "7",
    "email": "operator@example.com",
    "plan": "PRO",
    "status": "active",
    "billingProvider": "Stripe",
    "currentPeriodEnd": "2026-08-01T00:00:00.000Z",
    "createdAt": "2026-07-01T00:00:00.000Z",
    "updatedAt": "2026-07-20T00:00:00.000Z"
  },
  "reservation": {
    "id": 42,
    "userId": "7",
    "tour": { "id": 3, "name": "Monteverde Cloud Forest" },
    "participants": 2,
    "totalPrice": 180,
    "currency": "USD",
    "createdAt": "2026-07-20T00:00:00.000Z"
  },
  "failure": {
    "id": "job-123",
    "category": "background_job",
    "type": "embedding",
    "status": "failed",
    "occurredAt": "2026-07-27T00:00:00.000Z",
    "error": { "code": "JOB_FAILED", "message": "Background job failed" }
  }
}
```

For the overview, `activeUsers` is the number of distinct authenticated users
with persisted AI usage in the selected range. Every persisted reservation is a
completed confirmation because the current reservation schema has no draft
state. `aiRequestsToday` and `aiCostToday` retain dashboard-compatible names but
use the selected range when dates are supplied. MRR and active subscriptions
reuse the billing dashboard for the calendar month containing the range's
exclusive end.

Latency and error rate come from sanitized in-process AI telemetry. They cover
traffic observed by the current API process since startup and are not historical
or cross-instance metrics. Durable date-range latency/error reporting will
require persisting these telemetry samples or querying the configured tracing
provider.

AI usage returns `range`, aggregate `totals`, and `byFeature` entries containing
`feature`, `requests`, distinct `users`, and `tokens`. AI costs returns the same
range plus `currency`, `costType`, aggregate totals, `byModel`, `byFeature`,
`byPlan`, and a bounded `byUser` list. Cost entries contain `requests`, `tokens`,
`estimatedCost`, `averageCostPerRequest`, `pricedRequests`, and
`unpricedRequests`. The average divides estimated cost by priced requests so
unpriced usage does not silently lower the result. User entries expose only the
internal user ID and current plan, not names or email addresses. Historical plan
attribution is unavailable because usage events do not snapshot plan state.

Queue health returns `observedAt` and a `queues` array. Each queue contains a
stable UI `id`, display `name`, and the five numeric BullMQ counts. The UI IDs
`bird-identification`, `embeddings`, and `document-ingestion` map to the actual
BullMQ queue names `bird-identification`, `embedding`, and `ingestion`.
Bird-identification producers explicitly store the configured retry and bounded
retention options on each BullMQ job so a successful completion remains
countable for up to `BULLMQ_REMOVE_ON_COMPLETE_AGE_SECONDS` while respecting
`BULLMQ_REMOVE_ON_COMPLETE_COUNT`.

Quota errors use `429` with code `QUOTA_EXCEEDED` and a user-facing message.

## Auth Profile
`PATCH /auth/profile` requires JWT bearer authentication and updates the
authenticated user's display name. The request body is:

```json
{
  "name": "Ana Rivera"
}
```

`POST /auth/profile-image` requires JWT bearer authentication and accepts raw
JPEG, PNG, or WebP image bytes up to 5 MB. The endpoint stores images in S3
under `user-profile-images/`, persists the resulting object key on the user
record, and returns a frontend-safe user profile.

Success data:

```json
{
  "user": {
    "id": "user-1",
    "email": "ana@example.com",
    "name": "Ana Rivera",
    "role": "customer",
    "plan": "FREE",
    "imageUrl": "/files/user-profile-images/user-1.png"
  }
}
```

The client never sends a user ID for profile updates; the API uses the bearer
token identity.

## Subscription Plans
Authenticated users are assigned a subscription plan. New users default to:

```json
{
  "plan": "FREE"
}
```

### `POST /billing/checkout`
Requires JWT bearer authentication. Creates a hosted provider checkout/payment
session for the requested internal plan. The body may be empty, or may specify
the enabled provider and plan:

```json
{
  "provider": "stripe",
  "plan": "GUIDE"
}
```

Success data:

```json
{
  "provider": "stripe",
  "plan": "GUIDE",
  "checkoutUrl": "https://checkout.stripe.com/c/pay/cs_test_...",
  "paymentUrl": "https://checkout.stripe.com/c/pay/cs_test_..."
}
```

`FREE` plan requests do not create hosted provider checkout sessions.

### `POST /billing/portal`
Requires JWT bearer authentication. Creates a hosted billing management session
for the authenticated user's active subscription. The body may be empty, or may
specify the enabled provider:

```json
{
  "provider": "stripe"
}
```

The client never sends provider customer or subscription IDs.

Success data:

```json
{
  "provider": "stripe",
  "managementUrl": "https://billing.stripe.com/p/session/..."
}
```

If the account does not have a provider subscription/customer record in a
billing-manageable state, the API returns a safe `409` error with code
`BILLING_SUBSCRIPTION_NOT_FOUND`.

### `GET /billing/usage`
Requires JWT bearer authentication. Returns the authenticated user's current
month AI cost, usage, LangSmith trace correlation, subscription plan context,
and provider revenue/profitability summary. `monthlyCost` and
`monthlyRequests` are retained as top-level compatibility fields.

Success data:

```json
{
  "monthlyCost": 4.28,
  "monthlyRequests": 142,
  "plan": {
    "name": "PRO",
    "status": "active",
    "billingProvider": "Stripe",
    "hasProviderSubscription": true
  },
  "usage": {
    "requests": 142,
    "tokens": 12000,
    "byFeature": [
      {
        "feature": "chat",
        "requests": 100,
        "tokens": 9000,
        "cost": 3.5
      }
    ]
  },
  "langSmith": {
    "traceCount": 18
  },
  "profitability": {
    "revenue": 29,
    "cost": 4.284999,
    "profit": 24.72,
    "marginPercent": 85.22
  }
}
```

### `GET /billing/admin/dashboard`
Requires JWT bearer authentication with an admin role. Returns current-month
billing metrics for operator dashboards. The optional `monthStart` query
parameter accepts an ISO date string and defaults to the current database month.

Success data:

```json
{
  "monthlyRevenue": 2450,
  "mrr": 2450,
  "arr": 29400,
  "activeSubscriptions": 103,
  "cancelledSubscriptions": 7,
  "revenueByPlan": [
    {
      "plan": "GUIDE",
      "monthlyRevenue": 950,
      "activeSubscriptions": 19
    },
    {
      "plan": "PRO",
      "monthlyRevenue": 1500,
      "activeSubscriptions": 84
    }
  ]
}
```

### `GET /billing/admin/feature-economics`

Requires JWT bearer authentication with an admin role. Aggregates AI feature
usage, token volume, estimated AI cost, recognized subscription revenue, and
estimated contribution margin in UTC daily or monthly buckets.

Optional query parameters are `granularity=daily|monthly`, `startDate`, and
`endDate`. Dates must be valid ISO date strings; `endDate` is exclusive.

Success data:

```json
{
  "granularity": "daily",
  "timezone": "UTC",
  "currency": "USD",
  "range": {
    "startAt": "2026-07-01T00:00:00.000Z",
    "endAt": "2026-07-03T00:00:00.000Z"
  },
  "allocationMethod": "per_user_feature_usage_share",
  "totals": {
    "usage": 10,
    "tokens": 10000,
    "aiCost": 3,
    "subscriptionRevenue": 40,
    "estimatedContributionMargin": 37,
    "estimatedContributionMarginPercent": 92.5,
    "allocatedSubscriptionRevenue": 25,
    "unallocatedSubscriptionRevenue": 15
  },
  "buckets": [
    {
      "periodStart": "2026-07-01T00:00:00.000Z",
      "usage": 10,
      "tokens": 10000,
      "aiCost": 3,
      "subscriptionRevenue": 30,
      "estimatedContributionMargin": 27,
      "estimatedContributionMarginPercent": 90,
      "allocatedSubscriptionRevenue": 25,
      "unallocatedSubscriptionRevenue": 5,
      "features": [
        {
          "feature": "chat",
          "usage": 8,
          "tokens": 8000,
          "aiCost": 2,
          "allocatedSubscriptionRevenue": 20,
          "estimatedContributionMargin": 18,
          "estimatedContributionMarginPercent": 90
        }
      ]
    }
  ]
}
```

Per-feature subscription revenue is an allocation estimate based on each
paying user's feature-usage share within the period. Revenue for subscribers
without AI usage remains unallocated.

### `POST /billing/admin/simulate-payment`
Requires JWT bearer authentication with an admin role. Simulates provider-neutral
subscription lifecycle events without calling Stripe or any external provider.
Simulated events are persisted in `billing_events` with provider `Other` and
`eventData.simulated: true`.

Request body:

```json
{
  "userId": 7,
  "action": "renewal",
  "plan": "PRO",
  "status": "active",
  "amountPaid": 2900,
  "currency": "usd",
  "effectiveAt": "2026-07-08T00:00:00.000Z"
}
```

Supported actions are `renewal`, `cancel`, `upgrade`, `downgrade`,
`payment_failed`, and `expire`. `upgrade` and `downgrade` require a paid plan;
renewal and payment-failure simulations use the supplied paid plan or the
current paid plan.

Success data:

```json
{
  "simulated": true,
  "action": "renewal",
  "userId": 7,
  "plan": "PRO",
  "status": "active",
  "subscription": {
    "userId": 7,
    "plan": "PRO",
    "status": "active"
  },
  "billingEvent": {
    "provider": "Other",
    "eventName": "subscription_renewed"
  }
}
```

### `POST /billing/webhook` and `POST /billing/webhook/:provider`
Receive provider webhook or callback events. The default route uses
`BILLING_DEFAULT_PROVIDER`; provider-specific routes use the provider path
segment. The Stripe adapter verifies `Stripe-Signature`, stores provider events
idempotently by provider event ID, handles Checkout completion, subscription
create/update/delete events, records renewals and payment failures, and persists
subscription status locally through provider-neutral fields.

Local `user_subscriptions.status` values are:

| Status | Meaning |
| --- | --- |
| `trialing` | Provider subscription is in a trial period. |
| `active` | Provider subscription is active. |
| `past_due` | Provider subscription is in payment-retry/dunning state. |
| `cancelled` | Provider subscription was cancelled. |
| `expired` | Provider subscription expired or cannot become active. |

AI usage costs are stored in `usage_events` with `user_id`, `feature`, `tokens`,
`estimated_cost`, optional `trace_id`, compact `model_usage`, and `created_at`.
`trace_id` stores the LangSmith-compatible parent trace ID when available, so
billing rows can be correlated with runtime traces without storing prompt text,
responses, email addresses, or provider customer IDs in trace metadata. Features
include chat, identification, embedding, voice, and image analysis.

Internal plans remain provider-neutral. `plan_provider_mappings` can map a plan
to provider product, price, SKU, or equivalent identifiers. To add TiloPay or
another provider, add an adapter under `src/providers/billing/`, register it,
configure `BILLING_PROVIDERS`, and map provider callback payloads to the
normalized subscription sync shape used by `billing.service.js`.

Plan limits are enforced daily:

| Plan | Chats | Bird identifications |
| --- | ---: | ---: |
| FREE | 20 | 5 |
| PRO | 500 | 100 |
| GUIDE | 1200 | 300 |

When the daily quota is exhausted, protected AI endpoints return:

```json
{
  "success": false,
  "error": {
    "code": "QUOTA_EXCEEDED",
    "message": "Daily quota exceeded",
    "details": {
      "plan": "FREE",
      "feature": "chat",
      "used": 20,
      "max": 20
    }
  }
}
```

## Health endpoints

`GET /health` and `GET /health/live` return dependency-free API liveness with
HTTP `200`:

```json
{"success":true,"data":{"status":"ok","role":"api","uptime":123.4},"meta":{}}
```

`GET /health/ready` checks PostgreSQL and Redis with strict timeouts and returns
HTTP `200` only when both are ready. Degraded, unavailable, timed-out, and
shutting-down states return HTTP `503`. The schema is stable and deliberately
does not contain dependency errors, endpoints, or credentials:

```json
{
  "success": false,
  "data": {
    "status": "unavailable",
    "role": "api",
    "checks": {
      "postgres": {"status":"unavailable","reason":"timeout"},
      "redis": {"status":"ok"}
    }
  },
  "meta": {}
}
```

Success data:
```json
{
  "status": "ok",
  "uptime": 12.345
}
```

## `GET /homepage/hero`
Returns public homepage hero media content for the frontend.

Success data:
```json
{
  "hero": {
    "heroVideo": "https://www.youtube-nocookie.com/embed/example"
  }
}
```

## Homepage Content
These endpoints are public, return normalized JSON envelopes, and are used by the frontend homepage instead of chat streaming for static product content.

### `GET /tours`
Returns featured tour cards from PostgreSQL-backed tour data, including display fields such as `id`, `title`, `description`, `location`, `node`, `subnode`, `zone`, `duration`, `pricePerPerson`, `difficulty`, and optional media. Each card also exposes `tourType` (`scheduled` or `unscheduled`), `isActive`, `maxParticipants`, `minimumPrice`, `availableSlots`, and `occurrenceDates`. Each occurrence has `occurrenceId`, `startsAt`, Costa Rica calendar `date`, `remainingSpaces`, and `status`. Expired, inactive, and full scheduled occurrences are omitted from `occurrenceDates`; inactive or unavailable tours are not returned as bookable cards.

### `GET /birds/highlights`
Returns curated Costa Rica bird highlight cards. The backend can source names from `HOMEPAGE_BIRD_HIGHLIGHTS`/`HEAD_LINE_BIRDS`, falling back to built-in highlights.

### `GET /birds/profile`
Returns one bird profile by query parameter:
```http
GET /birds/profile?speciesCode=gretin1
GET /birds/profile?name=Great%20Tinamou
```

Either `speciesCode`/`species_code` or `name` is required. Missing query input returns `422` with code `validation_error`; unknown birds return `404` with code `bird_not_found`.

### `POST /birds/identify`
Requires JWT bearer authentication. Accepts a bird image URL or uploaded bird
image, stores uploaded images in S3, queues a BullMQ bird-identification job,
and returns immediately with a job ID. `POST /bird-identification` is available
as an equivalent alias for new clients.

URL body:
```json
{
  "imageUrl": "https://example.com/bird.jpg"
}
```

Image upload body:
```http
POST /birds/identify
Authorization: Bearer jwt
Content-Type: image/jpeg
X-Filename: bird.jpg

<raw image bytes>
```

Accepted response data:
```json
{
  "jobId": "job-123",
  "status": "queued"
}
```

Use `GET /jobs/:id` to poll the job status and final result. Completed result
data contains the same public bird-identification shape that this endpoint
previously returned synchronously.

Completed job result:
```json
{
  "jobId": "job-123",
  "status": "completed",
  "result": {
    "status": "identified",
    "bestMatch": {
      "commonName": "Resplendent Quetzal",
      "scientificName": "Pharomachrus mocinno",
      "confidence": 0.91,
      "reasoning": "Green upperparts, red underparts, and long tail coverts match visible field marks and retrieved profile support.",
      "visualEvidence": ["green upperparts", "red underparts", "long tail coverts"],
      "contradictions": [],
      "ragSupport": ["Retrieved profile describes emerald upperparts and red belly."]
    },
    "candidates": [
      {
        "species": "Resplendent Quetzal",
        "commonName": "Resplendent Quetzal",
        "scientificName": "Pharomachrus mocinno",
        "confidence": 0.91,
        "reasoning": "Green upperparts, red underparts, and long tail coverts match visible field marks and retrieved profile support.",
        "visualEvidence": ["green upperparts", "red underparts", "long tail coverts"],
        "contradictions": [],
        "ragSupport": ["Retrieved profile describes emerald upperparts and red belly."]
      }
    ],
    "imageAnalysis": {
      "dominantColors": ["green", "red"],
      "fieldMarks": ["long tail coverts", "red underparts"],
      "bill": { "color": "yellow", "shape": "short", "length": "short" },
      "head": "green head with crest",
      "throat": "green",
      "underparts": "red",
      "upperparts": "green",
      "wings": "green",
      "tail": "long",
      "legs": "unknown",
      "bodyShape": "trogon-like",
      "apparentGroup": "trogon",
      "habitatHint": "forest",
      "imageQuality": "clear",
      "confidence": 0.86
    },
    "notes": []
  }
}
```

### `GET /jobs/:id`
Requires JWT bearer authentication. Returns the polling state for an
authenticated user's background job.

Queued or active response data:
```json
{
  "jobId": "job-123",
  "status": "queued"
}
```

Failed response data:
```json
{
  "jobId": "job-123",
  "status": "failed",
  "error": {
    "message": "Bird identification failed. Please try again."
  }
}
```

Unknown or expired job response data:
```json
{
  "jobId": "job-123",
  "status": "not_found"
}
```

Bird identification job statuses are `queued`, `active`, `completed`, `failed`,
and `not_found`.

The worker extracts rich visible field marks, generates conservative candidate
species, verifies/reranks candidates against bird-profile RAG, and stores an
identified, uncertain, or unknown result for polling.

### `POST /ingestions`
Requires JWT bearer authentication. Accepts normalized JSON documents or a raw
text-like upload, persists the source payload, queues a BullMQ ingestion job,
and returns immediately.

JSON body:
```json
{
  "documents": [
    {
      "externalId": "field-note-1",
      "name": "Field note",
      "description": "Cloud forest bird habitat notes.",
      "documentType": "field_note"
    }
  ],
  "source": "manual-upload",
  "force": false
}
```

Raw text upload:
```http
POST /ingestions
Authorization: Bearer jwt
Content-Type: text/plain
X-Filename: notes.txt

Cloud forest bird habitat notes.
```

Accepted response data:
```json
{
  "jobId": "job-123",
  "status": "processing"
}
```

### `GET /ingestions/:id`
Requires JWT bearer authentication. Returns the authenticated user's ingestion
job status without exposing the stored source document contents.

Completed response data:
```json
{
  "jobId": "job-123",
  "status": "completed",
  "result": {
    "documentCount": 1,
    "chunkCount": 2,
    "queuedCount": 1,
    "skippedCount": 0
  }
}
```

Failed response data:
```json
{
  "jobId": "job-123",
  "status": "failed",
  "error": {
    "message": "Document ingestion failed. Please try again."
  }
}
```

Document ingestion statuses are `processing`, `active`, `completed`, `failed`,
and `not_found`. The ingestion worker validates and persists documents through
the existing ingestion service, which queues embedding jobs for pgvector storage.

`imageObservations` remains present as a compatibility alias for older clients. Normal responses omit internal debug details. Authenticated admins may request `?debug=true` to receive internal debug metadata under `meta.debug` with raw candidates, retrieved profile identifiers/names, and verification notes.

Confidence calibration:
- `0.90+` is reserved for distinctive species with clear diagnostic traits.
- `0.70-0.89` means likely but not perfect.
- `0.40-0.69` means plausible but uncertain.
- Best match below `0.55` returns `status: "uncertain"`; below `0.40` returns `status: "unknown"`.

Validation:
- The request must provide either `imageUrl` or a raw image upload, not both.
- `imageUrl` is trimmed, must be a valid `http` or `https` URL, and must be 2048 characters or fewer.
- Raw uploads must be JPEG, PNG, WebP, or GIF images and are limited to 10 MB.
- Uploaded images are stored in S3 under `bird-identification/`, converted to a CloudFront URL, and then passed into the same image-analysis pipeline as URL requests.
- Unknown JSON body fields are rejected.

### `GET /addons/transfers`
Returns public transfer add-on cards for the homepage. Booking-specific transfer selection remains part of the chat/tool flow.

## `POST /auth/signup`
Creates a user account with a bcrypt-hashed password and returns an access token, refresh token, expiry timestamps, and safe profile data.

Body:
```json
{
  "email": "ana@example.com",
  "password": "secure-password",
  "name": "Ana Rivera"
}
```

Validation:
- `email` is required, normalized to lowercase, and must be a valid email address.
- `password` is required and must be 8 to 128 characters.
- `name` is optional and must be text when provided.

Success data:
```json
{
  "token": "jwt",
  "accessTokenExpiresAt": "2026-06-01T12:00:00.000Z",
  "refreshToken": "opaque-refresh-token",
  "refreshTokenExpiresAt": "2026-07-01T12:00:00.000Z",
  "user": {
    "id": "user-1",
    "email": "ana@example.com",
    "name": "Ana Rivera",
    "role": "customer"
  }
}
```

Duplicate emails return `409` with code `EMAIL_ALREADY_EXISTS`. Password hashes are never returned.

## `POST /auth/login`
Authenticates an existing user and returns the same session shape as signup.

Body:
```json
{
  "email": "ana@example.com",
  "password": "secure-password"
}
```

Invalid credentials return `401` with code `INVALID_CREDENTIALS` and the generic message `Invalid email or password`.

## `POST /auth/refresh`
Rotates a refresh token and returns a fresh access token plus a new refresh token.

Body:
```json
{
  "refreshToken": "opaque-refresh-token"
}
```

Expired, revoked, or unknown refresh tokens return `401` with code `SESSION_EXPIRED`.

## `POST /auth/logout`
Revokes the current refresh token when one is provided.

## `POST /voice-chat`
Accepts a spoken user message, transcribes it, processes it through the existing chat orchestration, generates an MP3 assistant response, stores that generated audio in S3, and returns text plus a relative media URL that resolves through the CloudFront-backed `/files` route.

Request:
- Body must be the raw audio bytes.
- `Content-Type` must be `audio/mpeg`, `audio/mp3`, `audio/wav`, or `audio/x-wav`.
- Optional `X-Filename` may be provided and must end in `.mp3` or `.wav` when present.
- Optional `X-Conversation-Id` continues an existing conversation.
- Optional `X-Role` may be `visitor`.
- Optional `X-Response-Mode` may be `field_assistant` for concise, voice-friendly field guidance capped at two sentences.
- Optional `X-Field-Assistant: true` is accepted as shorthand for `X-Response-Mode: field_assistant`.
- Optional `X-Customer-Context` and `X-Conversation-Context` must be JSON objects matching the existing chat context validation rules.

Success data:
```json
{
  "transcript": "Where can I see quetzals?",
  "answer": "Monteverde is one of the best places to see quetzals.",
  "audioResponseUrl": "/files/voice-chat/audio-id.mp3"
}
```

Success meta:
```json
{
  "conversationId": "conversation-123",
  "aiTraceId": "11111111-1111-4111-8111-111111111111"
}
```

The `audioResponseUrl` is a relative URL. Clients can call it to receive the normalized `/files` response containing the CloudFront URL for the generated S3 object.

Standalone public transcribe or speak endpoints are intentionally not exposed. Routes and controllers should use the reusable backend audio services through voice-chat orchestration rather than adding browser-facing `/audio/transcribe` or `/audio/speak` routes.

Observability:
- The voice workflow creates a parent `voice_chat` AI execution trace.
- Speech-to-text transcription, chat retrieval, agent execution/tool work, and speech generation are nested under that workflow in LangSmith when tracing is enabled.

## Cart And My Tours
All cart endpoints require JWT authentication through `requireAuth`, reject unauthenticated requests, and return the normalized `{ success, data, meta }` envelope.

### `GET /cart`
Returns the authenticated user cart:
```json
{
  "cart": {
    "itineraryStartDate": "2026-06-10",
    "itineraryEndDate": "2026-06-12",
    "items": [],
    "count": 0
  }
}
```

### `POST /cart/items`
Adds or updates one cart tour. Body fields are `tourId`, optional `scheduledDate`, optional `participants`, optional `needsTransfer`, and optional safe `metadata`. Cart items may be added without itinerary dates; reservation creation still requires each selected item to have a scheduled date.

### `PATCH /cart/items/:itemId`
Updates `scheduledDate`, `participants`, or `needsTransfer` for one owned cart item.

### `DELETE /cart/items/:itemId`
Removes one owned cart item.

### `POST /cart/reservations`
Creates reservations from the authenticated user cart. With no `itemIds`, all cart items are reserved. With `itemIds`, only those cart items are reserved. Each selected item must have a scheduled date, and only one selected tour may be assigned to each day.

### `GET /cart/reservations`
Returns the authenticated user latest five reservations ordered by reservation creation date. Reservation rows do not persist extra metadata; itinerary dates are supplied during active cart/chat reservation flows when needed.

## `POST /chat`
Streams an assistant response with Server-Sent Events. Authenticated customer/admin requests include `Authorization: Bearer <token>` and existing authenticated conversations can only be continued by their owner. Unauthenticated visitor requests are accepted for bird-only questions and are blocked from tour planning, pricing, transfer, and reservations.

Body:
```json
{
  "message": "Where can I see quetzals?",
  "conversationId": "optional-existing-id",
  "customerContext": {
    "customerName": "Ana Rivera",
    "customerEmail": "ana@example.com",
    "itineraryStartDate": "2026-06-01",
    "itineraryEndDate": "2026-06-03"
  },
  "conversationContext": {
    "recentAssistantMetadata": {
      "selectedTourId": 1,
      "participants": 2,
      "uiAction": { "type": "reservation_confirmation" }
    }
  },
  "role": "customer",
  "responseMode": "field_assistant"
}
```

Validation:
- `message` is required, trimmed, non-empty, max 4000 characters.
- `conversationId` is optional, trimmed, non-empty when present, max 128 characters.
- `role` may be `"visitor"` for unauthenticated visitor mode; authenticated user roles come from the JWT.
- `customerContext` is optional and must be an object when provided. For authenticated requests, `req.user.email` overrides `customerContext.customerEmail`; `req.user.name` is preferred for `customerContext.customerName` when present.
- `customerContext.customerEmail` must be a valid email address when present.
- `customerContext.itineraryStartDate` and `customerContext.itineraryEndDate` must use `YYYY-MM-DD` when present, and the end date must not be earlier than the start date.
- `conversationContext` is optional and must be an object when provided. The validator only preserves safe recent assistant metadata used by guided booking flows.
- `responseMode` is optional. Set it to `"field_assistant"` for concise, voice-friendly field guidance capped at two sentences.
- Homepage/cart reservation entry points may send `conversationType: "reservation_entry"`, `conversationSource`/`entrySource` of `featured_tour` or `tour_cart`, and a safe `reservationEntry` object containing selected tour/cart summaries. These values are treated as already provided context, not authoritative reservation records.
- A featured-tour entry includes the exact `selectedTour` and `selectedTourId`. This does not create a reservation; it resumes the normal date, participant, transfer, and confirmation workflow.

SSE events:
```text
event: start
data: {"conversationId":"conversation-123","sources":[],"meta":{"promptVersions":{"chat":"2.4.0"}}}

event: chunk
data: {"content":"Hello"}

event: replace
data: {"content":"I can help with Costa Rica birdwatching, tours, pricing, or reservations. Could you rephrase what you would like to do next?"}

event: done
data: {"conversationId":"conversation-123","response":"Hello from AI","sources":[],"meta":{"promptVersions":{"chat":"2.4.0"}}}

event: error
data: {"code":"STREAM_ERROR","message":"Unable to stream chat response right now."}
```

Behavior:
- Creates a UUID conversation ID when none is provided.
- Persists `user_id` on new authenticated conversations and rejects attempts to continue another user's conversation.
- Loads recent history for that conversation.
- Retrieves relevant bird knowledge sources from PostgreSQL pgvector-backed knowledge chunks and returns them as `sources` in `start` and `done` events.
- Runs agent planning and any required tool calls first, then streams the final assistant text to the client.
- Sends `start` once the conversation ID and source context are known.
- Sends one or more `chunk` events as assistant text becomes safe to flush.
- Sends `replace` only when output guardrails replace already-started streamed text with a safe fallback.
- Sends `done` with the final persisted response and frontend-safe metadata.
- Sends `error` as an SSE event if the stream fails after headers are open.
- If the client disconnects, aborts the OpenAI stream and stops writing SSE events.
- Saves the exchange and durable chat-level metadata to PostgreSQL on a best-effort basis.

Done `meta` may include frontend-ready tool data collected during agent execution:
```json
{
  "toolsCalled": ["searchTours"],
  "tours": [
    {
      "tourId": 1,
      "name": "Monteverde Quetzal Tour",
      "location": "Monteverde",
      "pricePerPerson": 120,
      "availableSlots": 5,
      "durationHours": 4,
      "difficulty": "moderate"
    }
  ],
  "uiAction": {
    "type": "tour_selection",
    "prompt": "Which tour are you interested in?",
    "options": []
  }
}
```

When `searchTours` runs in recommendation mode, `done.meta.tourRecommendation`
contains the stable, schema-validated card contract. The assistant prose remains
in `done.response`; clients must not parse it to reconstruct cards.

```json
{
  "tourRecommendation": {
    "summary": "I found one tour that matches your preferences.",
    "recommendations": [
      {
        "tourId": "1",
        "tourName": "Monteverde Quetzal Tour",
        "location": "Monteverde",
        "estimatedPrice": {
          "amount": 120,
          "currency": "USD"
        },
        "matchReasons": ["Matches Monteverde", "Fits moderate budget"],
        "availabilityStatus": "available",
        "confidence": 0.6667
      }
    ],
    "sources": [],
    "assumptions": [],
    "followUpQuestion": "Which tour are you interested in?"
  }
}
```

The contract is owned by
`src/ai/schemas/tourRecommendation.schema.js`. `availabilityStatus` is one of
`available`, `limited`, `unavailable`, or `unknown`; 1–3 known remaining slots
are `limited`. Unknown price is represented as
`estimatedPrice: { "amount": null, "currency": null }`, and unknown availability
as `availabilityStatus: "unknown"`. Known currency values are uppercase ISO
4217 codes and known amounts are non-negative. Confidence is the existing
database-backed recommendation score normalized as `score / (score + 5)` and
bounded to `0–1`; it is not a claim about live inventory. Sources and
assumptions are empty unless supported data exists, and `followUpQuestion` is
`null` when no clarification is needed. An empty `recommendations` array is
valid. If any item fails validation, the API emits the existing safe stream
error and returns no partial recommendation contract.

Bird RAG responses may also include frontend-ready bird matches in `done.meta`.
Media files are not embedded in pgvector; the vector store embeds searchable
bird text and stores media references as document metadata. `meta.birdMatches`
is limited to the top matching bird profiles and may include only fields that
exist for that bird:
```json
{
  "birdMatches": [
    {
      "speciesCode": "gretin1",
      "commonName": "Great Tinamou",
      "scientificName": "Tinamus major",
      "family": "Tinamous",
      "description": "Large ground bird.",
      "locations": "La Cusinga Lodge",
      "lastObservation": {
        "locations": ["La Cusinga Lodge"],
        "obsDt": "2026-05-21 04:58",
        "howMany": 1
      },
      "media": {
        "photoUrl": "/photos/123_medium.jpg",
        "squarePhotoUrl": "/photos/123_square.jpg",
        "photoAttribution": "Photo by Example Birder",
        "wikiTitle": "Great_tinamou",
        "songUrl": "songs/123.mp3",
        "sonogramUrl": "sonograms/123_grey-small.png",
        "songLength": "0:42",
        "songAttributionHtml": "<p>Sound recording by Example Recordist. Licensed under CC BY-NC-SA 3.0.</p>"
      }
    }
  ]
}
```

Bird media fields may be absolute URLs or relative object keys from ingestion.
Relative media keys are intentionally resolved through the API media endpoint,
not treated as UI static files. The frontend integration contract is:
- absolute media URLs can be rendered directly by clients
- relative keys such as `/photos/...`, `songs/...`, and `sonograms/...` must be exchanged through `GET /files/:folderName/:filename`
- clients should prefer `squarePhotoUrl` for thumbnails and `photoUrl` for larger bird detail images when both are present
- clients should use `songLength` as the preferred audio duration for synchronizing sonograms when it is present
- `photoAttribution`, `wikiTitle`, and `songAttributionHtml` are copied from the source bird document metadata; clients should render attribution safely and avoid direct HTML injection unless sanitization is added
- the media endpoint returns a normalized JSON envelope with a short-lived `data.url`
- bucket credentials, S3 endpoints, and object-existence checks remain backend-only

`meta.customerContext`, `meta.reservation`, `meta.selectedTour`,
`meta.selectedTourId`, `meta.selectedTransfer`, and `meta.participants`
are chat-level fields.
They are merged into `conversations.metadata` and should not be duplicated onto
individual message records by clients. Per-turn UI fields such as `uiAction`,
`tours`, `pricing`, and `toolsCalled` may still be associated with the
assistant turn that produced them.

Tour tool notes:
- Tour and reservation state comes from PostgreSQL.
- `tours` explicitly distinguish scheduled and unscheduled inventory. Scheduled capacity lives per row-locked `tour_occurrences` record. Unscheduled tours use `minimum_price` as the per-person price floor and `max_participants` as the per-booking limit.
- `reservations` store customer details, optional authenticated `user_id`, `conversation_id`, `tour_id`, explicit Costa Rica calendar `tour_date`, optional occurrence ID, participant count, unique confirmation code, persisted tour total, and creation time.
- Birding location/reference data is modeled separately from RAG in `country`, `zone`, `node`, `birds`, and `birds_by_node`. Zones and nodes are ranked, nodes can be hierarchical, birds may have optional `species_code` and `tags`, and each of those tables has `is_active DEFAULT true`.
- The pgvector RAG tables are `knowledge_documents` and `knowledge_chunks`; they are the source for retrieved text and `birdMatches`, while the birding reference graph supports structured tour/location relationships and seed data.
- Available tour tools are `searchTours`, `calculateTransfer`, `checkAvailability`, `calculatePricing`, and `createReservation`.
- Users should receive available or recommended tours through response metadata and explicitly select one before pricing or reservation creation.
- Recommendation mode requests three results by default. Strong deterministic matches rank first; remaining slots are filled by the best eligible alternatives and marked with `matchStrength: "alternative"` plus an alternative reason. If fewer than three eligible tours exist, all are returned with `fewerThanRequestedReason`.
- Recommendation-mode results expose `done.meta.tourRecommendation`; legacy
  `meta.tours` remains available for existing guided booking controls.
- `searchTours` supports broad listing and recommendation mode. `checkAvailability` and `calculatePricing` use the latest validated structured selection. `createReservation` does not accept operational booking details from message-derived tool arguments; it accepts only `expectedStateVersion` and re-reads confirmed state in PostgreSQL.
- Species or topic queries such as `where can I see quetzals?` are passed into tour ranking so direct name/location matches like `Monteverde Quetzal Tour` outrank weak generic availability matches.
- When more than one reservation value is unresolved, `done.meta.uiAction` contains a `reservation_details` action with only the missing fields. Its `fields` may include `date`, `participants`, `transferRequired`, conditional `pickupLocation`, `customerName`, `customerEmail`, `itineraryStartDate`, and `itineraryEndDate`; clients submit all visible values in one message. A lone missing participant count may retain the backward-compatible `participant_count` action with numeric options from `1` through the tour limit.
- Availability requires an explicit `YYYY-MM-DD` date. Scheduled choices come only from live occurrences within the itinerary and with sufficient remaining capacity; unscheduled choices may use any calendar date within the itinerary. A lone missing date may retain the backward-compatible `date_picker` action rather than choosing a date automatically.
- Once supplied, participant count is persisted as proposed structured state and may also remain in safe response metadata for UI continuity. Only its latest confirmed structured value is eligible for reservation creation.
- Before final reservation confirmation, an unknown transfer preference is included in the combined reservation-details request (with pickup conditionally required when transfer is requested). A lone missing preference may retain the backward-compatible choice action. Requesting transfer triggers concrete options; declining it persists `meta.transferDeclined: true` for the booking flow.
- `calculateTransfer` estimates shared shuttle and private transfer options for supported tour regions and returns a `transfer_selection` `uiAction` when options are available.
- `calculatePricing` supports optional `discountCode`. Recognized codes are currently `EARLYBIRD`, `STUDENT`, and `LOCAL`; group discounts can also apply.
- `createReservation` requires `expectedStateVersion`. The atomic database wrapper rejects proposed, missing, invalid, stale, or out-of-itinerary state and supplies only confirmed values to `create_tour_reservation_for_date(...)`. That function locks scheduled inventory, decrements capacity atomically, rejects overbooking and participant-limit violations, and enforces one reservation per customer per Costa Rica calendar day.
- A combined reservation-details reply can complete the booking context in one turn. The backend follows up only for missing, invalid, unavailable, or ambiguous values and calls `createReservation` only after transfer is selected or declined and final confirmation is received.
- Final confirmation accepts the structured `confirm_reservation` action and affirmative text such as `Confirm` or `Yes` only when the previous assistant metadata contained the final confirmation action. This deterministic transition promotes proposals; assistant text alone never changes confirmation state, and an `unknown` intent classification cannot override a valid guided confirmation transition.
- Successful reservation tool results include `id`, `reservationId`, `userId`, `customerName`, `customerEmail`, `conversationId`, `tourId`, `tourName`, `tourDate`, `participants`, `confirmationCode`, `createdAt`, `totalPrice`, `tourTotalPrice`, itinerary dates, `currency`, `remainingSlots`, `discountRate`, and `discountReason`. Transfer selection and transfer-derived totals are calculated from chat-level `meta.selectedTransfer`, not embedded as `meta.reservation.transfer`.
- Reservations are associated with the active chat `conversationId` internally.
- Reservation-entry chat exchanges are saved with `conversation_type = "reservation_entry"` and optional `conversation_source` so they can support server-side reservation flow without becoming the user's regular latest chat.
- The public stream does not expose raw tool messages, but safe structured tool data is returned in the `done` event `meta` object for frontend rendering.

## `GET /chat/latest`
Returns the most recent regular conversation owned by the authenticated user. Requires `Authorization: Bearer <token>` and uses `req.user.id`; no user ID is accepted from the client. Conversations marked `reservation_entry` are excluded from this lookup.

Success data when a conversation exists:
```json
{
  "success": true,
  "data": {
    "conversationId": "conversation-123",
    "messages": [
      { "role": "user", "content": "Hello", "createdAt": "..." },
      { "role": "assistant", "content": "Hi!", "createdAt": "..." }
    ]
  },
  "meta": {}
}
```

The response `meta` includes persisted chat-level metadata from
`conversations.metadata`, such as `customerContext`, participants, selected
tour state, and selected transfer. If the latest owned conversation has an associated
reservation, `meta.reservation` contains the same frontend-safe reservation
shape used by the `POST /chat` stream `done` event. Transfer is exposed
through `meta.selectedTransfer`, not `meta.reservation.transfer`:
```json
{
  "success": true,
  "data": {
    "conversationId": "conversation-123",
    "messages": []
  },
  "meta": {
    "participants": 2,
    "selectedTransfer": {
      "transferOption": "shared_shuttle",
      "origin": "San Jose",
      "destination": "Monteverde",
      "totalPrice": 130,
      "currency": "USD"
    },
    "reservation": {
      "reservationId": 42,
      "customerName": "Ana Gomez",
      "customerEmail": "ana@example.com",
      "conversationId": "conversation-123",
      "tourId": 1,
      "tourName": "Monteverde Quetzal Tour",
      "participants": 2,
      "confirmationCode": "BW-ABC123",
      "totalPrice": 240,
      "tourTotalPrice": 240,
      "currency": "USD"
    }
  }
}
```

Success data when no owned conversation exists:
```json
{
  "conversationId": null,
  "messages": []
}
```

The lookup orders conversations by `last_message_at DESC NULLS LAST, created_at DESC`.

## `GET /files/:folderName/:filename`
Returns a public CloudFront media URL for a validated object key. This endpoint
requires `CLOUDFRONT_BASE_URL` and is used by the UI when RAG bird metadata
contains relative media references.

Example:
```http
GET /files/photos/123_medium.jpg
```

Success response:
```json
{
  "success": true,
  "data": {
    "url": "https://cdn.example.test/photos/123_medium.jpg"
  },
  "meta": {
    "delivery": "cloudfront"
  }
}
```

Validation and behavior:
- the file key is built from `folderName/filename`
- leading and trailing slashes are stripped before validation
- `.` and `..` segments are rejected
- path segments may contain only letters, numbers, dots, underscores, and hyphens
- missing or invalid file names return `400`
- when `CLOUDFRONT_BASE_URL` is configured, the endpoint returns the CDN URL without using bucket credentials
- when `CLOUDFRONT_BASE_URL` is empty, the endpoint returns a server configuration error
- successful responses do not expose bucket credentials

## Current Protection
`POST /billing/checkout`, `POST /billing/portal`, `GET /billing/usage`, `GET /chat/latest`, `GET /chat/:conversationId`, `POST /birds/identify`, `POST /bird-identification`, `GET /jobs/:id`, `POST /ingestions`, `GET /ingestions/:id`, and all `/cart` routes require JWT bearer authentication. `POST /chat` and `POST /voice-chat` accept authenticated customer/admin users or unauthenticated visitors; visitors can only ask bird-related questions, cannot execute tool-backed tour or reservation actions, and have a stricter 10-request-per-hour IP limit. Conversation, reservation, job, and ingestion ownership is enforced server-side. Billing webhooks are public provider callbacks and verify provider signatures where supported. `POST /auth/signup`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, homepage content endpoints, `GET /files/:folderName/:filename`, and `GET /health` remain public.

Request protection includes:
- Helmet security headers through `security.middleware.js`.
- CORS origin allow-listing from `CORS_ORIGINS`; disallowed browser origins receive `403 CORS_ORIGIN_DENIED`.
- JSON body size limit of `64kb`.
- Recursive JSON body and route-param sanitization that strips null bytes and prototype-pollution keys.
- Route-specific validation through `validate(...)` before service execution.
- Global in-memory IP rate limiting at 60 requests per minute.

## Common Errors
- Route validation failures usually return `400` with code `VALIDATION_ERROR`; controller-level public content validation may return `422` with route-specific lowercase codes such as `validation_error`.
- Missing or invalid bearer tokens return `401` with code `UNAUTHORIZED`.
- Rate limit failures return `429` with code `RATE_LIMITED`.
- Unknown routes return `404` with code `NOT_FOUND`.
- Empty or malformed AI provider responses return `502` with code `AI_EMPTY_RESPONSE`.
- Unexpected server errors return `500` with code `INTERNAL_SERVER_ERROR` and do not expose stack traces.

### Feature-control and suspension state

- `GET /admin/ai-features` (admin only) returns `name`, `enabled`, `status`,
  and ISO UTC `disabledUntil | null` for the three supported AI features.
- `POST /admin/ai-features/:feature/enable` with `{}` removes the temporary
  override and returns the audit reference.
- `GET /admin/users` includes `status`, `suspendedAt`, and
  `suspensionReasonCode`.
- `POST /admin/users/:userId/unsuspend` with `{}` clears an eligible user’s
  suspension and returns the audit reference.
- `GET /features/availability` is the safe public availability projection.

Enable and unsuspend are idempotent; admin/self protection remains enforced.
Temporarily disabled voice and bird-identification requests return the safe
`FEATURE_TEMPORARILY_DISABLED` code, feature-specific message, and UTC
expiration with HTTP `503`. A disabled booking capability is handled inside
chat orchestration: reservation tools and final model generation are skipped,
the successful limited response reports `reservation_tool`, and no reservation
or confirmation metadata is returned.
