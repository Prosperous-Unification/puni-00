## Why

The current basic consent controller prevents the Google tag and first page view from being sent until a visitor finds the optional analytics control. The owner needs GA4 measurement to start on the landing page so acquisition and funnel problems can be investigated, and explicitly chose GA4 over a separate dashboard.

## What Changes

- Start enabled GA4 measurement on the first registered public page using consent-denied, cookieless commands before any analytics-cookie permission.
- Carry safe page and funnel events through normal tag startup; enable analytics cookies only after acceptance. Preserve explicit rejection and withdrawal as a full measurement opt-out, including existing stored rejections.
- Keep page/campaign allowlists, operator exclusion, environment separation, ad features disabled and personal content out of ordinary GA4 events.
- Align site/app privacy controls and notice with default cookieless measurement and explicit cookie permission. Clearly distinguish collection from GA4 processing/reporting.

## Non-Goals

No detailed pre-consent recorder, fingerprinting, raw emails/briefs/answers in GA4, invented client identities, another dashboard, Ads/UPD activation, spending, provider activation or production release. Do not promise complete non-consenting visitor funnels or low-volume behavioral modeling.

## Constraints

Normal builds/demo stay disabled; enabled development uses the supplied G-R0JM3R4SSV and production identity remains held. Public canonical adapter/app changes precede private byte-identical projection and site integration. Use Google’s documented consent commands and the existing real-tag/local-HTTPS payload fixture. A known decline stays an opt-out; never convert absent/expired permission into cookie consent. Keep bounded optional loading and functional request handling independent of measurement. Every changed safety check needs an observed production-path fault/restoration proof. No h4 tests/builds/manual Jobs.

## Capabilities

### New Capabilities

- `first-page-measurement`: truthful first-load GA4 collection and cookie-consent transitions.

### Modified Capabilities

None.

## Domain Terms

Cookieless measurement; Analytics event.

## Decisions Recorded

None.

## Impact

Shared analytics controller/vendor adapter and tests, app/site privacy UI, privacy copy/evidence, controlled Google payload checks, public gate/private projection and development verification. GA4 property report eligibility/access is separate from browser payload acceptance.
