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
