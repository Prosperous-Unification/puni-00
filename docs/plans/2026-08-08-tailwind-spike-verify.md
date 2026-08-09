# T `tailwind-spike` — verify

Step 0 of the presentation lane in `2026-08-08-phases-gantt-mobile-roadmap.md`:
prove Tailwind v4 through the Vite/Vitest/Nx/Bun stack before any component
lands. No components were written and one utility class was added — the tracer
on the brand heading.

**It is not a no-op on the pixels, and calling it "tooling only" would be a
lie.** `src/components/ui/button.tsx` has carried Tailwind classes since before
this branch with no stylesheet behind them; compiling utilities makes them live
and restyles two chrome buttons (finding 2). That restyle is unowned by this
change — change **F `shadcn-foundation`** is the contract that adopts chrome
components and owns how they look. If Dany does not want those two buttons
changing ahead of F, the fix belongs in F's scope or in a revert of
`button.tsx`'s classes, not in a `@source` exclusion here.

Every command below was run on 2026-08-09 on Dany's Mac (darwin arm64, bun
1.3.14, chromium 1234 from the Playwright cache), from the worktree at
`.claude/worktrees/agent-ae45af060ccc8bbfb` on branch `change/tailwind-spike`.

## What landed

| file                              | what                                                                                                              |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `package.json` / `bun.lock`       | `tailwindcss@4.3.3`, `@tailwindcss/vite@4.3.3`, dev deps                                                          |
| `apps/fe-01/src/styles.css`       | the entry: theme + utilities, **no preflight**, scan confined to `src`                                            |
| `apps/fe-01/src/main.tsx`         | `import './styles.css'`                                                                                           |
| `apps/fe-01/src/app.tsx`          | the tracer — `className="tracking-tight"` on the `WBS tool v2` brand heading                                      |
| `apps/fe-01/vite.config.ts`       | `tailwindcss()` in `plugins`                                                                                      |
| `apps/fe-01/src/styles.test.ts`   | 7 unit tests: two real Vite builds — the stylesheet alone, and the whole app through the shipped `vite.config.ts` |
| `apps/fe-01/e2e/tailwind.spec.ts` | 3 browser tests: the tracer applied, the reset absent                                                             |
| `nx.json`                         | `production` no longer excludes `vite.config.[jt]s`; `bun.lock` added to `sharedGlobals` — see finding 3          |

`layout.spec.ts` and `keyboard.spec.ts` are untouched.

## The three findings

### 1. The layout gate cannot see unscoped preflight. The plan assumed it could.

The roadmap's T.2 says a deliberate unscoped-preflight commit "turns the
date-width and geometry assertions red". It does not. Watched:

```
  ✘  32 [chromium] › apps/fe-01/e2e/tailwind.spec.ts:53:3 › leaves the heading the margin the user agent gives it
  ✘  33 [chromium] › apps/fe-01/e2e/tailwind.spec.ts:67:3 › leaves form controls the platform font, not the page’s
  2 failed
  31 passed (34.7s)
```

All 22 of `layout.spec.ts`'s tests passed with preflight fully enabled, as did
all 8 of `keyboard.spec.ts`'s.
The reason is in `wbs-table.tsx:3766` — the earliest-start field already
carries `style={{ width: '100%', boxSizing: 'border-box', font: 'inherit' }}`,
which is precisely the pair of declarations preflight would have imposed, and
an inline style outranks every `@layer`. The whole table is styled that way.

That argument covers **overlapping** declarations only, and the claim is scoped
to them. Preflight's **inherited** ones are not blocked by an inline style on a
descendant: `html { line-height: 1.5 }` and the default font stack still reach
any cell that does not set them, so the table's vertical rhythm very likely did
move. Nothing in `layout.spec.ts` asserts a row height — it measures x, width,
containment, sticky offsets and overflow — so nothing measured it. What was
observed is **"no assertion the browser gate makes moved"**, not "the table did
not move", and the two are not the same sentence.

Consequences, and F should read them as prerequisites:

- Preflight is **unmeasured on today's table, not proven harmless, and worse on
  tomorrow's**. The first `<td>` styled by a class puts the overlapping
  declarations back in the cascade too, with nothing measuring either kind.
- The geometry oracle for this fault is **not** `layout.spec.ts`. It is
  `e2e/tailwind.spec.ts` (browser) and `src/styles.test.ts` (compiler), both
  watched failing below.
- Preflight stays off regardless. Nothing in this app is styled by a class, so
  a reset would be all cost.

### 2. Two Tailwind-classed buttons stop being inert

`src/components/ui/button.tsx` has shipped since before this change with
`bg-slate-900 text-white h-10 px-4 …` on it, and no stylesheet behind them.
Compiling Tailwind makes those classes live. Two elements change appearance:
the **Log out** button (`app.tsx`) and the auth form's **Create account /
Sign in** submit (`auth-form.tsx`). Both are chrome; neither is measured by
`layout.spec.ts`, and the browser gate is green with them live.

This is a visual change the spike's scope ("no restyling") did not ask for. It
was kept rather than suppressed: the only way to stop it is to exclude
`src/components/ui` from `@source`, which is an artificial rule that F would
delete on its first day. Flagged for Dany rather than decided here.

### 3. `nx run fe-01:build` answered from cache after inputs it never watched

Pre-existing, found by this change and fixed by it. `nx.json`'s `production`
named input excluded `{projectRoot}/vite.config.[jt]s`, and `build` uses
`["production", "^production"]` — so the file that decides the plugin list, the
output directory and the base path was not a build input at all. Watched, with
the exclusion still in place:

```
$ printf '\n// cache probe\n' >> apps/fe-01/vite.config.ts
$ bunx nx run fe-01:build
> nx run fe-01:build  [existing outputs match the cache, left as is]
Nx read the output from the cache instead of running the command for 1 out of 1 tasks.
```

With the exclusion removed, the same edit rebuilds:

```
$ printf '\n// cache probe two\n' >> apps/fe-01/vite.config.ts
$ bunx nx run fe-01:build
✓ built in 815ms
```

`vitest.config.ts` stays excluded: it genuinely does not affect a build.

**And the same hole, one level up: `bun.lock` was not in `sharedGlobals`.** A
lockfile-only dependency bump — exactly the shape of a Tailwind, `oxide` or
`lightningcss` version change, where the compiler and its native code move but
no source file does — reused a bundle built by the old one. Watched:

```
$ printf '\n' >> bun.lock
$ bunx nx run fe-01:build
> nx run fe-01:build  [local cache]
Nx read the output from the cache instead of running the command for 1 out of 1 tasks.
```

With `{workspaceRoot}/bun.lock` in `sharedGlobals`, the same touch rebuilds:

```
$ printf '\n' >> bun.lock
$ bunx nx run fe-01:build
✓ built in 779ms
```

`package.json` was already there, which is why this went unnoticed: a version
range change is caught, a resolution change inside the range is not.

## The tracer, end to end

**Compiled into the production bundle** (`bunx nx run fe-01:build --skip-nx-cache`,
`dist` deleted first):

```
$ grep -o "\.tracking-tight{[^}]*}" dist/apps/fe-01/assets/*.css
.tracking-tight{--tw-tracking:var(--tracking-tight);letter-spacing:var(--tracking-tight)}

$ grep -o '<link[^>]*css[^>]*>' dist/apps/fe-01/index.html
<link rel="stylesheet" crossorigin href="/assets/index-Rnbxh98P.css">

$ grep -c "border-box" dist/apps/fe-01/assets/*.css
0
```

**Applied by a real browser under `vite dev`** — the Playwright `webServer`
runs `bunx vite`, so all 33 browser tests exercise the dev pipeline, not the
build:

```
  ✓  31 [chromium] › apps/fe-01/e2e/tailwind.spec.ts:21:3 › applies the tracer class the brand heading carries
  ✓  32 [chromium] › apps/fe-01/e2e/tailwind.spec.ts:53:3 › leaves the heading the margin the user agent gives it
  ✓  33 [chromium] › apps/fe-01/e2e/tailwind.spec.ts:67:3 › leaves form controls the platform font, not the page’s
  33 passed (41.1s)
```

Production CSS is **6.96 kB / 1.75 kB gzipped**, against no stylesheet at all
before. About 1 kB of that is dead weight the scanner invents from TypeScript
string literals — `.sticky`, `.hidden`, `.table`, `.resize`, `.blur`, `.filter`
and a dozen more come out of `position: 'sticky'` and friends in
`wbs-table.tsx`. No element carries those class names, so they are inert; they
are the price of a heuristic scanner and are recorded rather than fought.

## Failure-proof table (R5)

Every check here has been watched failing with the thing it guards broken, one
fault at a time, each reverted before the next.

| check                                                      | fault injected                                                   | observed                                                                                                                                                                                    |
| ---------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `styles.test.ts` › compiles the tracer class               | `className="tracking-tight"` off the `h1` in `app.tsx`           | 1 failed — `expected '@layer properties{@supports (((-webki…' to contain '.tracking-tight'`                                                                                                 |
| `styles.test.ts` › emits nothing for an unused utility     | `source(none)` and the three `@source` lines out of `styles.css` | 1 failed — `expected '…' not to contain '.tracking-widest'`                                                                                                                                 |
| `styles.test.ts` › brings no box-sizing reset              | the two imports replaced by `@import 'tailwindcss'`              | 3 failed — `not to contain 'border-box'`                                                                                                                                                    |
| `styles.test.ts` › leaves form controls the browser's font | same fault                                                       | same run — `not to match /font:\s*inherit/`                                                                                                                                                 |
| `styles.test.ts` › base layer declared and empty           | same fault                                                       | same run — `to match /@layer[^;{]*\bbase\b[^;{]*;/`                                                                                                                                         |
| `tailwind.spec.ts` › applies the tracer class              | `import './styles.css'` dropped from `main.tsx`                  | 1 failed, 2 passed — `toBeCloseTo`, `Expected: -0.8, Received: NaN` (`normal`, the letter-spacing of an unstyled h1)                                                                        |
| `tailwind.spec.ts` › heading keeps its user-agent margin   | the two imports replaced by `@import 'tailwindcss'`              | 2 failed, 31 passed — `Expected: > 0, Received: 0`                                                                                                                                          |
| `tailwind.spec.ts` › form controls keep the platform font  | same fault                                                       | same run — `Expected: not "16px"`                                                                                                                                                           |
| `styles.test.ts` › the shipped config wires the plugin     | `tailwindcss()` out of `vite.config.ts`'s `plugins`              | 1 failed, 6 passed — `expected '@layer theme,base,components,utilitie…' to contain '.tracking-tight'`; the five stylesheet-alone tests passed throughout, which is the gap this pair closes |
| `nx.json` `production` includes `vite.config.ts`           | the exclusion put back, `vite.config.ts` touched                 | `[existing outputs match the cache, left as is]` — a stale bundle reported as a build                                                                                                       |
| `nx.json` `sharedGlobals` includes `bun.lock`              | the entry removed, `bun.lock` touched                            | `[local cache]` — a lockfile-only compiler bump reusing a bundle built by the old one                                                                                                       |

### A flake in `tailwind.spec.ts`, found by re-running it and fixed

`playwright.config.ts` sets `retries: 0` and says why: "a flake in this spec is
a bug in this spec". One appeared in the re-run after the review fixes —

```
  1) tailwind.spec.ts:67:3 › leaves form controls the platform font, not the page’s
    Error: page.evaluate: Error: the signed-out page has no input to measure
  1 failed
  32 passed (47.3s)
```

— and it is the test's own guard doing exactly its job. `page.goto` resolves on
the document's load event; this app renders from `main.tsx` after it, so a bare
`document.querySelector` races the first paint. The guard refused to measure an
empty page rather than reporting a font size nobody had rendered. The bug was
the missing wait, not the guard: both reset tests now wait on the username
field (`openSignedOutPage`) before measuring. The tracer test already waited on
its heading, which is why it never flaked.

Two checks were split into one assertion each after watching them: `expect`
throws on the first failure, so the second assertion of a two-assertion test is
never evaluated in the run that proves the first can fail. `border-box` masked
`font: inherit`; the heading margin masked the control font. Both pairs are now
separate tests and all four have been watched.

## Gate

```
$ bunx nx format:check --all
(no output, exit 0)

$ bunx nx run-many -t test lint typecheck build --parallel=2
 NX   Successfully ran targets test, lint, typecheck, build for 21 projects
```

`fe-01:test` is 619 tests across 26 files, 7 of them new in `styles.test.ts`.
Those 7 cost 1.8s of the file's runtime: two real Vite builds, one of the
stylesheet and one of the whole app through the shipped config.

Browser gate — 33 tests: 22 `layout.spec.ts`, 8 `keyboard.spec.ts`, 3 new
`tailwind.spec.ts` — run from this worktree on alternate ports (see below):

- **baseline, before Tailwind** (30 tests, no `tailwind.spec.ts` yet): 29 passed,
  1 failed — `keyboard.spec.ts › Cmd+Enter
saves the cell before it creates the row it lands in`, on
  `waiting for getByLabel('Name of 010')`. Re-run alone immediately after:
  8 passed. A pre-existing flake in the seed helper, present on `main` and
  unrelated to this change. It did not recur in any of the four later runs.
- **after Tailwind:** 33 passed (30 + 3 new), twice, cleanly.
- **after the review fixes:** 33 passed (49.1s) on 3103/3203/4203, plus
  `tailwind.spec.ts` alone twice more — 3 passed (4.3s), 3 passed (3.4s) —
  which is the repeated evidence the flake fix above is judged by.

## How the browser gate was run, and why it is not the plain command

`playwright.config.ts` hard-codes 3100/3200/4200 and reuses a running stack
when `CI` is unset. The canonical checkout's `bun run dev` was live on all
three ports throughout, serving a **different working tree** — so `bun run e2e`
from this worktree would have measured the canonical tree and reported it as
this branch's result.

The runs were made with `CI=1` (fresh servers, throwaway DB) against a locally
patched copy of the config, with matching `.env` files. The patch was reverted
with `git checkout --` before every commit; `playwright.config.ts` is
byte-identical to `main`. Anyone reproducing this on a machine with no dev
stack running can use `bun run e2e` unmodified.

**One port set is not enough on a machine running several agents.** The first
runs used 3101/3201/4201; the review-fix runs on those ports died mid-suite
twice, at test 12 and test 23, with no summary and no failure — and once with
`http://localhost:3101/health is already used` seconds after `lsof` reported it
free. The cause was another worktree: `agent-a537eaf384af84880`, building
`change/shadcn-foundation` on top of this branch, was running the same suite on
the same ports. Its servers were left alone and this branch moved to
3103/3203/4203, where the suite runs clean. Anyone parallelising this work
needs a port set per worktree — a truncated run reads exactly like a crash and
cost three re-runs to identify.

## Checks NOT run

- **The container build.** `apps/fe-01/Dockerfile` builds on
  `oven/bun:1.3.14-alpine` for `linux/amd64` with `BUN_JSC_useJIT=0`, and
  Tailwind v4 brings two native N-API modules (`@tailwindcss/oxide`,
  `lightningcss`). Both have `linux-x64-musl` entries in `bun.lock`, checked;
  neither has been _executed_ on alpine/amd64. The Docker daemon was not
  running on this machine and was not started. **This is the one thing most
  likely to bite, and it should be run on h2puni before F.**
- **The h2puni fit matrix.** T.2 asks for it; these runs are on Dany's Mac.
  The same chromium and the same spec, a different machine.
- **Dev deploy.** `bin/dev-deploy.sh` restarts on a changed lockfile
  (`docs/runbook-dev-deploy.md`); this change has one. Not exercised.
- **`openspec validate`.** No OpenSpec change was created — R4 exempts a
  tooling change with no observable contract. Finding 2 is the one place that
  claim is arguable, and it is flagged rather than buried.
