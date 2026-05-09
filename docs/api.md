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

Success data:
```json
{
  "conversationId": "uuid-or-provided-id",
  "response": "I found 2 tours that match your preferences.",
  "sources": [
    {
      "name": "Resplendent Quetzal",
      "location": "Monteverde, San Gerardo de Dota",
      "similarityScore": 0.9123
    }
  ]
}
```

Success meta may include frontend-ready tour and reservation data collected from tool calls:
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

Behavior:
- Creates a UUID conversation ID when none is provided.
- Loads recent history for that conversation.
- Retrieves relevant bird knowledge sources from `src/db/data/birds.json` and returns them as `sources` for frontend display.
- Sends role-based messages to OpenAI with tour tools enabled.
- May execute tour tools for listing, recommending, selecting, pricing, or reserving tours, then return a natural-language response plus structured metadata.
- When tour listing or recommendation tools return tours, the assistant text should stay short, for example `I found 2 tours that match your preferences.` Tour details belong in `meta.tours`.
- Saves the exchange to PostgreSQL on a best-effort basis.

Tour tool notes:
- Tour and reservation state comes from PostgreSQL.
- Available tour tools are `getAvailableTours`, `recommendTours`, `selectTour`, `checkTourAvailability`, `calculateTourPrice`, and `createReservation`.
- Users should receive available or recommended tours through response metadata and explicitly select one before pricing or reservation creation.
- `selectTour` accepts a selected `tourId` or a clear/partial `tourName`; the service resolves matching tour names before validating availability.
- `calculateTourPrice` supports optional `discountCode`. Recognized codes are currently `EARLYBIRD`, `STUDENT`, and `LOCAL`; group discounts can also apply.
- `createReservation` requires `tourId`, `participants`, and `customerName`; it accepts optional `customerEmail` and `discountCode`.
- Successful reservation tool results include `id`, `reservationId`, `customer_name`, `customerName`, `customerEmail`, `conversationId`, `tour_id`, `tourId`, `tourName`, `participants`, `confirmation_code`, `confirmationCode`, `created_at`, `createdAt`, `total_price`, `totalPrice`, `currency`, `remainingSlots`, `discountRate`, and `discountReason`.
- Reservations are associated with the active chat `conversationId` internally.
- The public `/chat` response shape does not expose raw tool messages, but safe structured tool data is returned in the top-level `meta` envelope for frontend rendering.

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
