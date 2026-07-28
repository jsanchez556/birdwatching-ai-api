# API Contracts

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

## `GET /health`
Returns service health and process uptime.

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
Returns featured tour cards from PostgreSQL-backed tour data, including display fields such as `id`, `title`, `description`, `location`, `node`, `subnode`, `zone`, `duration`, `pricePerPerson`, `difficulty`, and optional media.

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

### `GET /addons/transportation`
Returns public transportation add-on cards for the homepage. Booking-specific transportation selection remains part of the chat/tool flow.

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
Adds or updates one cart tour. Body fields are `tourId`, optional `scheduledDate`, optional `participants`, optional `needsTransportation`, and optional safe `metadata`. Cart items may be added without itinerary dates; reservation creation still requires each selected item to have a scheduled date.

### `PATCH /cart/items/:itemId`
Updates `scheduledDate`, `participants`, or `needsTransportation` for one owned cart item.

### `DELETE /cart/items/:itemId`
Removes one owned cart item.

### `POST /cart/reservations`
Creates reservations from the authenticated user cart. With no `itemIds`, all cart items are reserved. With `itemIds`, only those cart items are reserved. Each selected item must have a scheduled date, and only one selected tour may be assigned to each day.

### `GET /cart/reservations`
Returns the authenticated user latest five reservations ordered by reservation creation date. Reservation rows do not persist extra metadata; itinerary dates are supplied during active cart/chat reservation flows when needed.

## `POST /chat`
Streams an assistant response with Server-Sent Events. Authenticated customer/admin requests include `Authorization: Bearer <token>` and existing authenticated conversations can only be continued by their owner. Unauthenticated visitor requests are accepted for bird-only questions and are blocked from tour planning, pricing, transportation, and reservations.

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

SSE events:
```text
event: start
data: {"conversationId":"conversation-123","sources":[],"meta":{"promptVersions":{"chat":"2.3.0"}}}

event: chunk
data: {"content":"Hello"}

event: replace
data: {"content":"I can help with Costa Rica birdwatching, tours, pricing, or reservations. Could you rephrase what you would like to do next?"}

event: done
data: {"conversationId":"conversation-123","response":"Hello from AI","sources":[],"meta":{"promptVersions":{"chat":"2.3.0"}}}

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
`meta.selectedTourId`, `meta.selectedTransportation`, and `meta.participants`
are chat-level fields.
They are merged into `conversations.metadata` and should not be duplicated onto
individual message records by clients. Per-turn UI fields such as `uiAction`,
`tours`, `pricing`, and `toolsCalled` may still be associated with the
assistant turn that produced them.

Tour tool notes:
- Tour and reservation state comes from PostgreSQL.
- `tours` store price, availability, location, duration, difficulty, optional `node_id`, coordinates, and optional start/end dates; `node_id` references the Costa Rica birding `node` table when present.
- `reservations` store customer details, optional authenticated `user_id`, `conversation_id`, `tour_id`, participant count, unique confirmation code, persisted tour total, and creation time.
- Birding location/reference data is modeled separately from RAG in `country`, `zone`, `node`, `birds`, and `birds_by_node`. Zones and nodes are ranked, nodes can be hierarchical, birds may have optional `species_code` and `tags`, and each of those tables has `is_active DEFAULT true`.
- The pgvector RAG tables are `knowledge_documents` and `knowledge_chunks`; they are the source for retrieved text and `birdMatches`, while the birding reference graph supports structured tour/location relationships and seed data.
- Available tour tools are `searchTours`, `calculateTransportation`, `checkAvailability`, `calculatePricing`, and `createReservation`.
- Users should receive available or recommended tours through response metadata and explicitly select one before pricing or reservation creation.
- `searchTours` supports broad listing and recommendation mode. `checkAvailability`, `calculatePricing`, and `createReservation` can accept a selected `tourId` or clear/partial `tourName`; the service resolves matching tour names before validating availability.
- Species or topic queries such as `where can I see quetzals?` are passed into tour ranking so direct name/location matches like `Monteverde Quetzal Tour` outrank weak generic availability matches.
- When availability is checked for a selected tour and participant count is still missing, `done.meta.uiAction` may contain a `participant_count` action with `min`, `max`, and numeric `options` from `1` through `availableSlots`.
- Once supplied, participant count is persisted in safe response metadata as `meta.participants` and reused for pricing, transportation, final confirmation, and reservation creation; the same booking flow should not ask for participant count again.
- Before final reservation confirmation, booking flows with an unknown transportation preference return a choice `uiAction` asking whether the customer wants transportation. Choosing `show_transportation` triggers transportation options; choosing `decline_transportation` persists `meta.transportationDeclined: true` for the booking flow.
- `calculateTransportation` estimates shared shuttle and private transfer options for supported tour regions and returns a `transportation_selection` `uiAction` when options are available.
- `calculatePricing` supports optional `discountCode`. Recognized codes are currently `EARLYBIRD`, `STUDENT`, and `LOCAL`; group discounts can also apply.
- `createReservation` requires participants and customer name in tool arguments; tour selection can be resolved by `tourId`, `tourName`, or location. It accepts optional `customerEmail`, `discountCode`, and itinerary dates from frontend `customerContext`. Authenticated reservations persist `user_id` and use the authenticated email supplied through merged customer context.
- A participant-count reply from that UI action can complete the booking context; the backend then asks for transportation preference when unknown and only calls `createReservation` after transportation is selected or declined and final confirmation is received.
- Final confirmation accepts the structured `confirm_reservation` action and affirmative text such as `Yes` when the previous assistant metadata contained the final confirmation action.
- Successful reservation tool results include `id`, `reservationId`, `userId`, `customerName`, `customerEmail`, `conversationId`, `tourId`, `tourName`, `participants`, `confirmationCode`, `createdAt`, `totalPrice`, `tourTotalPrice`, itinerary dates, `currency`, `remainingSlots`, `discountRate`, and `discountReason`. Transportation selection and transportation-derived totals are calculated from chat-level `meta.selectedTransportation`, not embedded as `meta.reservation.transportation`.
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
tour state, and selected transportation. If the latest owned conversation has an associated
reservation, `meta.reservation` contains the same frontend-safe reservation
shape used by the `POST /chat` stream `done` event. Transportation is exposed
through `meta.selectedTransportation`, not `meta.reservation.transportation`:
```json
{
  "success": true,
  "data": {
    "conversationId": "conversation-123",
    "messages": []
  },
  "meta": {
    "participants": 2,
    "selectedTransportation": {
      "transportationOption": "shared_shuttle",
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
