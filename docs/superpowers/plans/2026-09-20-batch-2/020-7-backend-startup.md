# 020.7 Backend startup ownership with DI Bag: start, rollback, ordered close

**Size class:** L.
**Estimates:** 6,000,000 top-model planning tokens; 22,000,000 mid-level implementation tokens;
9,000,000 top-model review tokens.

**Designs this implements:** slice 5 of the
[package adoption plan](../2026-09-17-personal-package-adoption.md), "Transfer backend startup and
resource ownership", under its
[2026-09-19 amendment](../2026-09-17-personal-package-adoption.md#amendment-2026-09-19-read-before-executing).
The [code organization design](../../specs/2026-09-19-code-organization-design.md) and its
[rollout plan](../2026-09-19-code-organization-rollout.md) own the module split that comes after
this; see non-goals.

**Contract:** the [batch 1 README](../2026-09-19-batch-1/README.md) governs this packet — its
"Execution contract", "Rules for every executor" and "Standard blocks every packet uses". Where this
packet and that README disagree, the README wins. Do not copy those blocks here; follow them by
name.

**Rehearsed after the second review.** The planner executed every slice of this packet in order in
the planning worktree, stopping at each checkpoint and running that checkpoint's commands against
that checkpoint's tree, then restored the four files byte for byte (`cmp` clean, `git status apps/`
empty). Every number below was seen. The disposition tables are at the end.

---

## 1. Goal and non-goals

**Goal.** One owner for be-01's startup and shutdown: every resource is started in a declared order,
a failure at any step releases everything that had already started, and shutdown releases them in
the reverse of that order, reporting a release that is refused without abandoning the rest.
`bootBe01` becomes asynchronous because acquisition and release have to be awaited — not because
anything about it is late today.

**Non-goals.** No module split into `contract.ts`, `module.ts` and `check.ts` — that is work item
**020.9**, blocked on this one. No reporting library, no gw-01, no mcp-01, no startup or shutdown
timeout, no HTTP route change, no migration-policy change, no deploy-script change, no new Nx
target, and no new file under `apps/wbs/be-01/src`.

---

## 2. Read first

| Read                                                           | Why                                                                                                                               |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`, `LLM_README.md`                                   | Rules R1 to R5. R5 governs every check this packet adds.                                                                          |
| `docs/superpowers/plans/2026-09-19-batch-1/README.md`          | The execution contract and the standard blocks this packet names instead of copying.                                              |
| `docs/superpowers/plans/2026-09-19-batch-1/ASSUMPTIONS.md`     | Standing decisions from batch 1.                                                                                                  |
| `apps/wbs/be-01/src/boot.ts`                                   | The whole subject of this packet. Read all of it, including its two `Proof:` comments.                                            |
| `apps/wbs/be-01/src/boot.db.test.ts`                           | The existing cases that pin today's behaviour. Every one of them must stay green.                                                 |
| `apps/wbs/be-01/src/main.ts`, `apps/wbs/be-01/src/dev/main.ts` | The two entrypoints, the only non-test callers.                                                                                   |
| `apps/wbs/be-01/src/services.ts`                               | `buildServices` and `BeServices`; what boot hands it and what it gets back.                                                       |
| `node_modules/di-bag/AGENTS.md`                                | Rules 4 and 6: async is explicit, `withDisposal` owns the returned value, `pushDisposer` owns what a factory acquired on the way. |
| `node_modules/di-bag/docs/agent/recipes.md`                    | The "Own a resource a factory acquires on the way" recipe, which this packet uses.                                                |
| `node_modules/di-bag/docs/agent/api-card.md`                   | `createBuilder`, `fromSyncFactory`, `withDisposal`, `buildAndStart`, `close`.                                                     |
| `docs/findings/checks-that-cannot-fail.md`                     | Why section 8 rejects one mutation and replaces it.                                                                               |

---

## 3. Verified facts, 2026-09-20

Observed in the worktree `batch-2/planning`, by reading the file or running the command. **Main has
moved since and is not in this worktree**, so no count below is a pin and no line number is
something the executor must match: they locate code, and Step 0 records the numbers that matter.

### 3.1 What boot does today, and what is actually wrong with it

- `boot.ts` exports `function bootBe01(opts, dependencies): RunningBe`, **synchronous**, returning
  `{ services, port, stop }`.
- Its body, in order: open the source through the `openSource` seam, `buildServices`, `buildApp`,
  `services.retention.start()`, then `app.listen(opts.port, callback)`. The callback logs, runs
  `runMigrations` when `migrateOnStartup === true`, ensures the fixed local identity, starts the
  optimizer and sets `migrationsApplied = true`.
- **That callback is synchronous.** Elysia's `listen` calls its adapter inline, and the Bun adapter
  calls the callback directly after `Bun.serve` returns. Probed: the order is `before listen`,
  `callback`, `after listen`, and a throw inside the callback propagates out of `app.listen`, hence
  out of `bootBe01`, hence into `main.ts`'s existing `catch`.
- So the defect is not timing. It is that **nothing releases what startup acquired**: when the
  source opens and then `buildServices`, `buildApp`, `retention.start()`, `listen` or the callback
  throws, the SQLite connection stays open and the retention timer stays scheduled. A synchronous
  function cannot fix that — `source.close()` and `retention.stop()` are promises, and a synchronous
  `bootBe01` cannot await them before rethrowing. That is why the signature changes.
- A second defect, in shutdown: `stop()` awaits `app.stop()`, then `services.optimizer?.stop()`,
  then `services.retention.stop()`, then `source.close()`, in one chain. **A rejection anywhere
  abandons the rest.** Rehearsed: with the optimizer's `stop()` made to reject, today's `stop()`
  leaves the retention timer running and the file open.
- `main.ts` and `dev/main.ts` both do `running = bootBe01({...})` with no `await`, inside a `try`
  whose `catch` logs `'be-01 failed to start'` and calls `process.exit(1)`; both then install
  identical `SIGTERM`/`SIGINT` handlers that call `running.stop()` and exit 0, or log
  `'be-01 did not stop cleanly'` and exit 1 if it rejects.
- No other file imports `bootBe01` or `RunningBe`. `tools/tool-devsync` and Playwright's `webServer`
  start be-01 as a child process running `src/main.ts` and wait on `${beUrl}/health`.

### 3.2 What depends on the observable behaviour

- The blue/green swap health gate polls `/health` until `res.ok`
  (`tools/tool-remote-scripts/src/swap.ts`, through `src/lib/health.ts`): 120 attempts, 500 ms
  apart, 2 s per attempt. A connection refused and a 503 are the same thing to it.
- `bin/dev-poll.sh` (59 lines) reads the served commit out of the `/health` body with `curl` and
  `sed`. `tools/tool-smoke/src/health.ts` and `tools/tool-deploy/src/deploy.ts` use the same path.
- `apps/wbs/be-01/Dockerfile` ends `CMD ["bun", "run", "src/main.ts"]`; the swap stops a container
  with `docker stop`, i.e. SIGTERM and Docker's default grace.
- `/health` answers 503 `{ status: 'migrating' }` while `migrationsApplied` is false, 503
  `database_unreachable` when the schema probe throws, 503 with the schema's own word when it is not
  `ok`, and 200 `{ status: 'ok', commit }` otherwise
  (`apps/wbs/be-01/src/controller/infrastructure-endpoints.ts`). **A resolved boot does not imply a
  200**, and this packet does not make it imply one: slice B's unmigrated-database case holds that.

### 3.3 DI Bag 0.4.0, as installed and as exercised against this repository

`di-bag` is pinned at `0.4.0` in the root manifest and held by
`tools/tool-devsync/src/toolchain-pins.test.ts`. No repository file imports it yet, and there is no
package-adoption inventory to update: 020.1 shipped the pins, not the inventory.

| Question                                        | Observed                                                                                                                                                                                                                                                                              |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Does the graph type-check?                      | Yes — but only after two fixes. Elysia's `app.stop()` resolves to the Elysia instance, not to nothing, so every disposer awaits it in a block body. Before that fix the compiler reported TS2322 **and two cascading `[diBagTypeError]` "missing registrations" errors**.             |
| Does it lint?                                   | Yes — but only after the server factory stopped being `async`: with no `await` in its body, `@typescript-eslint/require-await` failed it. The listen callback is synchronous (3.1), so the factory is `fromSyncFactory`.                                                              |
| Close order from `bag.close()`                  | `app.stop`, `optimizer.stop`, `retention.stop`, `source.close` — today's four-step order, from the dependency edges plus pushed-disposer order.                                                                                                                                       |
| Rollback when a factory throws                  | `DiBagStartupError`, `code === 'DI_BAG_STARTUP_FAILED'`, `error.cause` is the original failure, `cleanupFailures` empty, every acquired resource released.                                                                                                                            |
| A disposer that rejects                         | `close()` rejects with `DiBagCleanupError`; `failures[].label` names the binding (`source`, or `server` for a pushed disposer); **every other release still runs** — rehearsed with the optimizer's `stop()` rejecting, after which the timer was stopped and the source closed once. |
| `bag.close()` twice                             | The second resolves.                                                                                                                                                                                                                                                                  |
| Dropping an ordering-only dependency            | The dependency is never acquired: with `retention` removed from the server factory's parameter, the timer never starts. Proof 2.                                                                                                                                                      |
| A renamed destructure (`retention: _retention`) | Still acquired; the Proxy read happens at destructuring.                                                                                                                                                                                                                              |
| Removing `withDisposal` from the server         | **The listener is still stopped**: DI Bag then reports `no-service-disposer` to the pushed disposer, which stops it. Section 8 mutates the disposer's body instead.                                                                                                                   |

### 3.4 The port can be occupied, and a refused connection has a shape

Elysia's Bun adapter passes `reusePort: true` to `Bun.serve`, whose own default is `false`
(`node_modules/bun-types/serve.d.ts`). Two **Elysia** listeners therefore share a port happily.
Against an **exclusive** holder a bind failure is reachable, and observed:
`Bun.serve({ port: 0, reusePort: false, … })` first, then `app.listen(thatPort, cb)` threw
`Failed to start server. Is port 38215 in use?` synchronously; the callback never ran;
`app.server?.port` was `undefined`; `app.stop()` on that app resolved.

Probed error shapes, which the `refuses()` helper depends on: a fetch to a closed port rejects with
a `TypeError` whose `code` is `'ConnectionRefused'`; a fetch to a listener that never answers
rejects with a `DOMException` named `TimeoutError`. The helper accepts only the first.

### 3.5 Baselines the planner measured (record your own; none of these is a pin)

| Command, from `apps/wbs/be-01`                    | Untouched tree                                    | After slice C           |
| ------------------------------------------------- | ------------------------------------------------- | ----------------------- |
| `bun test src/boot.db.test.ts`                    | `15 pass 0 fail`, 2.7 s. Binds loopback ports.    | `25 pass 0 fail`, 5.0 s |
| `bun test src/production-entrypoint.test.ts`      | `2 pass 0 fail`. Spawns `bun build`.              | `2 pass 0 fail`         |
| `bun test` (whole project, no coverage)           | `1078 pass, 1 skip, 0 fail`, 1079 across 91 files | `1089` across 91 files  |
| `NX_DAEMON=false bunx nx run wbs-be-01:typecheck` | exit 0, about 3 s                                 | exit 0                  |
| `NX_DAEMON=false bunx nx run wbs-be-01:lint`      | exit 0, about 18 s                                | exit 0                  |

All were run with `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT` in front; without it Bun prints
terser output and thirteen unrelated repository tests fail (batch 1 RESULTS.md).

### 3.6 Rules the edits must satisfy

- `eslint.config.js` enables `tseslint.configs.strictTypeChecked`. That brings
  `@typescript-eslint/await-thenable` — **`await` on a value that is not a promise is an error**,
  which is why slice B's cases call the still-synchronous `bootBe01` without `await` and slice C
  adds it — and `@typescript-eslint/require-await`, which is why the server factory is not `async`.
  Also `no-floating-promises`; `no-unused-vars` with `^_` ignore patterns, which is why every helper
  lands in the slice that first uses it; `no-unused-expressions` with no allowances, so a bare
  `builder.verifyGraph() satisfies void;` statement is a lint error here; and
  `simple-import-sort/imports`, which puts `di-bag` after the `@wbs/*` imports.
- `apps/wbs/be-01/src/test-tiers.test.ts` requires a test file mentioning `openDrizzle`,
  `openDatabase` or `runMigrations` to be named `*.db.test.ts`. Every test here goes into the
  existing `src/boot.db.test.ts`: no new file, no tier change, no new Nx target — so the
  `CLAUDECODE=0` and `AGENT=0` default that `tools/tool-devsync/src/workspace-targets.test.ts` will
  require of test-running targets is not this packet's business.
- This packet adds no README, so the coverage pin in
  `tools/tool-devsync/src/repo-namespacing-handoff.test.ts` is untouched whether packet 110.6 has
  landed and derived it or not. Nothing here inspects or moves it.
- The repository's lint rejects `await expect(promise).rejects.toThrow(...)`. Every rejection case
  below is written as `try { await … } catch (failure) { caught = failure; }`.

---

## 4. Assumptions recorded, not asked

1. **Boot keeps the listener where it is**, and keeps the `migrationsApplied` flag. It does not wait
   for a healthy schema before resolving, and `/health` keeps every one of its 503 answers.
2. **No startup timeout, no shutdown timeout.** `buildAndStart` and `close` both accept `timeoutMs`;
   neither is passed. A timeout is a new failure mode owing its own behaviour and test. A follow-up
   for 020.9.
3. **The signal handlers stay where they are**, registered after boot resolves.
4. **The adoption plan is not edited here.** Its slice 5 checkboxes stay unticked; packet 020.2 owns
   that file in this batch.
5. **`verifyGraph()` is not used** (3.6); `build()` reports the same graph errors at the builder
   expression, as section 3.3's cascade shows.
6. **One lifecycle fault the adoption plan names is deferred, without claiming it is impossible.**
   An `OptimizationCoordinator.start()` failure: its two error paths are caught and routed to
   `onChildError`, and the remaining ways it could throw — `setInterval`, `unref`, or an
   `onChildError` that throws — are reachable only by substituting something this packet has no seam
   for. Deferred to 020.9, which owns the module boundaries that would supply one. Every other case
   in that list is tested here: source-open failure, service-construction failure, port bind
   failure, post-listener failure, refused release, repeated stop.
7. **Names.** The OpenSpec change is `backend-startup-ownership`; the bag's registrations are
   `source`, `services`, `retention`, `server`.

---

## 5. Dispatch prerequisite — the planner's, not the executor's

`run-executor.sh` already resolves this batch: `--batch batch-2` selects
`docs/superpowers/plans/2026-09-20-batch-2`, the clone root `/home/df/wd/puni/batch-2`, the branch
prefix `batch-2/` and the temporary root `/tmp/puni-batch2`. One thing still has to be arranged:

**Every attempt of this packet is launched with `--batch batch-2 --network`.** The launcher defaults
`network=false` and passes that to `sandbox_workspace_write.network_access`; under that setting the
second reviewer's probe failed with `EPERM: operation not permitted, listen`, and every test in this
packet binds an ephemeral loopback port. Before the first dispatch the planner runs
`bun test src/boot.db.test.ts` inside a clone under the real launch configuration, echoes the
resolved packet path, and records both. Until that has been seen, Step 0's socket stop condition is
_unverified_, not false — it is the one stop condition here that may already be true.

---

## 6. File plan and interfaces

| File                                            | Create/modify | Responsibility                                                      |
| ----------------------------------------------- | ------------- | ------------------------------------------------------------------- |
| `openspec/changes/backend-startup-ownership/**` | create        | Proposal, delta spec, `design.md`, tasks, verification record.      |
| `apps/wbs/be-01/src/boot.ts`                    | modify        | The bag, the async signature, the ordered close, `Proof:` comments. |
| `apps/wbs/be-01/src/boot.db.test.ts`            | modify        | Five helpers, ten new cases, `await` at every call site.            |
| `apps/wbs/be-01/src/main.ts`                    | modify        | One word: `await`.                                                  |
| `apps/wbs/be-01/src/dev/main.ts`                | modify        | One word: `await`.                                                  |

Nothing else. No other batch 2 packet touches these files: 010.6, 010.7 and 040.1 are elsewhere;
020.2 creates `libs/shared/domain/failures` and edits the adoption plan (assumption 4); 040.4 is
frontend; 110.1 adds test-level tooling under `tools/tool-devsync`; 110.6 rewrites devsync tests and
lands first, which changes nothing here (3.6). If a step seems to need a file outside this table,
**stop and report**.

The only exported contract that changes:

```ts
export function bootBe01(opts: BootOptions, dependencies?: BootDependencies): Promise<RunningBe>;
```

`BootOptions`, `BootDependencies` and `RunningBe` keep their current shapes, field names and every
line of their existing field documentation — `BootOptions` carries no JSDoc of its own above the
`export interface` line, and none is added.

---

## 7. Steps

### Step 0 — Record the baseline. Every slice, before touching anything

Counts are relative to what **you** record, never to section 3.5.

- [ ] `git rev-parse HEAD` and `git status --short --untracked-files=all` — record both. Other
      lanes' modifications may be present; leave them exactly as they are.
- [ ] `mkdir -p "$TMPDIR/evidence"`.
- [ ] From `apps/wbs/be-01`:
      `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bun test src/boot.db.test.ts`. Record the
      `N pass` and `0 fail` line. **If this fails because a socket was refused — `EPERM`, `listen`,
      a refused loopback `fetch` — stop and report at once** (section 5).
- [ ] Run this slice's prerequisite exactly as written and compare both the printed number and the
      exit status. `grep -c` prints `0` **and exits 1** when it finds nothing; that is the expected
      result where the table says so, not a failure.

| Slice | Command                                                                                     | Expected                |
| ----- | ------------------------------------------------------------------------------------------- | ----------------------- |
| A, B  | `grep -c "^import { DiBag } from 'di-bag';" apps/wbs/be-01/src/boot.ts`                     | prints `0`, exits **1** |
| C     | `grep -c "^function heldPort" apps/wbs/be-01/src/boot.db.test.ts`                           | prints `1`, exits 0     |
| D     | `grep -c "^import { DiBag } from 'di-bag';" apps/wbs/be-01/src/boot.ts`                     | prints `1`, exits 0     |
| E     | `grep -c "^import { DiBagCleanupError } from 'di-bag';" apps/wbs/be-01/src/boot.db.test.ts` | prints `1`, exits 0     |

- [ ] Slices **A and E only**: record this attempt's own OpenSpec item count with the README's
      **OpenSpec validation** block. E compares against the number E recorded, never against A's.

**Per-slice test delta** against your own Step 0 count: A `0`, B `+5`, C `+5`, D `0`, E `0`.

---

### Slice A — Open the change (documents only)

- [ ] **A1.** Create it with the README's **Creating an OpenSpec change** block, named
      `backend-startup-ownership`. Expected: `grep -n "schema: sdd-lean"` prints one line.
- [ ] **A2.** Write `proposal.md` with the sections `openspec/changes/test-axes/proposal.md` uses
      (`## Why`, `## What Changes`, `## Non-Goals`, `## Constraints`), intent under 400 words: - Why: startup acquires a SQLite connection, a timer and a listener and releases none of them
      when a later step fails; shutdown is one `await` chain, so a refused release abandons the
      rest; releasing anything has to be awaited, which a synchronous `bootBe01` cannot do. - What changes: DI Bag owns the four resources; `bootBe01` returns a promise; a failure at any
      step releases what started, in reverse; `stop()` is the bag closing, and reports a refusal
      after attempting the rest. - Non-goals: section 1's list. - Constraints: `/health` keeps every answer it has today, including all three 503s; the
      listener keeps its position and `migrationsApplied` keeps its meaning; no timeout is
      introduced; schema management stays with the deploy pipeline.
- [ ] **A3.** Write the delta spec at `specs/backend-startup-ownership/spec.md`, opening
      `## ADDED Requirements`. Five requirements, each with real `- **WHEN**` and `- **THEN**`
      bullets under a `#### Scenario:` heading — OpenSpec validates headings only, so vacuous
      bullets pass validation and fail review. 1. _Boot resolves only when its configured startup actions have finished._ WHEN `bootBe01`
      resolves, THEN the process is listening on its port, the configured schema step has run,
      the fixed local identity exists where one was asked for, and the optimizer is started.
      WHEN the schema is not healthy, THEN `/health` still answers 503 with the schema's own
      word, exactly as it does today, and boot still resolves rather than refusing to start. 2. _A failure during startup releases what startup acquired._ WHEN the source cannot be
      opened, THEN boot rejects and no listener of its own is left. WHEN the service graph cannot
      be composed, or the port is already held by an exclusive listener, or a step after the
      listener fails, THEN boot rejects with the original failure reachable through the cause
      chain and closes the source exactly once. WHEN boot acquired a listener before failing,
      THEN that listener stops accepting; a listener boot never owned is left alone. 3. _Shutdown releases in the reverse of the start order._ WHEN `stop()` is called, THEN the
      listener stops accepting before the source is closed, and the optimizer and the retention
      timer are both stopped by then. WHEN `stop()` is called twice, THEN the second resolves. 4. _A refused release is reported, and the rest is still released._ WHEN a disposer rejects,
      THEN `stop()` rejects with a cleanup failure naming that resource and carrying its error,
      and every other release still runs. 5. _The retention timer is the process's, not the class's._ WHEN boot resolves, THEN the timer
      is running; WHEN `stop()` resolves, THEN it is not.
- [ ] **A4.** Write `design.md`: the four registrations and the edges between them; why the close
      order is a consequence of those edges plus pushed-disposer order rather than a written
      sequence; the split between `withDisposal` (owns the returned application) and
      `factoryCtx.pushDisposer` (owns what the factory took before it could return), and why
      `disposerCtx.reason` is read; how `buildAndStart` propagates the original failure as `cause`
      while reporting cleanup failures separately. Section 8's rejected mutation is the evidence
      that the disposer split is consequential, so name it here.
- [ ] **A5.** Write `tasks.md` as the five slices, unticked, and `verify.md` with the heading block
      `openspec/changes/test-axes/verify.md` uses and an empty results section.
- [ ] **A6.** Run the **OpenSpec validation** block. Expected: `failed == 0`, passed = this
      attempt's Step 0 number **+1**.
- [ ] **A7.** `GSETTINGS_BACKEND=memory bunx prettier --write` the new Markdown, then `--check`.

**Ready to commit.** `docs(openspec): open the backend startup ownership change`.

```text
?? openspec/changes/backend-startup-ownership/.openspec.yaml
?? openspec/changes/backend-startup-ownership/design.md
?? openspec/changes/backend-startup-ownership/proposal.md
?? openspec/changes/backend-startup-ownership/specs/backend-startup-ownership/spec.md
?? openspec/changes/backend-startup-ownership/tasks.md
?? openspec/changes/backend-startup-ownership/verify.md
```

---

### Slice B — Extend the boot tests before editing the root

The adoption plan's slice 5 says to extend the boot tests first. These five cases are green against
today's code and must stay green after slice C: they are the oracle the change is measured against,
not evidence for it. They call the **synchronous** `bootBe01`, without `await`, because
`await-thenable` forbids awaiting a non-promise (3.6); slice C adds the `await` to each of them.

The planner ran this slice on the untouched tree: **15 pass → 20 pass, 0 fail**, `typecheck` exit 0,
`lint` exit 0.

- [ ] **B1.** Add these helpers immediately above `describe('bootBe01', () => {` in
      `boot.db.test.ts`. All five are used by this slice, so none is an unused binding.

```ts
/** Every message in a failure's cause chain, so a test reads the reason through any wrapper. */
function reasons(failure: unknown): string {
  const seen: string[] = [];
  let at: unknown = failure;
  while (at instanceof Error) {
    seen.push(at.message);
    at = at.cause;
  }
  return seen.join(' | ');
}

/** A port held by an exclusive listener, which is what makes a bind failure reachable. */
function heldPort(): { port: number; release: () => Promise<void> } {
  const held = Bun.serve({ port: 0, reusePort: false, fetch: () => new Response('held') });
  const port = held.port;
  if (port === undefined) throw new Error('Bun.serve reported no port to hold');
  return { port, release: () => held.stop(true) };
}

/** A port nothing is listening on: held, then released. */
async function freePort(): Promise<number> {
  const held = heldPort();
  await held.release();
  return held.port;
}

/**
 * Whether the port refuses connections, which is the only answer that means
 * nothing is listening. A timeout means something accepted and never replied,
 * and a sandbox denial means the measurement never happened; both are rethrown
 * rather than reported as a closed socket.
 */
async function refuses(port: number): Promise<boolean> {
  try {
    await fetch(`http://localhost:${String(port)}/health`, { signal: AbortSignal.timeout(2_000) });
    return false;
  } catch (failure) {
    if (failure instanceof Error && 'code' in failure && failure.code === 'ConnectionRefused') {
      return true;
    }
    throw failure;
  }
}

/** The boot options every case below shares, minus the two each one chooses. */
function bootOptions(dbPath: string, port: number) {
  return {
    appOrigin: 'http://localhost',
    dbPath,
    port,
    logger: createLogger({ service: 'be-01' }),
    jwtKey: 'k'.repeat(32),
    gwUrl: 'http://gw.invalid',
    internalAuthSecret: 's'.repeat(32),
  };
}
```

- [ ] **B2.** Add these five cases inside `describe('bootBe01', …)`, immediately before
      `it('serves health on the port it bound', …)`. The first one is the control for `refuses()`:
      without it, a helper that reported every fetch failure as "closed" would certify a hung
      listener as released, and proofs 3 and 4 would prove nothing.

```ts
it('does not mistake a stalled listener for a closed one', async () => {
  const stalled = Bun.serve({
    port: 0,
    reusePort: false,
    fetch: () => new Promise<Response>(() => undefined),
  });
  const port = stalled.port;
  if (port === undefined) throw new Error('Bun.serve reported no port to stall on');
  let caught: unknown;
  try {
    await refuses(port);
  } catch (failure) {
    caught = failure;
  } finally {
    await stalled.stop(true);
  }

  expect(caught).toBeInstanceOf(Error);
  expect((caught as Error).name).toBe('TimeoutError');
}, 10_000);

it('releases nothing and rejects when the source cannot be opened', async () => {
  const dir = tempDir('wbs-boot-unopenable-');
  const port = await freePort();
  let caught: unknown;
  try {
    bootBe01(bootOptions(join(dir, 'test.db'), port), {
      openSource: () => {
        throw new Error('the database file is unreadable');
      },
    });
  } catch (failure) {
    caught = failure;
  }

  expect(reasons(caught)).toContain('the database file is unreadable');
  expect(await refuses(port)).toBe(true);
}, 10_000);

it('stops accepting before it closes the source it opened', async () => {
  const dir = tempDir('wbs-boot-release-order-');
  const dbPath = join(dir, 'test.db');
  runMigrations(dbPath, FOLDER);
  const port = await freePort();
  let refusedAtClose: boolean | undefined;
  const be = bootBe01(bootOptions(dbPath, port), {
    openSource: (options) => {
      const source = openSqliteSource(options);
      return {
        ...source,
        close: async () => {
          refusedAtClose = await refuses(port);
          await source.close();
        },
      };
    },
  });
  running = be;
  expect((await fetch(`http://localhost:${String(port)}/health`)).status).toBe(200);

  await be.stop();
  running = null;

  expect(refusedAtClose).toBe(true);
}, 10_000);

it('stops twice without complaining', async () => {
  const be = boot();
  running = null;

  await be.stop();
  await be.stop();

  expect(be.services.retention.isRunning()).toBe(false);
}, 10_000);

it('serves an unmigrated database rather than refusing to start', async () => {
  const dir = tempDir('wbs-boot-unmigrated-');
  const be = bootBe01(bootOptions(join(dir, 'test.db'), 0));
  running = be;

  const health = await fetch(`http://localhost:${String(be.port)}/health`);

  expect(health.status).toBe(503);
}, 10_000);
```

- [ ] **B3.** `bun test src/boot.db.test.ts` — Step 0 **+5**, `0 fail`. Every one of these passes
      against the unchanged `boot.ts`; that is the point of this slice.
- [ ] **B4.** `wbs-be-01:typecheck` exit 0, then `wbs-be-01:lint` exit 0.
- [ ] **B5.** Append to `verify.md`, tick `tasks.md`, prettier `boot.db.test.ts` and the two
      Markdown files, then `nx format:check --all` exit 0.

**Ready to commit.** `test(wbs-be-01): pin be-01's shutdown order and startup refusals`.

```text
 M apps/wbs/be-01/src/boot.db.test.ts
 M openspec/changes/backend-startup-ownership/tasks.md
 M openspec/changes/backend-startup-ownership/verify.md
```

---

### Slice C — Five red cases, then DI Bag owns the lifecycle

The whole graph lands in one slice. A bag for some resources and a hand-written cleanup chain for
the rest is exactly the shape that lets a cleanup failure replace the startup failure, so that
intermediate is never committed.

Write the five cases first and watch each one fail. **Lint is not run between C1 and C3:** these
cases `await` a `bootBe01` that is still synchronous, which `await-thenable` rejects until C3 lands.
`bun test` does not care, and the red observation is what C2 is for.

- [ ] **C1.** Add `import { DiBagCleanupError } from 'di-bag';` immediately after the `bun:test`
      import, and these five cases inside `describe('bootBe01', …)`, before the cases slice B added.

```ts
it('releases the source when the port it was given is already taken', async () => {
  const dir = tempDir('wbs-boot-taken-port-');
  const dbPath = join(dir, 'test.db');
  runMigrations(dbPath, FOLDER);
  const held = heldPort();
  let closes = 0;
  let caught: unknown;
  let heldStatus: number | undefined;
  try {
    await bootBe01(bootOptions(dbPath, held.port), {
      openSource: (options) => {
        const source = openSqliteSource(options);
        return {
          ...source,
          close: async () => {
            closes += 1;
            await source.close();
          },
        };
      },
    });
  } catch (failure) {
    caught = failure;
  } finally {
    // Boot does not own this listener and must not have stopped it. Read
    // before the release, so the answer is about a port that is still taken.
    heldStatus = (await fetch(`http://localhost:${String(held.port)}/health`)).status;
    await held.release();
  }

  expect(heldStatus).toBe(200);
  expect(reasons(caught)).toContain('Failed to start server');
  expect(closes).toBe(1);
}, 10_000);

it('closes the source when the service graph cannot be composed', async () => {
  const dir = tempDir('wbs-boot-uncomposable-');
  const dbPath = join(dir, 'test.db');
  runMigrations(dbPath, FOLDER);
  let closes = 0;
  let caught: unknown;
  try {
    await bootBe01(bootOptions(dbPath, await freePort()), {
      openSource: (options) => {
        const source = openSqliteSource(options);
        return {
          ...source,
          get stores(): never {
            throw new Error('store wiring failed');
          },
          close: async () => {
            closes += 1;
            await source.close();
          },
        };
      },
    });
  } catch (failure) {
    caught = failure;
  }

  expect(reasons(caught)).toContain('store wiring failed');
  expect(closes).toBe(1);
}, 10_000);

it('releases the source and the port when a step after the listener fails', async () => {
  const dir = tempDir('wbs-boot-rollback-');
  const dbPath = join(dir, 'test.db');
  const port = await freePort();
  let closes = 0;
  let caught: unknown;
  try {
    await bootBe01(
      {
        ...bootOptions(dbPath, port),
        migrateOnStartup: true,
        migrationsFolder: join(dir, 'no-such-folder'),
      },
      {
        openSource: (options) => {
          const source = openSqliteSource(options);
          return {
            ...source,
            close: async () => {
              closes += 1;
              await source.close();
            },
          };
        },
      },
    );
  } catch (failure) {
    caught = failure;
  }

  expect(reasons(caught)).toContain('no such file or directory');
  expect(closes).toBe(1);
  expect(await refuses(port)).toBe(true);
}, 10_000);

it('releases every other resource when one release is refused', async () => {
  const dir = tempDir('wbs-boot-refused-optimizer-');
  const dbPath = join(dir, 'test.db');
  runMigrations(dbPath, FOLDER);
  let closes = 0;
  const be = await bootBe01(
    {
      ...bootOptions(dbPath, 0),
      optimizer: {
        solverVersion: '0.1.0',
        budgetMs: 60_000,
        spawn: () => {
          throw new Error('this case must not spawn');
        },
      },
    },
    {
      openSource: (options) => {
        const source = openSqliteSource(options);
        return {
          ...source,
          close: async () => {
            closes += 1;
            await source.close();
          },
        };
      },
    },
  );
  running = null;
  const optimizer = be.services.optimizer;
  if (optimizer === undefined) throw new Error('this case needs the optimizer runtime');
  // The refusal is injected into the instance the composition returned, and
  // only for this shutdown: the real stop still runs, then it refuses.
  const real = optimizer.stop.bind(optimizer);
  const seam = optimizer as { stop?: typeof optimizer.stop };
  seam.stop = async () => {
    await real();
    throw new Error('optimizer refused to settle');
  };

  let caught: unknown;
  try {
    await be.stop();
  } catch (failure) {
    caught = failure;
  } finally {
    delete seam.stop;
  }

  expect(caught).toBeInstanceOf(DiBagCleanupError);
  if (!(caught instanceof DiBagCleanupError)) throw new Error('unreachable');
  expect(caught.failures.map((failure) => failure.label)).toEqual(['server']);
  expect(caught.failures.map((failure) => reasons(failure.error))).toEqual([
    'optimizer refused to settle',
  ]);
  expect(be.services.retention.isRunning()).toBe(false);
  expect(closes).toBe(1);
}, 10_000);

it('refuses to report a clean stop when a release is refused', async () => {
  const dir = tempDir('wbs-boot-refused-');
  const dbPath = join(dir, 'test.db');
  runMigrations(dbPath, FOLDER);
  let real: (() => Promise<void>) | undefined;
  const be = await bootBe01(bootOptions(dbPath, 0), {
    openSource: (options) => {
      const source = openSqliteSource(options);
      real = () => source.close();
      return { ...source, close: () => Promise.reject(new Error('disk gone')) };
    },
  });
  running = null;

  let caught: unknown;
  try {
    await be.stop();
  } catch (failure) {
    caught = failure;
  } finally {
    // The refusal is the double's, not the connection's; close the real one.
    await real?.();
  }

  expect(caught).toBeInstanceOf(DiBagCleanupError);
  if (!(caught instanceof DiBagCleanupError)) throw new Error('unreachable');
  expect(caught.failures.map((failure) => failure.label)).toEqual(['source']);
  expect(caught.failures.map((failure) => reasons(failure.error))).toEqual(['disk gone']);
  expect(be.services.retention.isRunning()).toBe(false);
}, 10_000);
```

- [ ] **C2. Watch all five fail, one at a time**, with `bun test src/boot.db.test.ts -t '<title>'`.
      Each run must report **1 test, 1 fail**; `matched 0 tests` or a zero count is a failure to
      stop on. These are the failures the planner observed on the untouched tree:

| Case                                                                    | Observed failure                                                                                                                                          |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `releases the source when the port it was given is already taken`       | `expect(received).toBe(expected)` · `Expected: 1` · `Received: 0`                                                                                         |
| `closes the source when the service graph cannot be composed`           | `expect(received).toBe(expected)` · `Expected: 1` · `Received: 0`                                                                                         |
| `releases the source and the port when a step after the listener fails` | `expect(received).toBe(expected)` · `Expected: 1` · `Received: 0`                                                                                         |
| `releases every other resource when one release is refused`             | `expect(received).toBeInstanceOf(expected)` · `Expected constructor: DiBagCleanupError` · the run also reports the uncaught `optimizer refused to settle` |
| `refuses to report a clean stop when a release is refused`              | `expect(received).toBeInstanceOf(expected)` · `Expected constructor: DiBagCleanupError` · the run also reports `disk gone`                                |

Save each output under `$TMPDIR/evidence/`.

- [ ] **C3. Rewrite `boot.ts`.** Add `import { DiBag } from 'di-bag';` after the `@wbs/store-sqlite`
      import, then replace everything from `interface BootDependencies` to the end of the file with
      the text below. This is the exact text the planner ran: `prettier --check` clean, `typecheck`
      exit 0, `lint` exit 0, 25 tests green. Do not reflow it.

```ts
interface BootDependencies {
  /** Opens the source whose lifetime this boot owns. */
  readonly openSource: typeof openSqliteSource;
}

/** The opened source, named through the seam so a test double satisfies the same type. */
type OwnedSource = ReturnType<BootDependencies['openSource']>;

/** The mounted application, named without restating Elysia's generic instantiation. */
type BuiltApp = ReturnType<typeof buildApp>;

/**
 * Everything between an empty process and a serving be-01.
 *
 * It is a function, and it is tested. `retention.start()` living in a top-level
 * script meant "the timer is running in production" was a claim no test could
 * reach — the same shape of gap as the `runRetention` that had no caller at all.
 *
 * **It owns what it acquires.** The bag below opens the source, composes the
 * services, starts the retention timer and mounts the listener, in that order,
 * and releases them in the reverse of it. A step that fails takes the whole
 * startup down with it and gives back every resource the earlier steps took;
 * that is why this is `async` — `source.close()` and `retention.stop()` are
 * promises, and a synchronous boot could not wait for them before rethrowing.
 * It rejects with `DiBagStartupError`, whose `cause` is the original failure.
 */
export async function bootBe01(
  opts: BootOptions,
  dependencies: BootDependencies = { openSource: openSqliteSource },
): Promise<RunningBe> {
  const state = { migrationsApplied: false };
  const bag = await DiBag.createBuilder()
    .register({
      // One connection for the process, opened through `openDrizzle` so the
      // per-connection pragmas (WAL, busy_timeout) are set and asserted.
      source: DiBag.withDisposal(
        DiBag.fromSyncFactory((): OwnedSource => dependencies.openSource({ dbPath: opts.dbPath })),
        (source) => source.close(),
      ),
      services: DiBag.fromSyncFactory(({ source }: { source: OwnedSource }): BeServices =>
        buildServices({
          source,
          logger: opts.logger,
          jwtKey: opts.jwtKey,
          gwUrl: opts.gwUrl,
          internalAuthSecret: opts.internalAuthSecret,
          pushFetch: globalThis.fetch,
          oidc:
            opts.oidc === undefined ? undefined : buildOidcVerifier(opts.oidc.verifier, opts.oidc),
          passwordSessions: opts.oidc !== undefined && opts.oidc.passwordLoginEnabled !== false,
          localIdentity: opts.localIdentity,
          optimizer: opts.optimizer,
        }),
      ),
      // Registered rather than started beside `listen`: a timer nobody stops
      // outlives the file it sweeps, so what starts it is now what the bag can
      // stop, and it stops before the source closes because it depends on it.
      retention: DiBag.withDisposal(
        DiBag.fromSyncFactory(({ services }: { services: BeServices }): BeServices['retention'] => {
          services.retention.start();
          return services.retention;
        }),
        (retention) => retention.stop(),
      ),
      // The listener is the last thing acquired and the first thing released.
      // `withDisposal` owns the app this returns; the pushed disposers own what
      // the factory took on the way, so a failure between `listen` and the
      // optimizer releases both at once instead of leaving a bound socket.
      // Pushed disposers run last first, after the `withDisposal` one: app.stop,
      // optimizer.stop, retention.stop, source.close — the order this process
      // has always shut down in.
      server: DiBag.withDisposal(
        DiBag.fromSyncFactory(
          (
            {
              source,
              services,
              retention: _retention,
            }: {
              source: OwnedSource;
              services: BeServices;
              // Read for its edge, not its value: it is what puts the timer's
              // disposer after the listener's. Drop it and the timer is never
              // started at all.
              retention: BeServices['retention'];
            },
            factoryCtx,
          ): BuiltApp => {
            const db = source.db;
            const app = buildApp({
              appOrigin: opts.appOrigin,
              clock: services.clock,
              get migrationsApplied() {
                return state.migrationsApplied;
              },
              auth: services.auth,
              // Proof: constructing a second LoginThrottle here made
              // boot.db.test.ts receive HTTP 401 instead of 429 (0 pass, 1 fail,
              // 13 filtered).
              loginThrottle: services.loginThrottle,
              oidc: opts.oidc,
              projects: services.projects,
              steps: services.steps,
              calendarMarkers: services.calendarMarkers,
              workItems: services.workItems,
              optimizer: services.optimizer,
              savedPlans: services.savedPlans,
              directory: services.directory,
              capacity: services.capacity,
              priorityBands: services.priorityBands,
              history: services.history,
              replay: services.replay,
              probeDatabase: () => probeSchema(db),
              writes: {
                imports: services.imports,
                uow: services.uow,
                // The batch's own services, over stores that hold no turn: the
                // runner takes the process's one turn for the whole batch, and
                // a store of its own that asked for another would wait for the
                // batch itself.
                batch: services.batch,
                announcements: services.announcements,
              },
              // Read per call, not captured here: dev's deploy is a `git reset`
              // under live watchers, so this process outlives the commit it
              // started on.
              deployedCommit: () => readDeployedCommit(opts.commitDir),
              internalAuthSecret: opts.internalAuthSecret,
              version: opts.version,
            });
            // Pushed before `listen`, because from here on there is something
            // to give back. On the clean path the `withDisposal` below stops the
            // app and this sees `service-disposed` and does nothing.
            factoryCtx.pushDisposer(async (disposerCtx) => {
              if (disposerCtx.reason !== 'service-disposed') await app.stop();
            });
            // Elysia runs this callback inline, before `listen` returns, so the
            // schema step and the identity write happen exactly where they did —
            // and a throw in either still leaves this factory, which is now what
            // releases the socket above.
            app.listen(opts.port, () => {
              if (opts.migrateOnStartup !== true) {
                opts.logger.info(
                  { port: opts.port },
                  'be-01 listening (schema managed by the deploy pipeline)',
                );
              } else {
                opts.logger.info({ port: opts.port }, 'be-01 listening (migrating)');
                runMigrations(opts.dbPath, opts.migrationsFolder ?? './drizzle');
              }
              if (opts.localIdentity !== undefined) {
                // The one write in the tree whose author is the row it writes:
                // the fixed local-mode account brings itself into existence, so
                // it is its own `created_by`. `Date.now()` rather than an
                // injected clock because boot is not a service and has none —
                // the rule the stamp exists for is that the *repository* reads
                // no clock, and this is the caller.
                //
                // **This has to finish before the first write, and it does.**
                // Every audit column's `created_by` references `users(id)` with
                // foreign keys on, so a write attributed to this identity before
                // its row exists is a `FOREIGN KEY constraint failed` rather
                // than a quiet null. `/health` answers 503 `migrating` until the
                // flag below, and both things that send the first request wait
                // for a 200 first: Playwright's `webServer` does, and so does
                // the deploy poller before it routes traffic to green. `OPEN`:
                // this runs before the first request is served, so there is no
                // batch for this write to land inside and no turn to wait for.
                new UserRepository(db, OPEN).ensureLocalIdentity(opts.localIdentity, {
                  at: Date.now(),
                  by: opts.localIdentity.id,
                });
              }
            });
            services.optimizer?.start();
            factoryCtx.pushDisposer(async () => {
              await services.optimizer?.stop();
            });
            state.migrationsApplied = true;
            if (opts.migrateOnStartup === true) opts.logger.info('migrations applied');
            return app;
          },
          { context: 'acquisition' },
        ),
        // A block body, not `(app) => app.stop()`: Elysia's `stop()` resolves to
        // the application, and a disposer must resolve to nothing.
        async (app) => {
          await app.stop();
        },
      ),
    })
    .buildAndStart(['server']);

  const services = bag.resolve('services');
  const app = bag.resolve('server');

  return {
    services,
    port: app.server?.port ?? opts.port,
    /**
     * Releases in the reverse of the start order: the listener stops accepting,
     * then the optimizer, then the retention sweep is waited out, then the file
     * is closed.
     *
     * Proof: closing first made the boot lifecycle test observe both
     * `optimizerRunning: true` and `retentionRunning: true` at source close
     * (0 pass, 1 fail, 14 filtered, 1 assertion).
     *
     * A disposer that rejects makes this reject with `DiBagCleanupError`, whose
     * `failures` name the resource; every other release is still attempted.
     * Calling it twice is safe: the second resolves.
     */
    stop: () => bag.close(),
  };
}
```

- [ ] **C4. Make every caller await.** In `main.ts` and `dev/main.ts`, change
      `running = bootBe01({` to `running = await bootBe01({`. Nothing else in either file changes:
      the `try`, the `catch`, the `process.exit(1)` and both signal handlers stay as they are. Bun
      and `bun build --target=bun` both accept top-level `await` here.
- [ ] **C5. Make every test call site await**, in `boot.db.test.ts`: - `function boot(` becomes `async function boot(`, and its return type `RunningBe` becomes
      `Promise<RunningBe>`. - Every `running = bootBe01({` becomes `running = await bootBe01({`. - Every `const be = boot(` becomes `const be = await boot(`, and every
      `const be = bootBe01(` becomes `const be = await bootBe01(` — including the four sites slice
      B wrote: `bootBe01(bootOptions(join(dir, 'test.db'), port), {` in the unopenable-source
      case, `const be = bootBe01(bootOptions(dbPath, port), {` in the release-order case,
      `const be = boot();` in the stop-twice case, and
      `const be = bootBe01(bootOptions(join(dir, 'test.db'), 0));` in the unmigrated case. - The three readiness loops (`for (let attempt = 0; attempt < 50; …)`) are **left exactly as
      they are**. They still pass, and they are the only thing proving `/health` reaches 200.
- [ ] **C6.** `bun test src/boot.db.test.ts` — Step 0 **+5**, `0 fail`. Every existing case must
      still pass, in particular `starts the retention timer`,
      `stops optimizer and retention before closing its opened source`,
      `stops accepting before it closes the source it opened` and
      `holds a command batch out while the write coordinator is taken`.
- [ ] **C7.** `wbs-be-01:typecheck` exit 0, then `wbs-be-01:lint` exit 0. A missed `await` shows up
      in lint as `@typescript-eslint/no-unsafe-*` on the call site; the planner watched seven of
      them come from one forgotten site.
- [ ] **C8.** `bun test src/production-entrypoint.test.ts` — 2 tests, both pass (the planner ran it
      against this exact edit). If the sandbox refuses `Bun.spawnSync`, record the refusal verbatim
      and list the file as pending planner verification; do not edit it.
- [ ] **C9.** Append to `verify.md`, tick `tasks.md`, prettier the changed files, then
      `nx format:check --all` exit 0.

**Ready to commit.** `refactor(wbs-be-01): the bag owns be-01's startup and shutdown`.

```text
 M apps/wbs/be-01/src/boot.db.test.ts
 M apps/wbs/be-01/src/boot.ts
 M apps/wbs/be-01/src/dev/main.ts
 M apps/wbs/be-01/src/main.ts
 M openspec/changes/backend-startup-ownership/tasks.md
 M openspec/changes/backend-startup-ownership/verify.md
```

---

### Slice D — The six negative proofs

No test and no behaviour changes here. Each mutation is injected into the committed code, watched
failing, restored, and answered with one adjacent `Proof:` comment. They are a slice of their own so
that slice C stays inside one attempt; section 8 has the table, and every row of it was observed by
the planner.

- [ ] **D1.** Proof 1, then D2 … D6 in order, each following the README's **Negative proofs with a
      restore** and **Saving a mutation patch** blocks. After each: restore the bytes, `cmp`, rerun
      the named test green, then write the comment.
- [ ] **D7.** `bun test src/boot.db.test.ts` — Step 0 **+0**, `0 fail`, the same count as slice C.
- [ ] **D8.** `wbs-be-01:typecheck` and `wbs-be-01:lint`, both exit 0 (the comments change line
      lengths; prettier and lint both have to see them).
- [ ] **D9.** Append every observed failure to `verify.md`, tick `tasks.md`, prettier `boot.ts` and
      the Markdown, then `nx format:check --all` exit 0.

**Ready to commit.** `test(wbs-be-01): record the six watched startup and shutdown faults`.

```text
 M apps/wbs/be-01/src/boot.ts
 M openspec/changes/backend-startup-ownership/tasks.md
 M openspec/changes/backend-startup-ownership/verify.md
```

---

### Slice E — The record

- [ ] **E1.** Complete `verify.md`: every command of every slice, its exit status and decisive line;
      each negative proof with the injected fault and the failure observed; and a "Not verified"
      section naming at least the whole `wbs-be-01:test` target, `wbs-be-01:build`, `wbs-fe-01:e2e`,
      `bin/h2puni-gate.sh`, and the deferred optimizer-start case from assumption 6.
- [ ] **E2.** Tick every task in `tasks.md`.
- [ ] **E3.** Run the **OpenSpec validation** block. Expected `failed == 0` and the passed total
      equal to **this slice's own Step 0 number**, unchanged.
- [ ] **E4.** Prettier the two Markdown files, then `nx format:check --all` exit 0.

**Ready to commit.** `docs(openspec): record how be-01 boot acquires and releases`.

```text
 M openspec/changes/backend-startup-ownership/tasks.md
 M openspec/changes/backend-startup-ownership/verify.md
```

---

## 8. Negative proofs

Follow the README's **Negative proofs with a restore** and **Saving a mutation patch** blocks: copy
the passing bytes aside, save the mutation as a patch under `$TMPDIR/evidence/<name>.patch` with the
`if diff …; then …; else test $? -eq 1; fi` form, run the named test, save the failing output beside
the patch, restore by copying the bytes back, `cmp` them, rerun green. **A proof succeeds when the
named test fails with the named message. Other tests failing from the same fault are recorded, never
a stop.**

**Every mutation below was injected by the planner against the finished code, and the quoted failure
is the one observed.**

| #   | Inject into `boot.ts`                                                                                       | Named test that fails                                                   | Observed failure                                                                                                      | Comment goes                       |
| --- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| 1   | Register `source` as a bare `DiBag.fromSyncFactory(…)`, dropping its `withDisposal` and `source.close`      | `releases the source when the port it was given is already taken`       | `expect(received).toBe(expected)` · `Expected: 1` · `Received: 0`                                                     | beside the `source` registration   |
| 2   | Delete the `retention: _retention` member from the server factory's parameter and its type                  | `starts the retention timer`                                            | `expect(received).toBe(expected)` · `Expected: true` · `Received: false`                                              | beside that member                 |
| 3   | Delete the `factoryCtx.pushDisposer(async (disposerCtx) => …)` that stops the app                           | `releases the source and the port when a step after the listener fails` | `expect(received).toBe(expected)` · `Expected: true` · `Received: false`                                              | beside the pushed disposer         |
| 4   | Replace the server's `withDisposal` disposer body with `await Promise.resolve();`, keeping `withDisposal`   | `stops accepting before it closes the source it opened`                 | `expect(received).toBe(expected)` · `Expected: true` · `Received: false`                                              | beside the `withDisposal` disposer |
| 5   | Make the source disposer swallow: `async (source) => { await source.close().catch(() => undefined); }`      | `refuses to report a clean stop when a release is refused`              | `expect(received).toBeInstanceOf(expected)` · `Expected constructor: DiBagCleanupError` · `Received value: undefined` | beside the source disposer         |
| 6   | Register `retention` as a bare `DiBag.fromSyncFactory(…)`, dropping its `withDisposal` and `retention.stop` | `releases every other resource when one release is refused`             | `expect(received).toBe(expected)` · `Expected: false` · `Received: true`                                              | beside the `retention` disposer    |

Proof 6 is what makes "the rest is still released" a claim and not a hope: with the timer's disposer
gone, the refused optimizer release leaves it running, and the case says so.
`closes the source when the service graph cannot be composed` shares proof 1's falsifier — the same
mutation fails it too — so it gets no mutation of its own.

**A mutation this packet does not use, and why.** Removing the server's `withDisposal` wrapper
altogether looks like the way to prove the listener is released, and it is not: DI Bag then reports
`no-service-disposer` to the pushed disposer, which stops the app anyway
(`node_modules/di-bag/dist/provider-execution.js`, where the `reason` is chosen). The planner
injected it and watched `stops accepting before it closes the source it opened` **pass**. Proof 4
mutates the disposer's body instead, which makes the reason `service-disposed`, suppresses the
fallback, and actually leaves the socket open. This is the failure mode
[checks that cannot fail](../../../findings/checks-that-cannot-fail.md) catalogues.

---

## 9. OpenSpec

Required: this changes an exported contract, when a process reports itself started, and what happens
to acquired resources when startup or shutdown fails. The change is `backend-startup-ownership`,
created in slice A with `--schema sdd-lean` and carrying a `design.md`; slices B to E append to its
`tasks.md` and `verify.md`. Nothing is archived or synced here. No migration and no deployment is
authorized; meeting either is a scope stop.

---

## 10. Verification

### What the executor runs

| Command                                                                                            | Expected                                                                |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT bun test src/boot.db.test.ts` (from `apps/wbs/be-01`) | exit 0; Step 0's count plus the slice's delta, `0 fail`                 |
| The same with `-t '<exact title>'`                                                                 | exit 0 **and a non-zero test count**; zero matched is a stop            |
| `NX_DAEMON=false bunx nx run wbs-be-01:typecheck`                                                  | exit 0 (not between C1 and C3; see slice C)                             |
| `NX_DAEMON=false bunx nx run wbs-be-01:lint`                                                       | exit 0 (not between C1 and C3)                                          |
| `bun test src/production-entrypoint.test.ts` (slice C)                                             | 2 tests; a refused `Bun.spawnSync` is recorded, not worked around       |
| The README's OpenSpec validation block (slices A and E)                                            | `failed == 0`; +1 in A against A's baseline, unchanged in E against E's |
| `NX_DAEMON=false bunx nx format:check --all`                                                       | exit 0                                                                  |

Every test here binds ephemeral loopback ports and fetches `http://localhost`. None needs an outside
network or Docker — but see section 5.

### Planner-only, listed by the executor as pending

| Check                                                                 | Expected                                                                                                                                                   |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NX_DAEMON=false bunx nx run wbs-be-01:test` (whole target, coverage) | **+10 tests** against whatever the baseline is when it runs, same file count, `0 fail`. The planner's pre-merge worktree went 1079 → 1089 across 91 files. |
| `NX_DAEMON=false bunx nx run wbs-be-01:build`                         | exit 0; the bundle still contains `solverSupervisorSpawner` and `/run/wbs-solver/supervisor.sock`                                                          |
| `NX_DAEMON=false bunx nx run wbs-fe-01:e2e`                           | Unchanged against the batch baseline. It starts be-01 through `main.ts` as a process and waits on `/health`.                                               |
| `bin/h2puni-gate.sh <sha>`                                            | On the shared build host only. The executor states that it was not run.                                                                                    |

### What none of it proves

That a deployed container shuts down cleanly under `docker stop`; that the blue/green swap's health
gate passes against a real image; that an abandoned optimizer generation is reconciled on a loaded
host. None of these is covered by the e2e or by the gate — the e2e starts processes with
`bun src/main.ts`, and the gate runs validation, tests, lint, type checks and builds. They stay
explicitly unverified and want dedicated planner-owned checks. Neither is an
`OptimizationCoordinator.start()` failure covered; assumption 6 records why and where it goes.

---

## 11. Stop conditions

Each is **false** at the start of the slice it belongs to, except where section 5 says otherwise.

- The Step 0 run of `src/boot.db.test.ts` fails before anything is edited — for any reason,
  including a refused socket. **This one may already be true; section 5 is the reason, and the
  planner settles it before dispatch.**
- The slice's Step 0 prerequisite prints a different number, or exits with a status the table does
  not give for it. That means the reviewed predecessor is not in this clone.
- `bun test -t '<title>'` reports `matched 0 tests` or a zero test count.
- A red observation in C2 does not happen: a case passes before C3 lands, or fails with a message
  the table does not name.
- A negative proof's named test **passes** under the injected fault, fails with a different message,
  or the mutation does not compile. Extra tests failing from the same fault are recorded, not a
  stop.
- A step needs a file outside section 6's table — `services.ts`, `app.ts`, any adapter, the adoption
  plan, a `tsconfig`, `project.json` or `package.json`.
- DI Bag reports `DI_BAG_CLASSIFIER_REQUIRED`, `DI_BAG_MISSING_DEPENDENCY`, `DI_BAG_CYCLE` or
  `DI_BAG_LIFETIME_DEPENDENCY` at build or resolve time, or the compiler reports a
  `[diBagTypeError]` type. Report the code and its `details` rather than adding registrations by
  trial — and check the disposer return types first, because that is what produced a spurious
  "required service registrations are missing" cascade for the planner (3.3).
- The test delta for the slice is anything other than the number Step 0 gives for it.

---

## 12. Out of lane

`libs/wbs/application/core/src/compose.ts` (adoption plan slice 4), `apps/wbs/gw-01`,
`apps/wbs/mcp-01` (slice 6; neither installs a signal handler today, which is a finding for whoever
plans it), `libs/shared/domain/failures` and
`docs/superpowers/plans/2026-09-17-personal-package-adoption.md` (packet 020.2),
`tools/tool-devsync/src/toolchain-pins.test.ts` and
`tools/tool-devsync/src/repo-namespacing-handoff.test.ts`, every deploy script, and every
`apps/wbs/be-01/src` file not named in section 6.

---

## Findings for whoever plans 020.9

- `boot.ts` ends this packet as one file holding four registrations and one host. The module split
  is 020.9's, and a `check.ts` whose only statement is `verifyGraph() satisfies void` needs a home
  this repository's `no-unused-expressions` rule tolerates, or an `eslint-disable` naming the
  boundary.
- An `OptimizationCoordinator.start()` failure has no seam here (assumption 6). Giving the optimizer
  runtime and `buildServices` a seam is a module-boundary question, which is 020.9's.
- gw-01 and mcp-01 install no `SIGTERM` or `SIGINT` handler at all. They stop when Docker kills
  them.
- Elysia asks Bun for `reusePort`, so two be-01 processes can serve one port and the kernel will
  load-balance between them. During a blue/green swap that is worth its own look.

---

### First review, 2026-09-20 (Codex gpt-6-astra, high effort): NOT READY

The second review confirmed C1, C2, C4, C5, I1, I2, I5, I6, I7, m1, m2 and m3 as fixed. C3, I3 and
I4 were reopened and are answered below. The short version of round one: the prescribed helpers did
not compile, proof 4's mutation could not fail, the callback-timing claim was wrong, and the
occupied-port case was wrongly ruled out.

### Second review, 2026-09-20 (Codex gpt-6-astra, high effort): NOT READY

Every finding was re-checked by executing it. The whole packet was then rehearsed slice by slice in
the worktree, each checkpoint against its own tree, and the four files restored byte for byte.

| Finding                                                        | Disposition                                                                                                                                                                                               | What changed in the steps                                                                                                                                                                      |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1 The asynchronous intermediate fails lint                    | **Fixed by removing the intermediate.** `strictTypeChecked` brings `require-await`, so a signature-only slice would need a contrived `await`.                                                             | The old slice B is gone. The signature changes in slice C, whose body awaits `buildAndStart`. Rehearsed: C's tree lints clean.                                                                 |
| C2 Slice C introduces unused helpers                           | **Fixed.** `no-unused-vars` would have failed C.                                                                                                                                                          | All five helpers now land in slice B, where all five are used by B's own cases. Rehearsed: B's tree lints clean.                                                                               |
| C3 The F prerequisite rejects the correct predecessor          | **Fixed.** `DiBagCleanupError` appears three times in the finished file.                                                                                                                                  | Step 0's prerequisites are a table of anchored patterns with both the expected count **and the expected exit status**, including that a zero-count `grep -c` exits 1.                          |
| I1 Cleanup continuation is testable without a new seam         | **Fixed; the earlier "partly" is withdrawn.** Wrapping the returned optimizer's `stop()` works, and today's `stop()` chain really does abandon the rest.                                                  | New case `releases every other resource when one release is refused` in slice C (red first: `Expected constructor: DiBagCleanupError`), proof 6, and requirement 4 restored to its full claim. |
| I2 "No injectable fault" is incorrect; source-open disappeared | **Fixed for two of three.** A throwing `openSource` and a source whose `stores` getter throws both work; `OptimizationCoordinator.start()` still has no seam, and is now deferred, not called impossible. | New cases `releases nothing and rejects when the source cannot be opened` (slice B, green today) and `closes the source when the service graph cannot be composed` (slice C, red today).       |
| I3 A timeout is accepted as proof the listener closed          | **Fixed.** Probed: a closed port rejects with `code: 'ConnectionRefused'`, a stalled listener with a `TimeoutError`.                                                                                      | `refuses()` accepts only `ConnectionRefused` and rethrows everything else, and slice B adds its negative control, `does not mistake a stalled listener for a closed one`.                      |
| I4 Tests follow the implementation they should drive           | **Fixed.** Five cases are red before C3 and are in the same slice as the code that makes them green; the five that were always green are slice B, before the root is touched, and labelled as such.       | Slices B and C; C2 carries the five observed red messages.                                                                                                                                     |
| I5 The occupied-port postcondition is impossible               | **Fixed.**                                                                                                                                                                                                | Requirement 2 speaks of a listener boot acquired; the case asserts the exclusive holder still answers 200 before releasing it.                                                                 |
| I6 F compares against another slice's OpenSpec count           | **Fixed.**                                                                                                                                                                                                | Step 0 records the count in A **and** E; E expects its own number unchanged.                                                                                                                   |
| m1 The launcher facts are outdated                             | **Fixed.** `run-executor.sh` resolves `--batch batch-2` to this directory.                                                                                                                                | Section 5 is now one prerequisite: launch with `--batch batch-2 --network`, and confirm the loopback baseline first.                                                                           |
| m2 The lifecycle design has no `design.md`                     | **Fixed.**                                                                                                                                                                                                | A4 writes it, A's handover lists it, and A7 formats it.                                                                                                                                        |

Carried in as well: main has moved, so every count here is relative and no line number is something
the executor must match; this packet adds no Nx target and no README, so neither the
`CLAUDECODE=0`/`AGENT=0` target default nor 110.6's coverage pin applies to it.
