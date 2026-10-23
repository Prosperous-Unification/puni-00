# Persistent selected-site dependency ingress exclusion

Source slice based on `9f257ca84ccbf4195f8127d0259c05d8a872bcab`, isolated in
`/tmp/puni-dependency-ingress`. Parent task 10.2, complete participant exclusion
and activation remain open. Parent design, delta scenarios and ordered ingress
tasks were added before implementation; the proposal intent is unchanged.

The new explicit `--fence-ingress-managed` operation closes selected WBS sites
before entering managed gateway/backend inventory. `--fence-managed` retains its
prior API/output and behavior. Closure is restricted to selected site files and
retains private original identities/bytes and exact owner-bound intent before
replacement. The publisher uses exclusive UUID siblings, no-follow file opens,
canonical inode checks, file/directory fsync and exact replacement readback.
Every ingress record includes the live owner's exact attempt/plan publication.
Neither serialized evidence nor a retained ingress receipt recreates authority.

The exact Caddy ID, immutable image/process/config observation, fixed Caddyfile
startup and canonical read-only directory bind precede mutation. Persistent
adaptation must equal fresh live admin JSON. Explicit selected host static-503
routes and unchanged unrelated configuration are independently checked before
reload, then exact live admin equality and current disk/ID are checked afterward.
A zero-exit reload alone is insufficient. Fresh inspection also checks its exact
retained private publication. Config bodies and parser excerpts are not printed.
Any failure retains owner/files/siblings/uncertainty; there is no restore,
production Caddy stop/recreate or activation path.

## Observed local checks

- Focused Bun regression: **190 passed, 0 failed, 975 assertions** across ingress, actual site-publication effect ports, owner, canonical lock, gateway/backend exclusion and dedicated CLI tests.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run tool-remote-scripts:typecheck`: passed, real TypeScript output, no cache hit.
- Same environment with `nx run tool-remote-scripts:lint`: passed, complete uncached project ESLint. The earlier failure was an import-sort finding in the expanded test; it was corrected before this successful rerun.
- Same environment with `nx run tool-remote-scripts:build`: passed; all remote script bundles ran, three unchanged dependency tasks used local cache on the final run.
- `bunx openspec validate cross-project-dependencies --json`: 1 passed/0 failed; existing warnings remain, none names the new ingress requirement.
- `git diff --check`: passed. Formatting and installed normal Lefthook checks run on the candidate commit without bypass.

Initial ingress tests failed before the module existed. All subsequent omission
proofs used the actual production functions, real temporary files and flocks,
and injected Docker/filesystem effect ports. The filesystem child tests invoke
the real publication helper, observe private readable original/intent plus file
sync before actual rename, and observe directory sync afterward. They also prove
zero-exit no-op rename refusal, post-rename sync-crash retention, and a staged
sibling symlink collision without altering its foreign target. No copied verifier
or source-text assertion substitutes for executing the effect path.

## Watched R5 faults

Each fault below was applied independently, its named production-path acceptance
failed with exit 1, and production source was restored before final green checks.
These establish source/boundary behavior; fake adapter JSON establishes no live
Caddy serving behavior.

| Injected omission/broken dependency                                   | Observed failing acceptance                                                     |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Full Caddy-ID grammar                                                 | Partial ID reached mutation/success instead of preflight refusal                |
| Fixed non-resume startup comparison                                   | Resume startup was admitted                                                     |
| Read-only `/etc/caddy` bind validation                                | Writable config bind was admitted                                               |
| Persistent/live equality before mutation                              | Live-drift negative changed the selected file before refusing later             |
| Explicit actual maintenance-route validation                          | Adapted status-200 route reached reload, violating the no-reload assertion      |
| Unrelated config projection equality                                  | Changed registry adaptation reached reload                                      |
| Exact live admin equality after reload                                | Unrelated live drift returned success despite selected 503                      |
| Fresh disk equality                                                   | Fresh inspection accepted changed registry bytes                                |
| Exact retained ingress publication equality                           | Fresh inspection accepted altered receipt bytes                                 |
| Selected site-file path restriction                                   | A genuine captured registry file was overwritten                                |
| Original file evidence publication                                    | Actual rename port found no private original record                             |
| Staged file sync                                                      | Actual rename port found an unsynced source                                     |
| Publication directory sync                                            | Effect acceptance found no directory durability fence                           |
| Exact published inode/byte readback                                   | Zero-exit no-op rename returned success                                         |
| Live owner interval checks                                            | Lost-owner reload path returned success                                         |
| Disk equality before publication                                      | External registry-file drift allowed selected file replacement                  |
| Canonical/no-follow file-reader boundary replaced by following reader | Symlink site was admitted                                                       |
| Original-byte equality guards                                         | Changed original bytes were overwritten                                         |
| Durable intent publication                                            | Actual rename port found no readable owner intent                               |
| Required persistent site import                                       | Selected file was replaced despite missing import                               |
| Immutable edge config validation                                      | Missing environment observation was admitted                                    |
| Private JSON diagnostic scrub                                         | Malformed-inspect sentinel escaped in diagnostics                               |
| Exclusive no-follow sibling creation replaced by following open       | Injected sibling symlink was admitted instead of the required collision refusal |

Additional restored-source negatives distinguish missing/unreadable root files,
symlink/unreadable selected files, malformed private inspect/admin output, absent
immutable image/environment/start observations, stale exact-ID/admin/disk/receipt
inspection, no-op reload and interruption after persistent file publication.
The inclusive coordinator test observes successful ingress reload before actual
managed inventory entry, then retains closure after that boundary refuses. This
is distinct from successful real-Caddy serving or complete participant exclusion.

## Actual-Caddy acceptance: prepared, not executed

Fresh read-only capability observations: `Bun.which('caddy')` returned `null`;
`Bun.which('docker')` returned `/usr/bin/docker`; `docker info --format
'{{.ServerVersion}}'` exited 1 with permission denied on `/var/run/docker.sock`.
No local actual-Caddy or Docker acceptance result is claimed. The full project
`test` target, which requires its Caddy prerequisite, was not run locally.
Dependencies reuse the existing locked workspace installation via a local
`node_modules` symlink; no fresh frozen install is claimed.

The reviewed host entrypoint is prepared at
`tools/tool-remote-scripts/test/dependency-ingress.ts`, exposed as
`tool-remote-scripts:test:dependency-ingress`. Root must run it only after review,
under the canonical host heavy lock, with the pinned `CADDY_IMAGE` available.
It deliberately blocks rather than skips when the image/daemon is absent.

The runner creates a unique labelled container and private `/tmp` tree, binds only
an ephemeral loopback TLS port, and uses fixture-only prod/dev/registry/AIVN
hostnames. An internal CA is accepted only by that fixture's loopback client.
The read-only logical edge lookup is normalized to the validated fixture ID/name;
every actual exec/reload targets only that full fixture ID. Startup, disk
adaptation, admin readback and HTTP serving are actual Caddy operations. The
runner requires selected 503 plus unchanged unselected sites, restarts only its
own disposable container to prove disk persistence, repeats HTTP assertions and
removes only its identity/label-checked container and anonymous volumes. Cleanup
failure refuses success. Private source and owner evidence remain available.

Actual adapter shape/equality, HTTP closure, unrelated serving, restart
persistence and fixture cleanup remain unverified until this host runner is
observed. Independent source/fixture review and the integrated exact-SHA host
gate also remain pending. No live production edge, h2 operation, installation,
deployment, activation, marker cleanup, automatic restoration or push ran here.

## Review correction: retained directory and bounded fixture — 2026-10-23

Independent Astra review reproduced a P2: replacing the selected file's parent
after its final path check could redirect the original path-based rename and
overwrite a foreign site before a later refusal. Publication now opens the
canonical parent once and retains its descriptor. Native `openat` creates the
exclusive no-follow private sibling; `renameat`, readback and directory sync all
resolve against that same retained directory. A replaced named parent refuses
afterward without changing the foreign directory. Originals and intents also
retain the directory device/inode. No recovery or automatic restoration is added.

The real child-process parent-swap acceptance injects both a symlink and a
different directory at the actual rename boundary, supplies a matching sibling
in that foreign directory and asserts its original site bytes remain unchanged.
Restoring the exact original `5dca4299a` production publisher produced **two
failures**, both observing `foreign staged sibling` where `foreign original`
was required (`/tmp/puni-ingress-parent-path-regression.log`). Restoring the
descriptor-bound publisher produced **two passes**. The effect tests were moved
to the new native ports; they still invoke the production publisher and real
filesystem operations. Staged-fsync, directory-fsync, following-sibling and
readback omissions independently failed; restored publication acceptance passed
all four cases. Logs: `/tmp/puni-ingress-native-{stage-sync,directory-sync,
following-sibling,readback,restored}.log`.

The P3 fixture issue is also corrected: every direct Docker operation, including
identity inspection, restart and cleanup, has an independent ten-second deadline
and propagates any narrower caller cancellation. The actual fixture entrypoint
was run with an invocation-private fake Docker that records its PID then stalls.
Removing the deadline required the external 15-second watchdog to kill the
fixture; restoring it refused in 10.04 seconds and its exact Docker child was
absent. The source was restored in a `finally` block. Receipts:
`/tmp/puni-ingress-deadline-proof.json`, with private per-run output paths. This
proves fixture process termination, not actual Caddy serving or host acceptance.

Fresh corrected-source checks: 192 passed, zero failed, 981 assertions across
eight named ingress/publication/parent/owner/canonical-lock/gateway/backend/CLI
files (`/tmp/puni-ingress-native-combined-complete.log`). Uncached Nx
`run-many -t lint,typecheck,build -p tool-remote-scripts --parallel=1
--skip-nx-cache --outputStyle=static` passed all three requested targets and
their three prerequisites (`/tmp/puni-ingress-native-checks.log`). Formatting
and `git diff --check` passed. Correction review, actual-Caddy acceptance and
the integrated host gate remain open.

### Native ABI review follow-up

Astra approved the Linux parent-descriptor correction at `a43aef050`, with
six independently rerun filesystem cases, but identified an unsupported Apple
Silicon ABI claim: native variadic `openat` cannot be declared as a four-fixed-
argument function on that ABI. This site publisher now explicitly supports only
the observed Linux x64 deployment hosts; other platform/architecture pairs
refuse before native file creation. General module import and unrelated scripts
do not fail merely because the publisher is unavailable. No macOS publication
acceptance is claimed. This does not change the project's existing installer
or general lock portability contract.

Two real child fixtures model Darwin/arm64 and Linux/arm64 and require explicit
refusal with no created file. Removing the platform boundary made both fail.
The publisher also requires exact mode 0600 before writing configuration bytes;
the real rename acceptance asserts the native-created sibling's mode. A
public-mode injection refuses before writing; removing that early check reaches
the later rename boundary with configuration bytes in a public-mode file and
fails the expected ordering assertion. Restored fixtures pass. Logs:
`/tmp/puni-ingress-unsupported-restored.log`,
`/tmp/puni-ingress-unsupported-platform-omitted.log` and
`/tmp/puni-ingress-private-mode-omitted.log`.

Final Linux-source regression after the ABI/mode correction: **195 passed,
zero failed, 989 assertions across nine files**, exit 0, at
`/tmp/puni-ingress-linux-combined.log`. Uncached configured lint, typecheck
and build plus three prerequisite targets passed again, exit 0, at
`/tmp/puni-ingress-linux-checks.log`. Independent Astra narrow rereview reran
nine filesystem/platform cases (30 assertions), found no remaining P1/P2/P3
and approved this explicitly Linux x64 source and controlled h2 fixture scope.
Actual host acceptance, complete exclusion and final integrated gate remain open.

## Integrated source checks and first actual host attempt

After combining reviewed ingress, lifetime runtime admission, V1 backend and MCP
fixtures, focused deployment tests at `b4b523ba9` passed **219 cases across
12 files, 1,071 assertions**, zero failures. Uncached configured deployment
lint/typecheck/build and their three prerequisite targets passed. The separately
named actual installer-operation suite at `d16c5d980` passed **46 cases, 344
assertions**; OpenSpec validation passed **277/277** entries. These are integrated
local results, not the final host gate. Logs:
`/tmp/puni-owner-ingress-runtime-b4b523ba9.log`,
`/tmp/puni-owner-ingress-runtime-checks-b4b523ba9.log` and
`/tmp/puni-owner-installer-integrated-d16c5d980.log`.

The first controlled actual-Caddy h2 attempt at
`d16c5d980657db2ad7aa549b6440e907038ece46` ran under the canonical heavy
lock and exited 1. Persistent adaptation/admin reload equality, selected-host
503 and all unrelated fixture-host HTTP assertions completed before restart.
After restarting the exact owned fixture, its probe to the initially captured
ephemeral loopback port refused connections. Exact-ID/label cleanup completed
and the heavy lock reported no holder afterward. No live production edge was
mutated. Retained output: `/tmp/puni-dependency-ingress-d16c5d980-host-failed.log`;
private fixture evidence remains on the host.

The fixture now freshly validates and uses the ownership-checked container's
loopback port mapping after restart, retaining both mappings in its acceptance
receipt. Port reallocation is the current hypothesis, not established by the
failed log. All HTTP/status/body, exact-ID, deadline and cleanup checks remain
unchanged. Scoped ESLint, uncached typecheck, formatting and independent Astra
review passed; actual restart persistence remains pending the corrected run.
