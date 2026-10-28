## Why

The operator funnel counts stored drafts, conversations and submissions but cannot show acquisition channels, landing visits or where visitors stop interacting. The revamped site needs those measurements to improve conversion and judge marketing, while keeping project content out of third-party analytics.

## What Changes

- Introduce consented GA4 traffic and funnel measurement across the public site and app.
- Track reviewed event names and bounded identifiers for starting choices, questions, brief display and confirmed submission.
- Make analytics optional, with Accept, Reject and change-preference controls; no Google tag loads before acceptance.
- Provide an acquisition report and funnel exploration, with development traffic isolated and consent/ad-blocking limitations explicit.
- Keep operational submissions and model spend in the existing server reports. Update the privacy notice to match the chosen measurement policy.

## Non-Goals

Ad purchasing, remarketing, Google Signals, enhanced conversions, session recordings, chat transcript analytics, automatic qualification, offline sales import, CRM implementation or guaranteed complete attribution.

## Constraints

No raw descriptions, messages, briefs, references, email addresses, claim tokens or internal request IDs in GA4, URLs or tag payloads. Chat and submission work with analytics refused or blocked. Use the same production measurement stream across the intended hosts; development is isolated. Existing authentication cookies remain host-only. Follow additive repository changes, Bun/Nx and the required gate.

## Capabilities

### New Capabilities

- `funnel-analytics`: optional traffic attribution and bounded conversion events.

### Modified Capabilities

None in the archived registry. This change supersedes the no-browser-script clause in the active website-operations and website-funnel-counts specifications only for consented, allowlisted measurement; operational counts remain authoritative.

## Domain Terms

None. Existing funnel count remains a stored-row count; a GA4 event is a separate measurement.

## Decisions Recorded

[Proposed analytics boundary](../../../docs/adr/0063-consented-traffic-analytics-stays-separate-from-request-content.md).

## Impact

Public app event/consent adapter and tests, private site/consent integration, privacy copy, GA4 property configuration and release verification. Depends on the conversion-scoping event points. No property has been created and no tag is activated by this plan.
