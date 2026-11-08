## Why

On dev, 2026-10-26, a two-agent swarm claimed work through MCP with
`{"kind":"claimWorkItem","workItemId":…,"runId":…}` and was refused `400 missing_id`. An agent
claiming for itself had to name its own person id, and the generic code did not say which id
was missing.

## What Changes

- `claimWorkItem` and `releaseWorkItem` naming neither `personId` nor `personRef` act for the
  person the request acts as (`actingPersonOf`): an API key's or MCP consent's own agent
  person. The result is the same as naming that person: the same lease, pin rules
  (`credential_not_for_person`), journal stack and undo.
- A request acting as its account (browser session, first-party, upstream pair) that names no
  person is refused `400 person_required` at the command's index, instead of `missing_id`.
- The command descriptions the OpenAPI document and the MCP batch tool carry say so.

`missing_id` stays the shared code for every other absent id/ref pair: it names no field and
other commands depend on it, so the claim pair gets its own code rather than changing it.

## Non-Goals

- The runtime channel (`applyRuntimeCommands`): its claim and release always name the person
  in the digested request, so its wire shape is unchanged. The acting person still reaches
  the shared batch path it runs through.
- Defaulting the person of any other command (`setAssignee`, `assignSubtree`, ...).
- An upstream (OIDC) pair's pinned person: `actingPersonOf` answers null for it, as lease
  renewal and the undo journal read it, so such a caller still names the person.

## Impact

`@wbs/core` plan commands, `@wbs/contracts` command descriptions and refusal union, be-01's
batch route, fe-01's refusal copy (one more silent code), mcp-01 descriptions.
