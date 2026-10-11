# Editable brief and proposal request acceptance

## Why

WBS 060.05.3 asks for a persistent editable brief, an explicit proposal request with one contact
email, a privacy notice, a durable receipt with a retry error, an idempotent double click, and
two tests: an edited brief survives reload, and a storage failure on submit does not show
success. Under the anonymous-first scope (batch 10 D1) the request is made from the manual brief
and from the Build `[ YOUR BRIEF ]` card. The manual brief already saves through `PATCH /brief`;
the Build card kept edits only in memory, named no privacy notice, and nothing proved the
storage-failure or brief-to-inbox path in a browser.

## What Changes

- The Build card saves an edited brief to the draft through `PATCH /brief` when the field loses
  focus, shows `Saved. It stays with this browser for 24 hours.`, and on a refused save says
  `Your edit is not saved yet.` with the reason. Unchanged or blank text is never written.
- The card states how the email is used and links the site's privacy page; the action reads
  `Sending…` and is disabled while a request is in flight.
- The manual brief no longer announces a submission it just failed as "a previous submission";
  the stored pending request is still replayed after a reload.
- The operator inbox shows a submitted brief with its own line breaks.
- Tests: card save, refused save and privacy-line component tests; a mounted API test that a
  storage failure during submission stores nothing, keeps the draft and lets the same key retry;
  a mounted test that operator sign-in without a configured password answers 503; and
  `apps/website/fe-01/browser/proposal-flow.mjs`, the end-to-end browser acceptance at 1440, 768,
  390 and 320 px.

## Non-Goals

No structured brief fields (problem, users, workflows, must-haves, integrations, constraints,
unknowns stay headings inside one free-text brief, as the AI writes them); no new route; no typed
5xx for storage failures (an unexpected store error still throws, R5).

## Constraints

The card uses the existing draft claim and CSRF; the proposal body is the text on screen whether
or not it was saved.
