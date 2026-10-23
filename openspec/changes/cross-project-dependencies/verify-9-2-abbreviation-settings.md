# Task 9.2 abbreviation settings acceptance

2026-10-23; base `448c0bdcdf31f6e7ad1ab2b7128f3483c21044fc`.
This bounded packet reconciles existing settings behavior and adds minimum-length
acceptance coverage. It does not complete parent Task 9.2.

## Existing implementation

`GeneralPanel` already displays the persisted abbreviation, validates manual
ASCII input against `^[A-Z][A-Z0-9_-]{0,19}$` case-insensitively before writing,
and installs the server's canonical uppercase response. An unchanged normalized
code sends no write. Typed `abbreviation_taken` refusals render an alert, retain
the draft and allow Escape to restore the current saved code. Other sections,
write/close coordination, same-project catalog refresh and old project responses
have existing mounted coverage.

The real page/table acceptance covers lowercase writes through the selected
stable `p1` project ID, catalog refresh and reopening with the canonical value.
An occupied-code case preserves that stable ID, name and saved abbreviation.
Name-derived 3–5-letter generation belongs to creation/allocation, outside this
settings packet; this audit adds no recommendation generator or second write path.

## Added acceptance and observed negative

The existing twenty-character acceptance now also exercises the one-character
lowercase input `p` returning canonical `P`. The original twenty-character literal
`puni2-core_main12345` is retained. No production behavior needed changing.

Temporarily changing only the production regex suffix from `{0,19}` to `{1,19}`
incorrectly required two characters. Running the mounted `boundary code` cases
failed the `p` case: expected canonical `P`, received retained lowercase `p`.
The twenty-character control passed (1 failed, 1 passed, 48 skipped; exit 1).
The fault was restored before final verification. The adjacent `Proof:` comment
records this production-path negative.

## Commands and results

From `apps/wbs/fe-01`:

```sh
TZ=UTC bunx vitest run --config vitest.view.config.ts src/components/wbs/project-settings-modal.test.tsx src/components/wbs/project-page.test.tsx --no-file-parallelism --maxWorkers=1 --testTimeout=30000 --hookTimeout=30000
```

Both configured mounted suites passed: 160 tests, zero failures. The settings
suite contributes 50 tests and the real page/table suite 110. Vite printed an
existing future-native-config compatibility warning.

From the repository root:

```sh
bunx prettier --check apps/wbs/fe-01/src/components/wbs/project-settings-modal.test.tsx
bunx eslint apps/wbs/fe-01/src/components/wbs/project-settings-modal.test.tsx
git diff --check
```

These checks exited 0. ESLint warned that `@nx/enforce-module-boundaries` was
skipped because this isolated clone had no cached ProjectGraph.

## Limits

The sandbox forbids writing the original repository's Git metadata, so the
packet uses an isolated shared clone at `/tmp/puni-task-9-2` with its own branch
and Git metadata. Dependencies are supplied through the existing workspace
`node_modules`; no fresh frozen install is claimed. Normal hooks are installed
for the commit. Their optional Tool Wiki admission may report inactive when no
external activation root is provisioned.

No browser/manual visual pass, actual HTTP/SQLite acceptance, generation-suite
rerun, full frontend suite, typecheck, build, host gate, deployment, push or PR
was performed in this bounded test/evidence-only packet. External authoring
activation and broader Task 9.2 acceptance remain open.
