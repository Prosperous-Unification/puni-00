## Context

The shared adapter currently treats absent cookie permission as a complete Google block. The enabled site/app already share environment-isolated consent and a validated page/event/campaign registry. The owner requests GA4 collection from the first page and rejects a separate analytics dashboard.

## Goals / Non-Goals

Start safe cookieless measurement on the first registered page, preserve full explicit rejection, and grant analytics cookies only through a valid choice. Keep functional actions independent. No detailed pre-consent local recorder, raw personal content, new dashboard, identity fabrication, Ads/UPD activation or production release.

## Decisions

Use advanced collection as the policy of explicitly enabled analytics; normal builds/demo stay disabled. Distinguish a valid rejected preference from absence/expiry/malformed permission: the former remains a complete opt-out, the latter permits only consent-denied cookieless measurement. Existing valid acceptance continues to allow analytics storage. Keep the existing cookie version/lifetime/environment boundary; do not reinterpret a stored rejection as permission.

Model transport readiness and cookie permission precisely. A cookieless-ready state must be distinguishable from permitted cookie measurement and an explicit denied/disabled state. Google initialization receives denied consent before config/event commands; a later acceptance updates the same tag before subsequent events. Ads, signals, enhanced conversions and user_data remain disabled. Do not turn a user opt-out into a granted consent signal.

Use the existing isolated Google command queue for safe startup events, preserving the first canonical page context even during rapid navigation. Any additional queue is bounded, sanitized before insertion and purged on rejection/disposal; it is not a detailed activity history and is never replayed merely because cookie permission changes. Dispatch outcomes describe vendor enqueue, never network delivery. Keep only ephemeral deduplication before consent; persistent receipt markers remain consent-dependent and receipts never enter payloads.

App/site privacy controls state that basic cookieless measurement starts on arrival, cookies require permission and Disable measurement stops further collection. Keep existing legitimate request/draft storage separate. Update the shared public adapter/app first; private site copy and browser harness follow only through a byte-identical projection.

## Risks / Trade-offs

Google may not report unconsented traffic in a new low-volume property; advanced collection is not proof of complete funnel reports. Official behavioral modeling thresholds and live-report limitations are recorded in the research. Sending cookieless data still requires appropriate privacy disclosures and lawful processing; no universal legal-compliance claim is made. A successful enqueue or HTTP204 is not processed-report proof.

## Migration Plan

No database migration. Preserve stored explicit rejections and already submitted request data. Stage and test source with the real non-debug Google tag and local HTTPS collector before the exact public gate/private projection. The current separately queued CSS-only release remains immutable. Enable only reviewed development delivery; production stays held.

## Open Questions

None for the requested collection behavior. Google account access/report eligibility remains an external verification prerequisite. The detailed pre-consent local-buffer suggestion is not authorized for implementation and is excluded.
