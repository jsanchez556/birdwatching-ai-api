# Durable Reservation Conversation State

Back to [Project Context](../CONTEXT.md). Conversation transcript behavior is documented in [Memory](./memory.md).

## Persisted Model

Chat messages remain conversational context, but reservation side effects never reconstruct arguments from them. `reservation_conversation_states` stores one current row per conversation with a monotonically increasing `version`, lifecycle `status`, separate `proposed_values` and `confirmed_values`, the successful reservation/idempotency references, and timestamps.

The initial operational fields are `tourId`, `date`, `participants`, `pickupLocation`, and `transportationRequired`. The existing workflow also keeps `customerName`, `customerEmail`, `itineraryStartDate`, `itineraryEndDate`, and optional `discountCode` in the same state so booking does not recover them from message text or response metadata.

`reservation_state_audit_events` is append-only. Every accepted version records previous/new versions, event type, changed fields, previous/resulting operational snapshots, confirmation state, source category, optional source message/request/trace identifier, and a database timestamp. Direct customer name/email values, transcript text, secrets, and unrelated data are omitted from audit snapshots.

## Extraction And Confirmation

The versioned reservation-intent Structured Output extracts only facts in the current user message. It distinguishes absent fields, normalized values, and explicit clearing through `clearedFields`. Invalid or ambiguous values are not promoted or used operationally. Validated customer-context form values join the proposal set, and backend-validated tour resolution may propose the exact resolved `tourId`.

After a tour is selected, the assistant requests all unresolved reservation
fields in one message. The guided `reservation_details` action contains only
fields absent from current proposed/confirmed state and customer context. A
later question is permitted only when a submitted value is missing, invalid,
unavailable, or ambiguous; validated values are retained and are not requested
again.

Confirmation is narrow and testable: the user must send an explicit confirmation action or a recognized phrase such as `Confirm` or `Yes` while the immediately previous assistant metadata offers `reservation_confirmation`. Explicit standalone phrases such as `confirm_reservation`, `Confirm reservation`, `Confirm booking`, `Yes, book it`, or `Go ahead and book it` remain supported. That transition promotes the complete latest proposal set atomically. Proposed corrections never overwrite confirmed values before promotion; a proposed `null` deletes the confirmed field only during promotion.

`ready_for_confirmation` is derived only when no proposals remain and all required confirmed fields exist. Transportation requires a pickup location when `transportationRequired` is true. A correction after readiness returns the state to `collecting_information`.

## Transitions And Booking Safety

```text
collecting_information
  -> ready_for_confirmation
  -> confirmed
  -> cancelled
```

Only a successful booking can enter `confirmed`. `confirmed` may only become `cancelled`, and `cancelled` is terminal.

`mutate_reservation_conversation_state(...)` locks the conversation and state, compares `expected_version`, updates the state, and appends its audit event in one transaction. Stale writers receive SQLSTATE `40001` without changing state or audit history.

`book_reservation_from_state(...)` locks and re-reads the latest state immediately before the side effect. It requires the expected version, `ready_for_confirmation`, an empty proposal set, every required confirmed value, and a confirmed date inside the itinerary. It passes only confirmed values to `create_tour_reservation_for_date(...)`, then marks state `confirmed` and appends the audit event only after booking succeeds. That transaction locks the selected scheduled occurrence before checking/decrementing remaining spaces; it also enforces active status, participant limits, occurrence status, expiration, and one tour per customer/calendar day. Failure leaves the state/version unchanged.

Calendar dates are exchanged as `YYYY-MM-DD` and scheduled occurrence timestamps are converted with `America/Costa_Rica` before day comparisons. The assistant and UI may propose valid choices, but neither may silently select one.

The idempotency key derives from conversation ID and confirmed state version. Repeating that booking returns the existing reservation without decrementing inventory, incrementing state, or emitting duplicate completion analytics. Stale attempts return the safe retryable `RESERVATION_STATE_CONFLICT` result.

Structured state and audit history remain internal and are not returned through public APIs.
