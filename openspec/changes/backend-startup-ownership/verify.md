# Verification Report

**Change**: `backend-startup-ownership`
**Verified at**: `2026-09-20`
**Verifier**: Codex executor, attempt `020-7-backend-startup.A.20260920T144350Z`

## Results

### Slice A — the OpenSpec change

- Planner prerequisite, 2026-09-20, in the executor's own sandbox configuration: `bun test src/boot.db.test.ts` in `apps/wbs/be-01` passed 15 of 15 with network access on and failed 15 of 15 with it off (every test binds a loopback port), so every attempt of this change runs with network access.
- OpenSpec validation before the change: 103 passed, 0 failed.
- The executor wrote the proposal (184 words), the design, the delta specification (five requirements, nine scenarios), the tasks and this record, then stopped as instructed: validation reported all five requirements as missing requirement text. The packet's prescribed specification gave scenarios under each heading and no normative sentence, which OpenSpec requires.
- The planner wrote one normative sentence under each requirement, drawn from its scenarios and the design, and validated again: 104 passed, 0 failed.

### Slice B — existing boot behavior

- Baseline commit: `10a43edbfce6cee4871bad3e94b74151dd4b5a29`; `git status --short --untracked-files=all` printed nothing.
- Baseline `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bun test src/boot.db.test.ts`: exit 0; 15 pass, 0 fail.
- Slice prerequisite `grep -c "^import { DiBag } from 'di-bag';" apps/wbs/be-01/src/boot.ts`: printed 0 and exited 1, as required before DI Bag lands.
- After adding the five characterization cases, `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bun test src/boot.db.test.ts`: exit 0; 20 pass, 0 fail.
- `NX_DAEMON=false bunx nx run wbs-be-01:typecheck`: exit 0; Nx successfully ran the target with 0/1 cache hits.
- `NX_DAEMON=false bunx nx run wbs-be-01:lint`: exit 0; Nx successfully ran the target with 0/1 cache hits.
- `GSETTINGS_BACKEND=memory bunx prettier --write apps/wbs/be-01/src/boot.db.test.ts openspec/changes/backend-startup-ownership/tasks.md openspec/changes/backend-startup-ownership/verify.md`: exit 0; all three files were unchanged.
- `NX_DAEMON=false bunx nx format:check --all`: exit 0 with no diagnostic output.

### Slice C — lifecycle ownership

- Baseline commit: `e45913380a75197e08265306022cf1fc81831a8d`; `git status --short --untracked-files=all` printed nothing.
- Baseline `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bun test src/boot.db.test.ts`: exit 0; 20 pass, 0 fail.
- Slice prerequisite `grep -c "^function heldPort" apps/wbs/be-01/src/boot.db.test.ts`: printed 1 and exited 0, as required after Slice B.
- Red `bun test src/boot.db.test.ts -t 'releases the source when the port it was given is already taken'`: exit 1; 1 test, 1 fail; `Expected: 1`, `Received: 0` (`red-taken-port.log`).
- Red `bun test src/boot.db.test.ts -t 'closes the source when the service graph cannot be composed'`: exit 1; 1 test, 1 fail; `Expected: 1`, `Received: 0` (`red-uncomposable.log`).
- Red `bun test src/boot.db.test.ts -t 'releases the source and the port when a step after the listener fails'`: exit 1; 1 test, 1 fail; `Expected: 1`, `Received: 0` (`red-post-listener.log`).
- Red `bun test src/boot.db.test.ts -t 'releases every other resource when one release is refused'`: exit 1; 1 test, 1 fail; `Expected constructor: [class DiBagCleanupError extends AggregateError]`; the received error rendering contained `optimizer refused to settle` (`red-refused-optimizer.log`).
- Red `bun test src/boot.db.test.ts -t 'refuses to report a clean stop when a release is refused'`: exit 1; 1 test, 1 fail; `Expected constructor: [class DiBagCleanupError extends AggregateError]`; the run also reported `disk gone` (`red-refused-source.log`).
- After DI Bag took lifecycle ownership, `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bun test src/boot.db.test.ts`: exit 0; 25 pass, 0 fail, including all five new cases.
- `NX_DAEMON=false bunx nx run wbs-be-01:typecheck`: exit 0; Nx successfully ran the target with 0/1 cache hits (`typecheck.log`).
- `NX_DAEMON=false bunx nx run wbs-be-01:lint`: exit 0; Nx successfully ran the target with 0/1 cache hits (`lint.log`).
- `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bun test src/production-entrypoint.test.ts`: exit 0; 2 pass, 0 fail.
- `GSETTINGS_BACKEND=memory bunx prettier --write apps/wbs/be-01/src/boot.db.test.ts apps/wbs/be-01/src/boot.ts apps/wbs/be-01/src/dev/main.ts apps/wbs/be-01/src/main.ts openspec/changes/backend-startup-ownership/tasks.md openspec/changes/backend-startup-ownership/verify.md`: exit 0; all six files were unchanged.
- `NX_DAEMON=false bunx nx format:check --all`: exit 0 with no diagnostic output (`format-check.log`).
- Strict `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json` block: exit 0; 104 passed, 0 failed (`openspec-validation.IFLcwp.json`).

### Slice D — watched lifecycle faults

- Baseline commit: `839c723e572be2ee84c9733d0873af0c1792e353`; `git status --short --untracked-files=all` printed nothing.
- Baseline `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bun test src/boot.db.test.ts`: exit 0; 25 pass, 0 fail.
- Slice prerequisite `grep -c "^import { DiBag } from 'di-bag';" apps/wbs/be-01/src/boot.ts`: printed 1 and exited 0, as required after Slice C.
- Each mutation was saved as the named `.patch`, its focused test exited 1 with 1 test and 1 failure, the saved passing bytes were restored and matched by `cmp`, and the same focused test then exited 0 with 1 pass and 0 fail. No additional tests ran because each command used its exact title filter.
- During proof 1, the first restore command was issued from `apps/wbs/be-01` with the repository-relative destination `apps/wbs/be-01/src/boot.ts`; `cp` and `cmp` exited 1 because that path did not exist from that working directory, and the following focused test remained red with the same `Expected: 1`, `Received: 0`. The corrected `src/boot.ts` destination restored matching bytes before the green rerun.
- After all six proof comments, `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bun test src/boot.db.test.ts`: exit 0; 25 pass, 0 fail.
- `NX_DAEMON=false bunx nx run wbs-be-01:typecheck`: exit 0; Nx successfully ran the target with 0/1 cache hits (`slice-d-typecheck.log`).
- `NX_DAEMON=false bunx nx run wbs-be-01:lint`: exit 0; Nx successfully ran the target with 0/1 cache hits (`slice-d-lint.log`).
- `GSETTINGS_BACKEND=memory bunx prettier --write apps/wbs/be-01/src/boot.ts openspec/changes/backend-startup-ownership/tasks.md openspec/changes/backend-startup-ownership/verify.md`: exit 0; `boot.ts` and `tasks.md` were unchanged, and Prettier formatted this record.
- `NX_DAEMON=false bunx nx format:check --all`: exit 0 with no diagnostic output (`slice-d-format-check.log`).

## Negative proofs

Slice A changes no check, so it has none. Slices B onward record theirs here.

Slice B changes no production safety check. Its five cases characterize behavior that already
passes before lifecycle ownership changes, so this slice has no fault injection.

Planner, after slice C, 2026-09-20: the whole `wbs-be-01` test, typecheck and lint succeeded outside the sandbox; the real stack (be-01 under the new ownership, gw-01 and a built fe-01) booted and served two Chromium cases on isolated ports (`CI=1 E2E_PORT_SHIFT=2000`): 2 passed in 15.5s.

### Slice D

| Proof | Injected fault                                                       | Named test                                                              | Observed failure                                                                                      | Evidence                                                                           |
| ----- | -------------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 1     | Registered `source` without `withDisposal` or `source.close()`       | `releases the source when the port it was given is already taken`       | `Expected: 1`, `Received: 0` source closes                                                            | `proof-1-source-disposal.patch`, `proof-1-source-disposal.log`                     |
| 2     | Removed the server factory's `retention` dependency edge             | `starts the retention timer`                                            | `Expected: true`, `Received: false`                                                                   | `proof-2-retention-edge.patch`, `proof-2-retention-edge.log`                       |
| 3     | Removed the pushed disposer that stops a partially acquired listener | `releases the source and the port when a step after the listener fails` | `Expected: true`, `Received: false` for connection refusal                                            | `proof-3-partial-listener-disposal.patch`, `proof-3-partial-listener-disposal.log` |
| 4     | Replaced the server disposer body with `await Promise.resolve()`     | `stops accepting before it closes the source it opened`                 | `Expected: true`, `Received: false` at source close                                                   | `proof-4-server-disposer.patch`, `proof-4-server-disposer.log`                     |
| 5     | Swallowed the source close refusal                                   | `refuses to report a clean stop when a release is refused`              | `Expected constructor: [class DiBagCleanupError extends AggregateError]`; `Received value: undefined` | `proof-5-swallowed-source-refusal.patch`, `proof-5-swallowed-source-refusal.log`   |
| 6     | Registered `retention` without `withDisposal` or `retention.stop()`  | `releases every other resource when one release is refused`             | `Expected: false`, `Received: true` for timer activity                                                | `proof-6-retention-disposal.patch`, `proof-6-retention-disposal.log`               |

Planner, after slice D, 2026-09-20: slice D changed only `Proof:` comments in `boot.ts`. Replayed the partial-listener rollback fault outside the sandbox (the `await app.stop()` in the server factory's rollback replaced by `await Promise.resolve()`; `boot.ts` holds two identical `await app.stop();` lines, and this is the first): `releases the source and the port when a step after the listener fails` failed with `Expected: true`, `Received: false`, 24 pass and 1 fail; restored byte for byte, then 25 pass.
