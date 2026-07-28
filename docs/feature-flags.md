# Feature flags

PostHog feature flags control product behavior. They do not replace LangSmith
AI observability or application logs.

All server checks use the provider-neutral service in
`src/featureFlags/featureFlag.service.js`. PostHog-specific evaluation stays in
the PostHog provider. Evaluation is best-effort and falls back to the current
product behavior when PostHog is disabled or unavailable.

## Flag catalog

| Key | Type | Safe fallback | Authoritative server behavior |
|---|---|---|---|
| `voice_ai` | Boolean | Enabled | Gates `POST /voice-chat` |
| `advanced_rag` | Multivariate | `current_retrieval` | Selects `current_retrieval` or `new_retrieval`; the new profile expands candidates and adjusts hybrid ranking |
| `multimodal_bird_identification` | Boolean | Enabled | Gates both bird-identification endpoints |
| `agent_booking` | Boolean | Enabled | Prevents reservation-related agent tools from executing |
| `tour_recommendation_prompt` | Multivariate | `recommendation_prompt_v1` | Assigns the tour recommendation response prompt; the first assignment is persisted per user |

Authenticated checks use the stable user ID plus safe `plan` and `role`
targeting properties. Anonymous voice checks use `X-Conversation-ID` when
available so percentage rollouts remain stable.

## PostHog setup

Create flags with the exact keys above.

To make voice available only to PRO accounts, configure `voice_ai` as a Boolean
flag with a condition where the person property `plan` equals `PRO`.

Configure `advanced_rag` as a multivariate flag:

- `new_retrieval`: 10%
- `current_retrieval`: 90%

Configure `tour_recommendation_prompt` as a multivariate flag with
`recommendation_prompt_v1` and `recommendation_prompt_v2`. See
[Product experiments](./experiments.md) for assignment persistence and metric
ownership.

PostHog assigns a stable variant from the distinct ID, and the API includes the
variant in the RAG trace metadata so LangSmith can compare AI-system behavior.
No prompts, retrieved content, credentials, tokens, or PII are sent for flag
evaluation.

Server configuration reuses:

```text
POSTHOG_ENABLED=
POSTHOG_API_KEY=
POSTHOG_HOST=
```

Changing targeting or rollout percentages in PostHog takes effect without an
application redeploy.
