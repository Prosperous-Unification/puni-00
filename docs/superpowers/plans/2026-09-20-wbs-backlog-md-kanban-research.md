# A kanban and ticket view in the WBS, backed by Backlog.md: research plan

Status: plan for research, written 2026-09-20 at Dany's request. Nothing here is
decided. Backlog.md facts were read from primary sources on 2026-09-20 against the
`main` branch and the npm registry; every claim below is either sourced or marked
unverified.

## Intent

**Problem.** The WBS draws a tree and a Gantt chart. It has no board. A board is
how a person sees what is in flight right now, and it is the view Dany wants,
without writing a kanban from scratch. Backlog.md is already the chosen
per-client-repository planning backend (assumption A20), and it already ships a
board. So the question is not "what kanban library", it is "which part of
Backlog.md do we take, and where does the board's write go".

**Outcome.** A decision, with evidence, on one of four ways to get the view:
embed Backlog.md's own web UI, vendor its board components, use Backlog.md as
storage and render the board ourselves from an off-the-shelf drag-and-drop
engine, or adopt something else. Plus the mapping the board needs: what a column
is, what a card is, and what happens when a card is dragged.

**Non-goals.** Building the cutover to Backlog.md storage — that is already
specified and gated. Replacing the tree or the Gantt chart. Running agents from
the board; that is Twilight Dash's. Re-opening A20, A26, A27 or ADR 0027.
Changing Backlog.md itself upstream.

**Constraints.**

- The board cannot be the WBS's second write authority. Every write is one
  accepted planning commit through the broker (ADR 0027, the transaction
  protocol in `docs/twilight-structure/client-repositories.md`).
- `docs/twilight-structure/client-repositories.md` already says the plan "does
  not expose the upstream unauthenticated Backlog browser server". Option (a)
  therefore has to overturn a written decision, not merely be cheaper.
- Rule F3 of `docs/superpowers/specs/2026-09-19-code-organization-design.md`:
  features import UI only from the application's own primitives layer, and only
  that layer imports a vendor UI library. A vendored board is a primitive.
- Rule F1: a service file never imports React. The board's data shaping is a
  feature-service in plain TypeScript.
- **Status in the WBS is derived and never stored.** `CONTEXT.md` defines Status
  as folded from steps' Progress on every read. A kanban column is a status, and
  a drag is a status write. Today there is nothing to write to. This is the
  central obstacle and it is not a Backlog.md problem.
- Before Backlog cutover the board has no Backlog.md to read; it would read
  SQLite. The research must say whether the board waits for cutover or ships
  against today's store first.

## What this repository already decided

Do not re-open these. Paths are relative to the repository root.

| Decision                                                                                                                                                                                              | Where                                                                                     |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| WBS is the planning interface; per-client-repository Backlog.md replaces SQLite as the planning backend after the WBS refactors land. Runtime execution scheduling stays Twilight Dash's.             | `docs/twilight-structure/assumptions.md` A20, confidence 85                               |
| A plan edit is published as an immutable Git tree on a planning ref, advanced by one authorized broker with compare-and-swap. The commit is the transaction boundary.                                 | `docs/adr/0027-planning-commits-are-the-transaction-boundary.md`, A26                     |
| Ordinary multi-file writes with Backlog's own per-task locks and watchers were rejected: a crash between writes exposes half a plan, and a lock in one checkout says nothing elsewhere.               | ADR 0027, "Rejected: ordinary multi-file writes with locks and watchers"                  |
| Native Backlog CLI, MCP and web edits are a candidate view and must import through the broker. "WBS is the hosted UI; this plan does not expose the upstream unauthenticated Backlog browser server." | `docs/twilight-structure/client-repositories.md`, proposed transaction protocol           |
| Native task fields stay native; WBS hierarchy, frozen numbering, per-step triples, measures, calendars and capacity live in versioned extension files under `<planning.backlogDir>/wbs/`.             | `docs/twilight-structure/client-repositories.md`, storage ownership                       |
| Backlog's serializer does not spread unknown front matter through a write, so an ad hoc `wbs:` YAML field is not an extension contract — a native edit can erase it.                                  | `docs/twilight-structure/research/backlog-patterns.md`                                    |
| A bare Backlog numeric ID is not durable identity; a stable UUID map scoped to the repository survives archive, renumber and restoration.                                                             | `docs/twilight-structure/client-repositories.md`, `backlog-patterns.md`                   |
| After cutover the accepted Backlog/WBS revision owns tasks; OpenSpec `tasks.md` becomes a regenerated export. Before the bridge it is the sole authored plan.                                         | A27, `openspec/changes/twilight-control-plane/specs/twilight/repository-planning/spec.md` |
| A predecessor whose completion receipt names an unintegrated source candidate is not available "even if a Backlog status says Done".                                                                  | `openspec/.../repository-planning/spec.md`                                                |
| Vendor UI lives only in the primitives layer (F3); services are plain TypeScript (F1); every stateful service exposes subscribe plus a stable snapshot (F2).                                          | `docs/superpowers/specs/2026-09-19-code-organization-design.md`                           |
| Frontend module shape: `contract.ts`, `*.resource.ts`, `*.feature.ts`, `composition.ts`, `view/`.                                                                                                     | `apps/wbs/fe-01/src/modules/*/README.md`                                                  |

### Where a board overlaps the sibling research

`docs/superpowers/plans/2026-09-20-wbs-agentic-planning-research.md`, written the
same day, proposes that every step of a work item gets its own status, that steps
form a graph with agent and human kinds, and that start and end become timestamps.
A kanban board needs exactly the first of those. The overlap is not incidental:

- **Columns are statuses.** The WBS has no stored status to move a card between.
  The sibling plan's outcome 3, per-step status, is what makes a card draggable.
  A board built before that decision lands either invents a second status model
  or is read-only.
- **A card is a slice, not a work item.** `CONTEXT.md` defines a Slice as one leaf
  work item's work for one step — the unit the schedule computes in. If each step
  has a status, the natural card is the slice, and a work item appears in several
  columns at once. Backlog.md has one flat status per task and no concept of a
  slice, so the mapping is lossy in that direction.
- **Swimlanes are the step order or the assignee.** Backlog.md's board already
  groups by milestone and filters by assignee, type, project and priority.
- These two research lines should share one design interview on status, because
  they will otherwise produce two status models.

## What Backlog.md is today

Read 2026-09-20. Version numbers are from the npm registry and the GitHub releases
API; source claims are from `main`, which is not the published tag, so pin a
commit before writing any adapter test.

| Fact                                                                                                                                                                                                                                                                                                                                                                                                                                      | Source                                                                                                                                                                                                   |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Latest published version `1.52.0`, published 2026-09-12. Previous releases: 1.51.0 on 2026-09-02, 1.50.1 on 2026-08-10, 1.50.0 on 2026-08-09, 1.49.x on 2026-08-02/03. 231 published versions.                                                                                                                                                                                                                                            | [npm registry](https://registry.npmjs.org/backlog.md), [releases API](https://api.github.com/repos/MrLesk/Backlog.md/releases)                                                                           |
| Licence MIT. Package `backlog.md`, executable `backlog`.                                                                                                                                                                                                                                                                                                                                                                                  | [package.json](https://raw.githubusercontent.com/MrLesk/Backlog.md/main/package.json)                                                                                                                    |
| Release cadence: roughly monthly minor releases with patch releases in between over the last three months. Unverified as a policy — inferred from the dates above, not from a stated schedule.                                                                                                                                                                                                                                            | as above                                                                                                                                                                                                 |
| The published package ships only `scripts/*.cjs`, `README.md` and `LICENSE`. There is no `exports` map for source and no component entry point.                                                                                                                                                                                                                                                                                           | [package.json](https://raw.githubusercontent.com/MrLesk/Backlog.md/main/package.json) `files` field                                                                                                      |
| The web UI is React 19.2.7 with React DOM 19.2.7 and TailwindCSS 4.3.2, plus `@uiw/react-md-editor` and `@uiw/react-markdown-preview`.                                                                                                                                                                                                                                                                                                    | package.json dependencies                                                                                                                                                                                |
| No drag-and-drop library is a dependency. `Board.tsx` uses native HTML5 drag events (`onDragStart` and friends) and is 967 lines.                                                                                                                                                                                                                                                                                                         | [Board.tsx](https://raw.githubusercontent.com/MrLesk/Backlog.md/main/src/web/components/Board.tsx)                                                                                                       |
| The browser server binds `127.0.0.1` as a constant and the CLI reference states: "The Web UI listens only on `127.0.0.1`; it is not reachable from other devices on the LAN or VPN."                                                                                                                                                                                                                                                      | [src/server/index.ts](https://raw.githubusercontent.com/MrLesk/Backlog.md/main/src/server/index.ts), [CLI-INSTRUCTIONS.md](https://raw.githubusercontent.com/MrLesk/Backlog.md/main/CLI-INSTRUCTIONS.md) |
| The web client's API base is the hard-coded string `"/api"`. There is no base-path option in the client or the CLI.                                                                                                                                                                                                                                                                                                                       | [src/web/lib/api.ts](https://raw.githubusercontent.com/MrLesk/Backlog.md/main/src/web/lib/api.ts)                                                                                                        |
| `backlog browser` flags are `--port` and `--no-open`. Default port 6420, configurable as `defaultPort`. There is no `--host`, no auth flag and no multi-project flag.                                                                                                                                                                                                                                                                     | README, CLI-INSTRUCTIONS.md, ADVANCED-CONFIG.md                                                                                                                                                          |
| No authentication, authorization, CSRF or CORS check was found in the server file. This is consistent with the prior 2026-09-06 reading.                                                                                                                                                                                                                                                                                                  | src/server/index.ts, `docs/twilight-structure/research/backlog-patterns.md`                                                                                                                              |
| HTTP routes exist for tasks, single task, complete, demote, statuses, config, docs, decisions, drafts, milestones (incl. archive), reorder, move, cleanup, duplicates, version, statistics, status, init, search.                                                                                                                                                                                                                         | src/server/index.ts route table                                                                                                                                                                          |
| The server upgrades `websocket` requests and pushes refresh notifications to connected sockets.                                                                                                                                                                                                                                                                                                                                           | src/server/index.ts                                                                                                                                                                                      |
| The MCP server is stdio only. Its own log line reads "MCP server initialised (stdio transport only)."                                                                                                                                                                                                                                                                                                                                     | [src/mcp/server.ts](https://raw.githubusercontent.com/MrLesk/Backlog.md/main/src/mcp/server.ts)                                                                                                          |
| `--json` is offered on `task list`, `task view`, the `task <id>` shorthand and `search`, described as "stable, versioned JSON". `task list --json --watch` streams full replacements.                                                                                                                                                                                                                                                     | README                                                                                                                                                                                                   |
| Configuration keys include `statuses` (board columns, default `To Do, In Progress, Done`), `defaultStatus`, `priorities` (default `High, Medium, Low`), `projects`, `definition_of_done`, `defaultPort`, `autoOpenBrowser`, `remoteOperations` (default true), `autoCommit` (default **false**), `bypassGitHooks` (false), `zeroPaddedIds`, `checkActiveBranches` (true), `activeBranchDays` (30), `onStatusChange`, `backlog_directory`. | [ADVANCED-CONFIG.md](https://raw.githubusercontent.com/MrLesk/Backlog.md/main/ADVANCED-CONFIG.md)                                                                                                        |
| `TaskStatus` is `string`. Statuses are free text validated against the configured list, so custom columns are supported.                                                                                                                                                                                                                                                                                                                  | [src/types/index.ts](https://raw.githubusercontent.com/MrLesk/Backlog.md/main/src/types/index.ts)                                                                                                        |
| The `Task` type carries: id, title, status, assignee[], reporter, createdDate, updatedDate, dueDate, labels[], milestone, dependencies[], references[], documentation[], modifiedFiles[], description, implementationPlan, implementationNotes, comments[], finalSummary, acceptanceCriteriaItems[], definitionOfDoneItems[], parentTaskId, subtasks[], priority, type, project, branch, ordinal, source, onStatusChange.                 | src/types/index.ts                                                                                                                                                                                       |
| A task's `source` is `local`, `remote`, `completed` or `local-branch`, and `isLocalEditableTask` refuses to edit remote and other-branch tasks. Cross-branch task state is a read-time merge, not a write.                                                                                                                                                                                                                                | src/types/index.ts                                                                                                                                                                                       |
| Graph visibility: the CLI, TUI and MCP resolve against the current checkout plus completed tasks; the browser uses "the configured cross-branch corpus". Archiving removes an ID from all of them.                                                                                                                                                                                                                                        | CLI-INSTRUCTIONS.md                                                                                                                                                                                      |
| Entities are tasks, drafts, documents and decisions, plus milestones, with separate `completed/` and `archive/` locations.                                                                                                                                                                                                                                                                                                                | src/types/index.ts `EntityType`, `backlog-patterns.md` directory constants                                                                                                                               |
| Concurrency: `proper-lockfile`, creation locks under the Git common directory, per-task locks that fail immediately on contention, `saveTask` ending in `Bun.write`. No multi-file commit protocol.                                                                                                                                                                                                                                       | `docs/twilight-structure/research/backlog-patterns.md` (source-inspected 2026-09-06)                                                                                                                     |

**No documented embedding story was found.** There is no iframe guidance, no base
path, no reverse-proxy note, no auth hook and no published component package. The
one hosting document the CLI reference links is
`backlog/docs/doc-003 - Running-Backlog-Browser-as-a-Service.md`, about keeping
the local server alive on boot — which is the opposite of multi-tenant hosting.

### What could not be verified

- Binary conformance of v1.52.0. Everything above except the version and release
  dates was read from `main`, not from the published tag. Nothing was installed
  and no Backlog.md command was run.
- Whether the browser server rejects cross-origin writes in practice. Absence of a
  CORS header in the file read is not proof of runtime behaviour; a browser's
  same-origin rules may or may not be the only protection.
- Whether the WebSocket refresh channel tolerates a reverse proxy or a non-root path.
- Whether `--json` mutation output exists and is versioned. Only the read commands
  are documented as stable JSON.
- Multi-project hosting. `projects` is a per-task component label, not separate
  projects with their own directories and authorization.
- Keyboard accessibility of the upstream board. `Board.tsx` has `aria-label`
  attributes on filters, and drag uses HTML5 drag events, which are not keyboard
  operable by default; no keyboard drag path was found, but this was a read of one
  file, not a test.
- Whether upstream would accept a base-path or auth patch.

## The four options

### a. Embed Backlog.md's own web UI

Run `backlog browser` per client repository and show it in the WBS, either in an
iframe or reverse-proxied under the WBS origin.

**Evidence.** The server binds `127.0.0.1` as a constant and the documentation
states it is unreachable from other devices. The web client's API base is the
literal `"/api"`, so any mount other than the origin root breaks every call unless
the proxy rewrites both the HTML and the WebSocket upgrade. No auth exists in the
server. `--port` and `--no-open` are the only flags.

**Cost.** Small to stand up for one local repository; large to make safe. Every
missing piece — an authenticating proxy, per-repository process supervision, path
rewriting, a WebSocket-capable proxy, theme alignment, deep links from a WBS work
item to a task — is work we own and upstream will not maintain for us.

**Risks.** It contradicts a written decision: the client-repositories document
says the plan "does not expose the upstream unauthenticated Backlog browser
server". It also creates a second write path straight to the filesystem, which
ADR 0027 rejected by name: its writes never reach the broker, never become one
accepted commit, and never appear in the WBS undo journal. One process per
repository does not scale to many clients, and a shared process has no tenant
boundary at all.

**Effect on existing decisions.** Overturns ADR 0027 for anything the board
writes, or else the board must be read-only and the WBS must import whatever it
did. Both are worse than not embedding.

### b. Vendor Backlog.md's board components

**Evidence.** The MIT licence permits it. But the published package ships only
`scripts/*.cjs`, `README.md` and `LICENSE` — the React sources are not
distributed, so this is a copy out of the Git repository, not a dependency.
`Board.tsx` is 967 lines and imports `apiClient` from `../lib/api`, the lanes
helper, milestone utilities, terminal-status, priority, project and task-type
config helpers, `TaskColumn`, a loading skeleton, a cleanup modal, a label filter
dropdown and a toast. It is coupled to Backlog.md's REST client and its `Task`
type, not to a data contract.

**Cost.** Medium to fork; high to keep. A fork of a 967-line component whose
upstream ships roughly monthly means either freezing it or re-merging forever.
Its stack matches ours closely — React 19 and Tailwind 4 on both sides — so the
fork compiles, which is exactly what makes the maintenance trap easy to walk into.

**Risks.** No stability contract: nothing in the package or the docs says these
components are an API. The coupling to `apiClient` means the first task is
replacing every call site with our own resource-service, at which point what
remains is the layout and the drag handlers, which is the cheap part.

**Effect on existing decisions.** Compatible with F3 if the copy lands in the
primitives layer and the WBS's own feature-service drives it. Compatible with
ADR 0027 because the writes are ours.

### c. Backlog.md as storage and rules; our own board over a vendored drag engine

The WBS reads the accepted planning revision, renders a board from its own
primitives, and every drag becomes a WBS command that the broker publishes as one
planning commit.

**Evidence.** Backlog.md's read surfaces are the strongest part of it: stable
versioned JSON on `task list`, `task view` and `search`, a `--watch` stream, a
typed `Task` shape, configured `statuses` as the column list, and MCP tools for
agent access. The prior research already accepted the CLI and MCP as the pinned
adapter surfaces. Our frontend is already React 19.2.8, Tailwind 4.3.3, TanStack
Router and TanStack Table, with a `src/components/ui` layer that F3 designates.

**The drag engines and board blocks available today.** Surveyed 2026-09-20 from
the npm registry and the GitHub API. Licences and peer ranges are primary-source;
accessibility rows state only what each project's own documentation says.

| Candidate                                | Latest / date           | Licence    | React 19                                                 | Delivery                                 | Keyboard drag, per its own docs                                                                                                        | Maintenance                                                                |
| ---------------------------------------- | ----------------------- | ---------- | -------------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `@dnd-kit/core` + `@dnd-kit/sortable`    | 6.3.1 / 10.0.0, 2024-12 | MIT        | Peer range `>=16.8.0`, unbounded; React 19 issue closed  | npm dependency, headless                 | Documented keyboard sensor: Space or Enter to pick up, arrows to move, Escape to cancel, with ARIA roles and live-region announcements | Not archived, pushed 2026-09-12, 128 open issues                           |
| `@dnd-kit/react`                         | 0.5.0, 2026-06-11       | MIT        | Explicit peer `^18 \|\| ^19`                             | npm dependency, headless                 | Inherits the dnd-kit model; no separate accessibility documentation found                                                              | Active, same organization                                                  |
| `@atlaskit/pragmatic-drag-and-drop`      | 3.1.0, 2026-08-29       | Apache-2.0 | No React peer dependency at all; framework-agnostic core | npm dependency, headless, ~4.7 kB core   | Its guidelines recommend an action-menu pattern **instead of** arrow-key dragging; announcements come from separate packages           | Not archived, pushed 2026-09-19, 103 open issues                           |
| `@hello-pangea/dnd`                      | 18.0.1, 2025-02-09      | Apache-2.0 | Explicit peer `^18 \|\| ^19`                             | npm dependency, wraps your markup        | Built-in keyboard and screen-reader support documented                                                                                 | Not archived, pushed 2026-09-20, 143 open issues                           |
| Kibo UI `kanban` block (shadcn registry) | repo pushed 2026-05-04  | MIT        | Inherits dnd-kit's peer looseness                        | **Copy-in source**, not a dependency     | Not separately documented; inherits whatever dnd-kit wiring the block kept                                                             | Active; open SSR/hydration issue, irrelevant under F8                      |
| `react-beautiful-dnd`                    | 13.1.1, 2022-08-30      | Apache-2.0 | Marked deprecated on npm                                 | npm dependency                           | Had it historically                                                                                                                    | **Archived 2025-08-18.** Reject.                                           |
| `@asseinfo/react-kanban`                 | 2.2.0, 2021-09-22       | MIT        | Peer `^16 \|\| ^17` only                                 | opinionated styled board                 | not verified                                                                                                                           | **Archived 2022-10-08.** Reject.                                           |
| `react-trello`                           | 2.2.11, 2021-06-24      | MIT        | Peer `*`, but requires Redux and styled-components       | opinionated; owns board state internally | not verified                                                                                                                           | Last pushed 2024-08-06. Reject: internal state fights external truth.      |
| Mantine                                  | —                       | MIT        | —                                                        | —                                        | —                                                                                                                                      | Has no kanban component; its own discussions treat it as a feature request |

Unverified: community forks of `react-kanban` such as `@caldwell619/react-kanban`,
whether Tremor offers a kanban at all, and whether `@dnd-kit/react` at 0.5.0 has
its own accessibility documentation distinct from the legacy core guide.

The shortlist for E3 and E4 is dnd-kit plus the Kibo UI kanban block as a
vendorable skeleton. dnd-kit is the only pure engine whose own documentation
describes arrow-key sortable dragging rather than telling you to build an
alternative affordance, which matters because F8 makes the WBS a single-page
application where a rendered-state requirement has nowhere else to go. Kibo UI's
block is the closest thing to what the owner asked for — a board's markup, copied
in rather than depended on, which is exactly what F3 wants in the primitives layer.
Pragmatic drag-and-drop is the fallback if bundle size wins.

**Cost.** Largest of the three in raw component work, but almost all of it is
work we would do anyway: the column mapping, the slice-versus-task card decision,
the optimistic write and the conflict refusal. The drag engine itself is the small
part and is off the shelf.

**Risks.** We own the board's accessibility, its virtualization and its empty and
error states. The board is only as good as the status model beneath it, which is
the sibling research's open question.

**Effect on existing decisions.** None broken. This is the option the existing
documents already assume.

### d. Other git-backed or markdown-backed kanban, for comparison only

Worth a half-day of desk research and nothing more, because A20 already chose the
backend. The point of looking is to learn whether any of them solved hosted,
multi-repository, authenticated boards, and to borrow that shape. Candidates to
check: GitHub Projects v2 and its GraphQL API as the hosted reference, Gitea and
Forgejo issue boards, Vikunja, Focalboard (archived by Mattermost — unverified),
Huly, Plane, and the `.taskmaster` and `todo.md` conventions. None of these
replaces Backlog.md here; the deliverable is one note on what a good embedding
story looks like, so option (a)'s shortcomings are measured against something.

### Comparison

| Option                     | Build cost | Ongoing cost   | Breaks ADR 0027 | Breaks F3            | Auth story          | Fits many repositories |
| -------------------------- | ---------- | -------------- | --------------- | -------------------- | ------------------- | ---------------------- |
| a. Embed the browser UI    | Low        | High           | Yes, for writes | N/A                  | None; we build it   | No, one process each   |
| b. Vendor the board source | Medium     | High (forever) | No              | No, if in primitives | Ours                | Yes                    |
| c. Own board, vendored dnd | Medium     | Low            | No              | No                   | Ours, already built | Yes                    |
| d. Another tool            | —          | —              | —               | —                    | —                   | —                      |

### Provisional recommendation

**Option (c), with (b) reduced to reading Backlog.md's board as prior art.**

Not because (c) is cheap, but because the expensive parts of a kanban here are not
the kanban. They are: deciding what a column is when Status is derived and never
stored; deciding whether a card is a work item or a slice; and routing a drag
through the broker so it lands as one accepted planning commit. Options (a) and
(b) give us drag-and-drop, which is the part we can get from an off-the-shelf
engine in a day, and give us nothing at all for the other three, while (a)
additionally reverses a decision the repository has already written down twice.

The "do not build the view myself" instinct is right and option (c) honours it:
the drag engine and probably the card and column layout come in as vendored
primitives. What we write is the feature-service, which is plain TypeScript and is
the WBS's actual domain work.

**What would overturn this.**

- If the board is wanted read-only and urgently, for one local repository, by one
  person, then (a) is minutes of work and nothing it violates matters yet. Say so
  and it changes the answer immediately.
- If upstream ships a base path, an auth hook, a documented embedding story, or
  publishes its board as a package, (a) or (b) becomes defensible. Ask upstream:
  the question costs one issue.
- If the experiment in E3 below shows a vendored board block that renders from a
  contract without its own state, (c)'s component work shrinks far enough that the
  drag engine choice stops mattering.
- If Dany decides the board should not write at all — a read-only wall display —
  then ADR 0027 is not engaged and every option gets cheaper; (a) wins on cost.

## Research questions still open

1. Is a card a work item or a slice? `CONTEXT.md` makes a slice the schedulable
   unit, and per-step status would put one work item in several columns.
2. What are the columns before per-step status exists? Derived Status has exactly
   three values — unknown, in progress, done — and a drag cannot write it.
3. Does the board write, or is it read-only in its first version?
4. Does a drag produce one WBS command, and which one? `setStatus done` today
   writes `done` on every step of every leaf beneath an item, which is not what
   dragging one card should mean.
5. Which Backlog.md statuses map to which WBS statuses, and who owns the mapping —
   the client's `backlog.config.yml` `statuses` list, or a WBS project setting?
6. Does the board ship before or after the Backlog cutover? If before, it reads
   SQLite and the Backlog mapping is deferred; if after, it waits on a gated
   milestone.
7. Who owns a task's status when both sides can set it: the WBS command, a native
   `backlog task edit`, or an agent through MCP? The import path exists; the
   precedence rule does not.
8. What does a card show for a three-point estimate, and does dragging ever change
   one?
9. How does a dependency appear on a board? Backlog.md dependencies point from the
   waiting task to its prerequisite; a board usually shows this as a blocked badge.
10. Does the board need the cross-branch corpus the Backlog browser uses, and if so
    how does that reconcile with the accepted planning revision being a single tree?
11. Does upstream accept a base path and an auth hook? One issue answers it.
12. Which drag engine, and does it support keyboard drag? Accessibility is a
    rendered-state requirement here, not a nicety.
13. Does a vendored board block satisfy F3 by living in `src/components/ui`, or
    does F3 want a thinner primitive than a whole board?
14. What happens to a card during a 409 from the broker — does it snap back, and
    what does the person see?

## Experiments worth running

Small, throwaway, each in a scratch directory and not in the product.

| Ref | Experiment                                                                                                                                       | Pass                                                                                                             |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| E1  | Install pinned `backlog.md@1.52.0`, `backlog init` a scratch repository, create tasks with every front-matter field, run `backlog browser`.      | The board renders; the observed front matter matches the `Task` type read here. Any mismatch is recorded.        |
| E2  | Put the running browser behind a reverse proxy at `/backlog/` on another origin and open it.                                                     | Fails if any request 404s or the WebSocket does not upgrade. Expected to fail: `API_BASE` is the literal `/api`. |
| E3  | Vendor one candidate board block into a scratch Vite app on React 19.2.8 and Tailwind 4.3.3, driven only by a props contract, no internal state. | Cards render and drag from external data, and a drag emits an event without mutating anything itself.            |
| E4  | Keyboard-only drag on the same candidate: move a card between two columns with no pointer.                                                       | The card moves and an assistive technology announcement is observable. Otherwise the candidate is rejected.      |
| E5  | `backlog task list --json --watch` in the scratch repository while another process edits a task file by hand.                                    | A full replacement arrives; its shape equals the non-watch shape. Record the latency.                            |
| E6  | Write a task through `backlog task edit` and confirm whether an unknown `wbs:` front-matter key survives.                                        | Expected to fail — the serializer does not spread unknown front matter. Confirms the extension-file decision.    |
| E7  | Map a real WBS project's items and steps onto Backlog tasks and columns on paper, then back, and list every field lost in each direction.        | The lossy set is written down. If it includes estimates or slices, the card unit question is answered.           |
| E8  | Hold two concurrent status writes against the same task through the CLI while a lock is held.                                                    | One fails immediately and visibly. If both appear to succeed, the conflict story needs its own work item.        |

E2, E6 and E8 are expected to fail. A failing experiment that we predicted is the
cheapest evidence available and each one closes an option.

## Work items to schedule

Three-point estimates in days, as the plan uses today, and tokens for a top model
at high effort. K1 to K5 touch no product file and can start now. K8 and K9 need
Dany.

| Ref | Item                                                                                                    | Depends on | Days (O / R / P) | Tokens    |
| --- | ------------------------------------------------------------------------------------------------------- | ---------- | ---------------- | --------- |
| K1  | Run E1, E5, E6, E8 against pinned `backlog.md@1.52.0`; record real output                               | —          | 0.25 / 0.5 / 1   | 700,000   |
| K2  | Run E2: the browser behind a proxy on another origin; record exactly what breaks                        | K1         | 0.25 / 0.5 / 1   | 500,000   |
| K3  | Shortlist drag engines and board blocks; run E3 and E4 on the top two                                   | —          | 0.5 / 1 / 2      | 1,200,000 |
| K4  | E7: the work-item-to-task field map, both directions, with the lossy set named                          | —          | 0.5 / 1 / 1.5    | 1,000,000 |
| K5  | Desk note on option (d): how GitHub Projects, Gitea, Vikunja and Plane handle hosted embedding and auth | —          | 0.25 / 0.5 / 1   | 800,000   |
| K6  | Open one upstream issue asking about base path, auth hook and component publishing; record the answer   | K2         | 0.1 / 0.25 / 0.5 | 200,000   |
| K7  | Board data shape: is a card a work item or a slice, and what is a column before per-step status exists  | K4         | 0.5 / 1 / 2      | 1,200,000 |
| K8  | One design interview with Dany on the board, shared with the sibling plan's status interview (its R9)   | K3, K4, K7 | 0.5 / 1 / 2      | 1,500,000 |
| K9  | ADR: where board writes go, and the column ownership rule; `CONTEXT.md` terms for column, card, lane    | K8         | 0.25 / 0.5 / 1   | 800,000   |
| K10 | OpenSpec change with delta spec and ordered TDD tasks for a first read-only board                       | K9         | 0.5 / 1 / 2      | 1,500,000 |

Totals: optimistic 3.6 days, realistic 7.25, pessimistic 14. About 9.4 million
tokens. This is research and specification only; building the board is K10's
output, not in this table.

A note on honesty about size: these numbers are small because the scope is small.
Nothing here builds a board, migrates a store or hosts anything. If K7 concludes a
card is a slice, the implementation behind K10 is a different and much larger
conversation.

## Decisions this will ask of Dany

Recorded so they are not a surprise. Until answered each is carried as an
assumption with its alternative written beside it.

1. Read-only board first, or a board that writes from day one?
2. Before the Backlog cutover, reading today's SQLite, or after it?
3. Is a card a work item or a slice?
4. If option (a) is ever acceptable for local single-user use, say so — it changes
   the whole answer and costs almost nothing.
5. Who wins when the WBS and a native `backlog task edit` both set a status?
6. Is keyboard drag a requirement, or is a keyboard-accessible alternative control
   enough?
7. Should the board's status interview be merged into the sibling research plan's
   R9 rather than held separately?
