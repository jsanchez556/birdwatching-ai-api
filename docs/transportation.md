# Transportation service

Migration `006_transportation_service.sql` owns database-backed vehicles, bookings, the atomic idempotent booking function, and three idempotently seeded vehicle records. Existing tour reservations remain separate from standalone transportation bookings.

Seeded vehicle images use canonical S3 keys under `vehicles/` (`jacsunray.jpg`, `hiacetb.jpeg`, and `hiaceht.jpg`). API responses keep these as keys rather than constructing storage URLs. Clients resolve them directly against their configured CloudFront base URL or through the public `GET /files/vehicles/:filename` compatibility endpoint, which requires `CLOUDFRONT_BASE_URL`.

## HTTP contracts

- `POST /transport/routes/quote` accepts `{ origin: { placeId }, destination: { placeId } }`. Google Places verifies both locations are in `TRANSPORT_COUNTRY_CODE`, Google Routes calculates the driving route, and the response returns an expiring signed `routeToken`.
- `GET /transport/vehicles?routeToken=…&passengers=…&luggage=…` returns active capacity-compatible vehicles and signed price quotes.
- `GET /transport/checkout-context` requires authentication and returns the name/email fields actually stored for the user plus supported payment options.
- `POST /transport/bookings` accepts the route and quote tokens, an offset-qualified future pickup timestamp, counts, bounded contact/comments, `pay_on_arrival`, and a UUID idempotency key. The service revalidates the vehicle and fare before calling the database function.

All success responses use `{ success, data, meta }`. Provider failures and validation errors use the centralized safe error envelope.

## Fare calculation

Rates are stored as `numeric(12,2)`. Runtime calculation converts rates to integer cents:

```text
distanceCharge = round(distanceMeters × rateCents / 1000)
finalFare = max(distanceCharge, minimumFareCents)
```

The UI never supplies an authoritative distance or price.

## Configuration

- `TRANSPORT_COUNTRY_CODE` defaults to `CR` and must be an ISO alpha-2 code.
- `TRANSPORT_TIME_ZONE` defaults to `America/Costa_Rica` and must be a valid IANA zone.
- `GOOGLE_MAPS_SERVER_API_KEY` requires Places API (New) and Routes API access and must be server/IP restricted.
- `TRANSPORT_ROUTE_TOKEN_SECRET` signs route and quote tokens; use an independent high-entropy production secret and rotate it by allowing outstanding tokens to expire before replacement.
- `TRANSPORT_ROUTE_TOKEN_TTL_SECONDS` defaults to 900.
- `TRANSPORT_QUOTE_TOKEN_TTL_SECONDS` defaults to 600.

The current provider-neutral subscription billing contract does not support one-time transportation charges or safely retrieving a reusable default method. Transportation therefore supports `pay_on_arrival` only; no card data or simulated saved method is returned.
