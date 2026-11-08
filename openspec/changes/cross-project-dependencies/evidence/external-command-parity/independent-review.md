# Independent bounded review — external command contracts

Reviewed 2026-10-22: `d6b408ca30c0da35c754109ff00d3b297951b31a`, based on `6ebc5c2e46690e14e50cb7a55eb4813a31fa04a4`, in `/tmp/puni-external-command-contracts`. The checkout was clean before and after review. No source edits were made.

**Bounded approval. No blocking correctness finding in this packet.** Approve integration as dormant HTTP/MCP contract and local compatibility work. This does not complete OpenSpec task 3.2 or authorize production external authoring. Task 3.2 correctly remains unchecked.

## Contract and implementation

I inspected the exact diff, architecture handoff, task 3.2, design's command endpoint admission section, plan-command-registry delta spec, existing verify.md and the new evidence directory.

The only runtime behavior change is `normalizeTypedEndpoint` in `libs/wbs/application/core/src/service/command-fields.ts`. When `projectId` is present, it rejects any supplied project/work-item/step identity that is empty or differs from its JavaScript `trim()` value. It does not trim or retarget identities, and it does not impose UUID grammar on ordinary stable IDs. Existing field exclusions still require the correct fields for whole/node/descendant-step. Explicit project plus `workItemRef` remains forbidden, even for the owner project. When projectId is omitted, local IDs and exact aliases retain their existing interpretation, including a padded local opaque ID in the unit control. The existing `sn1` parser already restricts decoded components to canonical lowercase UUID spelling, so decoded node IDs cannot bypass the whitespace invariant. That parser was not tightened here.

The other production change is description prose in the authoritative command registry. The existing registry still defines endpoint structure and FS/SS/FF; `planCommandsBody` derives its strict deep shape from that registry. The actual backend mount validates this shape and may use shared semantic parsing to classify a rejected body, but classification cannot admit it. MCP publishes the derived schema and forwards nested command JSON to the backend; it does not implement a competing nested endpoint validator. Existing `bindTypedEndpoint` preserves explicit project identity and otherwise binds owner-local references inside the batch context.

No activation switch, capability source, production composition, migration, or external writer was changed. `compose.ts` still supplies `INACTIVE_EXTERNAL_DEPENDENCIES`. The boot fixture's activation endpoint activates organizations only. The new fixture reads are in the existing test-only backend process.

## Mounted coverage and watched faults

The booted suite exercises the production be-01 composition against migrated SQLite, verified JWTs and organization delegation. The MCP handler uses the actual generated tools and makes real HTTP requests to that backend. Direct HTTP receives independently minted delegation. Refusal comparisons assert upstream status, exact typed serialized body including index/kind, and unchanged captured durable rows after each transport. Dormant add and local-to-external update cover whole/node/descendant-step and FS/SS/FF with a preceding valid patch.

Local positive controls cover legacy `PUNI.080.39` batch aliases and removal; typed omitted/explicit-owner forms; node aliases and sn1; update/remove and undo/redo. The typed history checks independently assert SQLite relationship identity, endpoint IDs/scopes, owner and type. Each transport creates its own local endpoints.

All 14 retained transcript/driver checksum entries verify. I inspected all seven fault transcripts and the driver; each claimed fault has the documented concrete assertion failure:

| Fault                                     | Observed failure in retained evidence                                             |
| ----------------------------------------- | --------------------------------------------------------------------------------- |
| Remove explicit-ID guard                  | Expected HTTP 400, received indexed 404 not_found                                 |
| Widen add type enum                       | Expected 400, received 422 unsupported_relationship_type for add                  |
| Widen update type enum                    | Expected 400, received 422 unsupported_relationship_type for update               |
| Delete deep undeclared fields             | Expected 400, received indexed 409 cycle                                          |
| Remove explicit-project alias exclusion   | Expected invalid_typed_endpoint, received unknown_ref                             |
| Strip projectId in MCP serialization      | Expected dormant 409, received 404 not_found; original direct control remains 409 |
| Delete projectId from endpoint descriptor | Generated input expected a string property, received undefined                    |

These are reviewed retained mutation observations, not mutations independently rerun during this review. The helper checks MCP first, so most fault runs stop before their later direct-HTTP assertions; the evidence README accurately discloses this. The nested-extra and alias mutations prove exact boundary/refusal behavior, not successful illegal writes: their downstream cycle/unknown-ref barriers still reject. This is sufficient for the bounded contract claim. The driver requires a failed test but does not automatically match a particular expected test name; the retained logs themselves were checked for the intended named failures.

## Fresh independent verification

All commands ran at the reviewed SHA with Bun 1.4.2:

- `bun test libs/wbs/domain/contracts/src/http/plan-command-shapes.test.ts libs/wbs/domain/contracts/src/http/document-from-shapes.test.ts libs/wbs/application/core/src/service/command-normalizers.test.ts apps/wbs/mcp-01/src/generated-document.test.ts apps/wbs/mcp-01/src/shape-document.test.ts`: **57 pass, 0 fail; 392 assertions**.
- `bun test apps/wbs/mcp-01/src/organization-delegation.boot.test.ts`: **21 pass, 0 fail; 698 assertions**, with approved sandbox escalation for localhost listeners. Initial sandbox attempt failed with `EPERM: listen`, followed by the existing unguarded `jwks.stop` cleanup failure; it is not counted as a product failure or passing run.
- `bun test apps/wbs/be-01/src/controller/typed-dependency-commands.controller.db.test.ts apps/wbs/be-01/src/controller/connected-command-admission.controller.db.test.ts`: **127 pass, 0 fail; 1,615 assertions**.
- `sha256sum --check SHA256SUMS` in the evidence directory: all 14 entries OK.
- `git diff --check 6ebc5c2e4 HEAD`: exit 0. Final HEAD is the reviewed SHA and `git status --porcelain` is empty.

## Integration and limits

The packet's changed paths do not overlap the UI/optimizer changes between base and `351ce5d43adf6dd2d5ffd28085ce31800008187d`. That branch also adds a solver durable-contract path alias. The subsequent activation-design documentation at `ad23e8bf1` changes CONTEXT/ADR/design/spec/tasks, not these runtime files. This is a source-overlap inspection, not a merged execution result. Preserve those independent changes and rerun focused suites on the actual integration SHA.

Integrator should link this packet's evidence from the existing OpenSpec verify.md; this commit deliberately leaves that integrator-owned file unchanged, and it currently records the older narrower parity packet. Keep task 3.2 unchecked.

Not independently rerun: typechecks, lint/format commands beyond diff whitespace, OpenAPI CLI emission, OpenSpec validation, mutation driver, frozen installation, full CI/builds, or h2/h4 exact-SHA gate. Implementation evidence reports its scoped checks, but this review does not convert them into independent results. Installed dependencies were reused.

Still outside approval: real semantic activation, successful external mounted writes/history/read-after-write, live announcements/fanout, real unavailable-calendar/optimization parity, browser behavior, startup/deploy/downgrade and participant compatibility. The controller suite's explicitly admitted semantic fixtures do not establish activated mounted authoring. No delivery or full-task completion claim is made.
