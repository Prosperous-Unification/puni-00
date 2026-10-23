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
