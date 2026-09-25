# Verification Report

**Change**: `migrate-report-libraries`

Each slice of packet 140.1–140.2 appends its own entry below: the attempt, its starting hash, its
baselines, every command's status, the red and green counts, every fault observed, and what stayed
pending planner verification.

## Packet 140.1–140.2, slice 1 — the intent

- Attempt `140-1-2-report-libraries-migration.1.20260925T114237Z`, observed 2026-09-25, starting
  hash `70c6f0652fbe6059dc0047afd67599efa49d0d5f` (`base.txt`); `status-before.txt` empty.
- Step 0b: `patches=5`, `mutations=13`, exit 0.
- Step 0c, strict `openspec validate --all --json` baseline: exit 0,
  `{"items":114,"passed":114,"failed":0}` (`openspec-base-totals.txt`), so O = 114.
- `openspec new change migrate-report-libraries --schema sdd-lean`: exit 0,
  `Created change 'migrate-report-libraries'`, then `1:schema: sdd-lean` (`openspec-new.log`).
- Section 7.1 applied with `git apply --check` and `git apply`: exit 0.
- Strict `openspec validate --all --json` after the change: exit 0,
  `{"items":115,"passed":115,"failed":0}` (O + 1), and `migrate-report-libraries` reports
  `valid: true` (`openspec-s1.*.json`).
- Prettier `--write` over the five owned paths left all five `(unchanged)`; `--check` exit 0,
  `All matched files use Prettier code style!`; the hand-over `diff` of the working tree's paths
  against the owned list printed nothing: five `??` paths (`step5.log`, `status-after.txt`).
- Pending planner verification: staging and committing the five paths with the hooks on, the
  repository-wide format check and strict validation on the committed tree. The host gate was not
  run.

## Packet 140.1–140.2, slice 2 — both libraries move, in one lockfile edit

- Attempt `140-1-2-report-libraries-migration.2.20260925T114640Z`, observed 2026-09-25, starting
  hash `53c4c39a5136f85b8d5785723c4bdf5630063fdc` (`base.txt`); `status-before.txt` empty.
- Step 0b: `patches=5`, `mutations=13`, exit 0. Step 0c strict OpenSpec baseline: exit 0,
  `{"items":115,"passed":115,"failed":0}` (`openspec-base-totals.txt`), so O = 115.
- Step 1, no nested copy under `application-exception`; baselines, each `status=0`: pins 19 pass,
  failures 20 pass, observability 28 pass, backend 5 pass, gateway 5 pass, MCP 4 pass, frontend
  `Test Files 7 passed (7)` `Tests 288 passed (288)`, typecheck `Successfully ran target typecheck
for 7 projects and 1 task they depend on` (`base-*.log`).
- Step 2, the registry (`registry.txt`), exit 0: `caught-object-report-json latest 13.0.0`,
  `application-exception latest 0.7.0`, and the three dependency lines `0.5.0 … "^11.0.1"`,
  `0.6.0 … "^12.0.0"`, `0.7.0 … "^13.0.0"`, each with `"nanoid":"^3.3.19"`.
- Step 3, section 7.2 applied; red (`red-*.log`), each `status=1`: pins 17 pass 3 fail (the
  manifest test `- Expected - 2`, the lock-key test `- Expected - 1`, and `installs one copy of
the report library, the one application-exception loads` on `Expected: "13.0.0"` `Received:
"11.0.1"`); failures 0 pass 1 fail, `Cannot find module
'application-exception/schemas/diagnostic-report-v6.json'`; observability 25 pass 4 fail, each
  `Expected: "corj/v0.15"` `Received: "corj/v0.14"`; backend, gateway and MCP 4·1, 4·1, 3·1, each
  on `"v": "corj/v0.15"` against `"corj/v0.14"`; frontend `1 failed | 6 passed (7)`,
  `1 failed | 287 passed (288)`, `expected [ 'corj/v0.15' ] to deeply equal []`; typecheck
  `status=1`, `Failed tasks: - shared-failures:typecheck`, ten diagnostics, all in
  `report-failure.test.ts` (TS2724, TS2305, TS2307, TS2724, TS2769, TS7031, TS2322, TS7006, TS7006,
  TS2322) (`red-typecheck.plain.log`).
- Step 4, section 7.3 applied. Step 5, `bun install --frozen-lockfile`: `status=0`, `2 packages
installed`; no nested copy; installed `"version": "13.0.0",` and `"version": "0.7.0",`;
  `2 files changed, 6 insertions(+), 6 deletions(-)` (`install.log`, `installed.txt`).
- Step 6, green (`green-*.log`), each `status=0`: pins 20 pass (N + 1), failures 20, observability
  29 (N + 1), backend 5, gateway 5, MCP 4, frontend 7·288, typecheck `Successfully ran target
typecheck for 7 projects and 1 task they depend on`, lint `Successfully ran target lint for 7
projects`.
- Step 7, the probe: Bun, `tsc` `Version 7.0.2` and `tsc6` `Version 6.0.3` each `status=0`, both
  compilers silent; Bun printed the eight `ok` lines (`diagnostic v is corj/v0.15`, `public v is
appex/public/v4`, `one occurrence id`, `fingerprint is fp1`, `secret scrubbed`, `budget holds at
32767 bytes`, `context dropped whole over budget`, `Corj.makeReport and CorjMaker agree on the
fingerprint`) and `issue 217 open: TypeError: Array.isArray cannot be called on a Proxy that has
been revoked` (`probe-*.log`).
- Step 8, strict OpenSpec: exit 0, `{"items":115,"passed":115,"failed":0}` (O)
  (`openspec-s2-totals.txt`).
- Pending planner verification: staging and committing the nineteen paths with the hooks on; the
  whole `tool-devsync:test` target (base + 1); `check-indexes`; the whole `test` targets of the
  five Bun projects; `wbs-fe-01:test` and `wbs-fe-01:test:unit`; the Chromium `wbs-fe-01:e2e`
  run of `browser-packages.spec.ts` and `fault-boundary.spec.ts`; the repository-wide format
  check. The host gate was not run.
