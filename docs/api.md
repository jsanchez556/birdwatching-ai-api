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
  "response": "AI response text",
  "sources": [
    {
      "name": "Resplendent Quetzal",
      "location": "Monteverde, San Gerardo de Dota",
      "similarityScore": 0.9123
    }
  ]
}
```

Behavior:
- Creates a UUID conversation ID when none is provided.
- Loads recent history for that conversation.
- Retrieves relevant bird knowledge sources from `src/db/data/birds.json` and returns them as `sources` for frontend display.
- Sends role-based messages to OpenAI.
- Saves the exchange to PostgreSQL on a best-effort basis.

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
