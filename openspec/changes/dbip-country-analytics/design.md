## Context

The canonical API/app/analytics live in public puni-00; the licensed Astro site and mirrored runtime live in puni-pr-00. Current global unset-choice behavior must become regional without fabricating an explicit choice. Current public source is c894bc45; private local work builds on the reviewed card commit `5198613`. The supplied archive extracts to the provider-published checksums; provenance is retained outside source until imported.

## Goals / Non-Goals

Goals are the regional visitor behavior, local-only lookups, licence credit, monthly maintenance note and verified packaged asset defined in the delta. There is no database migration, new user tracking store, automatic downloader, paid inference or production activation.

## Decisions

### Server asset and reader

Use pinned `mmdb-lib` 3.0.3, verified with Bun1.4.4 and the real archive. Keep gzip in the API source asset directory with SHA-256/release provenance and CC BY notice. Bound decompression, validate both archive and extracted bytes and the reader database kind. The reader is loaded once by main and injected into createWebsiteApi; programmatic API instances without this optional dependency return explicit unknown. Missing configured assets are fatal. Bun file-loader asset imports or an equally explicit source/build-relative packaging path must work in both source and actual compiled output; packaging is proved rather than assumed.

### Public contract

Export AnalyticsRegion = consent-required | elsewhere | unknown and a validated region response from website contracts. GET /analytics/region uses selectClientAddress and existing request windows; no raw address is returned or persisted by this feature. It returns region plus database metadata {month, refreshDue, updateDue}. Same-origin reads and configured cross-origin app/site reads are supported; foreign Origin is refused and responses are no-store. Country classification uses a recognized ISO country catalogue; unknown codes do not become elsewhere. The consent set is the 30 EEA countries plus GB/CH and corresponding EU outermost/Åland codes AX/GF/GP/MQ/RE/YT/MF.

### Browser controller

Keep explicit AnalyticsChoice independent from AnalyticsRegion. Add getRegion/subscribeRegion/setRegion to the canonical controller. Permission for unset is granted only for elsewhere, otherwise denied; accepted/rejected retain precedence. Region notification changes card visibility during vendor loading/failure without a fake preference write. The browser wrapper starts a bounded single region request to the site's existing /api/analytics/region, credentials omitted, only for enabled supported routes needing a default. Pending/failure is explicit unknown; no region result can override a later choice, disposal or unreadable storage. It does not record or backfill detailed activity. The real first-page vendor ordering and sanitized context remain unchanged.

### Presentation and credits

App ArrivalChoice uses the region independently of tag readiness and gets the approved compact card styling. Private site consumes the same controller and mirrors the public projects through the existing snapshot process; its reviewed card remains. Both shared footers expose the DB-IP credit link, with fuller licence/source details in privacy/maintenance documentation. The data file never enters client imports.

### Manual maintenance

The provenance manifest is the source of release/hash values; the maintenance document carries the requested dated next-action note and exact manual refresh steps. Runtime metadata derives next-month refresh due and a clock-tested due boolean. This is a visible maintenance indicator, not a scheduled notification or an automatic download.

## Risks / Trade-offs

IP country is approximate, including VPN exits; it is not legal residence. Unknown lookup keeps the card/cookies-denied default. This configured policy is not a certification of every country's privacy law. The free dataset requires visible attribution and manual monthly replacement. A new category must not be confused with saved consent. API absence during mixed-version rollout stays unknown, preserving the existing conservative default.

## Migration Plan

No SQLite schema change. First land a backward-compatible endpoint and packaged data, then controller/app and private site consumers. Existing saved v1 preferences remain valid. Validate local/fixture flows and package asset absence before any development publication. Use normal reviewed development release; production stays held.

## Open Questions

None blocks implementation; deployment remains subject to the owner's existing production hold.
