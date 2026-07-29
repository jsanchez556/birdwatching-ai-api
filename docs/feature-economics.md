# AI feature economics

The admin feature economics report combines provider-neutral AI usage costs with
recognized subscription-renewal revenue.

## Metrics

For each UTC daily or monthly bucket:

- `usage`: count of `usage_events`
- `tokens`: summed AI tokens
- `aiCost`: summed estimated AI provider cost
- `subscriptionRevenue`: successfully recorded `subscription_renewed` revenue
- `estimatedContributionMargin`: subscription revenue minus AI cost
- `estimatedContributionMarginPercent`: contribution margin divided by revenue

The report also groups usage and cost by AI feature, including `chat`, `voice`,
`identification`, `image_analysis`, and `embedding`.

## Revenue allocation

Subscription revenue is not naturally owned by one AI feature. The report
therefore estimates per-feature revenue by allocating each paying user’s
recognized revenue within a period according to that user’s feature-usage
share:

```text
feature allocated revenue
  = user period revenue × feature usage / total user AI usage
```

Feature contribution margin is allocated revenue minus feature AI cost.
Revenue from subscribers with no AI usage in that period remains
`unallocatedSubscriptionRevenue`. Overall contribution margin always uses total
recognized revenue minus total AI cost.

This is an estimated contribution margin, not GAAP gross margin. It excludes
non-AI infrastructure, support, payment processing fees, taxes, refunds, labor,
and other operating costs.

## API

`GET /billing/admin/feature-economics` is restricted to admins.

Query parameters:

- `granularity`: `daily` or `monthly`; defaults to `monthly`
- `startDate`: optional ISO date/time
- `endDate`: optional ISO date/time; exclusive report boundary

Default windows are the latest 30 daily buckets or latest 12 monthly buckets.
Daily reports are limited to 366 days and monthly reports to 36 months.

## Data ownership

- `usage_events` is authoritative for feature usage, tokens, and AI cost.
- Verified, normalized `subscription_renewed` billing events are authoritative
  for recognized subscription revenue.
- PostgreSQL performs period aggregation and per-user revenue allocation.
- `featureEconomics.service.js` validates filters and maps database values into
  the public report contract.
