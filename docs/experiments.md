# Product experiments

## Tour recommendation prompt

The `tour_recommendation_prompt` PostHog multivariate flag assigns authenticated
users to one of two prompt versions:

- `recommendation_prompt_v1`: concise baseline recommendation framing
- `recommendation_prompt_v2`: guided-choice framing tied to supplied preferences

The first recommendation exposure is persisted in
`experiment_assignments`. Its `(user_id, experiment_key)` primary key and
`assign_user_experiment_variant` database function preserve the first valid
assignment even if the PostHog rollout changes later.

The assignment flows through conversation metadata so subsequent
`tour_selected`, `reservation_started`, and `reservation_completed` events keep
the original cohort.

## Measurement ownership

PostHog compares product behavior:

```text
tour_recommended
  -> tour_selected
  -> reservation_completed
```

Filter `experiment = tour_recommendation_prompt` and break down by `variant`.
The relevant events contain only the safe `experiment` and `variant`
properties; prompts and AI-system telemetry are not sent to PostHog.

LangSmith compares AI behavior by prompt version:

- evaluation score
- latency
- prompt, completion, and total token usage
- estimated cost
- tool correctness and retrieval quality

`runTourRecommendationPromptExperiment` wraps the existing LangSmith evaluation
runner with both runtime prompt assets. Evaluation executors must return safe
numeric metadata and must not export raw prompts, responses, retrieved content,
PII, or secrets.

## PostHog configuration

Create a multivariate feature flag with key `tour_recommendation_prompt` and
variants:

- `recommendation_prompt_v1`
- `recommendation_prompt_v2`

A 50/50 rollout is the normal starting point. Existing durable assignments are
sticky; changing the rollout affects only users who have not yet received an
assignment.
