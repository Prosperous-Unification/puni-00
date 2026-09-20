# K3: dnd-kit vs @hello-pangea/dnd, run to ground

Research work item K3 from
`docs/superpowers/plans/2026-09-20-wbs-backlog-md-kanban-research.md`. The desk
note at `docs/wbs/research/2026-09-20-kanban-components-and-hosted-boards.md`
shortlisted `@dnd-kit/core`+`@dnd-kit/sortable` (with a Kibo-UI-style vendored
block) and `@hello-pangea/dnd` for E3/E4. This note is those experiments run
for real, not desk research. Everything below is either something I ran and
observed, or marked as not tested. Run on 2026-09-20 in a throwaway Vite project outside the Nx workspace; the
sources are kept beside the planning files, not in this repository. The planner
reran the four browser tests afterwards: 4 passed.

## Setup (facts)

Matched `apps/wbs/fe-01`'s stack exactly, read from this repository's root
`package.json`: `react@19.2.8`, `react-dom@19.2.8`, `vite@8.2.2`,
`@vitejs/plugin-react@6.1.1`, `tailwindcss@4.3.3`, `@tailwindcss/vite@4.3.3`,
`@playwright/test@1.63.0`. `@types/react@19.2.18`/`@types/react-dom@19.2.7`
also matched the root pins (`19.2.8` doesn't exist for the types packages).
All installs used `bun add --exact`; no npm/pnpm/yarn/npx.

Candidates installed at the desk note's pinned versions:
`@dnd-kit/core@6.3.1`, `@dnd-kit/sortable@10.0.0`, `@dnd-kit/utilities@3.2.2`,
`@hello-pangea/dnd@18.0.1`. `bun add --exact` resolved all four against React
19.2.8 with no peer warnings. Read from each installed `package.json`:
`@dnd-kit/*` peers are `react: ">=16.8.0"` (unbounded), licence MIT (confirmed
from the installed `LICENSE`, copyright Claudéric Demers). `@hello-pangea/dnd`
peer is `react: "^18.0.0 || ^19.0.0"` (explicit), licence Apache-2.0
(confirmed from the installed `LICENSE`). Matches the desk note.
`~/.cache/ms-playwright` already had `chromium-1140`/`chromium-1243`
installed, so E4 ran through real Chromium via `bun x playwright test` — no
browser download, no jsdom/happy-dom fallback needed.
**Not a literal vendor-in of Kibo UI's source** — I did not fetch
`shadcnblocks/kibo`'s `packages/kanban/index.tsx`. I hand-wrote a comparable
multi-column dnd-kit board (`src/candidates/dndkit/Board.tsx`) in the same
spirit (a copy-in block over dnd-kit's sensors). Confirms the engine works
this way, not that Kibo UI's exact file does — a limitation.

## E3 — props-only board, 3 columns/13 cards, then 1,000 cards

Both boards (`src/candidates/{dndkit,hellopangea}/Board.tsx`) take only
`{ columns, onMove }` (`src/contract.ts`) and hold no card-placement state.
`src/App.tsx` owns `columns` in `useState`, mutates it only on accepted moves,
and refuses moves of one fixed card id (`refuse-me`) by doing nothing.
Measured with a `Profiler` `mount`-phase `actualDuration` plus wall clock,
driving `?candidate=X[&stress=1]`:

| Candidate    | 13 cards, mount | 13 cards, wall | 1,000 cards, mount | 1,000 cards, wall |
| ------------ | --------------- | -------------- | ------------------ | ----------------- |
| dnd-kit      | 12.5 ms         | 189 ms         | 82 ms              | 415 ms            |
| hello-pangea | 18.4 ms         | 208 ms         | 166.8 ms           | 824 ms            |

Both stayed usable at 1,000 cards under React 19 `StrictMode` (double-render
on): no console errors/warnings, and a keyboard move on a mid-list card still
completed and logged correctly. Neither engine ships virtualisation. dnd-kit's
own repo (discussion #1372, cited in the desk note) says so and points at
`@tanstack/react-virtual`; integrating it is architecturally possible since
dnd-kit is headless, but not attempted here. `@hello-pangea/dnd` documents
"virtual list support" as a `react-window` integration pattern, not built in;
also not attempted. Neither blocked at 1,000 cards, but nothing here windowed
the DOM.

## E4 — keyboard-only move + aria-live, Playwright/Chromium

`tests/e4.spec.ts`. Interaction: `.focus()` on a card (no pointer event),
`Space` (lift), `ArrowRight` (cross-column), `Space` (drop), 150ms waits
between presses (needed — without them the first run raced the library's
scheduler and failed spuriously).
`@dnd-kit/sortable`'s shipped `sortableKeyboardCoordinates` only reasons about
one `SortableContext`. Cross-column keyboard movement needed a hand-written
`coordinateGetter` (~35 lines) filtering droppables by arrow direction and
picking the closest — not something `@dnd-kit/core`/`sortable` provide out of
the box. `@hello-pangea/dnd` needed no extra code: `ArrowRight` crossed
columns and announced immediately, built in.

Both passed `expect(log).toContainText(/moved todo-1 todo->doing@\d/)`, the
card rendered in the target column, and an aria-live element carried real
text — dnd-kit's `[id^="DndLiveRegion"]`: `Card "todo card 1" moved to column
"Doing".` (custom `Announcements` I wrote); hello-pangea's
`[id^="rfd-announcement-"]`: `You have moved the item from position 3 in list
todo to list doing in position 3.` (built in, no code).
Refusal path: same sequence on `refuse-me`, both candidates: `log` shows
`refused refuse-me todo->doing@0`, card stays in `column-todo`, never appears
in `column-doing` — the parent never changed `columns`, so the next render
put it back with no special-case code.

## Fault injections (R5), each restored and re-verified green after

| #   | Candidate    | Fault                                       | How                                                     | Observed failure                                                                                        |
| --- | ------------ | ------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 1   | dnd-kit      | keyboard sensor                             | commented out `useSensor(KeyboardSensor, …)`            | `log` stayed `[]`, 5s timeout — no lift                                                                 |
| 2   | dnd-kit      | custom announcements                        | commented out `accessibility={{ announcements }}`       | move succeeded, but live text was dnd-kit's generic default, not `"moved to column"` — assertion failed |
| 3   | hello-pangea | keyboard (and pointer — no separate switch) | `isDragDisabled={true}` on `Draggable`                  | `log` stayed `[]`, 5s timeout                                                                           |
| 4   | hello-pangea | live-region text                            | `MutationObserver` clearing `[id^="rfd-announcement-"]` | move succeeded, `liveText` was `""` — assertion failed                                                  |

Fault 3 is a real architectural difference: dnd-kit's sensors are
independently composable (removed only `KeyboardSensor`, kept
`PointerSensor`); hello-pangea's `isDragDisabled` kills pointer and keyboard
together — no keyboard-only switch. Diffed every restored file against a
pre-fault backup (clean) and reran the full suite (4/4 green) before treating
the note as final.

## Bundle size, LOC, dependencies (vite build, gzip)

Isolated per-candidate bundles (each mounting only one board plus one dummy
card) against a React-only baseline, `vite build` (production):

| Build                              | JS gzip  | Delta                    |
| ---------------------------------- | -------- | ------------------------ |
| baseline (React 19.2.8 + ReactDOM) | 59,151 B | —                        |
| + dnd-kit board                    | 75,256 B | **+16,105 B (~15.7 KB)** |
| + hello-pangea board               | 88,212 B | **+29,061 B (~28.4 KB)** |

Close to the desk note's registry figures (dnd-kit core ~14.2 kB, hello-pangea
~28.8 kB), now measured through this exact toolchain.

|              | Vendored LOC | npm packages added                                | Notable transitive deps                                               |
| ------------ | ------------ | ------------------------------------------------- | --------------------------------------------------------------------- |
| dnd-kit      | 211          | 3 direct + `@dnd-kit/accessibility` + `tslib` = 5 | none (no state library)                                               |
| hello-pangea | 60           | 1 direct                                          | `redux`, `react-redux`, `css-box-model`, `raf-schd`, `@babel/runtime` |

hello-pangea's component is far shorter to drive (wraps your markup), but
pulls in Redux internally for its own transient drag state — invisible from
outside, but real weight and part of why its bundle delta is larger.

## What was NOT tested

E1/E2/E5/E6/E7/E8 (Backlog.md itself) — out of scope for K3. Kibo UI's actual
vendored source file (see limitation above). Pointer/touch dragging, only
keyboard, per E4's scope. Any browser besides Chromium; no real screen
reader, only DOM presence and text of the aria-live element. Virtualisation
at 1,000 cards — neither ships it; only researched, not built. Tailwind
4/React 19 `StrictMode` conflicts: none observed, but incidental, not an
adversarial test. Within-column keyboard reordering for dnd-kit (only
cross-column `ArrowLeft`/`ArrowRight` was built; `ArrowUp`/`ArrowDown`
unimplemented).

## Recommendation (judgement, not a finding)

Matches the desk note's provisional call: **dnd-kit**, with a hand-rolled
Kibo-UI-style board. Smaller (~15.7 KB vs ~28.4 KB gzip added), no
state-management dependency, and independently composable sensors — what made
fault-injecting only the keyboard path possible, which matters for an
R5-style, provably-breakable check on the real board later. The cost is real:
cross-column keyboard support needed ~35 lines of hand-written coordinate math
not covered by dnd-kit's docs. `@hello-pangea/dnd` is the safer bet if the
team wants keyboard/screen-reader behaviour with zero extra code and accepts
wrapping markup plus an unwanted Redux dependency. Given Dany's stated
preference — "i just don't want to build the view myself" — dnd-kit still
means building more of the interaction layer than hello-pangea does; that
tradeoff, not the numbers above, is the real decision point for K8.
