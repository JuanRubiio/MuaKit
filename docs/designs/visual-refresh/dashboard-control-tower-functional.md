# Dashboard Control Tower - Functional Design

## Purpose

The Dashboard is the owner control tower for Mua. Its default view must answer, in order:

1. What economic result is being recorded?
2. What explains that result?
3. What threatens future sales, margin, or cash?
4. What action should be taken today?

It is not a replacement for the analytical depth of Gastos, Ingresos, Pedidos,
Materiales, Proveedores, or purchasing plans. Every block must provide a useful
summary and a direct path to the owning domain.

## Default Scope

- Default period: current quarter.
- Default granularity: monthly.
- Default mode: `Operacion`.
- Alternative mode: `Rentabilidad`.
- Freshness is always visible.
- All values in the concept images are illustrative. Production values must come
  from the same reusable services used by their owning domains.

## Metric Semantics

### Primary KPIs

| KPI | Definition | Guardrail | Drill-down |
| --- | --- | --- | --- |
| Ingreso neto cobrado | Sum of executed net payouts in the selected period | Pending or unreconciled income | Ingresos |
| Gasto registrado | Sum of active expenses in the selected period | Draft and pending imported expenses are excluded and shown separately | Gastos |
| Saldo operativo registrado | Net collected income minus registered expenses | It is not accounting profit or order margin | Gastos / Ingresos |
| Margen real de pedidos | Average or weighted real margin of reliable orders in the selected period | Always show reliable-margin coverage | Pedidos |
| Ticket medio | Net sales divided by orders in the selected period | Show order count | Pedidos |

Every KPI shows comparison with the immediately preceding equivalent period.
Clicking a KPI opens the corresponding domain with the dashboard period applied.

### Modes

`Operacion` prioritizes collected income, registered spending, purchasing risk,
and the action queue.

`Rentabilidad` retains the same shell but promotes order sales, real cost,
reliable margin, margin distribution, and low-margin orders. It never mixes
collected payouts with order profitability without explicitly labelling them.

The coordinated visual references are:

- `dashboard-control-tower-desktop.png`
- `dashboard-control-tower-mobile.png`
- `dashboard-profitability-desktop.png`
- `dashboard-profitability-mobile.png`
- `dashboard-filters-desktop.png`
- `dashboard-filters-mobile.png`

### Profitability Mode

The primary KPIs are:

- Net order sales.
- Reliable gross profit.
- Revenue-weighted real margin, always paired with reliable-margin coverage.
- Real cost sold.
- Average ticket, paired with order count.

The main diagnostic surfaces are:

- Profitability movement: net order sales, real cost, and weighted margin.
- Margin pressure: unreliable orders, low-margin orders, and missing costs.
- Margin distribution by both order count and net-sales share.
- Cost drivers that consume order margin.
- Orders requiring review.
- Profitability by kit type.
- Calculation quality.
- Materials with the highest impact on consumed cost.

## Desktop Information Architecture

### 1. Header And Global Controls

- Title and short purpose statement.
- Period, granularity, and freshness.
- No export control in the first iteration unless there is a real export use case.

### 2. Primary KPI Rail

Exactly five cards. Expense categories and record counts do not appear as primary
KPIs. Cards must remain readable at laptop widths and wrap only when necessary.

### 3. Result And Action Hero

#### How The Operating Balance Is Formed

A waterfall explains the selected period:

`Net collected income -> Materials -> Marketing -> Shipping -> Services and
software -> Registered operating balance`

The chart is descriptive of registered cash movement, not profitability.

#### Today's Priorities

One cross-domain queue ordered by expected business impact, then urgency.

Candidate signals:

- Stock risk before supplier delivery.
- Orders without reliable margin or below the operating margin threshold.
- Pending purchasing actions or partial receipts.
- Draft expenses and imports ready for confirmation.
- OCR errors.
- Pending or unreconciled income.

Each row includes a short impact, severity, and a single domain action. Low-impact
catalog hygiene such as missing images belongs in the owning domain, not here.

### 4. Business Drivers

#### Order Profitability

- Sales, real cost, and margin percentage over time.
- Reliable-margin coverage and orders requiring review.
- Links to filtered Pedidos views.

#### Recommended Purchasing

Uses the intelligent replenishment service, never the legacy static minimum list.

Shows:

- Actionable material count.
- Estimated purchasing requirement.
- Critical/high/medium mix.
- Top recommendations with coverage, supplier, suggested quantity, and cost.
- Entry point to review and create a purchasing plan.

### 5. Supporting Explanations

#### Where Spending Goes

Horizontal ranked bars with amount, share, and previous-period movement.
This replaces the expense donut and separate expense-category KPI cards.

#### Income Channels

A 100% stacked bar plus concise channel rows with amount, share, and movement.
This replaces the channel donut.

#### Quality And Synchronization

Compact interpretation guardrails:

- Reliable order-margin coverage.
- Expense imports ready for confirmation.
- OCR errors.
- Last Shopify synchronization.

These are not presented as business outcomes.

### 6. Supplier Dependency

A compact Pareto-style ranking with supplier spend, share, and cumulative share.
Future enrichment may include lead time and materials at risk per supplier.

## Mobile Behavior

- Mobile navigation uses a menu; desktop domain navigation must not be squeezed.
- KPIs become a horizontally swipeable rail with one complete card visible.
- Today's Priorities appears before analytical charts.
- The waterfall becomes a simplified, readable mobile bridge.
- Recommended Purchasing and Order Profitability become compact summary panels.
- Supporting explanations become expandable summary rows with the key takeaway
  visible while collapsed.
- No desktop tables or charts may create horizontal page overflow.

## Interaction Contract

- Global date controls update every block consistently.
- KPI cards, priority rows, chart categories, and ranked rows deep-link to the
  owning domain with relevant filters.
- `Operacion` and `Rentabilidad` are persistent dashboard modes, not separate
  duplicated pages.
- Empty states explain why no action is required and link to the owning domain
  only when useful.
- Loading states preserve panel dimensions and do not show stale values as fresh.
- Errors are isolated per block; one failed source must not blank the Dashboard.

## Time Filters And Granularity

### Period

Supported presets:

- Current month.
- Last 30 days.
- Current quarter.
- Last 3 months.
- Last 6 months.
- Current year.
- Custom range.

The selected period updates totals, comparisons, distributions, rankings, and
period-based action rows. Each domain uses its relevant business date:

- Gastos: invoice date.
- Ingresos: payout date.
- Pedidos and profitability: order date.

### Granularity

Supported chart groupings:

- Auto.
- Day.
- Week.
- Month.
- Quarter.

Granularity changes chart grouping only. It never changes KPI totals,
distributions, rankings, or the comparison period.

Recommended `Auto` behavior:

- Up to 45 days: daily.
- 46 days to 6 months: weekly.
- More than 6 months to 24 months: monthly.
- More than 24 months: quarterly.

Charts must adapt their visual form to the available point count. Short series
use bars or points instead of misleading smoothed curves.

### Comparison

Default comparison: immediately preceding equivalent period.

Examples:

- Current month compares with the previous month to the equivalent elapsed day.
- Current quarter compares with the previous quarter to the equivalent elapsed
  day.
- Custom ranges compare with the immediately preceding range of equal length.

### Current-State Blocks

The following blocks do not change with the period filter and must be labelled
`Ahora` or `Estado actual`:

- Today's priorities that describe unresolved current work.
- Intelligent replenishment and recommended purchasing.
- Active purchasing-plan state.
- Synchronization freshness and current diagnostic health.

Historical or selected-period rows inside the action queue must be visually
distinguished from current-state rows.

## Data Ownership

| Dashboard block | Owning source/service |
| --- | --- |
| Income and pending reconciliation | Ingresos |
| Registered spend and drafts | Gastos |
| Imports and OCR health | Expense import service |
| Order profitability and coverage | Pedidos profitability service |
| Replenishment risk and suggested purchases | Intelligent replenishment service |
| Purchasing-plan state | Purchasing service |
| Supplier concentration and lead time | Proveedores |
| Freshness and synchronization | Diagnostico / Shopify synchronization |

The Dashboard must consume shared services. It must not reimplement simplified
business logic locally.

## Deliberately Removed From The Default View

- Expense record count as a primary KPI.
- Expense-category cards for Materials, Marketing, and Shipping.
- Separate default charts for monthly income and monthly expense.
- Expense and income donut charts.
- Static reorder-point list.
- Recent activity feed.
- Catalog-quality alerts without immediate business impact.

## Acceptance Questions Before Implementation

1. Should the waterfall include all registered expenses or only paid expenses once
   expense payment status is consistently maintained?
2. Should order margin be average percentage or revenue-weighted margin? The
   recommended default is revenue-weighted, with average percentage available in
   Pedidos.
3. What margin threshold should classify an order as low-margin?
4. Should purchasing requirements reduce the operating balance as a forecast, or
   remain a separate forward-looking warning in the first iteration?

## Recommended Decisions

### Expense Scope

Current behavior includes every active expense, including drafts. This remains
the intended behavior because draft expenses usually have a reliable invoice
total even when one or more material lines still need completion.

The Dashboard includes drafts in `Registered expense` and the operating balance.
Draft count and completion work remain visible in Today's Priorities.

### Margin Aggregation

Current behavior calculates the arithmetic mean of reliable order-margin
percentages. A very small order therefore affects the displayed margin as much as
a large order.

Approved default:

`Revenue-weighted margin = sum(reliable order profit) / sum(reliable order net sales)`

Keep arithmetic average margin as a diagnostic inside Pedidos.

### Margin Thresholds

Current behavior marks an order as low-margin only below 55%. In the current
reliable dataset this identifies zero orders and therefore provides no useful
operating signal.

Observed reliable-order distribution on 2026-06-15:

- Revenue-weighted margin: 86.74%.
- Arithmetic average margin: 87.75%.
- 10th percentile: approximately 77%.
- 20th percentile: approximately 88%.
- Median: approximately 91%.

Initial data-informed dashboard bands:

- Below 75%: critical margin review.
- 75% to below 88%: margin pressure.
- 88% or above: healthy.

With the current dataset, these bands identify approximately:

- Critical: 32 orders, 8.7% of reliable orders and 12.6% of reliable sales.
- Pressure: 38 orders, 10.3% of reliable orders and 13.0% of reliable sales.
- Healthy: 298 orders, 81.0% of reliable orders and 74.4% of reliable sales.

Threshold-management rule:

- Re-evaluate thresholds monthly from the latest 90 days of reliable orders.
- Use the observed 10th and 20th percentiles as evidence, then round to stable,
  understandable operating thresholds.
- Do not automatically change thresholds unless there are at least 100 reliable
  orders and the proposed change is at least 3 percentage points.
- Any threshold change requires human confirmation and is recorded with its
  effective date.
- Store thresholds in configuration so Dashboard and Pedidos share one source.

### Purchasing Forecast

Current purchasing recommendations and plans are separate from the Dashboard
balance and do not affect it.

Approved first iteration:

- Keep `Registered operating balance` historical and factual.
- Show recommended purchasing as a separate forward-looking exposure.
- Later add a clearly labelled `Projected balance after planned purchases` only
  after purchase-plan state and expected payment timing are dependable.
