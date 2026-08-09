# Verification — `directory-page`

Branch `change/directory-page`, from `main` @ `7f0d059` (which carries `directory-crud`: the
PATCH/DELETE routes, the 409 `{ error: 'in_use', usage }` shape and the `directory_changed`
events). All output below is fresh, taken 2026-08-09 on darwin/arm64.

## Commands

| Command                                                                      | Result                                                                            |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `bun install` (adding `@tanstack/react-router@1.170.24`)                     | `10 packages installed`                                                           |
| `bun run dev:setup`                                                          | wrote all three `.env` files; `apps/be-01/.env` carries `JWT_SIGNING_KEY_CURRENT` |
| `bunx nx format:check --all`                                                 | green, no output, exit 0                                                          |
| `bunx nx run-many -t test lint typecheck build --parallel=2 --skip-nx-cache` | `Successfully ran targets test, lint, typecheck, build for 21 projects`, exit 0   |
| `bunx openspec validate --all --json`                                        | `{"items": 57, "passed": 57, "failed": 0}`                                        |
| `bunx vitest run` in `apps/fe-01`                                            | `Test Files 45 passed (45)`, `Tests 978 passed (978)`                             |
| the browser gate, whole, through the shifted config                          | `92 passed (1.9m)` — 85 that were there plus this change's 7                      |
| `bunx nx run fe-01:e2e-packaged` (built `dist/` under `caddy:2-alpine`)      | `2 passed (2.3s)`                                                                 |

`nx format:write --all` was run once, on the six files this change touched or added, before the
check above.

### The browser gate did not run through `bun run e2e`, and why

The landmine in `LLM_README.md`: the committed Playwright config sets
`reuseExistingServer: !isCi`, so `bun run e2e` measures whatever holds 3100/3200/4200 — another
checkout's `bun run dev` included. This change's browser proofs were taken through an
**uncommitted** copy of that config at `tmp/pw-shifted.config.ts`, `repoRoot` pointed at this
worktree and the three ports shifted to **3141/3241/4241** with `reuseExistingServer: false`, so
the servers under test are this worktree's own. `tmp/` is gitignored and the file is deliberately
not committed.

The packaged gate (§8.2) is different: `apps/fe-01/playwright.packaged.config.ts` **is**
committed, because it is the change's own artifact rather than a workaround.

### Browser flakes, and what they turned out to be

Three full runs of the 92-test suite on this branch failed one or two tests each — twice
`hover-cards.spec.ts` › `opens the folded figure in the same breath as the mouse arrives`
(`Received string: "Dev for 010No estimate yet"`), once `name-cell.spec.ts` › `a peer's longer
name arriving …`. None is a directory test.

They were chased rather than waved away, because R5 says a flake is a bug:

1. Each file re-run alone: `hover-cards.spec.ts` + `name-cell.spec.ts` → `13 passed`.
2. The full suite at the base commit `7f0d059`, same config → `85 passed`.
3. The full suite on this branch **with `directory.spec.ts` excluded entirely** → a _different_
   test failed (`gantt.spec.ts` › `draws the arrow head, the caret and the bracket where they can
be seen`), and `hover-cards` passed. So the cause is not this change's spec polluting the
   deployment-wide directory, which was the hypothesis worth ruling out.
4. Docker Desktop — started for §8.2 — quit, and the full suite re-run: **`92 passed (1.9m)`**.

The failures were this machine under load. Every one of the affected assertions reads the DOM
once with no retry (deliberately, per `hover-cards.spec.ts`'s own note), so they are the first
things to give when the box is busy. Nothing was changed to make them pass and nothing is claimed
fixed; the green run above is the one the gate is reported from.

### The order the slices were taken in

`tasks.md`'s order, with one exception recorded here: **§1 shipped a `DirectoryPage` that drew
its header and a heading and nothing else**, because §1's test has to be able to say which of
the two pages is on screen and §2 (the client the real page is built on) had not been written
yet. §3 filled it in. Nothing was written twice and no slice was skipped.

## Deviations from `tasks.md`, stated

- **§3.1's spy is the module, not an injected gateway.** The task asks for "a spy
  gateway/presence context". `directory-page.test.tsx` mocks `@/lib/project-stream` instead and
  asserts `subscribeToProject` called **0 times** across a mount and a rerender. That is the
  **production** dependency rather than a stand-in the page could route around, and the named
  fault was watched failing through it (below). An unused `subscribe` prop would also have been a
  prop nothing reads.
- **§6.1's "mark" assertion lives in `app-router.test.tsx`.** `aria-current` is the router's
  answer, and neither `project-page.test.tsx` nor `directory-page.test.tsx` mounts a router.
  `marks only the page that is showing` asserts both ends on both routes there; the **absence**
  of the project controls is asserted in `directory-page.test.tsx` and the presence of the nav
  beside them in `project-page.test.tsx`, as the task asks.
- **§8.2 ran here, not on h2puni.** Docker Desktop on this machine served the built `dist/` under
  `caddy:2-alpine`; nothing was built for `linux/amd64` and nothing was published. The proof is
  about a Caddy config line, not about an image platform.
- **§9.2 (deploy to dev, Dany looks) is not done.** Out of scope for this run; nothing was
  pushed, merged or deployed.

## What is NOT verified

- **§9.2.** Not deployed to dev; nobody has looked at it in the real app.
- **The `assignment_dropped` and `assumed_assignee_changed` effects end-to-end.** The browser
  removal test builds a real 409 through a work item's **service team label**, so the payload it
  draws carries `label_nulled`. The other two arms are covered by `wbs-api.test.ts`'s parse, by
  `directory-page.test.tsx`'s confirmation cases (including the flip to `unassigned`), and by
  be-01's own `directory-usage` tests from `directory-crud` — but no browser has drawn one.
- **`taken` end-to-end in a browser.** The refusal sentence and its surviving name are proven in
  `wbs-api.test.ts` and `directory-page.test.tsx`; the browser suite does not force a collision.
- **A second browser.** Chromium only, as every spec in this repository is.
- **The packaged image itself.** §8.2 serves `dist/apps/fe-01` from a mounted volume with the
  same `caddy:2-alpine` base and the same `Caddyfile` the Dockerfile copies. It does not build
  `apps/fe-01/Dockerfile`, so nothing here says the `COPY` lines are right — only that the config
  they install answers a deep link.

## A check that was written and deleted for being unbreakable

`page-nav.tsx` first carried `activeOptions={{ exact: true }}` on the plan's link, on the
reasoning that `/` is a prefix of `/directory` and both links would otherwise read as current.
**Removing it was watched changing nothing** — `app-router.test.tsx` stayed at `5 passed`,
because `/` and `/directory` are siblings under the root route rather than parent and child, and
`Link` decides "active" by route match. It is not in the shipped file, and the reason is written
where it was going to be. R5: a guard whose failure cannot be observed is a claim.

## A check that was written, watched passing, and rewritten

§4.2's "on-response, not optimistic" was first written as: refuse the patch, then assert the
refused team is not chipped. With the fault injected — `setMemberships` given a `setPeople` that
draws the new memberships **before** `patchPerson` — it **passed**, `26 passed`. It had to: the
page re-reads after every write, so an optimistic page and a patient one converge on the same
screen and the difference is only visible in the window between the request and the answer.

The fake now holds the patch in flight (`holdWrites` / `releaseWrites`) and the assertion is made
**there**. Two cases, and both were then watched failing on the same fault. This is the fault
class R5 tallies; it is written up here because it was caught by injecting the fault rather than
by reading the test.

## Failure-proof table

Every check below was watched failing with the named fault injected, then the fault reverted and
the suite watched green again. Messages are quoted as the runner printed them.

### §1 — the router, and the gate above it

| Check                                                                           | Fault injected                                                                                                                         | Observed                                                                                                                           |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `app-router.test.tsx` › `marks only the page that is showing`                   | the directory's `Link` replaced by `<a href="/directory">` — the shape somebody reaches for when a nav is "just two links"             | `1 failed \| 4 passed`, `→ expected null to be 'page'`                                                                             |
| `app.test.tsx` › both cases in `a signed-in address asked for while signed out` | the router hoisted above the gate: `app.tsx`'s `if (session === null)` branch made unreachable, token passed as `session?.token ?? ''` | `2 failed \| 2 passed`, both `→ Unable to find role="button" and name "Log in"` — the directory drawn to a visitor with no session |

### §2 — the directory client and its sentences

| Check                                                                               | Fault injected                                                              | Observed                                                                                                   |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| the three `throws an in_use …` cases in `wbs-api.test.ts`                           | the `isDirectoryUsage(body['usage'])` half dropped from `removeDirectoryAt` | `3 failed \| 18 passed`, `→ promise resolved "{ ok: false, reason: 'in_use', …(1) }" instead of rejecting` |
| `reads the usage out of the refusal rather than throwing the code`                  | the whole `in_use` branch deleted, so the 409 falls to the throw            | `1 failed \| 20 passed`, `→ promise rejected "Error: in_use" instead of resolving`                         |
| `names the code it does not know rather than rendering nothing`                     | the `default` arm of `directoryRefusalSentence` replaced by `return ''`     | `1 failed \| 20 passed`, `→ expected '' to contain 'http_502'`                                             |
| `answers the taken refusal with the name that survived, not the one that was typed` | `survivingName` taken from the request body instead of be-01's `name`       | `1 failed \| 20 passed`, `→ expected { ok: false, reason: 'taken', …(1) } to deeply equal { … }`           |

### §3 — the page, its panels, and renaming

| Check                                                                      | Fault injected                                                                                      | Observed                                                                                      |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `opens no subscription of its own, on mount or after`                      | `subscribeToProject({ token, projectId: 'x', sinceSeq: -1, … })` added to the page's arrival effect | `1 failed \| 24 passed`, `→ expected "spy" to be called +0 times, but got 2 times`            |
| `sends nothing when the name is whitespace alone, and says so`             | the `clean === ''` guard removed from `commitRename`                                                | `1 failed \| 24 passed`, `→ Unable to find role="alert"`, `patchPerson` called `{ name: '' }` |
| `when the window is focused again, and when the tab becomes visible again` | the `focus` and `visibilitychange` listeners removed from the page's second effect                  | `1 failed \| 24 passed`, `→ expected 1 to be 2` — the read count stuck at the arrival read    |

### §4 — memberships as chips

| Check                                                                    | Fault injected                                                          | Observed                                                                                                                             |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `are chips beside a picker offering only what they lack` (+ its sibling) | `entries={teams.filter(…)}` replaced by `entries={teams}`               | `2 failed \| 23 passed`, `→ expected [ 'Platform', 'Payments', 'Design' ] to deeply equal [ 'Design' ]`, and the duplicate then sent |
| `are not drawn until be-01 has answered` (+ the refusal case)            | `setMemberships` given an optimistic `setPeople` ahead of `patchPerson` | `2 failed \| 24 passed`, `→ expected <button …> to be null` — the chip on screen with be-01 silent                                   |

### §5 — the removal, and the usage in front of it

| Check                                      | Fault injected                                | Observed                                                                                                                                         |
| ------------------------------------------ | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| six cases in `removing from the directory` | `askToRemove`'s two `false`s pinned to `true` | `6 failed \| 20 passed`: five on `→ Unable to find role="dialog"` and one on `→ expected [ [ 't2', true ] ] to deeply equal [ [ 't2', false ] ]` |

### §6 — the header, and the row it stays inside

| Check                                                                  | Fault injected                                                                         | Observed                                                                        |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `header.spec.ts` › `keeps the header to one row at every laptop width` | FAULT W, re-run with the navigation on the bar: three ~200px `shrink-0` controls added | fails at **1024**, `"past": 38` against `"past": 0` — the matrix can still fail |

### §7 — the phone

| Check                                                                                  | Fault injected                                   | Observed                                                                                             |
| -------------------------------------------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `directory.spec.ts` › `gives every control it offers at least 44px in both dimensions` | `min-h-11 min-w-11` struck from the chip's class | `1 failed`, `Error: Remove Platform … from Kat … is 24px tall`, `Received: 24` — Chromium at 390×844 |

### §8.2 — the packaged deep link

| Check                                         | Fault injected                                                                          | Observed                                                                                                                                                                                                                                                   |
| --------------------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| both tests in `e2e-packaged/packaged.spec.ts` | FAULT T: `try_files {path} /index.html` deleted from `apps/fe-01/Caddyfile` for one run | `2 failed`. `answers the application rather than a not-found page` on `Error: the static server has no fallback for a client route`, `Expected: 200 / Received: 404`; `draws the directory on a reload of /directory` on `Unable to find heading "People"` |

The container mounts `apps/fe-01/Caddyfile` read-only at `/etc/caddy/Caddyfile` and
`dist/apps/fe-01` at `/srv/www` — the two paths `apps/fe-01/Dockerfile` copies to, so the file
under test is the shipped one rather than a transcription. Restored, the same two tests are
`2 passed (2.3s)`. The vite-served suite is green **through** this fault, which is the whole
reason the slice exists.
