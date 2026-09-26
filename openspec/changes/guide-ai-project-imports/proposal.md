## Why

People cannot reliably bring an existing project into WBS through an AI client from a connection snippet alone. They need a safe sequence for authentication, source mapping, preview, import and reconciliation, with honest client-support labels.

## What Changes

- Publish `docs/import-with-ai.md` as an accessible help page and link it from Export / Import → Import with AI.
- Give client-specific connection guidance and a support table covering all clients in the design reviews, with documented, bridge fallback or unverified status and separately recorded live-tested evidence.
- Provide a copyable prompt that previews mappings before write, preserves unknowns, uses WBS batch/import tools correctly and checks the result.

## Non-Goals

No native Jira, Linear or Asana adapter, `.mpp` parser, continuous sync, source deletion, automatic conversion of story points or packaged plugin.

## Constraints

Depends on `enable-public-mcp-client-auth`: publish a URL and “tested” label only after live public authentication, write and refresh evidence. OAuth per-user tokens are obtained by sign-in; users are not asked to copy browser tokens. Unsupported relationships are reported rather than invented. One-time copy creates a new project by default; append requires explicit choice.

## Capabilities

### Modified Capabilities

- plan-import: guided preview, write and reconciliation.
- wbs-domain: discoverable in-app Import with AI help.

## Domain Terms

None.

## Decisions Recorded

None.

## Impact

Canonical guide, help link/content and documentation/browser tests. No stored contract or migration.
