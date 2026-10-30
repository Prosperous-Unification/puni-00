# Task 4.4 bounded mounted remote endpoint compensation acceptance

Date: 2026-10-23. Base: `d4cede3c9261dd97d758228adff272a615df7d0f`.
Workspace: `/tmp/puni-compensation-44`, branch
`acceptance/mounted-compensation-44`.

The new `cross-project-remote-replay.controller.db.test.ts` covers the current
production replay path through mounted HTTP requests, composed SQLite stores,
retained browser authority and publication transport. It performs a real
first-child command compounded with an unrelated local patch, then independently
edits either the incoming remote predecessor or outgoing remote successor through
that project's mounted command route. Both undo and redo are covered. Each case
confirms the selected journal guards the edited endpoint and the real edit
increments its revision exactly once.

The replay must return HTTP 409 `stale_undo` with the remote endpoint change
detail. Every database table must equal the snapshot taken after the remote edit,
except for removal of exactly the selected stale journal entry. This comparison
includes both local and foreign journals, revisions, relationships, audit and
event rows. Publication requests must remain unchanged. Redo cases first perform
a successful mounted undo, exercising flipped external revision evidence.

## Watched R5 fault

Temporarily changed only the replay's external revision mismatch predicate in
`WorkItemService` from `revisions.get(scopedRevisionKey(revision)) !==
revision.revision` to that expression followed by `&& false`. Endpoint admission,
incident receipt checks and graph checks stayed active.

Command:

```sh
bun test apps/wbs/be-01/src/controller/cross-project-remote-replay.controller.db.test.ts --timeout=30000
```

Observed: **0 passed, 4 failed**, 58 assertions. Every case returned unsafe
HTTP **200**, body `{ done: '2 changes', detail: null }`, instead of HTTP 409
`stale_undo`. Log: `/tmp/mounted-compensation-44-red.log`.
The original comparison was restored immediately. Adjacent `Proof:` comments
record the observed fault in production and beside the mounted cases.

## Checks and limits

- Baseline mounted copy: **1 passed, 0 failed**, 36 assertions.
- New mounted replay cases before fault: **4 passed, 0 failed**, 66 assertions.
- `bunx tsc --build --force apps/wbs/be-01/tsconfig.json`: exit 0.
- Final regression and lint receipts are recorded below.

No production activation, runtime behavior change, migration, deployment or image
rehearsal is included. The synthetic stored authority is fixture-only; the
mounted structural/history paths do not opt into general external authoring.
Task 4.4's broader lifecycle/history matrix and the exact-SHA host gate remain
open; this packet closes only mounted remote endpoint revision compensation
evidence. No full backend suite, full workspace lint/build or h2/h4 gate is
claimed.

Final restored regression command:

```sh
bun test apps/wbs/be-01/src/controller/cross-project-remote-replay.controller.db.test.ts apps/wbs/be-01/src/controller/cross-project-mounted-copy.controller.db.test.ts apps/wbs/be-01/src/controller/cross-project-incident-replay.controller.db.test.ts --timeout=30000
```

Observed: **9 passed, 0 failed**, 224 assertions across three files, 17.06 seconds.
Log: `/tmp/mounted-compensation-44-green.log`.

`bunx openspec validate cross-project-dependencies --json`: exit 0, one valid
change, no errors and 18 existing requirement-length warnings. Initial focused
ESLint caught an unsafe response JSON assignment; it was corrected by binding
the response to `unknown`. The first lint run also lacked a cached Nx graph;
a fresh isolated Nx graph was generated before the final lint run.

Final focused ESLint for the new mounted test and the production file bearing
the proof comment: exit 0 with the fresh isolated Nx graph. The backend
TypeScript build reported no errors. No runtime statements changed in the final
production diff.
