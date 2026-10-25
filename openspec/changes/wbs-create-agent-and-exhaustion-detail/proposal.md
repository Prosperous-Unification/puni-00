<!--
INTENT. Hard cap: 400 words excluding these comments.
-->

## Why

The swarm end-to-end test (PR #666) found two gaps an agent hits directly
(issue #669, F1 and F7):

- `createPerson` cannot create an agent. Its `kind` field is the command's
  discriminator, so an agent today takes `createPerson` and then
  `patchPerson { kind: 'agent' }`: two commands where one is meant, and the
  limits spec says the directory add with kind `agent` is "reachable only
  through the plan import until it gains one".
- `resources_exhausted` names only the first short resource in resource-id
  order. An agent waiting for RAM claims again and is refused for the worktree
  it was never told about.

## What Changes

- `createPerson` gains an optional `personKind`, `person` (the default) or
  `agent`, validated as `patchPerson.patch.kind` is: any other value is
  `invalid_kind` before anything is read. A new agent passes the same
  organization gauge `patchPerson` does (`agent_person_limit { cap, current,
added }`), inside the batch's write turn; legacy access has no cap. A name
  the organization already holds joins that person and keeps its kind, as the
  plan import does; the answer's entity names the kind kept.
- `resources_exhausted` keeps its fields, now the first short resource, and
  adds `resources: [{ resourceId, asked, free, holders }]` naming every short
  resource in resource-id order. The change is additive: fe-01's
  `plan-refusal.ts` reads only the code, mcp-01 passes the body through.
- The MCP tool descriptions of `createPerson` and `claimWorkItem` say so.

## Non-goals

- Changing an existing person's kind through `createPerson`.
- Listing every short resource in a redo's or undo's `stale_undo` detail; it
  stays one sentence naming the first.
- F5 and F6 of issue #669.

## Constraints

- No migration: `person.kind` and the claim tables are unchanged.
- The refusal stays parseable by every client built before it (additive field).
- Archive order: `wbs-resources`, then `wbs-organization-limits`, then this change. Both
  deltas modify capabilities those changes add, so until then openspec reports each as
  "Archive would refuse … target spec does not exist".
