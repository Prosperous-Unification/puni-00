## Context

The scheduler (`apps/be-01/src/service/schedule.ts`) is a deterministic millisecond pass (Fast). It is immediately visible, the sole fallback, and never labelled optimal. WBS has no optimization today. Dany approved adding an optional dual-objective mode using official OR-Tools CP-SAT. Architecture section 1 (toggle, PRI+Time concurrency, exact-hash SQLite cache, one generation per project) and sections 2-4 (behaviour, failure, test design) are all approved; this design records the settled technical shape.

## Goals / Non-Goals

**Goals:**

- Compute Priority-first (PRI) and Finish-first (Time) schedules with a real constraint solver, concurrent, behind a project-wide OFF-by-default toggle.
- Keep Fast unchanged as the preview and fallback.
- Cache validated results in durable SQLite; broadcast newly stored results so collaborators converge.
- Surface a compact comparison indicator without a toast or modal.

**Non-Goals:**

- No proven optimality (best-found only).
- No daemon, port, sidecar, or outbox.
- No fix to the known capacity/floor hand-off audit finding.
- No timer retry; no per-user objective.

## Decisions

- **Runner:** official OR-Tools CP-SAT in its own versioned Python package `wbs-solver`, invoked by Bun as a short-lived stdin/stdout CLI. No import, no daemon, no HTTP port.
- **Concurrency:** optimization ON computes PRI and Time concurrently for one canonical input. Engine Fast/Optimized and Objective Priority-first/Finish-first only select which cached output is displayed.
- **Cache identity:** one SQLite table `optimized_schedule_cache` in the existing application database, declared in `apps/be-01/src/repository/schema.ts` with a forward migration under `apps/be-01/drizzle/`. Composite primary key `(projectId, inputHash, objective, solverVersion)` → `status` (`'ok' | 'failed'`), `scheduleJson` (NULL when failed), `failureReason` (NULL when ok), `createdAt`. A row satisfies a read iff `status='ok'`, the hash matches the current input, and the version matches the installed package. Only the latest valid PRI+Time pair per project is retained. **`apps/be-01/drizzle/**` is a prod-mode path, so the slice that lands this migration ships as a reviewed PR and is not self-merged.**
- **Input hash:** SHA-256 of a canonical JSON of scheduling facts (work-item tree, dependency edges including leaf expansion, team pools). Engine, Objective, the toggle, and the display variant are excluded; objective is a separate cache dimension.
- **Solver contract:** request is one JSON line `{ objective, slices, edges, pools, baselineOffsets, budgetMs, solverVersion }`; response one JSON line `{ status, offsets, objectiveValue }`. Bun independently re-validates offsets before storing. `baselineOffsets` is the Fast schedule for the same canonical input — a pure function of the hashed facts — and is the only movement reference either objective may use, so the input hash fully determines each objective. The solver reads no clock, database, or other schedule.
- **Failure:** fail-closed — Fast stays visible, failure is variant-specific, and manual Retry rechecks the hash and launches only the failed/missing variant. A failure writes a `status='failed'` marker row with a `failureReason` and no `scheduleJson`; that row never satisfies a read, never suppresses a Retry or a later solve, and is overwritten by the next run for the same key. That is the precise meaning of "failed runs do not poison the cache": the marker records why the variant is unavailable so every collaborator sees the same `Optimization unavailable · Retry` state, and it blocks nothing.
- **Events:** `schedule_optimized` fires once per newly stored validated result; a cache hit emits nothing.
- **Resource ceilings:** 4 solver processes per project, 16 global (Dany 2026-09-02). When the global cap is full, entries wait in a single global FIFO ordered by enqueue time, one per (project, objective); at dequeue an entry whose hash no longer matches its project's current hash is discarded without launching.
- **Budget:** one config value `solverBudgetMs`, default 60000 (Dany's >=60s floor), child killed at `solverBudgetMs + 5000`. It is excluded from `inputHash` and never invalidates stored rows — every stored row is an independently re-validated feasible schedule and stays correct regardless of search time.
- **Restart:** nothing is resumed on startup and no queue is rebuilt. Only the live coordinator that spawned a run writes its result, so a mid-solve death leaves no row; orphaned solver children are killed on startup.
- **Selection channel:** toggle, Engine, and Objective are project-scoped persisted settings and broadcast on the existing project-settings update channel, never on `schedule_optimized`.
- **Determinism:** production runs multi-worker under a wall-clock budget and is explicitly not required to be reproducible; one result is stored and every collaborator refetches that row, so all clients converge. Reproducibility is asserted only under a pinned test configuration (`num_search_workers=1`, fixed `random_seed`, deterministic time limit).

## Risks / Trade-offs

- **New language in the stack (Python):** the deploy image must carry a pinned Python runtime plus OR-Tools. Mitigated by isolating the solver behind a one-line stdin/stdout contract and versioning the package into the cache key.
- **Two concurrent solves per edit:** CPU cost. Mitigated by the OFF-by-default toggle, debounce, cancellation, and the 4/16 ceilings.
- **SQLite growth:** one row per objective per project per valid input, but only the latest pair is retained so the table stays bounded per project.
- **Best-found semantics:** a host-dependent solve could surface differing "optimal" dates; the exact input hash plus the reported day-count comparison forces like-for-like reads, and storing exactly one result per key means collaborators never disagree even though a re-solve might have found other offsets.
- **A prod-mode migration inside a dev-mode item:** the cache table is the only prod-mode path here. It is isolated into its own slice (tasks.md slice 3) so the rest of the change stays dev-mode and only that slice carries the reviewed-PR obligation.
