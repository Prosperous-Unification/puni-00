# Hosted optimization API

Exploratory product note from 2026-09-08. No product decision has been made.

## Hypothesis

There may be a paid product in exposing an OR-Tools-backed scheduler as a
managed API. The stronger offer is not "OR-Tools over HTTP." It is a bounded,
domain-shaped service: send work, dependencies, calendars, and team capacity;
receive a feasible schedule with explanations.

The WBS application can be its first consumer and a live demonstration of the
model. A useful test is whether somebody would buy the API without adopting the
WBS interface.

## Why it could work

- OR-Tools is Apache-2.0 licensed. The license grants commercial use and
  redistribution subject to its attribution and redistribution conditions.
  Optional third-party solvers retain their own license terms.
- Managed optimization is an established category. Buyers pay for a stable API,
  compute, queues, limits, callbacks, observability, model versions, and support
  around a solver they could technically operate themselves.
- Domain APIs already sell optimization in workload-shaped units. Google Route
  Optimization bills by shipments submitted. Timefold offers domain APIs for
  employee scheduling, field-service routing, pickup and delivery, and task
  scheduling.

## Positioning

The initial product should solve one recurring scheduling problem completely.
A generic endpoint that accepts arbitrary solver models competes mostly on
hosting convenience and exposes customers to OR-Tools concepts. A scheduling
contract can instead own validation, sensible defaults, infeasibility reports,
stable result shapes, and the operational behavior of long-running solves.

The current WBS domain suggests this initial contract:

> Submit tasks, dependencies, estimates, calendars, and per-project team
> capacity. Receive a feasible schedule, the constraints that delayed each
> task, and the solve status.

Finding a feasible solution and proving optimality must be distinct statuses.
Requests also need explicit limits for problem size, wall-clock time, and
parallel solves.

## Commercial shape to test

Start with a monthly minimum that includes a compute allowance, then meter
overages. Do not offer unlimited solves. Possible billing units are solve
seconds, submitted tasks, or completed solves; the best unit is the one a buyer
can predict from their own workload.

Pricing is not decided. Current market signals are:

- Nextmv includes OR-Tools execution and charges usage in execution credits,
  where one standard-compute second is one credit. Its published pay-as-you-go
  rates are a useful infrastructure comparison, not a target price.
- Google Route Optimization charges by shipments submitted, showing the value
  of a domain unit rather than raw compute.
- Timefold publishes feature and compute tiers but asks prospects to contact
  sales for prices, consistent with services that include modeling and support.

The price must cover constraint discovery and support. If each customer needs a
private constraint model, the business becomes consulting unless those models
converge into reusable product capabilities.

## Largest risks

1. **No distinct buyer:** teams able to formulate arbitrary OR-Tools models can
   often host them too.
2. **Unbounded compute:** adversarial or simply difficult models can consume far
   more CPU and memory than their request size suggests.
3. **Custom-model gravity:** customer-specific constraints can dominate delivery
   and support costs.
4. **Weak infeasibility UX:** "no solution" is rarely enough; buyers need to know
   which input or constraint to change.
5. **Trust:** schedules affect staffing and commitments, so determinism,
   reproducibility, tenant isolation, and retained-input policy matter early.

## Cheapest validation

Describe the scheduling contract on one page and put it in front of five people
who currently build project, workforce, or field-service schedules. Ask for a
real input file and the decision they make from its output. A strong signal is a
buyer willing to supply data and rerun the schedule; compliments about a generic
solver API are not.

## Sources checked

- [OR-Tools license](https://github.com/google/or-tools/blob/stable/LICENSE)
- [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0)
- [Nextmv pricing](https://www.nextmv.io/pricing)
- [Timefold Platform](https://docs.timefold.ai/timefold-platform/latest/introduction)
- [Timefold pricing](https://timefold.ai/pricing)
- [Google Route Optimization usage and billing](https://developers.google.com/maps/documentation/route-optimization/usage-and-billing)
- [Google Maps Platform pricing](https://developers.google.com/maps/billing-and-pricing/pricing)
