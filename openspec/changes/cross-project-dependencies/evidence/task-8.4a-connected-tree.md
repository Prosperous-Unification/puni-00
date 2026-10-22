# Task 8.4a pure connected-tree projection

Bounded implementation on `f0a1b99b605c57545dee7fbdbda8c7af1664f6ee` in
`/tmp/puni-connected-tree-84a`, 2026-10-22. This packet is unmounted: it does
not close task 8.4, alter execution admission or enable connected scheduling.

## Seam

`service/connected-tree.ts` exports `projectConnectedTree(captured, projectId)`.
The first argument is the connected arm of `LivePlanRead`. The output keeps:

- `reads`: the matching captured member's accounting, assignments, capacities,
  resources and organization-local directory facts.
- `metadata`: the matching live project, rows, steps, attempts, blockages and seq.
- `readiness`: target-keyed component statuses, node readings/causes, eligibility,
  sparse predecessors and component order. Remote blockers and roots retain IDs.
- `placement`: the existing `selectConnectedProject` value, including the exact
  selected Schedule reference or truthful unavailable discriminator.
- `dependencies`: incoming and outgoing authored incident links with stable scoped
  endpoints, own-project numbering, own-step labels/references and node IDs.
  Uncoded steps have null printable references and retain stable navigation IDs.

The resource integrator must select this arm in both `tree` and `treeWithin`,
feed it into a presentation-only branch of the existing formatter, and carry
explicit connected availability and endpoint DTOs through response validation.
Do not invoke local canonical graph preparation or optimization using this arm.
The existing row folds/accounting formatter remains integrator-owned.

## Observed checks

- Initial projector stub: focused suite exited 1, six failures for missing
  projection behavior. Empty per-step maps subsequently exposed an additional
  RED; undefined endpoint abbreviation/name/code injections exposed four REDs.
- `bun test libs/wbs/application/core/src/service/connected-tree.test.ts`:
  19 pass, 0 fail, 52 assertions after the endpoint-label changes.
- Final combined projector, connected-plan and connected-readiness suites:
  50 pass, 0 fail, 142 assertions, exit 0 (158 ms).
- `bunx tsc --build --force libs/wbs/application/core/tsconfig.lib.json
libs/wbs/application/core/tsconfig.spec.json`: final rerun exit 0.
- Initial direct ESLint lacked a cached Nx project graph and skipped its module
  boundary rule. After invoking Nx, `bunx eslint
libs/wbs/application/core/src/service/connected-tree.ts
libs/wbs/application/core/src/service/connected-tree.test.ts` exited 0
  with no diagnostics or skipped-rule warning.
- Named-file Prettier check (both source files and this evidence): exit 0.
- `bun node_modules/typescript/bin/tsc ...` was unavailable because this repo's
  TypeScript package alias has a different installed path; configured `bunx tsc`
  was used successfully instead.

The configured full lint attempt was
`NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-core:lint --skip-nx-cache`.
It exited 1 after 32.3 seconds, with no ESLint rule diagnostics. Its complete
captured output was:

```text
> nx run wbs-core:lint

> bunx eslint libs/wbs/application/core/src libs/wbs/application/core/testing libs/wbs/application/core/playwright.config.ts

Warning: command "bunx eslint libs/wbs/application/core/src libs/wbs/application/core/testing libs/wbs/application/core/playwright.config.ts" exited with non-zero status code

 NX   Running target lint for project wbs-core failed

Failed tasks:

- wbs-core:lint

Hint: run the command with --verbose for more details.

  Run duration:      32.3s
  Cache:             Skipped (--skip-nx-cache)
  Critical path:     32.3s (1 task)
  Recoverable time:  <1ms

  Recommendations:
    - Cache: drop --skip-nx-cache to restore unchanged tasks instantly.
    - Speed up or split the longest tasks on the critical path:
        wbs-core:lint    32.3s
```

## Watched faults

Each temporary production edit below exited 1 with its named projector test
failing. Each was restored before the green combined run. Logs remain under
`/tmp/puni-connected-tree-<fault>.log`; summary is
`/tmp/puni-connected-tree-faults.json`.

| Injected fault                                               | Observed negative                                                                                                                                                                     |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Remove `requireEvidence` refusal                             | `refuses absent row status` returned an undefined status rather than throwing.                                                                                                        |
| Remove metadata identity guard                               | All five corrupted row/step/project-owner/row-owner/step-owner cases failed. Missing steps and foreign owners were accepted; the missing-row case reached a later diagnostic refusal. |
| Remove per-step reading/cause checks                         | `refuses missing per-step readings and causes` accepted an incomplete leaf.                                                                                                           |
| Replace incident relationship filter with true               | A's endpoint projection leaked unrelated B-to-C link; incident-label case failed.                                                                                                     |
| Use `010` instead of endpoint's own number in step reference | Remote `080.39.s1-dev` assertion failed.                                                                                                                                              |

## Remaining acceptance

These are pure production-function proofs, not mounted HTTP proofs. Required
follow-up includes formatter parity, full/paged/single-row response validation,
calendar/engine-unavailable rendering, committed claim/history/event success,
event timing after writer release, borrowed/staged reads, aggregate load/space
deduplication/cache coherence, connected optimizer admission, and external fanout.
The packet does not assert rendered dates or slices absent on an HTTP unavailable
tree; it preserves the truthful placement discriminator for that integration.

No mounted controller tests, full CI, browser checks, host gate, OpenSpec
validation, deployment, push or merge were performed for this isolated packet.
