# Bounded managed Compose backend exclusion evidence

Base: `89b112475fce6d511d73d9c6e975c74702c178dd`, isolated shared clone
`/tmp/puni-backend-fence`, local host `pop-os`, 2026-10-23. Parent tasks 10.1/10.2
remain open. This packet establishes no semantic activation authority or complete
participant/store exclusion.

The initial dedicated CLI test failed because `parseBackendFenceInvocation` was
absent; the initial backend lifecycle suite failed because its module was absent.
After implementation, focused gateway/backend tests passed. The shared managed
inventory extraction preserves existing gateway lifecycle tests. The production
executor/inspector own the real flock; the under-lock gateway primitive is used
only by the held-lock backend owner and public gateway wrapper.

## Watched R5 production faults

Each mutation below was independently applied, the named production-path test
ran with `bun test tools/tool-remote-scripts/src/lib/backend-exclusion.test.ts -t
'<name>'`, failed with exit 1, and the original source was restored. External
machine-readable observation: `/tmp/backend-fence-mutation-report.json`.

| Injected fault                                                     | Observed failing test                                                                 |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| Delete durable intent publication                                  | every backend effect follows readable durable intent and marker                       |
| Suppress exact-ID restart disable                                  | fences both backend colours after fresh gateway exclusion and binds database identity |
| Suppress exact-ID stop                                             | same both-colours success test                                                        |
| Delete restart update readback                                     | retains evidence and refuses skipped-restart; forbidden stop became observable        |
| Reuse stopped snapshot after completion instead of fresh inventory | retains evidence and refuses completion-drift                                         |
| Delete backend database-family equality                            | refuses foreign-database before backend publication or effects                        |
| Delete exact-one DB_PATH admission                                 | refuses duplicate-db-path before backend publication or effects                       |
| Delete unmanaged writable-mount audit                              | refuses unmanaged-writer before backend publication or effects                        |
| Delete gateway byte-hash comparison                                | read-only inspection rejects changed intent bytes and gateway evidence bytes          |
| Delete inspection's current completion/cohort equality             | inspection refuses replaced main file at the same database path                       |

Additional production dependency faults exercise missing/resumed gateway proof,
replacement container IDs, changed process starts, database/gateway drift,
interrupted stop, stalled stop with a 100ms total deadline, empty backend cohort,
sidecar mount shadow, actual lock contention, orphan evidence and strict
intent/completion/gateway-binding grammars. All retain evidence/current Docker
state; no start/restart/rm is issued by the fence executor.

## Verification status

Scoped full source tests, configured lint/typecheck/build, format, OpenSpec
validation and clean-source installed-image acceptance are recorded below when
run. No h1claw build/test, production execution, migration or semantic activation
is authorized by this packet. An isolated integrated-SHA h2/h4 gate and independent
review remain required before a parent completion claim.

Pre-acceptance scoped checks:

- Focused six-file backend/gateway lifecycle, invocation and ordinary-admission suite:
  323 passed, 0 failed, 1,051 assertions.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run
tool-remote-scripts:lint --skip-nx-cache`: passed.
- The same configured `typecheck` and `build` targets: passed; explicit spec
  `bunx tsc --project tools/tool-remote-scripts/tsconfig.spec.json --noEmit` passed.
- `openspec validate cross-project-dependencies --json`: inspected structured
  summary, 1 passed/0 failed. Strict mode reports 18 existing long-requirement
  warnings and `valid:false`; temporarily restoring the base specification
  produced the identical 18-issue list. Strict validation is not claimed green.
- Full source `bun test` was started in the restricted sandbox; Unix-listener
  fixtures fail with socket EPERM. Slow release-config fixtures were still
  progressing when this first record was written. No full source pass is claimed.
- Fresh changed-file lint, Prettier and `git diff --check` passed before this
  source commit. Full configured Caddy/remote host gates remain unrun here.

The first clean-source real Docker attempt at
`05aa51c15c022821c7aa5ecac2015827845dbf4f` failed before any fence effects:
actual application `/health` never became ready within 15 seconds. Owned container
and network cleanup was verified in `/tmp/backend-fence-docker-05aa51c15.json`.
Inspecting the actual installed default `src/main.ts` established that startup
migration is disabled unless explicitly requested; the acceptance-created DB had
only its seed table. The disposable fixture now explicitly enables startup
migration during application preparation and captures logs/state on a health
failure. This does not add any migration to the production fence operation.
Docker also verified that registry-qualified `docker.io/wbs-be-01@...` and
`docker.io/wbs-gw-01@...` resolve to the exact already installed bare RepoDigests;
production strict image validation remains unchanged, with no pull or build.

The initial full source sandbox run completed: 1,260 passed, 2 skipped, 8 failed,
7,445 assertions, 370.44s. The failures are Unix socket fixtures denied by the
sandbox. A full elevated rerun was started to establish the actual suite result;
no full-suite green is inferred from that restricted run.

## Actual application readiness and namespace audit correction

Clean source `ac7ffae902b48405119c8e95a9d671caa950e6be` reached real backend
health HTTP 200; its first write correctly refused `403 invalid_origin`. The
fixture was corrected to send its configured Origin. Clean source
`894073b2c45565aaf9c73a749aca1e8929172fc9` then proved health and registration
writes for both actual default-command installed backend applications and
physically fenced the gateway runtime probe. Backend admission correctly refused
an unrelated BuildKit volume host path with EACCES before any backend publication
or effects. Exact owned container/network cleanup passed in
`/tmp/backend-fence-docker-894073b2c.json`. The backend image health reports
`commit:null`: executor/acceptance source provenance is clean and exact, while
installed application provenance is the pinned image digest, without a source
revision attestation. This is not a successful full backend fence acceptance.

Noninteractive host root traversal is unavailable (`sudo -n id` requires a
password). The reviewed correction reuses the production initialized namespace
census rather than skipping opaque volume inspection. Readable sources also
require actual namespace admission. No BuildKit/controller is exempted or stopped.
The default operation still refuses unsupported/no-init/privileged namespaces.

Mounted adapter tests execute the existing immutable scanner programs against
real host fixture directories and parse the complete production session protocol.
They cover Source EACCES and ENOENT positives with four complete initialized session
ACKs, readable source success, opaque main/WAL/SHM/journal hardlinks, Docker-RO
nested RW aliases, rebound host Source, hidden roots/symlinks, missing declared/root
mounts, PID/start/restart/foreign-ID drift, unreadable/missing tools, malformed,
incomplete, stalled and unreaped sessions, privilege/capability/init/PID refusal.
A repeated complete global inventory before intent catches new/missing members
and mount/PID/start/restart changes. Ordinary orphan companion admission is also
exercised through both real ordinary entry points for all tier selections.

Independent restored mutations, each exit 1 (external detailed report:
`/tmp/backend-namespace-mutation-report.json`):

| Omitted production check               | Observed failures                                       |
| -------------------------------------- | ------------------------------------------------------- |
| Actual namespace invocation            | 30 mounted adapter positives/negatives fail             |
| Exact namespace pre/post identity      | PID/start/restart/foreign-ID cases: 4 fail              |
| Root/declared actual mount membership  | 2 mounted adapter cases fail                            |
| Post-audit complete inventory identity | 6 pre-intent drift cases fail                           |
| Full-inventory cardinality             | Missing inspected bystander case fails                  |
| Full-inventory ID membership           | Foreign inspected ID case fails before-intent assertion |

Direct writable host file hardlinks additionally refuse early by inode identity;
main/WAL/SHM/journal and non-file sidecar negatives were red/green and independently
mutated before the namespace integration. After integration the early-alias tests
also require refusal before namespace inspection. The namespace audit remains the
mandatory independent barrier for opaque/rebound/directory-content aliases.

The first elevated full-suite command used a root-relative Bun substring filter
after the configured TypeScript build had emitted test copies under `dist`; it
collected 108 files and reported generated-output alias/path errors (1,546 pass,
2 skip, 89 fail/29 errors). That command does not establish a source-suite failure
or success. The corrected elevated run uses the configured project cwd and
`bun test ./src --preload ../test/scratch/preload.ts --timeout=10000`, which
excludes generated test copies; its final result is recorded below when complete.

After namespace integration the focused seven-file lifecycle/admission/namespace
suite passed: 435 tests, 0 failures, 1,345 assertions. Configured uncached lint,
explicit spec TypeScript check and normal structured OpenSpec validation passed.
Configured typecheck/build were rerun after the integration. The namespace
identity adapter is shared with the existing gateway observations; no separate
scanner implementation or controller exception was added. A dedicated actual
initialized coordinator/opaque daemon-owned volume proof was added to the
Docker harness; it verifies unchanged volume sentinel and process inventory to
establish scanner cleanup before trying global backend admission.

## Clean-source actual supported participant proof

At clean source `f6363f45382d3b7311de842a541377215825efd0`, the installed
application image was
`docker.io/wbs-be-01@sha256:1859b545e83b98a3948134947cd21b357cac382ca30e168d63aa696ff969f86d`;
the separately labeled gateway/coordinator runtime image was
`docker.io/wbs-gw-01@sha256:d897ba9eb3835a79853211f3bee69a287327c704571bcbee0f667008a47c01f4`.
Neither image was built or pulled. Both real backend colours returned health and
registration HTTP 200. Actual initialized coordinator
`4d0e28b650cc00cc395506b85730e1cbb17723c2400dbb4aee337b2c67f21b16`
then passed the production namespace adapter for its genuinely host-EACCES
Docker volume
`backend-proof-2b934e0e-cddc-4ddc-8819-b36276193311-opaque`.
Its process inventories before/after were byte-identical (only Docker init and
Bun, no scanner orphan) and its stored sentinel was unchanged. Gateway runtime
exclusion also passed. Detailed external receipt:
`/tmp/backend-fence-docker-f6363f453.json`.

Global backend admission correctly remained blocked by an unsupported unrelated
participant before backend intent/effects. The initial generic error was
`Docker init metadata is missing or malformed`; diagnostic wrapping now names
the exact inspected container and attended path. Read-only inventory identified:

- `9438214c5c1b9556b22069a37561cabf0341f19bf46c6b0197310b821098c144`,
  `/puni-gate-lab-target`: stopped, writable Docker-socket bind, missing Docker
  Init metadata. No running namespace can establish exclusion for that mount.
- `52a96e3da92e6b11eccfce4ab4d2abd378f6531b239dce39ebac60bbf1d61d00`,
  `/buildx_buildkit_puni-fleet-controller-6c2fa84a6b610`: running with Init true
  but privileged; its daemon-owned volume is also unsupported by the
  unprivileged namespace contract. It was not exempted, stopped or altered.

The attended operational choices are a dedicated Docker daemon containing only
supported initialized participants, or explicit owner-controlled maintenance of
these unsupported participants before retrying. This code does not remove lab
fixtures or stop/recreate BuildKit. All owned acceptance containers, network and
volume were removed with exact label/identity checks; cleanup verified true and
zero cleanup failures. This proves the supported opaque-participant path and
safe global refusal, not a successful full real backend fence on this shared
host. No semantic authority or complete participant exclusion is claimed.

The diagnostic-context change passed 133 lifecycle/actual-scanner adapter tests,
0 failures, 411 assertions, plus spec TypeScript and changed-source ESLint checks.
The corrected elevated full-source run has separately observed release-config
fixture timeouts at 120 seconds and gateway boot child exitCode null/10-second
timeout. Its broader result is not substituted for the focused green proof and
will be recorded on completion.
