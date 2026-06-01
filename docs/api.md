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
  "role": "customer"
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
- The public stream does not expose raw tool messages, but safe structured tool data is returned in the `done` event `meta` object for frontend rendering.

## `GET /chat/latest`
Returns the most recent conversation owned by the authenticated user. Requires `Authorization: Bearer <token>` and uses `req.user.id`; no user ID is accepted from the client.

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
Returns a short-lived presigned media URL for a validated S3-compatible object
key. This endpoint is used by the UI when RAG bird metadata contains relative
media references.

Example:
```http
GET /files/photos/123_medium.jpg
```

Success response:
```json
{
  "success": true,
  "data": {
    "url": "https://bucket.example.test/photos/123_medium.jpg?signature=..."
  },
  "meta": {
    "expiresInSeconds": 900
  }
}
```

Validation and behavior:
- the file key is built from `folderName/filename`
- leading and trailing slashes are stripped before validation
- `.` and `..` segments are rejected
- path segments may contain only letters, numbers, dots, underscores, and hyphens
- missing or invalid file names return `400`
- unknown objects return `404`
- successful responses do not expose bucket credentials

## Current Protection
`GET /chat/latest` requires JWT bearer authentication. `POST /chat` accepts authenticated customer/admin users or unauthenticated visitors; visitors can only ask bird-related questions, cannot execute tool-backed tour or reservation actions, and have a stricter 10-request-per-hour IP limit. Conversation and reservation `user_id` ownership is enforced server-side. `POST /auth/signup`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, and `GET /health` remain public.

Request protection includes:
- Helmet security headers through `security.middleware.js`.
- CORS origin allow-listing from `CORS_ORIGINS`; disallowed browser origins receive `403 CORS_ORIGIN_DENIED`.
- JSON body size limit of `64kb`.
- Recursive JSON body and route-param sanitization that strips null bytes and prototype-pollution keys.
- Route-specific validation through `validate(...)` before service execution.
- Global in-memory IP rate limiting at 60 requests per minute.

## Common Errors
- Validation failures return `400` with code `VALIDATION_ERROR`.
- Missing or invalid bearer tokens return `401` with code `UNAUTHORIZED`.
- Rate limit failures return `429` with code `RATE_LIMITED`.
- Unknown routes return `404` with code `NOT_FOUND`.
- Empty or malformed AI provider responses return `502` with code `AI_EMPTY_RESPONSE`.
- Unexpected server errors return `500` with code `INTERNAL_SERVER_ERROR` and do not expose stack traces.
