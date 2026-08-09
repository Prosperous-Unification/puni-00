<!--
Ordered TDD slices. There is no separate plan.md in this schema — this file
absorbed it.

A slice is a coherent unit of behavior with a test that proves it, not a
two-minute keystroke. "Add a failing test for X, then make it pass" is ONE
slice.

Any slice that adds a safety check must also name the negative test proving the
check fails when the guarded thing is broken. See AGENTS.md, "Non-vacuous
checks". A check with no negative test is not done.

Only `- [ ]` checkboxes are tracked by the apply phase.
-->

## 1. The router, and the gate that stays above it

- [x] 1.1 `@tanstack/react-router` added; `app-router.tsx` builds the tree in
      code — a root route drawing an outlet alone, `/` → `ProjectPage`,
      `/directory` → the new page — and `app.tsx`'s signed-in branch mounts
      it, handing `token`, `presence` and `account` down as router context
      rather than as props threaded through routes. **The header contract is
      picked here, not left to whoever writes 6.1: each route renders
      `AppHeader` itself**; the account, the presence slot and the two-page
      navigation come from router context; the project picker, its rename and
      its list stay in `ProjectPage` and are hoisted nowhere — test:
      `app-router.test.tsx` on a memory history: `/` draws the project,
      `/directory` draws the directory, and a re-entry at `/directory` draws
      the directory rather than the project
- [x] 1.2 The auth gate stays where it is: no session draws `AuthForm` at
      every address, and the address asked for is the one drawn once
      `onSignedIn` fires — test: `app.test.tsx` entered at `/directory` with
      no stored session, asserting the form first and the directory after;
      negative: the router hoisted above the gate — `/directory` draws the
      directory to a signed-out visitor, watched failing, then restored;
      `Proof:` comment names the hoist

## 2. The directory client, and the sentences its refusals get

- [x] 2.1 `DirectoryApi` in `lib/wbs-api.ts` — `listPeople`, `listTeams`,
      `addPerson`, `addTeam` behind it plus `patchPerson`, `renameTeam`,
      `removePerson`, `removeTeam`; `httpProjectApi`'s four directory methods
      delegate to it, so each call has one spelling. Removal models the
      `directory-crud` refusal as an **answer** carrying the directory usage,
      the way `removeRole` models `in_use`, because the usage is the whole
      value of that refusal and `send` throws the code alone (`wbs-api.ts`'s
      `send` keeps `error` and drops every field beside it). The parse asks
      for the whole shape — `usage.projects` and `usage.members` both there,
      each work item with `number`, `name` and `effects` — test:
      `wbs-api.test.ts`: request shape per method, the usage answer parsed
      whole incl. an `assumed_assignee_changed` with `assumedAfter: null`,
      and the cascade call's query; negative: a 409 reading `in_use` with no
      `usage`, and one whose `usage` has no `members`, **throw** rather than
      resolving into a confirmation of nothing — watched failing with the
      shape check dropped, then restored, the way `removeRoleAt`'s
      `inUse !== undefined` half already is
- [x] 2.2 The PATCH answer is structured, not a thrown code: `patchPerson`
      and `renameTeam` return `{ ok: true, … }` or
      `{ ok: false, reason: 'taken', survivingName }` — `send` would throw
      `taken` and lose the surviving name the sentence is made of. Then
      `directoryRefusalSentence` beside `roleRefusalSentence` — one sentence
      per refusal be-01 answers with, `taken` built **from that object's
      `survivingName`** rather than from what was typed, plus `unknown_team`,
      `not_found` and the empty patch, and a fallback that names a code it
      does not know instead of rendering nothing — test: `wbs-api.test.ts`,
      one per refusal, and a trimmed collision — `Kat` typed with a space
      either side against a held `Kat` answers `survivingName: 'Kat'` and the
      sentence reads `Kat`, so a sentence built from the local draft (which
      still holds the untrimmed name) cannot pass this vacuously;
      negative: the fallback deleted — an unknown code renders an empty
      toast, watched failing, then restored

## 3. The page, its panels, and renaming on them

- [x] 3.1 `components/directory/directory-page.tsx` — People and Teams
      panels on `Card`: a person with the teams they belong to, a team with
      its member count, the creation both panels already had, and an
      empty-panel sentence that still offers to add — test:
      `directory-page.test.tsx` against a fake `DirectoryApi`: both
      populated panels, both empty ones, **and the no-socket claim made
      observable**: the page is given a spy gateway/presence context and
      `subscribe` is asserted called **0 times** across mount and a rerender
      — the scenario is vacuous otherwise, since a page that never had a
      socket passes "holds no subscription" by doing nothing; negative: a
      `subscribeToProject` call added to the page's mount effect, watched
      failing that count, then restored
- [x] 3.2 Rename in place on both panels, whitespace refused on the page
      before anything is sent, `taken` rendered as its sentence with the old
      name still on screen — test: `directory-page.test.tsx` rename cases;
      negative: the whitespace guard removed — the blank name reaches the
      fake client, watched failing, then restored
- [x] 3.3 The page re-reads on arrival, after each of its own writes, **and
      when the window is focused or the tab becomes visible again** — plan v2
      asked for navigation and focus, and arrival alone leaves a page that
      sat open all afternoon showing the morning's directory — test:
      `directory-page.test.tsx`: a `focus` and a `visibilitychange` each
      followed by a fresh `listPeople` / `listTeams`, and the read count
      asserted so a re-read on every render cannot pass as one on focus;
      negative: the focus listener removed — the count stays at the arrival
      read and the stale name is still on the panel, watched failing, then
      restored

## 4. Memberships as chips and a picker of what is missing

- [x] 4.1 One removable chip per team beside `CreatablePicker` used as what
      it is — single-select, `value` held at `null`, each choose adding one
      membership — and its `entries` are the teams **minus** those the person
      holds; a choose or a chip removal sends exactly the set the chips show,
      through `patchPerson` — test: `directory-page.test.tsx` add, remove,
      and the exact `teamIds` sent; negative: the minus-those-held filter
      deleted — a team already chipped is offered and a duplicate is sent,
      watched failing, then restored
- [x] 4.2 On-response, not optimistic (the `run()` rule): the chips redraw
      from what be-01 answered, and a refused patch leaves them as they were
      with the sentence on screen — test: `directory-page.test.tsx` with the
      fake refusing `unknown_team`; negative: the redraw moved ahead of the
      answer — the refused team stays chipped, watched failing, then restored
- [x] 4.3 The keyboard: chips are reachable, Delete and Backspace remove the
      focused one, focus lands on the neighbour it left, and the picker keeps
      its combobox contract — test: `directory-page.test.tsx` keyboard cases

## 5. Removal, with the directory usage in front of it

- [x] 5.1 The first removal carries no cascade; the usage answer opens a
      `Modal` built from the payload's own named properties — each project by
      `name`, each work item by `number` and `name`, each effect by its
      `kind`, `members` listed as the people who lose a membership, and an
      `assumedAfter` of `null` drawn as the word `unassigned` — scrolling
      inside itself when the list is long; the confirm is the only thing that
      sends cascade; closing drops the confirmation rather than remembering
      it — test: `directory-page.test.tsx`, seven cases incl. the re-ask
      after a close, a team whose usage names members and no project, and the
      flip to `unassigned` read off the screen; negative: the confirmation
      opened with cascade pinned on — the first request removes without
      asking, watched failing, then restored (the fault `phases-dialog`
      already knows)
- [x] 5.2 An entry nothing points at is removed by the first request, with
      no confirmation drawn — test: `directory-page.test.tsx` against a fake
      answering removed

## 6. The header, and the row it has to stay inside

- [x] 6.1 `AppHeader` gains a nav slot carrying the two pages; the current
      one is marked `aria-current="page"`; the project picker and rename are
      absent on `/directory` rather than drawn dead — test:
      `project-page.test.tsx` (project route) and `directory-page.test.tsx`
      (directory route) asserting the mark and the absence
- [x] 6.2 `e2e/header.spec.ts` re-runs with the new control: the one-row
      matrix at 1280, 1024 and 900 stays `rowsDeep: 1, past: 0`, and the
      four-things test becomes a five-things one — test: the header suite,
      whole; negative: the file's own FAULT W — three ~200px
      `shrink-0` controls added — watched breaking `past` at 900, then
      restored, so the matrix is known to still be able to fail

## 7. The phone

- [x] 7.1 Panels stack in one column below 768px and share the row at and
      above it; every control the page offers measures at least 44px in both
      dimensions **as rendered** — test: `e2e/directory.spec.ts` at 390×844
      reading bounding boxes, because jsdom measures nothing and the
      fifteenth and fourteenth checks were both faults only a browser could
      see; negative: the hit-area utility dropped from the chip's remove
      button — the measured box comes back under 44, watched failing, then
      restored

## 8. The browser, and the artifact that actually ships

- [x] 8.1 `e2e/directory.spec.ts` against the real stack: the header link
      followed, the address read, the page reloaded on `/directory`, and a
      removal taken all the way through the real confirmation to the cascade
      round-trip — test: the spec, plus the whole browser suite green
      (47 today, plus these)
- [x] 8.2 **The packaged deep link.** `bunx nx run fe-01:build`, then
      `dist/apps/fe-01` served by `caddy:2-alpine` with `apps/fe-01/Caddyfile`
      — the exact file the Dockerfile copies, not a transcription — on a free
      port; `/directory` requested against it answers 200 with the app, and a
      browser reload on it draws the directory — test: `e2e/packaged.spec.ts`
      pointed at that port, run on h2puni where images build; negative:
      `try_files {path} /index.html` deleted from `apps/fe-01/Caddyfile` for
      one run — the request comes back 404 and the reload lands on Caddy's
      not-found page, watched failing, then restored. **Both runs recorded in
      `verify.md`**; the vite-served suite cannot see this fault at all,
      which is the reason this slice exists

## 9. Gate

- [x] 9.1 `bunx nx format:check --all` and
      `bunx nx run-many -t test lint typecheck build --parallel=2` and
      `openspec validate --all --json` green; `verify.md` records commands,
      results, and the failure-proof table for every negative above
- [ ] 9.2 Deploy to dev and Dany looks
