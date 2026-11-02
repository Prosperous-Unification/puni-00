---
status: proposed
---

# Consented traffic analytics stays separate from request content

PUNI needs campaign attribution and funnel drop-off reporting, which its stored-row operator counts cannot provide. The proposed release adds GA4 only after an explicit analytics choice, while retaining server records as the authority for submissions and inference spend. Request descriptions, chat, briefs, references, emails, claim tokens and internal request identifiers never enter GA4. This deliberately revises the earlier no-browser-analytics policy; it does not convert operational request records into a marketing dataset.

First-party counts alone avoid the external measurement dependency but leave traffic attribution unmeasured. Advanced Consent Mode can send cookieless measurements before consent; the initial release instead uses basic blocking with no Google measurement requests before acceptance. It loses visibility into declining visitors and ad-blocked sessions, so GA4 conversion rates describe the measured cohort, not every visitor. A different provider remains possible, but data already disclosed cannot be recalled by switching libraries.

The [analytics change](../../openspec/changes/website-funnel-analytics/design.md) defines the event allowlist, consent lifecycle, cross-subdomain behavior and verification. This is a planning recommendation awaiting the owner's implementation choice, not evidence that GA4 has been configured.
