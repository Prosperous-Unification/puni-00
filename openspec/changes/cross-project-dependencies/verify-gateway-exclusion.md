# Managed Compose gateway exclusion prerequisite — 2026-10-23

This packet implements an explicit attended fence and read-only inspection for the
environment's managed Compose gateway blue/green cohort. It grants no activation,
ordinary-swap bypass, marker clearance, restart, recreation, semantic compatibility
or exclusion of other participants. Requested SHA is provenance only. Parent tasks
10.1/10.2 and the integrated isolated host gate remain open.

## TDD and mounted evidence

The first mounted filesystem/stateful-Docker-boundary suite failed 18 assertions
against explicit unimplemented entry points; the separate CLI suite failed all 15
cases before dispatch/admission existed. Green then covered the actual production
executor, retained files and real `flock`, without a test-only publication path.
Later tests watched malformed process timestamps, detached unexpected managed names,
interruption classification and a non-UUID intent attempt fail before their fixes.
The UUID negative supplies a matching completion attempt and recomputed byte hash,
so another binding guard cannot mask the malformed-attempt check.

The focused command is:

```sh
bun test tools/tool-remote-scripts/src/lib/gateway-exclusion.test.ts tools/tool-remote-scripts/src/swap-gateway-exclusion.test.ts tools/tool-remote-scripts/src/swap-gateway-fence.test.ts --preload ./tools/test/scratch/preload.ts
```

Coverage includes both colours, an explicitly empty managed cohort, unrelated
containers in the unfiltered inventory, duplicate/missing/foreign identities,
strict image resolution/security/network/label/state boundaries, existing-state
readability and symlinks, actual concurrent lock refusal, exact-ID-only effects,
lying/stalled/failed updates/stops, drift after completion publication, changed
intent bytes, foreign/malformed/extra-field records and orphan admission.
Every post-publication fault retains marker/intent/current Docker state and records
no start/restart/rm. Lying update specifically asserts no stop follows its failed
policy readback. CLI negatives use both the parser and the actual swap subprocess.

## Watched R5 faults

Each of the following 31 source/dependency faults was injected independently;
each selected production-path test exited 1 with an assertion failure, and the
original source was restored before the next fault. The final green suite also
includes the additional UUID red/green proof above. The table names the injected
fault and observed assertion, rather than treating a command exit alone as proof.

| Injected fault                                                                                  | Observed production-path assertion                                                                                                                                        |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ignore companion records in ordinary admission                                                  | Both orphan intent/completion negatives stopped refusing.                                                                                                                 |
| Remove dedicated gw-only CLI admission                                                          | The be invocation lost its named parser/subprocess refusal.                                                                                                               |
| Omit canonical state-root validation                                                            | A symlink parent with a real directory leaf was admitted.                                                                                                                 |
| Ignore closed record fields                                                                     | Extra completion field was accepted by inspection.                                                                                                                        |
| Remove integer / boolean / full identity / digest / nonempty checks independently               | Negative RestartCount, string Running, empty network ID, equal malformed image IDs and empty Compose project respectively passed their mounted pre-publication negatives. |
| Omit snapshot comparisons                                                                       | Lying restart-policy readback reached a forbidden stop.                                                                                                                   |
| Accept unknown policy / invalid policy retry count independently                                | Both mounted policy negatives admitted publication/effects.                                                                                                               |
| Corrupt timestamp observation dependency                                                        | The mounted successful operation failed before publication.                                                                                                               |
| Omit full inventory cardinality / inspect membership independently                              | Missing inspected member or foreign full inspect ID passed the pre-publication boundary.                                                                                  |
| Omit Compose service / init / image-resolution equality / project-cohort equality independently | Wrong label, unprepared init, mismatched image ID and different projects respectively passed their mounted negatives.                                                     |
| Corrupt persisted publication readback dependency                                               | The successful fence failed before Docker update.                                                                                                                         |
| Omit intent version validation                                                                  | Wrong intent version was accepted even with recomputed completion binding.                                                                                                |
| Omit exact-byte intent hash binding                                                             | Whitespace-changed intent was accepted by inspection.                                                                                                                     |
| Suppress exact-ID stop / restart-disable effects independently                                  | Successful fence failed its physical-state / restart-policy readback.                                                                                                     |
| Reuse stopped observations after completion                                                     | Final completion drift was admitted.                                                                                                                                      |
| Trust historical completion in inspection                                                       | Resumed gateway was accepted.                                                                                                                                             |
| Bypass actual lock acquisition                                                                  | Fence execution was admitted under an already-held real flock.                                                                                                            |
| Suppress marker / intent / completion publication independently                                 | The successful mounted sequence failed instead of returning a complete retained proof.                                                                                    |
| Ignore unexpected managed names                                                                 | Detached unexpected managed gateway was admitted.                                                                                                                         |

Exclusive publication and directory durability reuse
`writeNewMigrationCapture`'s already exercised hard-link/fsync primitive; its
adjacent tests are included in the focused supporting verification. Publication
collision is additionally mounted through this executor: a foreign intent created
after initial inventory is not replaced; marker remains and no update/stop occurs.
The shared deadline helper has real subprocess abort tests, and this executor's
stalled update and stop each reject within their injected 100ms budget with durable intent intact.

## Verification receipts and limits

- Final focused production/CLI/admission plus publication/deadline supporting
  suite passed **196 tests** across five files; the tool-working-directory CLI
  suite separately passed all 15 cases. The first full source run exposed a
  cwd-relative subprocess fixture path; an import-relative absolute executor
  path fixed it, verified from the configured tool cwd.
- The full source command (`bun test src --preload ../test/scratch/preload.ts
--timeout=10000`, cwd `tools/tool-remote-scripts`) reported 1113 pass, 2 skip,
  22 fail in 423s before that test-path fix. Fourteen failures were the corrected
  new CLI path cases. The other eight are unchanged installed-solver acceptance
  and Unix-listener tests: four client EOF expectations and four EPERM
  socket/listener cases. No full-suite pass is claimed; the seven-minute
  unchanged configuration matrix was not repeated after the targeted fix.

- Configured `tool-remote-scripts:lint`, `typecheck` and `build` passed with
  `NX_DAEMON=false NX_ISOLATE_PLUGINS=false`. The build bundled the swap executor.
  These settings avoid sandbox-denied Nx worker/daemon sockets; an earlier default
  invocation printed socket refusals and did not constitute verification.
- Configured `tool-remote-scripts:test` refused at its required `test:caddy`
  dependency: Docker API socket access was denied, and required Caddy image
  preparation exited 1. The test target itself did not run in that invocation.
- `bunx openspec validate --all --json` passed all 273 entries (255 changes,
  18 specs). Strict selected-change validation refused on 18 long-requirement
  warnings. A separate `git archive HEAD openspec` baseline produced the exact
  same 18 issues; this packet adds none.
- Disposable real Docker/container-init/process/websocket closure proof is
  unavailable here: `docker version --format '{{.Server.Version}}'` reports
  permission denied connecting to `/var/run/docker.sock`. Stateful Docker boundary
  tests do not replace that operational evidence. No live deployment/fence or
  activation was attempted. Representative 60-second timing remains unverified.
- An isolated exact-SHA h2puni/h4claw host gate is a coordinator-owned follow-up
  check. Independent Astra High review found no blocking issue in the bounded
  source contract and reran 192 production/CLI/admission tests with 629 assertions.
  No host gate is claimed by this packet.

The advisory deploy lock coordinates this executor only. Fresh inventory proves
an observation of the two managed names, not a continuous daemon lease or a broad
participant roster; external Docker administrators/controllers must respect the
interval. A completion alone never grants present exclusion or semantic authority.
