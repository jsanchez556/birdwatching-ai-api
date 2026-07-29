# Privacy, Retention, Deletion, and Export

Back to [Project Context](../CONTEXT.md).

This document describes the current implementation as of July 2026. It is not
a promise of legal compliance or a substitute for a deployed environment's
privacy notice, processor agreements, backup policy, or incident procedures.
Where no automated retention or deletion exists, that limitation is stated
explicitly.

## Current data handling

| Category | Purpose and current storage | Current retention and deletion | Processors and flow | Access, minimization, and user behavior |
|---|---|---|---|---|
| Chat messages | User and assistant text is stored in PostgreSQL `conversations` and `messages`; the browser also caches rendered messages and customer context in user-scoped `localStorage`. Redis may hold bounded-TTL AI/retrieval cache entries only when a response is safe to reuse. | No server-side age-based retention or conversation/account deletion endpoint exists. Deleting a conversation in PostgreSQL cascades to its messages and linked reservations, but no public API currently performs that operation. Browser data can be cleared by the user through browser storage controls; logout is not documented as a guaranteed cache erasure. Database backups may retain deleted rows until the platform backup expires. | Text needed for AI processing flows to OpenAI. Sanitized trace metadata may flow to LangSmith when enabled; product events may flow to PostHog when enabled. PostgreSQL/Redis are deployment infrastructure. | Conversation reads require ownership checks. Admin and database operators may have infrastructure access. Application logs and telemetry must not contain transcript text. There is no comprehensive user export; authenticated conversation APIs expose only supported conversation views. |
| Customer email and profile data | Email, display name, password hash, role, plan, profile-image URL, session records, and suspension state are stored in PostgreSQL. Booking intake may also place customer details in conversation/reservation records. | No account deletion or age-based profile retention endpoint exists. Several user-owned tables use `ON DELETE CASCADE`, but conversations and reservations use `ON DELETE SET NULL` in current migrations, so deleting a user row alone is not full erasure. Refresh sessions can be revoked. Backups follow the hosting platform's policy, which is not configured in this repository. | Authentication stays in the API/PostgreSQL. Billing identifiers flow to the selected billing provider (currently Stripe). PostHog may receive allowlisted product analytics when enabled. | Passwords are hashed and raw credentials/tokens must not be logged. Users can update supported profile fields, but cannot currently export or delete the full profile through a public API. |
| Uploaded bird images | Bird-identification uploads are stored in S3-compatible object storage; safe object URLs and identification results are stored in PostgreSQL/job records. | No object lifecycle or user deletion endpoint is implemented in this repository. BullMQ job records have bounded age/count, but that does not delete S3 objects or PostgreSQL identification records. Backups and object versions, if enabled by the host, may outlive primary data. | The image may flow from the browser to the API, S3/CloudFront, and OpenAI image analysis. | Upload routes require authentication, validate type/size, and avoid logging image contents or signed credentials. The UI has no identification-image export/deletion control. |
| Profile images | Profile images are stored in S3-compatible object storage and the current URL is stored on the PostgreSQL user row. | Replacing a profile image does not currently delete the previous object. No object lifecycle or account-deletion cleanup is implemented. | Browser → API → S3/CloudFront. | Profile update requires the current authenticated user. Only the returned URL is kept in browser auth state. There is no dedicated image deletion/export action. |
| Voice input and generated responses | Raw MP3/WAV request bytes are processed in memory for transcription. Generated MP3 responses are stored under `voice-chat/` in S3-compatible storage; message text/transcript may be persisted as chat. | The API does not intentionally persist the raw input file, but OpenAI's provider-side handling is governed by the deployed account terms. Generated audio has no application-managed retention or deletion lifecycle. Browser playback URLs may remain in cached messages. | Browser → API → OpenAI transcription/chat/speech; generated audio → S3/CloudFront. | Audio bytes, transcript text, and generated response text must not be logged. No user-facing audio deletion/export mechanism exists. |
| Reservations | Booking, participant, price, customer, itinerary, transportation, and confirmation data is stored in PostgreSQL. | No age-based retention, cancellation-driven deletion, or public erasure endpoint exists. A conversation deletion would cascade to linked reservations under the original reservation foreign key, while later user ownership is nullable; actual production schema must be checked before manual deletion. Backups may retain history. | PostgreSQL is authoritative; billing flows may send payment-related identifiers to Stripe, but raw payment credentials are not stored here. | Reservation access is owner-scoped in application services. Admin/database operators may have operational access. The UI exposes recent reservation history, not a complete portability export. |
| Traces and logs | Console/platform logs contain coarse operational metadata. LangSmith receives sanitized trace/span metadata only when enabled. | Local log retention is owned by the deployment platform; LangSmith retention is owned by its project/account settings. This repository does not enforce either period or provide deletion APIs. | Railway or another log host; LangSmith when configured. | Prompts, responses, secrets, credentials, and unnecessary PII are prohibited in logs/traces. Access is controlled by deployment and LangSmith accounts, outside this codebase. Users have no direct trace/log export or deletion action. |
| Analytics and operational events | Product analytics may be sent to PostHog. Usage, billing events, jobs, and admin audits are stored in PostgreSQL. Failed BullMQ jobs/DLQ records use Redis. Some runtime errors remain in a 250-entry in-memory ring. | PostgreSQL records have no general age-based cleanup. BullMQ success/failure/DLQ retention is bounded by configured age/count. The telemetry ring is overwritten at 250 entries and erased on restart. PostHog retention is account-configured. Backups may retain PostgreSQL events. | API/UI → PostHog when enabled; API/worker → PostgreSQL and Redis; optionally LangSmith for trace correlation. | Events are allowlisted/minimized and must exclude prompts, raw payloads, credentials, and unnecessary personal data. Admin endpoints require admin authorization. The error dashboard is incomplete across replicas by design. No user-facing comprehensive event export/deletion exists. |

## Access and deletion operations

There is currently no single account-deletion or data-portability workflow.
Manual deletion must be planned against the deployed schema, S3 object keys,
provider records, Redis keys, and backup schedule; deleting only the `users`
row is insufficient. Infrastructure access should follow least privilege, and
manual actions should be audited without copying deleted content into logs.

## Recommended follow-up work

1. Approve category-specific retention periods with product/legal owners and
   encode PostgreSQL cleanup jobs plus S3 lifecycle rules.
2. Add an authenticated export workflow with bounded, expiring downloads.
3. Add an idempotent account-deletion workflow that inventories and deletes or
   legally retains PostgreSQL rows, S3 objects, Redis cache keys, Stripe data,
   PostHog data, and LangSmith traces.
4. Define backup retention and deletion propagation with the actual hosting
   provider; disclose that deletion from primary storage does not immediately
   remove immutable backups.
5. Store object ownership metadata needed to delete replaced profile images and
   generated voice/bird media safely.
6. Add scheduled verification reports for retention jobs without including
   customer content or object URLs.
