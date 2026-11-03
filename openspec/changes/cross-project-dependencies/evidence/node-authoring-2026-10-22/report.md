# Task 4.2 bounded FS node authoring and staged alias packet

Based on feature head `1cef3d8e4` in isolated clone
`/tmp/puni-node-authoring-proofs`. Production source and admission remain
unchanged. Task 4.2 remains unchecked; this packet does not complete its broader
matrix.

The existing `connected-command-admission.controller.db.test.ts` harness now adds
eight cases using real composed HTTP, migrated SQLite, connected graph/history
and the existing `open(undefined, true)` test-only active authoring seam:

- Both explicit remote node wire forms (split work-item/step IDs and
  `sn1.<workItemId>.<stepId>`) resolve to the same stable endpoint structure.
  Each uses a same-organization restricted predecessor owned by another member.
  The caller can read it but a mounted edit returns 403 without table changes.
- The successor is created as owner-local alias `REMOTE.010`, set ready and
  estimated earlier in the same batch. The external relationship binds that
  alias to its minted owner-local ID. Its project/scope/step IDs/type are checked
  exactly in `external_dependency`; `typed_dependency` stays empty. The mounted
  real tree places the successor at 2→3 and reports the same connected endpoint
  pair. The remote revision is 1 and successor revision is 3.
- The committed batch journal records the stable typed relationship forward,
  contains the minted ID rather than the alias, and retains exact external
  before/expected revisions 0→1.
- Ordinary inactive composition returns indexed 409
  `external_dependencies_inactive` at command 3. Active synthetic composition
  followed by an absent patch returns indexed 404 at command 4. Both compare
  every row of every non-SQLite-internal table before and after, covering the
  staged row, estimate, relationship, revisions, history, events and sequencers.
- Remote node-on-parent returns indexed 409 `rolled_up`; remote
  descendant-step-on-leaf returns 409 `not_a_parent`; a real owner-project step
  used on the remote node returns concealed 404 `not_found`. Each mounted refusal
  rolls back all staged work; the direct semantic service returns the same
  reason and rolls back an earlier patch under the real unit of work. A direct
  positive checks the same stable node scopes and step IDs in SQLite.

## Independently observed production mutations

Each mutation was injected alone, run through its selected mounted test and
restored in `finally` before the next mutation. Adjacent test `Proof:` comments
identify the observations. The transcripts are beside this report.

| Mutation                                                                                       | Selected test                                                                             | Observed failure                                                                                        |
| ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `bindTypedEndpoint`: replace explicit-project fallback with unconditional owner project        | `node authoring split remote endpoint binds staged dotted alias locally and schedules FS` | Expected 200, received 404; one selected test failed.                                                   |
| `bindTypedEndpoint`: pass `workItemRef` through as an ID instead of calling `context.required` | Same split endpoint case                                                                  | Expected 200, received 404; one selected test failed.                                                   |
| `WorkItemService.typedEvidence`: remove only node-on-parent refusal                            | `node authoring mounted and direct parity refuses node-parent with full rollback`         | Expected typed 409, received 500; downstream real graph throws that node endpoint is not a leaf.        |
| `WorkItemService.typedEvidence`: remove only descendant-step-on-leaf refusal                   | `node authoring mounted and direct parity refuses descendant-leaf with full rollback`     | Expected typed 409, received 500; downstream real graph throws that descendant-step endpoint is a leaf. |

The shape mutations prove loss of the typed refusal, **not an unsafe commit**.
Their status assertion fails before the later full-table comparison, so those
mutated runs do not independently establish post-error table equality. The
restored production checks do establish full rollback in the passing suite.

## Verification

Commands ran from the isolated clone with Bun 1.4.2. Its `node_modules` symlinks
to the existing workspace installation; no fresh install is claimed.

| Command                                                                                                                                      | Observed output                                                               |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Baseline `bun test apps/wbs/be-01/src/controller/connected-command-admission.controller.db.test.ts --timeout=30000`                          | 121 pass, 0 fail, 1,711 assertions.                                           |
| Final focused `bun test apps/wbs/be-01/src/controller/connected-command-admission.controller.db.test.ts -t 'node authoring' --timeout=30000` | 8 pass, 121 filtered out, 0 fail, 102 assertions.                             |
| `bunx tsc --noEmit -p apps/wbs/be-01/tsconfig.spec.json --pretty false`                                                                      | Exit 0, no diagnostics.                                                       |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx graph --file=/tmp/node-authoring-project-graph.json`                                       | Exit 0; generated real project graph before scoped ESLint.                    |
| `bunx eslint apps/wbs/be-01/src/controller/connected-command-admission.controller.db.test.ts`                                                | Exit 0, no diagnostics after replacing untyped nested asymmetric matchers.    |
| `bun run tools/tool-git-hooks/src/install.ts`                                                                                                | Exit 0; normal pre-commit, prepare-commit-msg and commit-msg hooks installed. |

The first packet run used unsupported patch field `readiness` and got structural
400; it was corrected to the public `setStatus` command. The next run used an
exact nested array matcher for partial tree rows and failed despite correct tree
placement; the final assertions select the stable row ID and compare its required
fields. TypeScript initially rejected an in-place union array assignment;
immutable mapping corrected the test. Initial ESLint rejected untyped nested
asymmetric matchers; direct typed journal/tree selections corrected them.

The final restored-source full suite reported **129 pass, 0 fail, 1,813
assertions** in 44.14 seconds. All four mutation runs each reported one selected
test failing and were restored before that run. `git diff --check` returned exit 0. `bun node_modules/.bin/openspec validate cross-project-dependencies --json`
reported one valid change and zero failures (existing requirement-length
warnings). Full Nx targets, build, h2/h4 host gate,
independent CI secrets/migration scans, production activation, SS/FF, MCP and
browser acceptance were not run. No deployment or rollout evidence is claimed.

Normal commit hooks passed scoped lint, format, plaintext-secrets and
private-nesting. Tool-wiki explicitly returned inactive/uncertified because its
external activation root is not provisioned; no certification is claimed.
Migration hooks and doc-caps skipped because no matching files were staged.
Prepare-commit-msg and commit-msg hooks passed. No hook was bypassed.
