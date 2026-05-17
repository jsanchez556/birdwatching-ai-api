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

## `POST /chat`
Streams an assistant response with Server-Sent Events.

Body:
```json
{
  "message": "Where can I see quetzals?",
  "conversationId": "optional-existing-id"
}
```

Validation:
- `message` is required, trimmed, non-empty, max 4000 characters.
- `conversationId` is optional, trimmed, non-empty when present, max 128 characters.

SSE events:
```text
event: start
data: {"conversationId":"conversation-123","sources":[],"meta":{"promptVersions":{"chat":"2.1.0"}}}

event: chunk
data: {"content":"Hello"}

event: replace
data: {"content":"I can help with Costa Rica birdwatching, tours, pricing, or reservations. Could you rephrase what you would like to do next?"}

event: done
data: {"conversationId":"conversation-123","response":"Hello from AI","sources":[],"meta":{"promptVersions":{"chat":"2.1.0"}}}

event: error
data: {"code":"STREAM_ERROR","message":"Unable to stream chat response right now."}
```

Behavior:
- Creates a UUID conversation ID when none is provided.
- Loads recent history for that conversation.
- Retrieves relevant bird knowledge sources from `src/db/data/birds.json` and returns them as `sources` in `start` and `done` events.
- Resolves any required OpenAI tool calls first, then streams the final assistant text to the client.
- Sends `start` once the conversation ID and source context are known.
- Sends one or more `chunk` events as assistant text becomes safe to flush.
- Sends `replace` only when output guardrails replace already-started streamed text with a safe fallback.
- Sends `done` with the final persisted response and frontend-safe metadata.
- Sends `error` as an SSE event if the stream fails after headers are open.
- If the client disconnects, aborts the OpenAI stream and stops writing SSE events.
- Saves the exchange to PostgreSQL on a best-effort basis.

Done `meta` may include frontend-ready tour and reservation data collected from tool calls:
```json
{
  "toolsCalled": ["recommendTours"],
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
  ]
}
```

Tour tool notes:
- Tour and reservation state comes from PostgreSQL.
- Available tour tools are `getAvailableTours`, `recommendTours`, `selectTour`, `checkTourAvailability`, `calculateTourPrice`, and `createReservation`.
- Users should receive available or recommended tours through response metadata and explicitly select one before pricing or reservation creation.
- `selectTour` accepts a selected `tourId` or a clear/partial `tourName`; the service resolves matching tour names before validating availability.
- Species or topic queries such as `where can I see quetzals?` are passed into tour ranking so direct name/location matches like `Monteverde Quetzal Tour` outrank weak generic availability matches.
- When availability is checked for a selected tour and participant count is still missing, `done.meta.uiAction` may contain a `participant_count` action with `min`, `max`, and numeric `options` from `1` through `availableSlots`.
- Once supplied, participant count is persisted in safe response metadata as `meta.participants` and reused for pricing, transportation, final confirmation, and reservation creation; the same booking flow should not ask for participant count again.
- Before final reservation confirmation, booking flows with an unknown transportation preference return a choice `uiAction` asking whether the customer wants transportation. Choosing `show_transportation` triggers transportation options; choosing `decline_transportation` persists `meta.transportationDeclined: true` for the booking flow.
- `calculateTourPrice` supports optional `discountCode`. Recognized codes are currently `EARLYBIRD`, `STUDENT`, and `LOCAL`; group discounts can also apply.
- `createReservation` requires `tourId`, `participants`, and `customerName`; it accepts optional `customerEmail` and `discountCode`.
- A participant-count reply from that UI action can complete the booking context; the backend then asks for transportation preference when unknown and only calls `createReservation` after transportation is selected or declined and final confirmation is received.
- Final confirmation accepts the structured `confirm_reservation` action and affirmative text such as `Yes` when the previous assistant metadata contained the final confirmation action.
- Successful reservation tool results include `id`, `reservationId`, `customer_name`, `customerName`, `customerEmail`, `conversationId`, `tour_id`, `tourId`, `tourName`, `participants`, `confirmation_code`, `confirmationCode`, `created_at`, `createdAt`, `total_price`, `totalPrice`, `currency`, `remainingSlots`, `discountRate`, and `discountReason`.
- Reservations are associated with the active chat `conversationId` internally.
- The public stream does not expose raw tool messages, but safe structured tool data is returned in the `done` event `meta` object for frontend rendering.

## `GET /chat/:conversationId`
Returns up to 100 persisted messages for one conversation as alternating user and assistant messages.

Success data:
```json
{
  "conversationId": "conversation-123",
  "messages": [
    { "role": "user", "content": "I am visiting Monteverde.", "createdAt": "..." },
    { "role": "assistant", "content": "Monteverde is excellent...", "createdAt": "..." }
  ]
}
```

## `POST /recommend`
Body:
```json
{
  "location": "Monteverde",
  "budget": "moderate",
  "days": 3
}
```

Validation:
- `location` is required, trimmed, non-empty.
- `budget` must be `budget`, `moderate`, or `luxury`.
- `days` must be an integer from 1 to 30.

Success data is the parsed OpenAI function tool response:
```json
{
  "location": "Monteverde",
  "budget": "moderate",
  "days": 3,
  "recommendations": {
    "birdSpecies": [],
    "bestSpots": [],
    "suggestedItinerary": []
  }
}
```

## Current Protection
Routes are public. The app applies global in-memory IP rate limiting at 60 requests per minute, but does not yet enforce JWT, sessions, or API keys.

## Common Errors
- Validation failures return `400` with code `VALIDATION_ERROR`.
- Rate limit failures return `429` with code `RATE_LIMITED`.
- Unknown routes return `404` with code `NOT_FOUND`.
- Empty or malformed AI provider responses return `502` with code `AI_EMPTY_RESPONSE`.
- Unexpected server errors return `500` with code `INTERNAL_SERVER_ERROR` and do not expose stack traces.
