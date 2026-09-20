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

## Negative proofs

Slice A changes no check, so it has none. Slices B onward record theirs here.

Slice B changes no production safety check. Its five cases characterize behavior that already
passes before lifecycle ownership changes, so this slice has no fault injection.
