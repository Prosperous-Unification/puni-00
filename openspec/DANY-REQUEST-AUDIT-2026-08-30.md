# What Dany asked for, and what is actually on `main` — 2026-08-30

Written because four items were reported as "queued" while their code was not on
`main`, and two of them had never been started. This is the helicopter view he
asked for: **every sub-item of the original request, checked against the code
rather than against a `tasks.md` tick.**

The original request is reproduced verbatim at the bottom so a later reader does
not have to trust this summary's paraphrase.

## The table

Checked by grepping `main` for the shipped symbol, not by reading a change's
tasks. "Change" names the OpenSpec change that owns it.

| #   | Ask                                                  | On `main`? | Change                                          |
| --- | ---------------------------------------------------- | ---------- | ----------------------------------------------- |
| 1.1 | Hover tooltip right of the project dropdown          | **NO**     | `project-dropdown-details` (1 task left)        |
| 1.2 | Selecting a project must not arm a rename            | **YES**    | `project-picker-flow` (archived)                |
| 1.3 | Creating a project arms the rename                   | **YES**    | `project-picker-flow` (archived)                |
| 2   | Rename Phases → Steps                                | **NO**     | `steps-not-phases` (15 open, unstarted)         |
| 3   | One project-config modal (Teams/Priorities/Steps)    | **NO**     | `project-config-modal` (11 open, unstarted)     |
| 4.1 | `Freeze #` — one button for freeze/unfreeze          | **YES**    | `plan-toolbar-controls`                         |
| 4.2 | Expand/collapse all as icons                         | **YES**    | `plan-toolbar-controls`                         |
| 4.3 | Keyboard glyph unreadable on macOS                   | **YES**    | `plan-toolbar-controls`                         |
| 5   | Priority Medium by default, Medium grey, Lowest blue | **YES**    | `priority-default-medium`, `priority-bands`     |
| 6   | Teams cell behaves like the Depends-on cell          | **YES**    | `unified-reference-cell-ux`, `deps-single-line` |
| 7.1 | Gantt deps from **all** steps, not the first         | **NO**     | `dep-reach-whole-item` (14 open)                |
| 7.2 | Unestimated steps assume 2 days for ordering         | **NO**     | `assumed-duration-schedules` (9 open)           |

**Shipped: 7 of 12. Outstanding: 5 — 1.1, 2, 3, 7.1, 7.2.**

## The five that are not done, in the order they should be done

### 1. `assumed-duration-schedules` — ask 7.2

A branch exists (`feat/assumed-duration-schedules`, 1 commit, 29 files) and a
trial merge into `main` was clean with `1404 pass / 0 fail` on be-01 and
`libs/`. It was **not** merged only because its `tsc` run surfaced four
`TS4111` index-signature errors in `apps/be-01/src/testing/assumed-duration-oracle.ts`
(`.id` must be `['id']`). That is a mechanical fix.

**Do first**: it is the closest to done of the five, and it is the one Dany named
twice.

### 2. `dep-reach-whole-item` — ask 7.1

A branch exists (`feat/dep-reach-whole-item`, 1 commit, 50 files), untested here.
It supersedes `dep-waits-on-first-role`, which is archived and implements the
behaviour Dany is asking to change.

**Touches the scheduler**, as does 7.2 — the two must not be worked in parallel
by different agents without one of them rebasing onto the other. Dany's own
framing puts 7.1 before 7.2 in the sentence but 7.2 is nearer the finish line;
either order works provided the second rebases.

### 3. `steps-not-phases` — ask 2

Fifteen open tasks and a `wip(steps-not-phases): unverified snapshot` commit
carrying **180 files**. The snapshot exists because its agent was killed by the
account rate limit mid-change; nothing in it has been verified.

**`steps-schema-rename` (8 open tasks) is the second half** and is blocked on
this one. `project-config-modal` wants the rename done first so its section is
named once rather than renamed twice.

**Warning for whoever resumes it**: a 180-file rename will collide with the
migration ledgers, the `openapi.json` freshness test, and the identity corpora.
See "Traps" below.

### 4. `project-config-modal` — ask 3

Eleven open tasks, never started, blocked on `steps-not-phases` by its own
section 0.

### 5. `project-dropdown-details` — ask 1.1

One open task. Worth checking whether that last task is the hover card itself or
a deploy-and-look item, because the rest of the change is done (13 ticked).

## Traps that cost this session hours

Every one of these was discovered the hard way. They are not hypothetical.

1. **A new migration breaks ~30 tests across four pinned ledgers** —
   `migrate.test.ts`, `migrate-down.test.ts`, `identity-migration.test.ts`,
   `project.test.ts`. Half the lists are ascending (the applied ledger) and half
   are descending (a `rollbackTo` result), so one blanket fix is right in half of
   them and wrong in the other half. `rollbackTo` **performs** the rollback
   rather than describing it, so each assertion in a chain starts from what the
   previous one left. The migration count in `identity-migration.test.ts` is a
   pinned integer.

2. **`apps/be-01/openapi.json` is committed and has a freshness test.** Any new
   route or plan-command kind fails it. Regenerate with
   `bun apps/be-01/src/openapi/emit-openapi-cli.ts` — the test names the command
   in its own failure message.

3. **`mcp-01` pins the tool count and the command-kind count** against that
   document, so a new be-01 route must be _decided about_ rather than silently
   offered. Both counts are pinned integers in `openapi-tools.test.ts`.

4. **Two production guards throw on an unlabelled column** — the Columns
   control's label map and `column-hints.ts`. A new table column fails ~1200
   tests until it has both. Each names the fix in its message.

5. **A whole-workspace run is not the sum of per-project runs.** Seven
   import-sort errors reached `main` green in every per-project run, because they
   were inserted by regex rather than by editing the import block. Now a
   landmine in `LLM_README.md`.

6. **A killed e2e run leaves its shifted servers holding the ports.** Clear with
   `for p in <be> <gw> <fe>; do kill $(lsof -ti :$p); done` before re-running.
   `E2E_PORT_SHIFT` now refuses a shift that lands one tier on another's port —
   1100 is invalid (3100+1100 = 4200).

7. **`jsdom` lays nothing out.** Every claim about height, docking, clipping or
   overlap needs Chromium. Four faults this session were invisible to 1882
   passing jsdom tests.

## The original request, verbatim

> Also more improvements: (1) list of projects selector: 1.1 i want the on-hover
> tooltip to expand to the right of the dropdown - revealing more inf about the
> project, but not obstructing the projects list view 1.2. i want selecting a
> project to not automatically put into editing name mode 1.3. i want creating a
> new project to put automatically a cursor into editing mode (2) Rename Phases
> to Steps (3) configs: i want to hide project config under single buttong that
> will open a modal and will allow to work in this modal 3.1 Capacity planning
> (Teams), Priorities and Steps must each go to the project config modal under
> one button (4) better header - 4.1. Freeze numbering & unfreeze all - put them
> under same button; idk call it "freeze #"; 4.2. expand all collapse all - make
> symbols for these buttons, calling them full name just takes up space; 4.3. the
> keyboard symbol on the button does not read well on MacOs, need to change it;
> (5) I want each item to receive priority Medium by default; For this i wnt to
> change the coloring scheme - make Medium grey color (same as Lowest now) so
> that it does not stand out this much; Lowest - change to non-threatening tint
> of blue; (6) UI or teams cell is fucked up now, fix it; it must work exactly
> like deps on cell; it does not need to expand the row vertically like it does
> now; (7) gantt behavioral change: 7.1. I want for gantt chartt to chart
> dependencies based on all steps executed, not only the first one; (later i'll
> want to add nuance to deps where item can depend on certain steps of another
> item, but this is for later) 7.2. By default i want gantt chart to render as if
> each step in each items is estimated with 2 days - so that even for unestimated
> item; they still must render as unestimated dotted outline items, but they must
> assume order as if they are estimated with 2 days;

## Separately reported, and fixed

- **The Gantt panel floated above half a screen of dead space** — "i need the
  whole gantt panel to go down", 2026-08-30. Fixed on `main` (`eb8968d`) with
  `GANTT_DOCK_SLACK`, two browser tests watched failing without it.
