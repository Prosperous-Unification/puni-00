# Task 9.2 bounded remote navigation audit

2026-10-23. Audited base `6bb0b0833b920d44c628d736cf1591e447c1b2ea` in isolated
managed worktree `/home/df/.codex/worktrees/1d51/puni-00`, branch
`task92-remote-navigation`, on `pop-os`. No h1claw, shared checkout, push, deploy
or activation work occurred. This is a documentation/evidence audit; all
production sources and existing tests are unchanged.

## Existing implementation traced

- `lib/wbs-api.ts:dependencyViewsOf` consumes the actual shared connected DTO,
  merges relationships by stable relationship ID and marks foreign endpoints
  with their captured evidence.
- `typed-dependency-editor.tsx:endpointText` and `dependencyWords` retain captured
  qualified references, step names and work-item names. Desktop Depends and
  phone cards share this spelling and `dependency-navigation.tsx` links.
- `DependencyNavigation` puts captured stable project/work-item IDs and optional
  step-node ID in the href; the abbreviation/number only supplies display words.
  Existing mounted rename tests assert changed label and identical stable href.
- `plan-chart-input.ts:chartTypedDependencies` excludes either foreign endpoint
  before local layout. Existing mounted coverage requires an actual local Gantt
  bar and no external arrow; the direct adapter case also preserves a local edge.
- Existing captured-details UI is read-only. Existing stable-link landing tests
  cover desktop/phone filters, collapsed ancestors, focus and URL consumption.

The original implementation/TDD history remains in the
[persisted display packet](task-9-2-persisted-remote-display-packet.md). This audit
adds fresh observations rather than reimplementing that slice. No new safety
check was introduced; adjacent existing `Proof:` comments already name the same
watched faults.

## Fresh commands and observations

Root: `BUN_TMPDIR=/tmp BUN_INSTALL_CACHE_DIR=/tmp/bun-task92-cache bun install --frozen-lockfile`
succeeded with 1493 installed packages, without a tracked lockfile change.

From `apps/wbs/fe-01`:

```sh
TZ=UTC bunx vitest run src/components/wbs/persisted-remote-dependencies.test.tsx src/components/wbs/typed-dependency-editor.test.tsx src/components/wbs/plan-chart-input.test.ts src/lib/wbs-api.test.ts --maxWorkers=1 --no-file-parallelism --testTimeout=30000 --hookTimeout=30000
```

[Baseline](task-9-2-remote-navigation-audit/baseline.log.txt): **149/149 passed**
in four files. The persisted-remote suite contains 35 mounted cases.
[Restored run](task-9-2-remote-navigation-audit/restored.log.txt) after all three
mutations also passes **149/149**, exit 0. A fresh production-source diff is empty.

Root configured frontend checks:

```sh
NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t lint,typecheck -p wbs-fe-01 --parallel=1 --skip-nx-cache --output-style=static
```

[Output](task-9-2-remote-navigation-audit/nx.log.txt): exit 0; full configured
frontend lint and required module/app typechecks pass uncached in 4m24s. This
command began before the fault campaign; final source restoration is separately
verified by the restored four-suite test run and empty production diff. Final
restored-file ESLint also passes (exit 0, no diagnostics):

```sh
bunx eslint apps/wbs/fe-01/src/components/wbs/dependency-navigation.tsx apps/wbs/fe-01/src/components/wbs/plan-chart-input.ts apps/wbs/fe-01/src/components/wbs/typed-dependency-editor.tsx
```

Scoped Prettier for this audit, `tasks.md` and `verify.md`, plus
`git diff --check` and `git diff --exit-code -- apps/wbs/fe-01/src`, pass.

## Independently watched production faults

All faults used the existing mounted suite, replacing one production source
expression at a time. Each source was restored in `finally`. Each receipt names
the exact mutation and command, observed failed tests and `AUDIT_EXIT=1`.

| Fault                                                                                                      | Observed failure                                                                                                                                                 |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Use abbreviation for navigation project](task-9-2-remote-navigation-audit/address-navigation.log.txt)     | Three mounted cases fail: desktop/phone href becomes `project=REMOTE`; rename becomes `project=RENAMED` instead of stable `project=remote-stable`.               |
| [Admit foreign relationships into local chart input](task-9-2-remote-navigation-audit/local-chart.log.txt) | Two cases fail: adapter returns `external` alongside `local`; rendered local bar disappears into chart fault boundary with `unknown chart work item remote-row`. |
| [Return only non-null qualified address](task-9-2-remote-navigation-audit/address-only-label.log.txt)      | Desktop/phone accessible labels lose captured `Remote development` step words; two cases fail.                                                                   |

The mutation driver initially refused its ambiguous label replacement before
editing that file; it was narrowed to the first captured-label branch, then the
two intended mounted failures were observed. This setup refusal is not counted
as an R5 proof.

## Limits

This audit exercises the existing frontend transport adapter and mounted UI over
explicit captured fixtures; it does not prove live backend activation, production
remote authoring, remote scope editing, end-to-end project loading, browser
geometry or deployment. The full frontend aggregate, unit-tier aggregate, zoned
suite, browser/Playwright, production build, repository CI/OpenSpec validation and
canonical exact-SHA host gate are unrun in this packet. Parent 9.2 remains
unchecked. Existing Vite native-config `__dirname` compatibility warnings remain.
