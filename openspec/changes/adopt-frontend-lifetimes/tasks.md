# Tasks

- [x] 1. The lifetime slot owns one runtime as a serialized state machine: withdrawal
      is synchronous, the request's generation is rechecked after every await, a
      superseded request acquires nothing, a construction that fails releases what it
      acquired, and a failed or timed-out disposal refuses replacement and is terminal.
      Proves: the named example tests, plus a `fast-check` scheduler property over
      generated interleavings. Negatives: each fence removed; the upstream
      report-and-continue policy; the retained late-cleanup promise dropped.
- [x] 2. The preferences module is a sealed, labelled DI Bag module whose browser store
      is private, installed by one transactional installer: it retains the bag before
      resolving and releases partial acquisitions on failure. Proves: the module label
      names the private binding; the installed surface carries neither the store nor the
      bag; the installer's close really is the bag's close. Negatives: the label removed;
      a registered cycle; the bag leaked into the returned surface; the close delegation
      replaced by a resolved no-op.
- [ ] 3. The page's application lifetime is opened through the slot at module load and
      delivery reads its preferences out of that one graph, with the module's wiki index
      declaring `module.frontend.preferences` and its files.
- [x] 4. The application bootstrap owns the React root: it builds the runtime before
      `createRoot`, publishes `RememberedPreferences` — the feature facade only, never
      the `Preferences` resource — through one context, and renders the sanitized fatal
      state when the slot is fatal, terminal or not.
      Follow-up for 050-7-d: once withdrawal is accepted, reads and writes through the
      withdrawn runtime's facade must refuse, and a validator that retires the runtime
      from inside `isValid` must not still have its return value trusted. These are
      required outcomes; this task mandates no mechanism.
      Closed by 050-7-d's part 1 (`preferences.resource.ts`'s `ensureLive`, fed by a
      synchronous `isLive` predicate over the existing `LifetimeSlot.snapshot()`; no
      change to `lifetime-slot.ts`) — see
      `docs/superpowers/plans/2026-09-21-batch-6/050-7-d-withdrawal-and-page-lifecycle.md`.
- [x] 5. Page hide and persisted restoration join one application retirement;
      restoration rebuilds only after it succeeds; a development edit that reaches
      the bootstrap is a document replacement that retires through page hide.
      Page hide and persisted restoration are closed by 050-7-e: `pagehide`
      retires the runtime through the slot and invalidates the mounted React
      root; a persisted `pageshow` rebuilds through the same path, joining
      whatever retirement is already pending with no bookkeeping of its own
      (the slot's own serialization is the join); a retirement that rejects
      or times out leaves the sanitized fatal page showing, redrawn without a
      second report across a hide-and-restore of an already-fatal page. Hot-
      reload disposal was 050-7-e's own explicit non-goal after three review
      rounds each found a further HMR ownership race — see
      `docs/superpowers/plans/2026-09-21-batch-6/050-7-e-page-lifecycle.md`,
      sections 1 and 11. It is closed by amendment (Dany, 2026-09-23): an
      edit that reaches the bootstrap is a document replacement, whose
      retirement page hide starts before its dispatch returns and nobody
      awaits, and a gated in-document replacement is not provided — the
      requirement "A document replacement starts retirement and promises
      nothing after it", landed by
      `docs/superpowers/plans/2026-09-21-batch-6/050-7-e2a-hmr-amendment.md`.
      The held record
      `docs/superpowers/plans/2026-09-21-batch-6/050-7-e2-hmr-ownership.md`
      keeps the races any gated mechanism must answer. A bounded Chromium application-lifecycle case exists
      (`e2e/lifetime-bfcache-probe.ts`, `lifetime-bfcache.spec.ts`) and was
      run through the real `wbs-fe-01:e2e` Nx target, `CI=1`, a checked-free
      port shift: one test, passing (section 4.7 has the exact command and
      output).
- [ ] 6. The session runtime is keyed by user id and installs the directory
      module; the router instance and address survive a same-session update.
- [ ] 7. Log out is a coordinated local exit: no request, project then session
      retirement, and the fatal state when either fails.
- [ ] 8. The project prerequisites: plan snapshot, connection, roster and busy
      state move into project-owned stores, and the command register and refusal
      publication move behind narrow ports.
- [ ] 9. The broad project API moves behind the plan and command modules' private
      repository ports.
- [ ] 10. The project runtime owns feed, writer, markers and saved plans for one
      selected project, replacing the per-effect ownership under `WbsTable`.
- [ ] 11. Project switch, route unmount and Strict Mode re-entry each replace all
      project ownership; a stale completion changes nothing.
- [ ] 12. Each module has its own isolated type check and its graph check, and every
      module directory carries a validated wiki index and a `contract.ts`. The
      preferences module's public `preferences` resource — kept only for
      `src/lib/remembered.ts`'s per-project layout stores — moves behind a feature of
      its own or is recorded as accepted debt with its one caller named. Existing
      trusted pilot mappings are preserved untouched.
- [ ] 13. No infrastructure escapes a context: the architecture checks refuse a
      bag, credential, broad client, repository or resource in delivery.
