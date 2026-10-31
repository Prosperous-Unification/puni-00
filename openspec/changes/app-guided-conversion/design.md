## Context

The public React app/API are canonical; the private Astro site currently serves A. SiteHeader still renders the old rail. Anonymous version1 scoping already supplies catalogue IDs, candidate briefs, optional references and an explicit contact editor; the development provider remains disabled.

## Goals / Non-Goals

Match the existing landing header and keep email-last, offer-guided conversation. Do not add reply fields, accounts, database state, budgets or automatic submissions. First-page GA4 is a separate change.

## Decisions

Reimplement the measured PUNI masthead using the existing React chrome and owned CSS; never copy licensed Astro/theme source. Retain night/light tones and the flow/overlay placement distinction using names that describe placement rather than the removed rail. Update all callers and existing component/browser assertions together.

Use the existing starting-choice and scoping-question catalogue, including route-selection, references and uncertainty. Tighten the structured scoping prompt, synchronize its documented source, and record a new future prompt version without editing persisted operations or legacy sales prompts. The model recommends reviewed choices; the visitor supplies the actual choice.

Verify the email-free path with the existing mounted real-API/controlled-provider fixture before any paid activation. The disabled provider remains honest and usable through manual review. Once source is reviewed, use the canonical public h2 gate, byte-identical private projection and established development release process.

## Risks / Trade-offs

Header height affects fixed chat controls and all app states; measure small screens, focus, contrast and layout stability. Prompt text alone is not proof of real-model behavior; retain scripted regression, adversarial cases and a separately authorized real-provider evaluation. Shared privacy UI changes from the independent GA4 task must remain compatible.

## Migration Plan

No database migration or reply-schema change. New source first, then exact public gate and private projection. Keep production held. Live AI cannot be marked complete until its existing paid activation prerequisites are actually satisfied.

## Open Questions

None for source implementation. Real paid evaluation authorization and Google account verification remain existing external prerequisites; they do not prevent local source work.
