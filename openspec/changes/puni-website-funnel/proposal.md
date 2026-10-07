## Why

Prosperous Unification has no public path from a visitor's software need to a human-reviewed request. The approved site plan puts a request field first; its text must survive manual submission or later sign-in and scoping without retyping or an AI delivery promise.

## What Changes

- Visitors see an accessible `puni.dev` landing page with the request field above the pitch, services and a blog about real work.
- A visitor's description survives handoff and reload. The first release permits a browser-bound manual brief and one contact email without prospect sign-in.
- A visitor can explicitly request a human proposal immediately. Later releases add PUNI account sign-in, bounded scoping and optional concept preview without blocking submission.
- Operators receive a private queue and contact statuses. Submission is confirmed and idempotent.

## Non-Goals

- No automatic price, date, contract or delivery commitment.
- No payments, model-controlled tools, arbitrary fetched URLs, generated code execution or invented customer proof.
- The local funnel walkthrough is a design aid, not implemented authentication or inference.

## Constraints

- Astro/Novaform source stays in private `puni-pr-00/apps/website/site`; demo media must be replaced. EmDash does not gate launch.
- Public offer is Prosperous Unification; Vesper Shipyards stays internal. English first. Approved privacy terms cover description, chat and one contact email for 12 months unless the prospect becomes a client; provider wording remains a chat gate.
- `puni.dev`, `app.puni.dev` and `api.puni.dev` have separate security boundaries. The PUNI session must not reuse WBS identity or cookies. Migrations require `migration.sql` and `down.sql` and additive forward changes during shared SQLite swaps. Bun/Nx and the repository gate apply to work here.

## Capabilities

### New Capabilities

- `public-website`: landing, services, blog publication and discoverability.
- `request-handoff`: anonymous description transfer, account identity and draft recovery.
- `proposal-intake`: editable brief, explicit submission and private operator follow-up.
- `scoping-conversation`: bounded, policy-constrained OpenRouter conversation and usage accounting.
- `concept-preview`: safe, optional interface concept rendering and revision.
- `website-operations`: site/API delivery, privacy lifecycle and observable pilot operation.
- `repository-portability`: versioned shared governance and bidirectional project transfer between public and private monorepos.

## Domain Terms

Visitor, Prospect, Request description, Intake draft, Software request, Scoping conversation, Request brief, Concept preview, Proposal request, Operator inbox.

## Decisions Recorded

[ADR 0032](../../../docs/adr/0037-public-and-private-monorepos-share-a-portable-project-contract.md).

## Impact

Private `puni-pr-00/apps/website/site`; new `apps/website/fe-01`, `apps/website/be-01`, website contracts/storage and deployment; shared repository baseline and clean-copy gates; `docs/website/` and OpenSpec. WBS apps retain their current ownership.
