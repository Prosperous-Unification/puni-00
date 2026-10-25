# Website funnel analytics verification

Status: implementation pending; no Google tag was activated by this work.

The user supplied development measurement ID `G-R0JM3R4SSV` on 2026-10-25. Use the controlled consent adapter rather than the unconditional supplied snippet. This ID belongs to dev.puni.dev, as the user clarified. It may serve both development site and development app after consent/continuity verification; production needs a separate property and ID. Development tracking stays disabled unless explicitly configured.

The supplied ID identifies the development stream; administrative settings have not been independently verified. Production property and stream remain to be supplied. Event retention, advertising/enhanced-measurement settings, generate_lead key-event setup, saved reports and DebugView/processed reports remain unverified. No Analytics management connector is available in this session.

Contract, consent, leakage, blocked-provider, cross-host navigation and confirmed-lead tests have not yet run. Server counts must stay separate from the consenting GA cohort. The privacy contact supplied by the user is Danylo Fedorov, dany@puni.dev.

Recommended environment mapping: one Dev property/web stream for dev.puni.dev and dev.app.puni.dev, using G-R0JM3R4SSV; one separate Production property/web stream for puni.dev and app.puni.dev, whose ID is still pending. Google documents [same-stream measurement](https://support.google.com/analytics/answer/10071811?hl=en) and [shared subdomain cookies with configurable prefixes](https://developers.google.com/tag-platform/security/guides/customize-cookies). Both development hosts share puni.dev as their cookie ancestor, so isolate environments with distinct analytics and consent cookie names; a dev.puni.dev cookie cannot be read by dev.app.puni.dev. Functional draft claims remain host-only.
