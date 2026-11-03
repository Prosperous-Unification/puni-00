# Verification

Baseline public458570bebdfc26d772c33b1f58d069565dd11562, private runtimea0d7857ff13139b954bce8035755b302639c53f7, later private docs89cbdab40ec2329b05531197bdc5f0092544fe63, Fleetcbc0498531d159b7979a0ff3a58d04f5f574e8b6/order6.

Observed actual development screenshots:

- /tmp/puni-live-analytics-bb565077-7f5b-4c79-9c60-beecdc218cde/manual-ready-for-synthetic-send.png
- /tmp/puni-live-analytics-bb565077-7f5b-4c79-9c60-beecdc218cde/confirmed-synthetic-request.png

The scoped-v1 RequestEditor renders inside white .form-panel, but shared night rules set white preview/reference and pale labels/copy. Existing legacy-only manual captures do not cover this path. This is evidence of the defect, not yet the required automated failing contrast proof. Source, proof commands, fault/restoration and release/live evidence will be recorded below as actually executed. Production and paid inference remain held.

## Task 1: scoped source restoration and rendered regression

Worktree `/home/df/.codex/worktrees/143d/puni-00`, branch `fix/puni-manual-contrast`, base `458570bebdfc26d772c33b1f58d069565dd11562`. Public source only. Independent review and all Task 2 delivery work remain pending with root.

The production change is confined to `apps/website/fe-01/src/style.css`: existing light palette roles under `.form-panel` restore scoped editor text, fields, focus, actions and receipts. Shared night selectors and RequestEditor behavior are unchanged. The existing screen fixture now creates versioned `improve` drafts only for the new states; its legacy intake remains unchanged. The browser-only helper `browser/scoped-contrast.mjs` samples actual screenshot backgrounds behind visible own text/entered values, including pseudo-elements, glass and gradients, and measures resting/focused field indicators against their painted surrounding surface. The dark positive additionally pins its observed label/preview colors and glass gradient.

Evidence root: `/tmp/manual-contrast-task1/`. `capture-manifest.json` records every executed state/viewport and SHA-256 for every retained screenshot. Logs contain actual individual text and field contrast measurements. The new states are `manual-scoped-edit`, `manual-scoped-preview`, `manual-scoped-receipt` and `build-scoped-review`, each at 1440×900, 768×1024, 390×844 and 320×568. Each complete run retains 16 named captures plus four dark edit screenshots, 20 PNGs total. The manifest asserts the exact state/width set, nonzero counts and expected pass/failure sets.

| Execution                                 | Observed result                                                            | Receipt                                                   |
| ----------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------- |
| Frozen locked install                     | Exit 0; 1801 installs checked, no changes                                  | `install.log`                                             |
| Baseline focused Nx test, uncached        | Exit 0; 140 pass, 0 fail, 416 expectations                                 | `baseline-test-permitted.log`                             |
| Baseline app build, uncached              | Exit 0; app plus four declared dependencies                                | `baseline-build.log`                                      |
| Complete baseline rendered RED            | Exit 1; all 12 manual captures fail, all four dark positives pass; 20 PNGs | `red-corrected.log`, `red-corrected/`                     |
| Fixed app build, uncached                 | Exit 0; 153 app modules, plus four declared dependencies                   | `green-build.log`                                         |
| Rendered GREEN                            | Exit 0; all 16 captures pass, 20 PNGs                                      | `green.log`, `green/`                                     |
| Remove actual compiled repair             | Exit 1; same 12 manual captures fail, four dark positives pass, 20 PNGs    | `fault.log`, `fault/`, `css-fault.json`                   |
| Broaden actual repair beyond manual panel | Exit 1; all four dark captures fail the palette check, eight PNGs          | `scope-fault.log`, `scope-fault/`, `css-scope-fault.json` |
| Restore byte-identical CSS and rerun      | Exit 0; all 16 captures pass, 20 PNGs                                      | `restored.log`, `restored/`, `css-restored.json`          |
| Uncached focused test/lint/typecheck      | Exit 0; all three website-fe-01 targets pass                               | `focused-checks.log`                                      |
| Explicit browser ESLint                   | Exit 0, no suppressions or added globals                                   | `browser-lint-final.log`                                  |
| Strict named OpenSpec                     | Exit 0; one valid change                                                   | `openspec-strict.log`                                     |
| Ordinary all OpenSpec                     | Exit 0; 288 changes and 18 specs pass                                      | `openspec-all.log`                                        |

Baseline manual labels measured about 1.82:1, preview about 1.1:1, entered email 1:1 and receipt reference 1:1. After repair, minimum sampled manual normal text is 6.3266:1, resting field boundary 3.2546:1 and field focus 5.0841:1. Dark edit/review normal text remains at least 7.4335:1. Normal text threshold stays 4.5:1; boundary/focus stays 3:1. All final captures also pass existing 44px target, horizontal overflow, console and CLS checks (max manual CLS 0.028; dark 0).

The fault removes exactly the 11 compiled repair rules (1077 bytes) from `dist/assets/index-JOy1FyGv.css`, with no source mutation. Fixed and restored CSS SHA-256: `1091d28e5e3bdb2806f8cff822a10d4535bb270317e550136b43758c54f4fdad`; removed-fix SHA-256: `3be00862a95b2f892638a78ec13a1d50290da1d42d19776331392b28d5137213`. The second fault strips `.form-panel ` only from those rules, causing the dark positive to report muted light label/preview colors and `glass: none`. Both faults are restored before the final complete run. Adjacent `Proof:` comments name the observed production-path negatives.

Commands (all in the owned public worktree; scoped execution permission used for writes/listeners/cache):

```sh
bun install --frozen-lockfile
bunx nx run website-fe-01:test --skip-nx-cache
env WEBSITE_API_PORT=3519 PUBLIC_ORIGIN=http://localhost:4719 APP_ORIGIN=http://localhost:4619 WEBSITE_DATABASE_PATH=/tmp/manual-contrast-task1/website.sqlite DEMO_AUTH=0 OPENROUTER_ENABLED=0 RETENTION_JOURNAL=disabled TRUSTED_PROXY_HOPS=1 bun apps/website/be-01/src/main.ts
env VITE_API_ORIGIN=http://localhost:3519 VITE_SITE_ORIGIN=http://localhost:4719 bunx nx run website-fe-01:build --skip-nx-cache
# In apps/website/fe-01:
bunx vite preview --host localhost --port 4619 --strictPort
# From the workspace root, with the appropriate evidence directory for each phase:
env PUNI_SCREENS_PORT_OFFSET=400 PUNI_SCREENS_DIR=/tmp/manual-contrast-task1/restored PUNI_SCREENS_ONLY=manual-scoped-edit,manual-scoped-preview,manual-scoped-receipt,build-scoped-review PUNI_SCREENS_STRICT=1 bun apps/website/fe-01/browser/screens.mjs
bunx nx run-many --targets=test,lint,typecheck --projects=website-fe-01 --skip-nx-cache --parallel=1
bunx eslint apps/website/fe-01/browser/screens.mjs apps/website/fe-01/browser/scoped-contrast.mjs
bunx openspec validate restore-manual-editor-contrast --strict --json
bunx openspec validate --all --json
```

Setup failures are distinct from product RED: the first sandboxed Nx test refused `.nx/workspace-data/d/daemon.log` with EROFS (`baseline-test.log`), then passed with scoped permission. First disposable API launch refused absent `RETENTION_JOURNAL` (`api.log`), then started with explicit `disabled` (`api-ready.log`). The initial browser run (`red.log`, `red/`) exposed fixture defects: focus sampling landed on the outline itself, clicking a pre-open reference details closed it, and a small dark viewport clipped an independently scrolling text sample. Those were corrected before the complete baseline RED; original results remain retained. The first fault extraction asserted 13 rules rather than the observed 11 and stopped before mutation; the corrected extraction then produced the retained genuine fault run. Focused Vite builds emit the existing NO_COLOR/FORCE_COLOR warning but complete successfully.

The fixture has no paid provider and uses a fresh disposable SQLite store, existing simulated gateway visitor setup, synthetic brief/reference and `.test` email. Site media is deliberately aborted to exercise the deterministic fallback gradient, so no external media is fetched. Three background samples per visible text rectangle are a bounded rendered regression, not an exhaustive whole-glyph audit or validation of every moving video frame. Legacy states, header parity, full host gates, private projection, publication, live Cloud and production/paid acceptance are not run in Task 1. The API/preview processes are stopped after capture, with listener cleanup retained in the task report. Formatting, final diff/hook receipts and the normal source commit are recorded there as well.
