# B · be-01 `service/`, `controller/`, `middleware/`, `openapi/`, roots

Read-only sweep of `main` @ `3346bb15` (155 commits past `5ec3b5f`). Every non-test `.ts` in scope opened; `work-item.service.ts` (4,007) and `schedule.ts` (2,212) read in full in chunks. Context read first: `CLAUDE.md` R1–R5, `CONTEXT.md` `## Language`, ADRs 0006/0007/0010/0011/0012, and `docs/2026-08-30-sustainability-audit.md` §1, §2, §4. Project-level R1/R2/R4/R5/D2/D5/D6/D7 findings are **not** restated except where their status has changed.

## 0 · What moved since `5ec3b5f`

Eight commits touched `work-item.service.ts`; the two that changed its shape are `d4e737c7` (`role` → `step`, physical rename) and `b8331b74` (audit columns / ADR 0012). `schedule.ts` took `5ee589db` (dependency reach) and `de1ddf53` (assumed slice duration).

**ADR 0012's `WriteStamp` changed the service shape in three ways the audit predates:**

- Seven services grew an identical `private stampFor(actorId): WriteStamp { return { at: this.now(), by: actorId }; }` — `auth.service.ts:79`, `capacity.service.ts:37`, `directory.service.ts:154`, `priority-band.service.ts:49`, `step.service.ts:133`, `project.service.ts:59`, `work-item.service.ts:1118`. Beside them sit 9 copies of `this.now = opts.now ?? (() => Date.now())` and 6 of `this.newId = opts.newId ?? (() => crypto.randomUUID())`. This is a new R4-class cluster the audit could not have seen.
- Every mutating store call in `work-item.service.ts` grew a trailing `stamp` argument. This is what ADR 0012 bought (compile-time coverage) and is correctly argued; the cost lands on `work-item.service.ts`'s signature surface, not its structure.
- `create()` (`:1599`) now builds one stamp for the row, the four `moveAll` hand-downs and the journal entry — a genuine improvement in locality over four `now()` reads.

**D6 has changed shape rather than closed.** `capacityController` and `priorityBandController` are no longer imported or registered. But `capacity.controller.ts` and `priority-band.controller.ts` still exist, still carry `.controller.ts` names, register no route, and export only a parser (`capacityOf`, `ladderOf`) imported by `work-item.controller.ts:29,31`. Meanwhile `app.ts:181–192` retains three orphan comments — "_Beside `capacityController` for its reason_", "_Beside the two above for their reason_" — that now sit above a single `historyController` registration and explain the placement of two things that are not there. `history.controller.ts:49` repeats the reference. The stale artifact moved from the registration to the comments and the filenames.

**D7 holds unchanged.** `BatchResult` (`plan-commands.ts:15`), `ItemState` (`libs/domain/src/progress.ts:44`, used across `roll-up.ts`), `AuthResult` (`auth.service.ts:14`), and `result` as the success field of nine outcome types including `WorkItemOutcome<T>` (`work-item.service.ts:622`).

**R5 holds unchanged.** Exactly 23 `userFromHeaders(auth, headers)` sites and 23 `'unauthenticated'` literals.

---

## 1 · Roots

**`app.ts` | 243 | Composes the Elysia instance: plugins, the write-scope pre-filter, controller registration, `/health`.**

- _Reuse_: the write-scope guard at `:152–168` re-derives the identity `.derive()` computes one line later. `requiresWriteScope` (`:240`) is a well-placed single rule.
- _Performance_: **`:171–173` is the sharpest per-request cost in the app.** `.derive(async ({ headers }) => ({ requestIdentity: await userFromHeaders(opts.auth, headers) }))` runs `AuthService.authenticate` on every request — an HS256 `jwtVerify` (or an OIDC verify) _plus_ `users.findById(sub)` — and `requestIdentity` has no reader anywhere in `apps/` or `libs/`. Write requests pay it twice (`onRequest` + `derive`), then a third time in the handler. `/health`, polled by the deploy poller, pays it too.
- _Readability/DDD_: `:181–192`'s three comment blocks describe a registration order for controllers that no longer exist. The JSDoc on `AppOptions` (`:36–122`) is exemplary R3 — every required field states what an optional one would silently break.

**`boot.ts` | 164 | Connection, services, app, retention timer, local identity, listen/stop.** _Reuse_: none. _Performance_: none. _DDD_: `:113–135`'s `ensureLocalIdentity` comment is the best example in the sweep of R3 done right — it states the FK ordering hazard, the window, and who closes it.

**`main.ts` | 56 | Process entry; config, signals.** _Reuse_: none. _Performance_: none. _DDD_: `let running;` at `:18` is assigned in a `try` and used in the signal handler without a definite-assignment guard — if `bootBe01` throws, `process.exit(1)` runs first, so it is safe, but the reader has to prove that.

**`services.ts` | 216 | The one composition root: 16 repositories, 10 services, one broadcaster, one replay buffer.** _Reuse_: audit R3 recorded that no test uses `buildServices()`; still true. _Performance_: none — construction only. _DDD_: this file is the best statement of the app's object graph, and the JSDoc at `:73–83` correctly names the two invariants only this file can hold (one buffer, one broadcaster). It is also where D2's "14 stores on one service" is visible in one screen (`:155–186`).

**`config.ts` | 25 | ArkType env schema.** _Reuse_: none. _Performance_: none. _DDD_: the only ArkType-validated boundary in be-01; `LLM_README.md:19`'s "ArkType" claim is true here and false for the HTTP routes.

**`deployed-commit.ts` | 99 | Reads `HEAD` from disk on every `/health`.** _Reuse_: none. _Performance_: 2–4 `existsSync`/`readFileSync` per `/health` call, plus a full `packed-refs` line scan (`:71–75`) when refs are packed. Bounded and argued at `:4–25`; the argument (a `git reset` under live watchers) is correct and the cost is right. _DDD_: none.

---

## 2 · `middleware/`

**`authenticated.ts` | 36 | Token from cookie or Bearer; identity from a token.**

- _Reuse_: `cookieValue` (`:24`) is a second, independent cookie parser — `auth.controller.ts:315` `cookiesOf` is the first. They differ: this one decodes lazily and returns `null` on a bad escape, that one decodes eagerly and would throw. Two parsers of one header format, in two files, one of which has a `try` and one of which does not. **The audit missed this.**
- _Performance_: `userFromHeaders` is the entry point for the 23 duplicated guards and for the dead `derive`.
- _DDD_: correct — the retired `x-wbs-token` refusal has a watched negative named in the JSDoc.

**`internal-auth.ts` | 9 | Shared-secret check for `/internal/*`.** _Reuse_: none. _Performance_: the comparison at `:2` is a plain `!==` — not constant-time. For a 32-byte shared secret over a trusted internal hop this is a defensible choice, but nothing says so; R3 would want the sentence. _DDD_: none.

**`validate.ts` | 24 | `HttpError` + an ArkType body validator.** _Reuse_: `validateBody` has exactly one caller, `smoke.controller.ts:13`. Every other route either declares a TypeBox schema or hand-parses. **Deletion test: this module and `HttpError` collapse into `smoke.controller.ts` with no loss**, and the seam it looks like it provides has not been taken in any real route. _Performance_: none. _DDD_: it reads as the app's validation boundary and is not one — an LLM adding a route will reach for it and find it does not fit the hand-parse doctrine.

---

## 3 · `openapi/`

**`openapi-plugin.ts` | 101 | The emitter and the document's prose.** _Reuse_: none. _Performance_: none. _DDD_: `DOCUMENT_DESCRIPTION` (`:37–74`) is the single best statement of be-01's contract in the repo, and it lives where no `LLM_README` reader will find it.

**`document-from-app.ts` | 44 | Reads the document over `app.handle`; one serialiser.** _Reuse_: correct — the writer and the freshness check share both functions. _Performance_: none. _DDD_: none.

**`emit-openapi-cli.ts` | 61 | Rewrites `openapi.json`.** _Reuse_: `:44–58` duplicates `openapi-document.test.ts:20–34` line for line — ten test doubles wired twice. The 10-line `app()` builder is the natural shared seam and is not taken. _Performance_: none. _DDD_: the JSDoc (`:10–21`) argues why a non-test file imports `src/testing`; sound.

**`hand-parsed-body.ts` | 42 | The "this schema is documentation" caveat, once.** _Reuse_: exemplary — the one sentence eight (now two) routes need. _Performance_: none. _DDD_: `:13` says "Eight routes parse their own bodies — the six work-item writes, the capacity PUT and the priority-band PUT." **None of those eight routes exists any more.** `openapi-document.test.ts:107–113` records the correction ("Since `plan-commands` the hand-parsed bodies are the two batch routes") but the production JSDoc was not updated. A comment describing a route table three releases old.

---

## 4 · `controller/`

**`work-item.controller.ts` | 945 | Every plan and directory write: `parseCommand`/`parseKind`, the batch routes, undo/redo, the tree read.**

- _Reuse_: R1's `parseCommand` switch (`:564–778`, 214 lines). Beyond what the audit recorded: the `…Ref` pairing is written out **36 times** by hand (`asOptionalId(raw['parentRef'], 'parentRef')` and 35 siblings) with no `refPair(name)` helper; `cascade: asOptionalFlag(raw['cascade'], 'cascade')` appears five times identically (`:747, :754, :761, :768, :775`); the four `patchX`-by-name kinds (`:721–741`) differ only in the identifier. `present()` (`:531`) is the right seam and is used well.
- _Performance_: `present()` does `Object.fromEntries(Object.entries(...).filter(...))` per command — three object allocations per command, ×200 per batch. Trivial against the DB cost; noted only because it is on the hottest parse path. `statusForBatch` (`:799`) builds a fresh 7-element array literal per refusal — cold path.
- _Readability/DDD_: `parseKind` is a 214-line function with 36 arms and no sub-functions; it is the single hardest thing in this directory for an LLM to edit without reading whole. `MOST_TAGS_ON_ONE_ITEM` / `MOST_SERVICES_ON_ONE_ITEM` / `MOST_TYPES_ON_ONE_ITEM` / `MOST_REFS_ON_ONE_ITEM` (`:86–125`) carry 40 lines of JSDoc arguing why they are four constants and not one — correct and worth keeping, but it means the file's first 130 lines are constants. `answerUndo` (`:493`) is a good, small, named seam.

**`plan-command-schema.ts` | 322 | The OpenAPI `oneOf` body, one variant per kind.**

- _Reuse_: R1's third copy. The only drift guard is the length check at `:297–301`, which catches a missing kind and cannot catch a variant describing the wrong fields — `patchWorkItem`'s field list (`:79`) is a prose string, so a field added to `parsePatch` will never redden anything here.
- _Performance_: `VARIANTS` and the length check run at **module load**, so `plan-command-schema.ts`'s throw is a boot failure. Correct and deliberate (`:308`).
- _Readability/DDD_: **`:19` — `const step = { stepId: id('The step (step) this figure belongs to.') };`** A `role (phase)` → `step (step)` substitution artifact from `d4e737c7`. This string is the description an MCP client shows a model for every one of the twelve step-carrying kinds. Also note `CONTEXT.md`'s `Avoid` list for **Step** forbids "phase"; the rename removed the word and left the parenthetical.

**`project.controller.ts` | 211 | Project CRUD, `/opened`, `/export`.** _Reuse_: six copies of the 401 guard (R5); `markdownCell` (`:60`) is the second markdown escaper — `plan-export.ts:315` is the first, and the audit already flagged them as user-visibly inconsistent. _Performance_: `/export` (`:138`) computes `projects.read` **and** a full `workItems.tree()` — one whole schedule per export, unavoidable for JSON, wasted for markdown (which reads only `number`, `name`, `dates`, `schedule.duration`, `schedule.critical`). _DDD_: `projectPatch` (`:12–51`) is where three ADRs (0010, 0011, and `estimate_method`) meet the wire, each with the same argument written three times ("an unrecognised X in the column is read back as malformed data"). One `refusedEnum(values, why)` helper would state the rule once.

**`auth.controller.ts` | 342 | Password register/login/me, and the OIDC flow.** _Reuse_: `/register` and `/login` (`:100–183`) share five guard steps (route-disabled, origin, client IP, throttle key, cookie-or-bearer response) written out twice with one clause of difference. `cookiesOf` (`:315`) duplicates `middleware/authenticated.ts:24`. _Performance_: `Bun.password.hash` is called on **every** register attempt including ones that will be refused as `taken` (`:88` in the service) — deliberate and argued at `:121–123` as an anti-abuse measure, and correctly throttle-gated. No synchronous crypto: `randomBytes(32)` (`:70, :195`) is sync but only on OIDC login initiation; `jose` is async WebCrypto; `Bun.password.*` is off-thread. _DDD_: `OidcRouteOptions` (`:20`) is 15 fields wide and is the app's only options object mixing policy (`groupPrefix`), collaborators (`tokens`, `verifier`) and test seams (`now`, `random`).

**`directory.controller.ts` | 69 | Six directory list routes.** _Reuse_: R5's worst case, unchanged — 44 of 69 lines are six copies of one guard, and the six handlers differ only in `directory.listX()` and the response key. _Performance_: none. _DDD_: none.

**`step.controller.ts` | 95 | Step add/rename/remove.** _Reuse_: `statusFor` (`:14`) is a fourth refusal→status table. Three 401 guards. _Performance_: none. _DDD_: `?cascade=true` read off raw `query` here while `history.controller.ts:82` declares a query schema for the document's sake — the two routes make opposite choices about the same mechanism and only one of them says why (`history.controller.ts:74–81`).

**`history.controller.ts` | 120 | One read route with a filter.** _Reuse_: one 401 guard. _Performance_: none — pushed into the store's `listFor`. _DDD_: `filterFrom` (`:27`) is a clean pure parser with the right absent-vs-empty argument. `:49`'s "Registered beside `capacityController` and `priorityBandController`" is stale.

**`solution.controller.ts` | 26 | One read route.** _Reuse_: 401 + `read`-scope guard, the second of only two `read`-scope checks in the app (the other is `project.controller.ts:144`). Nothing says why these two routes check a scope the other 21 do not. _Performance_: none. _DDD_: **Solution ref** is not in `CONTEXT.md` (audit D4 named it); this route is the term's only server-side surface.

**`internal.controller.ts` | 68 | gw-01's `/forward` and `/resume`.** _Reuse_: the two handlers share their whole shape — secret check, `parseOrThrow`, the same three-header `InternalCallContext`, the same `ValidationError` → 400 — with one call swapped. _Performance_: none. _DDD_: correct; the `onForward` pure-ack decision is argued in `app.ts:196–201` rather than here, which is the wrong file for it under R3.

**`capacity.controller.ts` | 63 | Not a controller: `BadCapacity` + `capacityOf`.** _Reuse_: `capacityOf` is the one guard for the pool floor, correctly single. _Performance_: none. _DDD_: **the filename lies.** It registers no route, exports no Elysia instance, and its JSDoc (`:15–43`) still describes "this route". `MOST_PEOPLE_AT_ONCE`'s ceiling is asked here and at `work-item.controller.ts:433` — two boundaries, one constant, correctly shared.

**`priority-band.controller.ts` | 85 | Not a controller: `BadLadder` + `ladderOf`.** _Reuse_: correct — `priorityLadderProblem` is asked once and lives in `libs/domain`. _Performance_: none. _DDD_: the filename lies as `capacity.controller.ts`'s does; `:18–24` describes "this route". `:35–45` is a model R5 entry: the JSDoc _retracts its own earlier proof_ and says what the arms actually buy.

**`smoke.controller.ts` | 22 | Echo.** _Reuse_: the only `validateBody` caller. _Performance_: none. _DDD_: `.decorate('smoke', new SmokeService())` is the only service constructed inside a controller; every other one is injected. It is harmless and it is also the pattern an LLM will copy.

---

## 5 · `service/` — the plan write path

**`work-item.service.ts` | 4,007 | 14 stores, 28 methods: the tree read, every plan mutation, the undo/redo walk, the compensating `apply` switch, the journal/history write, the broadcast.**

- _Reuse_:
  - The **`storedX` quartet** — `storedTrio` (`:3856`), `storedActual` (`:3880`), `storedMeasure` (`:3900`), `storedProgress` (`:3920`) — are one function: `listByProject(projectId)` then `.find()` on a `(workItemId, stepId[, metric])` key. Audit R4's "four `storedX` readers", unchanged.
  - The **`setX`/`clearX` octet** (`setEstimate:2516`, `clearEstimate:2573`, `setActual:2624`, `clearActual:2678`, `setMeasure:2728`, `clearMeasure:2794`, `setProgress:2855`, `clearProgress:2911`) is one 10-step body each: `contextFor` → `rolled_up` guard → `holdsStep` → `storedX` → `stampFor` → `writeNamingStep` → `announceWorkItem` → conditional `record` with a symmetric `set`/`clear` inverse. Audit R4, unchanged, and now the `stamp` threading makes each arm one line longer.
  - The **`apply` switch's five `set_*` arms** (`:3266, :3295, :3329, :3361`) repeat the same four steps: `listByProject` → `has children` → `holdsStep` → `writeNamingStep`, with the same two sentences of `detail` prose.
  - `descendsFrom` (`:814`) and `dependency.ts:7`'s `isWithin` are the same upward parent walk, in two files, building the same `parentOf` map.
  - `subtreeOf` (`:825`), `roll-up.ts:54`'s `foldByStep`, `roll-up.ts:327`'s `rollUpItemStates` and `schedule.ts:302`'s `indexTree` each rebuild a `childrenOf` map from scratch. Four independent child indexes over one row list, three of them in the same call (`tree()`).
- _Performance_ — this is where the plan's cost lives:
  - **44 `listByProject` call sites.** `contextFor` (`:3995`) issues `workItems.findById` + `projects.findById` + `workItems.listByProject` for _every_ command. `holdsStep` (`:3850`) issues `projects.stepsOf` for every step-naming command. Each `storedX` issues a full-project scan of its own table to read one row.
  - **Traced batch, end to end** (200 × `setEstimate`, one project): per command 6 queries of which 2 are full-project scans → ~1,200 queries and ~400 scans, all inside `lock.run` and the `BEGIN IMMEDIATE`. Then `recordCollected` → 1 `record` → 1 more `listByProject` (`revisionsOf`, `:3208`) + `journal.append`. Commit, lock released. Then `announceTreeNow` → one full `tree()`. Then `undoState` → 1 query. Then the client's `GET /work-items` → **a second full `tree()`**. Two complete schedules per batch, neither cached.
  - **`tree()` (`:1139–1569`) is 13 sequential awaits** (`:1278–1378`) with no `Promise.all`, on one SQLite connection where they could be issued together. It then runs `deriveNumbers`, `rollUp`, `rollUpFinals`, `rollUpActuals`, `rollUpMeasures` ×3, `rollUpProgress`, `rollUpItemStates`, `effectiveTeamsOf`, `slicesOf` and `schedule()` — and `schedule()` calls `deriveNumbers(rows)` **again** at `schedule.ts:1967`, a second full tree walk over the identical array.
  - **`:1531` is O(n²)**: `dependsOn: (waitingFor.get(row.id) ?? []).filter((id) => rows.some((r) => r.id === id))`, evaluated inside the `.map` over every row. The `Set` of ids is built three lines up (`:1302`) for people and not reused for this.
  - **`create()` (`:1571–1748`) interleaves 4 reads and 5 writes** and, on the first-child path, issues four _separate_ `listByProject` calls (`:1645, :1657, :1668, :1678`) each followed by a `.filter` for one parent's rows, then four `moveAll` writes. Audit D2's example, still exact.
  - **`remove()` cascade (`:2149–2246`) recomputes the whole tree six times for one leaf**: `rollUp`, `rollUpActuals`, `rollUpProgress` (+ `workedStepsOf`), and `rollUpMeasures` once per metric — plus `subtreeOf` twice (`:2158`, and again at `:2355` on the promote path). All to hand figures up to one surviving parent.
  - **`applyRestore` (`:3609–3627`) re-reads every dependency inside the loop**: `for (const edge of command.externalDependencies) { const current = await this.opts.dependencies.listByProject(projectId); ... }`. E full table reads for E edges, each followed by `canDepend` → `indexTree` + `expandToLeaves` + `topological` over the whole project.
  - **`walkStack` (`:3071`) reads the rows twice** — `staleness` (`:3184`) and `revisionsOf` (`:3209`) each call `listByProject` on the same project in the same act.
  - **Memory: `Recording.before` (`:1094`) is the whole project's rows, one fresh array per command.** A 200-command batch retains 200 distinct full copies for the life of the batch; `recordCollected` (`:3725`) reads exactly one of them (`only.recording.before`).
  - **`announceTree` (`:3931`) serialises the whole plan.** `publish` → `recordEvent` writes the `tree_replaced` payload into `event_log` (JSON), the `ReplayBuffer` retains the object, and `PushClient` (`push-client.ts:40`) `JSON.stringify`s it again for the HTTP body. Two serialisations of the entire plan per batch, plus a retained reference.
  - No synchronous crypto on this path; `crypto.randomUUID()` (`:1105`) is the only crypto call and is cheap.
- _Readability/DDD_: audit D2 stands in full. Two things it did not name: (a) `announceWorkItem` (`:3945`) computes a **full schedule** and then discards everything but `withAncestors(tree.workItems, id)` — and that branch is **unreachable in production** (see `broadcast.ts` below); (b) the `apply` switch (`:3236–3472`) is where the _domain rules_ actually live — "has children now", "that step is no longer in this project" — restated in English prose per arm rather than shared with the forward guards that state the same rules in `WorkItemRefusal` terms. The forward path says `rolled_up`; the compensating path says `'that work item has children now, so its figures are sums.'` Two vocabularies for one rule.

**`schedule.ts` | 2,212 | The engine: tree index, edge expansion to leaves, two placement passes, the capacity profile, the backward pass, the projection.**

- _Reuse_: the tightest module in the sweep. `windowFor`/`jointWindowFor` (`:770`, `:919`) is a deliberate fixpoint-over-the-single-pool composition with the reason stated (`:874–879`); `placeSlices` is run twice with `withResources` toggled rather than copied. `indexTree`/`expandToLeaves`/`hasCycle` are correctly exported to `dependency.ts` so `canDepend` asks the engine's own question. Nothing to collapse.
- _Performance_:
  - **`eventAt` (`:729–735`) inserts with `pool.events.splice(index, 0, fresh)`.** Binary-search location, O(E) shift. Every placed block writes two events per pool, so building one pool's profile is **O(E²)** in slices on that pool. On a 2,000-slice single-pool plan that is ~4 M element moves, entirely separate from the `eventsVisited` figure the tests bound (`:277`, `:695`) — the instrumented complexity claim measures the _scan_, not the _insertion_.
  - **`topological` (`:377–409`) uses `ready.shift()`** — O(V) per pop, O(V²) overall. Only reached from `hasCycle` → `canDepend`, i.e. once per `addDependency` and once per external edge in `applyRestore`. `applyRestore` therefore pays O(E·V²).
  - **`projectOntoWorkItems` (`:2130–2212`) is O(parents × leaves-under)** — for a chain-shaped tree, O(n²) — and builds 4–6 fresh arrays per parent (`:2188–2205` calls `beneath.map` five separate times). It also spreads into `Math.min(...)`/`Math.max(...)` (`:2142, :2173, :2190, :2193, :2199, :2200`); a project with ~10⁵ leaves under one root would hit the engine's argument-count limit and throw a `RangeError` no branch handles.
  - Two `placeSlices` passes and two `lateTimes` passes per schedule — deliberate (`:1949–1954`, and the unleveled pass is the ranking input), correct, and the dominant constant factor.
  - `augmented` (`:2033`) allocates a new array per node when any resource edge exists.
  - `slicesOf` in `work-item.service.ts:182` builds `inProject` and `held` Sets per call and does `rows.map(...)` before the loop — fine.
- _Readability/DDD_: the vocabulary here **is** `CONTEXT.md`'s — Slice, Block, Pool, Slot, Width, Binding floor, Blocking set, Display referent, Eligible slice, Anchor slice, Resource predecessor all appear as named types or locals. This is the counter-example to D2 in the same directory: `schedule.ts` is pure, testable at T0, and imports exactly one row type (`WorkItem`) from the barrel. Audit D4's `Slack`/`float` split persists (`:123` `float`, `:1622` `slackOf`); `CONTEXT.md` still names neither.

**`plan-commands.ts` | 663 | The batch runner: lock, outer transaction, ref resolution, the 36-arm dispatch, one journal entry, one broadcast.**

- _Reuse_: R1's fifth copy (`applyAll:278–659`, 381 lines). The nine directory arms (`:512–658`) are five triples — create/patch/delete for Team, Tag, WorkItemType, Service, Person — written out line for line, with `:592–594` _saying so in a comment_: "The tag trio, one dimension over, line for line". `DIRECTORY_KINDS` (`:49`) is a sixth hand-kept list of a subset of the vocabulary, with no check tying it to the union.
- _Performance_:
  - `execute` (`:118`) correctly keeps the broadcast **outside** `lock.run`, with a watched proof (`:110–117`). **That invariant is broken by three services the runner calls:** `capacity.service.ts:96`, `priority-band.service.ts:84` and `directory.service.ts:664` each `await broadcast.publish(...)` from inside `applyAll` — inside the lock and inside the `BEGIN IMMEDIATE`. `DirectoryService.announce` (`:662`) loops one publish per touched project, sequentially. A tag rename touching 40 projects therefore performs 40 event-log inserts _inside the batch's transaction_ and 40 gw-01 HTTP pushes, each of which `PushClient` retries 6 times with 500 ms→30 s backoff on a 5xx — a worst case of tens of minutes with the process-wide write lock held. The event-log inserts also become savepoints under ADR 0007, so a later refusal rolls back the recorded events for pushes that already left.
  - The closures `id`, `required`, `ids`, `mint`, `plain`, `detailOf`, `reasonOf`, `done`, `entity`, `refuse` (`:224–276`) are rebuilt **per command** — ten closures × 200 commands. Negligible against the DB cost, but it is per-iteration allocation in the batch's inner loop.
  - `commands.at(MOST_COMMANDS_IN_A_BATCH)` (`:125`) is the right O(1) bound check.
- _Readability/DDD_: `BatchResult` is D7's banned noun and is the runner's central type. `applyAll`'s `scope: string | null` with the IIFE at `:218–221` producing `scope ?? ''` means a directory command is dispatched with `projectId === ''` — an empty string standing for "no project", which every arm below then does not use. A `runDirectory` that never enters the project arms would make that unrepresentable.

**`plan-command.ts` | 144 | The `PlanCommand` union and `PLAN_COMMAND_KINDS`.** _Reuse_: R1's first two copies, in one file, 36 lines apart, with nothing but the length check in `plan-command-schema.ts` between them. _Performance_: none. _DDD_: the union is the closest thing be-01 has to a written domain vocabulary of writes, and it is a type with no behaviour — §4's registry proposal is exactly right and this file is where it starts.

**`compensating.ts` | 492 | The command vocabulary an undo/redo applies, plus `readCommand`/`readPayload`/`readPreconditions`, `touchedBy`, `subjectOf`, `quoteName`.**

- _Reuse_: `touchedBy` (`:373`) and `subjectOf` (`:440`) are two switches over the same 17 arms answering two different questions — correctly separated, with `:427–433` explaining why. `COMMANDS` (`:284`) is a **seventh** hand-kept vocabulary list, this one for the compensating kinds; nothing ties it to the union it guards.
- _Performance_: **it does not recompute anything.** Every command carries its whole before-state (`:33–37`), which is the design and is right. The recomputation the audit's question is about happens one layer up in `work-item.service.ts`'s `remove()`/`create()`, which build those payloads with six tree folds.
- _Readability/DDD_: this is the file most worth lifting into a domain layer — it is 400 lines of pure type and 90 lines of pure parsing, importing 18 row types from the barrel and nothing else. `quoteName` (`:489`) is a presentation concern (40-char truncation, curly quotes) living in the command vocabulary.

**`derive-numbers.ts` | 174 | Work item numbers from position, honouring frozen anchors.** _Reuse_: none — one function, one rule, correctly the only place. _Performance_: one full tree walk with a per-group sort; **called twice per plan read** (`work-item.service.ts:1313` and `schedule.ts:1967`) on the same array. `claimLabel`'s `frozenLabels.slice(i + 1).find(...)` (`:146`) allocates a suffix array per unfrozen row in a group — O(g²) in group size, only on frozen projects. _DDD_: excellent — `below`/`between`/`stepLastDigit` are the Repadding and Frozen-number rules from `CONTEXT.md` in code, and the throws (`:52`, `:86`, `:170`) are R5 done properly.

**`place-sibling.ts` | 65 | Where a new sibling goes; respacing.** _Reuse_: `POSITION_STEP` is correctly the one gap constant (also used at `work-item.service.ts:2340`). _Performance_: sorts the group per call; called once per create/move/restore. `work-item.service.ts:1882` and `:3571` each independently do a `filter → sort → at(-1)` to find "the sibling it sat after" — that is `place-sibling.ts`'s question asked outside `place-sibling.ts`, twice. _DDD_: clean; the `.at` vs `[]` comment (`:43–48`) documents a real `noUncheckedIndexedAccess` hazard.

**`assumed-assignee.ts` | 76 | The Assumed assignee reading, and which rows a step removal would flip.** _Reuse_: model — `CONTEXT.md`'s term, one function, three callers (`work-item.service.ts:245`, `directory-usage.ts:182`, `step.service.ts:103`), with the drift argument stated (`:11–15`). _Performance_: `assumedAssigneeFlips` (`:51`) rebuilds a whole record per assignment via spread (`:57–60`) — O(a²) in a project's assignments; the same spread-in-a-loop appears at `work-item.service.ts:1307–1312` and `directory-usage.ts:96`. Three copies of an O(n²) grouping idiom. _DDD_: exemplary.

**`dependency.ts` | 60 | `canDepend`.** _Reuse_: `isWithin` (`:7`) duplicates `work-item.service.ts:814`'s `descendsFrom`. _Performance_: `isWithin` builds a fresh `parentOf` Map on each of its two calls per check (`:40`); then `indexTree(rows)` + `expandToLeaves` + `topological` runs the whole graph (`:57`). Called per `addDependency` and per external edge in `applyRestore`. _DDD_: `:44–52` is the best-argued line in the directory — the guard asks the engine's own question rather than reimplementing reachability, with two independent reviewer findings recorded.

**`roll-up.ts` | 347 | One generic `foldByStep` and six roll-ups over it.** _Reuse_: `foldByStep` (`:49`) is the audit's "counter-example done right" applied inside be-01 — one recursion, four figure roll-ups on it, and `:37–42` states the reason. `rollUpItemStates` (`:323`) is a _second_ memoised child-walk that could not use `foldByStep` (it folds over children, not steps) and says so (`:305–312`). _Performance_: each roll-up rebuilds `childrenOf` from `rows` (`:54–59`, `:327–332`); `tree()` calls them seven times, so seven identical child-index builds per plan read. _DDD_: the best-factored file in `service/`; `ItemState` is D7's banned noun and enters from `libs/domain`.

**`directory-usage.ts` | 387 | Directory usage: what a person/team/tag/type/service removal takes.** _Reuse_: `directoryUsageOfTag`, `directoryUsageOfWorkItemType` and `directoryUsageOfService` (`:221`, `:247`, `:285`) are **the same one-line lambda** — `row.Xids.includes(id) ? [{ kind: 'label_removed' }] : []` — with 25, 30 and 35 lines of JSDoc apiece explaining why the absences are different. This is R2's triplication with the reasoning done and the collapse not taken. _Performance_: `usageFrom` (`:117`) builds the per-project group with `[...(treeOf.get(id) ?? []), row]` — a spread copy per row, O(n²) — and again for `byProject` (`:140`). Then `deriveNumbers` per project. `byStepOn` (`:96`) scans all assignments per work item — O(rows × assignments), called from `directoryUsageOfPerson`'s `effectsOf`. On a large deployment a person-removal preview is quadratic in two dimensions at once. _DDD_: the vocabulary is exactly `CONTEXT.md`'s (**Directory usage**, **Stating row**, **Effective team set**), and `:294–355` is the most carefully argued JSDoc in the repo, including a recorded case where the injection left 693 tests green.

---

## 6 · `service/` — the other services

**`directory.service.ts` | 667 | Teams, people, tags, services, types: list/add/patch/remove.**

- _Reuse_: R2's core. `addTag`/`addWorkItemType`/`addService` (`:240, :297, :384`) are identical but for the store method; `renameTag`/`renameWorkItemType`/`renameService` (`:247, :310, :394`) are identical; `removeTag`/`removeWorkItemType`/`removeService` (`:270, :339, :428`) are identical. Nine methods, three bodies, ~120 lines of executable code and ~180 of JSDoc explaining the sameness. `cleanName` (`:116`) is correctly one function — and is duplicated verbatim at `step.service.ts:83`.
- _Performance_: **`announce` (`:662–666`) publishes sequentially, one project at a time, awaiting each** — and, when called from a batch, does so inside the outer transaction and the write lock (see `plan-commands.ts` above). The JSDoc at `:653–657` argues "`recordEvent` opens a transaction of its own, so it cannot be nested inside the write's" — under ADR 0007 that is precisely what happens for every directory command in a batch. **The comment and the runner state incompatible things about the same call.**
- _Readability/DDD_: `PersonPatchInput` (`:89`) and `holdsKind` (`:75`) are the right narrowing seam and are argued by reference to `work-item.service.ts`'s `holdsMetric` — good cross-file R3. The `taken` outcome carrying the surviving name (`:97–101`) is a small, sharp piece of domain modelling.

**`step.service.ts` | 254 | Step add/rename/remove and Step usage.**

- _Reuse_: `cleanName` (`:83`) duplicates `directory.service.ts:116`. `gate` (`:242`) is `contextFor`'s question in a third place (`work-item.service.ts:3995` and `capacity/priority-band`'s inline pair are the others) — four spellings of "find the project, check `canEdit`".
- _Performance_: `remove` opens the store transaction even when the fast path could have refused (see below).
- _Readability/DDD_: **`:212`'s fast-path predicate is `seen.estimates > 0 || seen.assignments > 0`; the authoritative in-transaction predicate at `repository/step.ts:373–380` is `estimates || actuals || progress || measures || assignments`.** The two have drifted. Nothing is lost — the store still refuses, and it returns its own usage — but a step holding only recorded days is refused by the _second_ check rather than the first, and `StepInUse.actuals`'s own JSDoc (`:28–40`) argues at length that this exact case must refuse. The narrowing predicate is written where the file's doctrine says it must not be.

**`project.service.ts` | 193 | Project create/list/open/read/update; `canEdit`.** _Reuse_: `canEdit` (`:45`) is correctly exported and is the one authorisation rule, used by 5 services. _Performance_: none. _DDD_: `STARTING_STEPS` (`:19`) and `DEFAULT_ESTIMATE_RULE` are correctly single. `update`'s `bad_pert_weights` check (`:181`) is ADR 0011's boundary refusal, watched.

**`capacity.service.ts` | 99 | Per-project Capacity.** _Reuse_: `set` (`:80–98`) and `priority-band.service.ts:68–86` are the same eight lines with two identifiers swapped: find project, `canEdit`, stamp, store write, `not_found`, publish, re-read the whole list. _Performance_: publishes inside the batch's transaction and lock; `listFor` is called again after the write to answer with the whole list (`:97`) — a second query where the store's own write could have returned it. _DDD_: **Capacity** and **Remembered capacity** are `CONTEXT.md` terms and the JSDoc (`:45–79`) states both correctly.

**`priority-band.service.ts` | 87 | The Priority ladder.** _Reuse_: `capacity.service.ts`'s twin, and `:25` says so. _Performance_: as above — publish inside the transaction, plus a re-read. _DDD_: correct vocabulary (**Priority ladder**, **Rank**, **Band**).

**`history.service.ts` | 39 | One read.** _Reuse_: none. _Performance_: none. _DDD_: `:14–20` — "this service has no write method at all, which is what makes 'append-only' a property of the code rather than a promise in a comment" — is the sharpest sentence in the directory.

**`auth.service.ts` | 186 | Register, login, `authenticate`, OIDC resolution, JWT issue.** _Reuse_: none. _Performance_: `authenticate` (`:115`) is on the request path **twice** for reads and three times for writes because of `app.ts`'s dead derive; each call is a `jwtVerify` plus `users.findById`. The `DUMMY_HASH` path (`:104`) correctly keeps the unknown-user branch as expensive as the known one. No synchronous crypto. _DDD_: `AuthResult` is D7's noun. `scopes: ['read', 'write', 'editor']` is hard-coded for password sessions (`:140`) while OIDC reads them from claims — two sources for one concept, unremarked.

**`login-throttle.ts` | 67 | Fixed-window failure limits.** _Reuse_: none. _Performance_: `prune` (`:62`) iterates the **whole** map on every `canAttempt` and every `recordFailure` — O(MAX*ENTRIES) = up to 10,000 iterations per login attempt. Under the load this exists to survive, the throttle is itself the O(n) cost. \_DDD*: "fail closed when their bounded map fills" (`:14`) is stated and implemented (`:33`, `:42`).

**`broadcast.ts` | 124 | `ProjectEvent`, `subscriptionFor`, `Broadcaster`, `withAncestors`.** _Reuse_: `subscriptionFor` (`:91`) is correctly the one spelling across three tiers. _Performance_: **`withAncestors` (`:109`) is dead in production.** Its only caller is `work-item.service.ts:3954`, inside `announceWorkItem`, whose publish branch is unreachable because every `WorkItemService` mutator is invoked only from `PlanCommandRunner.applyAll`, which always runs inside `collect()`. So the `work_items_changed` arm of `ProjectEvent` is never published. _DDD_: `:7–13` argues carefully for two event shapes ("A cell edit touches one work item and its ancestors' totals, and that is a small patch worth computing") — a rationale for a path the command bus retired and nobody deleted. **Deletion test: `withAncestors`, `announceWorkItem`, and the `work_items_changed` variant all delete together with no production behaviour change.**

**`gateway-broadcaster.ts` | 46 | Record, buffer, push.** _Reuse_: none. _Performance_: `await this.opts.push.push(...)` (`:41`) is awaited, so `publish` does not return until gw-01 answers or `PushClient` exhausts its retries. Correct for a single `announceTreeNow` outside the lock; the hazard is the callers that publish inside it. _DDD_: `:20–27`'s ordering argument is right and load-bearing.

**`push-client.ts` | 61 | HTTP push to gw-01 with backoff.** _Reuse_: none. _Performance_: `JSON.stringify(payload)` (`:40`) is inside the retry loop — a `tree_replaced` payload is re-serialised on every one of up to six attempts. Backoff 500 ms doubling to 30 s over 6 attempts ≈ 63 s worst case per push. _DDD_: `PushFailed('unreachable')` (`:59`) is an honest R5 tail.

**`replay-buffer.ts` | 68 | In-memory per-subscription ring.**

- _Reuse_: none.
- _Performance / memory shape_: `Map<subscription, BufferEntry[]>`, `maxPerSubscription: 1000`, `maxAgeMs: 5 min` (`services.ts:43,47`). Each entry holds the event **by reference**, and the dominant event is `tree_replaced` carrying the whole `NumberedWorkItem[]`. So one project edited 1,000 times inside 5 minutes retains 1,000 whole-plan snapshots. **Eviction is lazy and per-key** (`:63`): a subscription written once and never touched again keeps its entries and its map key **forever** — no global sweep, no key deletion, and `RetentionTimer` prunes the _database_ log, not this. `evict` uses `list.shift()` in a loop (`:65–66`), which is O(n) per removal and O(n²) when a burst expires at once.
- _DDD_: `covers` (`:45`) with its "evicted before the question is answered" note (`:47–51`) is a good recorded bug fix.

**`replay-orchestrator.ts` | 111 | Serves `resume` from buffer then log.** _Reuse_: none. _Performance_: `replay` (`:49`) awaits one subscription at a time; a client resuming 20 projects pays 20 serial round trips. `DEFAULT_MAX_EVENTS = 32` (`:33`) is the bound that keeps the payload sane and its reasoning (`:25–32`) is right. _DDD_: `isContiguousFrom` (`:108`) is the completeness gate, correctly the only one, with two watched proofs.

**`event-sequencer.ts` | 19 | Two pass-throughs to `EventLogRepo`.** _Reuse_: none. _Performance_: none. _DDD_: **pure pass-through.** `recordEvent` adds only `this.now()`; `latestSeq` adds nothing. **Deletion test:** `GatewayBroadcaster` could take an `EventLogRepo` and a clock directly, deleting the class and the `RecordedEvent` re-export (`:3`). The one thing it buys is the injected clock, which `EventLogRepo` could take per call as every store now takes a `WriteStamp`.

**`retention-job.ts` | 33 | Two one-line prune calls.** _Reuse_: `runRetention` (`:4`) is a pure pass-through to `repo.pruneBeyond`. `runPlanEventRetention` (`:28`) adds the day→ms arithmetic, which is real. _Performance_: none. _DDD_: `:24–27` argues why the two are separate functions; the argument is good and applies to the _second_ one only.

**`retention-timer.ts` | 139 | The schedule.** _Reuse_: none. _Performance_: sweeps are serialised and non-overlapping (`:83`), correctly. _DDD_: `isRunning` (`:97`) exists so a test can assert the _process_ started it — R5 applied to composition, and the reason is recorded.

**`outer-transaction.ts` | 18 | The three-method interface ADR 0007 names.** _Reuse_: none. _Performance_: none. _DDD_: model — an interface with no implementation in `service/`, pointing at the one file allowed to import drizzle.

**`write-lock.ts` | 27 | The promise-chain lock.** _Reuse_: none. _Performance_: **this is the process-wide serialisation point ADR 0007 accepts.** The chain never rejects (`:21–24`), correctly. Its cost is entirely determined by what callers do inside `run` — see the directory-broadcast finding. _DDD_: `{@link Write lock}` is a `CONTEXT.md`-style term that `CONTEXT.md` does not define.

**`smoke.service.ts` | 5 | `echo`.** Nothing to report.

**`service/fixtures/` | 2 JSON | `capacity-oracle-2026-08-13.json` (428 KB), `live-plan-2026-08-09.json` (6 KB).** _Reuse_: the two differential oracles ADRs 0010 and 0011 name as the arms that keep `anchor-slice` and `exact` tested rather than merely present. _Performance_: 428 KB parsed by `capacity-migration-identity.test.ts` and `priority-band-identity.test.ts` on every run of the be-01 suite — a fixed cost in the 26.6 s figure. _DDD_: `capturedFrom: "050fd45"` inside the file is the right provenance record; nothing in `LLM_README.md` points at either.

---

## Deepening candidates (this area)

### 1. Delete the dead `derive` and give every handler one identity

**Files**: `app.ts:171–173`, `middleware/authenticated.ts`, all 23 handlers in `controller/`.
**Problem**: `requestIdentity` is computed for every request — a JWT verify plus a user-row query — and read by nobody. Separately, each handler re-runs the same computation and then writes the same five-line 401 block (R5).
**Solution**: delete the `.derive`. Then replace it with an Elysia macro or a `signedIn(auth)` guard plugin that resolves the identity **once** and either short-circuits with 401 or hands the handler a non-null `user`. Handlers become `async ({ params, user }) => …`.
**Benefits**: _Locality_ — "who is asking, and may they" lives in one file instead of 23. _Leverage_ — one place to add the `read`-scope rule that today exists at two arbitrary routes. _Tests_ — the 401 case gets one test instead of 23 untested repetitions; `directory.controller.ts` drops from 69 lines to ~25.
**Deletion test on the derive**: passes — zero readers, verified by grep across `apps/` and `libs/`. **Effort**: ~0.5 day. **Risk**: low; the macro must run _after_ `openApiPlugin` so route registration is still seen. **ADR conflict**: none.

### 2. Give a batch one read of the plan

**Files**: `work-item.service.ts` (`contextFor:3995`, `holdsStep:3850`, the four `storedX`, all 44 `listByProject` sites), `plan-commands.ts:118–166`.
**Problem**: every command re-reads the whole project — rows, estimates, actuals, measures, progress, steps — to decide guards that a batch could decide once. 200 commands cost ~1,200 queries and ~400 full-project scans inside the write lock.
**Solution**: `PlanCommandRunner.execute` opens a **plan snapshot** for the batch's project before the loop — rows, steps, estimates, actuals, measures, progress, dependencies — and passes it through `collect`. `contextFor`, `holdsStep` and the four `storedX` read the snapshot; each mutator updates it in place after its write (they already know exactly what changed). The forward guards (`rolled_up`, `has_children`, `unknown_step`) become pure functions of the snapshot.
**Benefits**: _Locality_ — the guards become one pure module that can be tested with a literal snapshot instead of 12 repositories (this is the concrete form of audit item #4, and it is what makes `undo.test.ts`'s 1,891 lines shrink). _Leverage_ — the same snapshot is what `tree()` needs, so the post-commit broadcast reads it rather than re-querying. _Tests_ — the eight `setX`/`clearX` bodies become one parameterised function over `(store, key)` and lose their per-arm DB fixtures.
**Effort**: ~4 days. **Risk**: medium — the snapshot must be invalidated correctly by `duplicate`, `remove` and the restore path, and `writeNamingStep`'s FK-race translation must keep re-reading the _store_ rather than the snapshot. **ADR conflict**: none; ADR 0007's savepoint semantics are unaffected because nothing about the transaction changes.

### 3. Move the three stray broadcasts out of the lock

**Files**: `capacity.service.ts:96`, `priority-band.service.ts:84`, `directory.service.ts:662–666`, `plan-commands.ts:118–166`, `work-item.service.ts:3931–3956`.
**Problem**: `plan-commands.ts:110–117` states, with a watched proof, that the broadcast must happen after the lock is released. Three services violate it, and `DirectoryService.announce` does so once per touched project, sequentially, with `PushClient` retrying to ~63 s per push. `directory.service.ts:653–657`'s own comment asserts the opposite of what happens under ADR 0007.
**Solution**: extend `WorkItemService`'s collector idea to a **runner-owned pending-announcement set**. `CapacityService`, `PriorityBandService` and `DirectoryService` take a `Broadcaster` that, when a collector is installed, records `(projectId, eventType)` instead of publishing; the runner drains the deduplicated set after `commit()` and after `lock.run` returns. `WorkItemService.collector` becomes that shared object rather than a private field.
**Benefits**: _Locality_ — one rule about when an event leaves, in one place, instead of a rule in the runner and three exceptions to it. _Leverage_ — deduplication falls out: a batch renaming a tag used by 40 projects sends 40 events once rather than 40 events plus a `tree_replaced`. _Tests_ — the existing "lets go of the write lock before the broadcast leaves" test extends to cover directory commands, where it currently proves nothing.
**Effort**: ~1.5 days. **Risk**: low-medium — `directory.service.ts`'s "after the commit, never before" proof (`:658–660`) must keep a test; deferring publication strengthens it. **ADR conflict**: none — it makes ADR 0007's write-lock cost bounded, which the ADR asks for ("would be the first thing to revisit").

### 4. Delete the retired one-item broadcast path

**Files**: `broadcast.ts:23` (`work_items_changed`), `broadcast.ts:108–125` (`withAncestors`), `work-item.service.ts:3945–3956` (`announceWorkItem`) and its 14 call sites, `broadcast.ts:7–13` (the rationale).
**Problem**: `announceWorkItem` computes a full schedule and discards all but one ancestor chain — and its publish branch is unreachable, because every mutator runs inside `collect()`. Fourteen call sites exist only to set `collector.dirty = true`, which `announceTree` also does.
**Solution**: replace the fourteen `announceWorkItem(projectId, id)` calls with a single `this.markDirty()`; delete `announceWorkItem`, `withAncestors`, the `work_items_changed` variant, and rewrite `broadcast.ts:7–13` to say that the command bus made the tree the only shape.
**Deletion test**: passes — grep confirms `withAncestors` and `work_items_changed` have exactly one non-test reference each, in the unreachable branch. Tests that exercise `WorkItemService` directly will fail; those tests are asserting a production path that no longer exists.
**Benefits**: _Locality_ — one broadcast shape, one reason. _Leverage_ — deletes the last consumer of "compute the whole tree to send part of it". _Tests_ — removes a set of tests that assert unreachable behaviour, which is R5's "check that cannot fail" in its other form. **Effort**: ~0.5 day. **Risk**: low. **ADR conflict**: none.

### 5. One descriptor per command kind (audit §4, sharpened by what this sweep found)

**Files**: `plan-command.ts` (union + `PLAN_COMMAND_KINDS`), `plan-command-schema.ts` (`VARIANTS`), `work-item.controller.ts:564–778` (`parseKind`), `plan-commands.ts:278–659` (`applyAll`), `plan-commands.ts:49` (`DIRECTORY_KINDS`), `compensating.ts:284` (`COMMANDS`).
**Problem**: the audit counted five copies. There are **seven** lists of the write vocabulary — `DIRECTORY_KINDS` and `compensating.ts`'s `COMMANDS` are two more, neither tied to anything by a check. And the one guard that exists (`plan-command-schema.ts:297`) compares lengths, so it cannot catch `"The step (step)"`-class drift in what a variant _says_.
**Solution**: as §4 proposes — one descriptor `{ kind, schema, scope: 'plan' | 'directory', parse, apply, describe }` per kind in `libs/contracts`. `PLAN_COMMAND_KINDS`, `DIRECTORY_KINDS`, `VARIANTS`, the parser switch and the dispatch switch all derive from the registry. `compensating.ts`'s `COMMANDS` stays separate — it is a _different_ vocabulary (17 compensating kinds vs 36 command kinds) and merging them would be the mistake.
**Benefits**: _Locality_ — a new command is one file. _Leverage_ — the five directory triples collapse into a parameterised descriptor factory (`namedEntity('Tag', store)`), which is R2's ~450 LOC. _Tests_ — a registry can be property-tested for round-trip (`parse(describe(kind))`), which no current copy can be.
**Effort**: ~5 days (as §4 estimates). **Risk**: low — verify Elysia 1.4's Standard Schema JSON-Schema export before committing to it. **ADR conflict**: none.

### 6. Fix the two real algorithmic hot spots in the engine

**Files**: `schedule.ts:729–735` (`eventAt`), `schedule.ts:377–409` (`topological`), `schedule.ts:2130–2212` (`projectOntoWorkItems`), `work-item.service.ts:1531`.
**Problem**: `pool.events.splice()` makes profile construction O(E²) per pool — the instrumented `eventsVisited` bound measures the scan and is blind to this. `topological`'s `ready.shift()` is O(V²) on the `canDepend` path, which `applyRestore` runs once per external edge. `projectOntoWorkItems` is O(parents × leaves) with 5 separate array builds per parent and spread-argument `Math.min`. `dependsOn` at `work-item.service.ts:1531` is a plain O(n²) nested scan.
**Solution**: `dependsOn` — reuse the `Set` of row ids already built at `:1302` (5-minute fix, do it first). `topological` — head index instead of `shift()`. `eventAt` — accumulate events into a `Map<at, PoolEvent>` and sort once per pool at first search, or keep the sorted array but batch inserts. `projectOntoWorkItems` — one pass per parent computing all six aggregates in a single reduce; replace spread with a loop.
**Benefits**: _Locality_ — none gained; this is pure cost removal. _Leverage_ — `schedule()` runs twice per batch and once per read, so it compounds. _Tests_ — `schedule-identity.test.ts`'s thousand-seed differential and the two captured oracles are exactly the harness that proves a rewrite here changed no number; that is why this is safe to do at all.
**Effort**: ~1.5 days. **Risk**: low for `dependsOn` and `topological`; medium for `eventAt`, where the aggregation-by-timestamp invariant (`:605–621`, watched proof) must survive. **ADR conflict**: none, but the identity differentials named in ADRs 0010 and 0011 are the gate.

### 7. Collapse the seven `stampFor` methods and the clock/id injection

**Files**: the seven `private stampFor` sites, the nine `this.now = opts.now ?? …` and six `this.newId = opts.newId ?? …` lines.
**Problem**: ADR 0012 landed after the audit and added a new R4-class cluster: one three-line method copied into every service, over an identical `now`/`newId` injection idiom.
**Solution**: a tiny `Acting` base or, better, a `clock: Clock` collaborator with `stampFor(actorId)` on it, constructed once in `services.ts` and injected. Services stop owning a clock; they own an actor.
**Benefits**: _Locality_ — "one act carries one instant" becomes a property of one object rather than seven copies of a comment saying so. _Leverage_ — a new service cannot get it wrong. _Tests_ — one fake clock instead of nine `now` options threaded through fixtures.
**Deletion test on `event-sequencer.ts`**, adjacent: it exists only to inject a clock into two `EventLogRepo` calls; with a shared clock it deletes.
**Effort**: ~0.5 day. **Risk**: low. **ADR conflict**: **check against ADR 0012.** The ADR's whole argument is that the stamp is a _parameter_ found by `tsc` at 67 write sites, not ambient context. A shared clock object does not weaken that — the stamp is still an argument to every store method — but the ADR should get a consequence line saying so, or the change reads as re-litigating it.

### 8. Rename the two files that are not controllers, and fix the two stale doc-strings

**Files**: `capacity.controller.ts` → `capacity-body.ts` (or fold into `plan-command-parsers.ts`), `priority-band.controller.ts` → `priority-ladder-body.ts`, `app.ts:181–192`, `history.controller.ts:49`, `hand-parsed-body.ts:13`, `plan-command-schema.ts:19`.
**Problem**: two files named `.controller.ts` that register no route; three comments describing a route table that no longer exists; one MCP-facing description reading "The step (step)".
**Solution**: rename, delete the orphan comments, correct `hand-parsed-body.ts`'s "eight routes" to the two batch routes (the correction is already written in `openapi-document.test.ts:107–113` and can be moved), fix the parenthetical.
**Benefits**: _Locality_ — an agent grepping `*.controller.ts` gets the route table. _Leverage_ — R2: the name carries the domain. _Tests_ — none needed; `openapi-document.test.ts` already guards the route table.
**Effort**: ~1 hour. **Risk**: none. **ADR conflict**: none. This is the cheapest item in the list and the one an agent is most likely to be misled by.

---

## Agentic-workflow notes

What makes this directory expensive for an LLM to edit safely, with evidence:

- **The read set for one change is unbounded by any index.** Adding a command kind requires editing seven places (`plan-command.ts` ×2, `plan-command-schema.ts`, `work-item.controller.ts:564`, `plan-commands.ts:278`, and possibly `plan-commands.ts:49` and `compensating.ts:284`), spanning ~1,700 LOC, none of which links to the others. The only enforcement is a length comparison (`plan-command-schema.ts:297`). An agent that adds a kind and forgets `DIRECTORY_KINDS` produces a directory command that refuses `project_required` in a plan batch — and nothing reddens.

- **Comment-to-code ratio inverts the usual reading cost.** `work-item.service.ts` is 4,007 lines of which ~2,400 are JSDoc; `directory-usage.ts` is 387 lines of which ~230 are. This is R3 working exactly as intended and it is genuinely the best documentation in the repo (audit C7) — but it means an agent loading `work-item.service.ts` to change one guard loads ~130 k tokens, and the _executable_ content of the eight `setX`/`clearX` pairs it needs to keep consistent is ~90 lines spread over 420.

- **Three comments in scope assert things that are no longer true**, and each is the kind an agent will trust: `app.ts:181–192` (controllers that are not registered), `hand-parsed-body.ts:13` ("eight routes" — zero of which exist), `directory.service.ts:653–657` ("cannot be nested inside the write's" — under ADR 0007 it always is, for every directory command in a batch). An agent following the third comment's reasoning will conclude the current broadcast placement is correct.

- **The doctrine is stated in one file and violated in three.** `plan-commands.ts:110–117` states the lock/broadcast rule with a watched proof; `capacity.service.ts:96`, `priority-band.service.ts:84` and `directory.service.ts:664` break it. An agent reading either side alone gets a consistent, wrong picture.

- **Deletion tests are hard to run by inspection because the call graph funnels through one runner.** `withAncestors`, `announceWorkItem` and `work_items_changed` all _look_ live — they have callers, and those callers have tests — and are unreachable in production only because `PlanCommandRunner` is the sole entry and always installs a collector. Establishing that took four greps. Any similar "is this reachable" question in `work-item.service.ts` costs the same.

- **Two predicates for one rule, drifted, with no test that compares them**: `step.service.ts:212` vs `repository/step.ts:373`. An agent asked to "add measures to the step-removal warning" will find one of the two and believe it is done.

- **The engine is the safest thing here to change and reads as the most dangerous.** `schedule.ts` has a thousand-seed differential, two captured oracles, and ~60 watched-negative proofs written into its JSDoc, so a performance rewrite is verifiable in one command. `work-item.service.ts` has none of that at the seams that matter — `undo.test.ts` wires 12 real repositories to test one revision rule — so the file that is cheapest to _reason_ about is the one an agent will avoid, and the file that is riskiest is the one it will edit.

- **Naming pressure is real and mostly won.** The R2 ban list holds inside function bodies throughout; `CONTEXT.md`'s scheduling vocabulary appears as types in `schedule.ts`; the one systematic violation is D7's outcome contract (`result`, `BatchResult`, `ItemState`, `AuthResult`), which is load-bearing in nine types and cannot be renamed without touching every service and controller at once — which is why it has not been.
