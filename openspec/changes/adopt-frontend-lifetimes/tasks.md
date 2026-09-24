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
      Partly moved by 050-7-f1: `lib/theme.ts` reads through
      `useApplicationServicesState()`, degrading visibly — never throwing — when
      withdrawn, per the delivery-degradation requirement this change now carries.
      The other four moved by 050-7-f2, observed 2026-09-24:
      `project-settings-modal.tsx` and `project-page.tsx` resolve the runtime at the
      instant of each access through `useApplicationServicesReader()`;
      `gantt-detail.ts` follows `useApplicationServicesState()` as `useTheme` does;
      and `lib/remembered.ts` resolves the runtime's `preferences` from the slot at
      every call, so `remembered-layout.ts`'s module-scope `storedMermaidSectionMode`
      holds no store. `modules/preferences/composition.ts` and its two tests are
      deleted. This box stays unchecked for the one outcome still owed: the module's
      wiki index (`apps/wbs/fe-01/src/modules/preferences/README.md` says it carries
      no `module-index` block yet, and that adopting one is its own packet).
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
- [x] 6. The session runtime is keyed by user id and installs the directory
      module; the router instance and address survive a same-session update.
      Closed by 050-7-i, observed <observed-date-i>: `createSessionOwner`
      (`apps/wbs/fe-01/src/runtime/session-runtime.ts`) keys one DI Bag session
      runtime by the user id, the credential only building the directory's
      client; the runtime installs the sealed `frontend.directory-management`
      module and owns the session's project owner, retiring it first.
      `SignedInApp` in `app.tsx` owns it, and a same-user identity replaces
      nothing, so the router instance, the address and a mounted route's state
      survive. The catalog and the header token still reach `ProjectPage`: the
      catalog facade is the lifetime map's prerequisite, and refusing a token
      in delivery is task 13's.
- [x] 7. Log out is a coordinated local exit: no request, project then session
      retirement, and the fatal state when either fails.
      Closed by 050-7-k, observed <observed-date-k>: the account menu's Log out is
      `SessionOwner.exit` (`apps/wbs/fe-01/src/runtime/session-runtime.ts`),
      which is the owner's one `leave()` — the session and its project withdrawn
      in one instant, the project retired and then the session, each under the
      retirement budget — and sends no request and revokes nothing, so a reload
      restores the identity. `SignedInApp` in `app.tsx` hands the signed-out
      state up only when both let go, and otherwise draws the sanitized fatal
      state: a socket that refuses, or never closes within the budget. A project
      that cannot be given back after its page has gone is drawn in the signed-in
      region's place too. The failure is drawn, not logged; page hide's own
      session retirement is still not observed by anybody, which no open task
      owns.
- [x] 8. The project prerequisites: plan snapshot, connection, roster and busy
      state move into project-owned stores, and the command register and refusal
      publication move behind narrow ports.
      Closed by 050-7-g, observed 2026-09-24: the plan snapshot and the
      connection are `modules/plan-feed/delivered-plan-store.ts`, the roster is
      `presence-store.ts` beside it, and busy is
      `modules/plan-writer/busy-store.ts`; a command issued and a refusal are
      `modules/channel.ts` channels the table listens to. `PlanFeedForReader` and
      `PlanWriterHost` take those stores and ports and no React setter, ref or
      toast function, and the table and the page select from the stores. Each is
      still built by the mount that owned the state it replaced — the table's for
      the delivered plan, busy and the channels, the page's for presence, which is
      therefore not reset by a project switch, exactly as before — until task 10's
      project runtime builds them; the feed's owner reads and the broad
      `ProjectApi` are tasks 9 and 10's.
- [x] 9. The broad project API moves behind the plan and command modules' private
      repository ports.
      Closed by 050-7-h, observed 2026-09-24: each plan module is handed only
      its own port, cut from the page's one client by the project composition root
      `apps/wbs/fe-01/src/modules/project/composition.ts` — the plan feed
      `PlanReadRoutes` (`src/lib/plan-refresh.ts`), the calendar markers
      `CalendarMarkerRoutes`, and the new `modules/plan-commands` module
      `PlanCommandRoutes`. The table receives `ProjectServices`, which builds the
      feed, the marker gestures and the project-bound `PlanCommands`, and its hooks,
      toolbar and columns receive `PlanCommands`; none of them sees `ProjectApi`.
      The page keeps the client for the project catalog and the archival import,
      which are not plan modules. When each service is opened and closed, and the
      feed's owner reads, stay task 10's.
- [ ] 10. The project runtime owns feed, writer, markers and saved plans for one
      selected project, replacing the per-effect ownership under `WbsTable`.
      Moved by 050-7-j, observed 2026-09-24: one DI Bag project runtime
      (`apps/wbs/fe-01/src/runtime/project-runtime.ts`) owns the selected
      project's delivered plan, busy, presence, refusal and command-issued
      channels, feed, marker gestures, writer and commands, and one project owner
      in `ProjectPage` opens it per selected project, withdraws it the instant the
      selection moves or the page goes, and retires it once; the table receives
      `ProjectRuntime` and opens and closes nothing. Presence is now reset by a
      project switch. This box stays unchecked for the one outcome still owed:
      saved plans, whose shelf keeps its own keyed watch and has no feature facade
      yet — the lifetime map's saved-plans prerequisite.
- [x] 11. Project switch, route unmount and Strict Mode re-entry each replace all
      project ownership; a stale completion changes nothing.
      Closed by 050-7-m, observed <observed-date-m>: a switch withdraws the old
      runtime in the page's own effect, and the page draws no table and hands the
      header nobody until the next is live, so every runtime is drawn in a table of
      its own and the table carries no key; an undo answered in a project the reader
      has left says nothing into the page's toasts, which outlive the table
      (`components/wbs/project-replacement.test.tsx`). Following the directory link
      gives the project back once through the page's cleanup and keeps the session;
      a project that cannot be given back there is drawn as the fatal state in the
      region's place; Strict Mode's re-entry into the region leaves the session it
      first asked for, and into the page opens nothing, the page mounting with
      nothing selected (`app.test.tsx`). The writer's and the marker gestures'
      second reader predicate is gone: the refresh owner's identity, `null` from
      the withdrawal on, answers everything it did.
- [ ] 12. Each module has its own isolated type check and its graph check, and every
      module directory carries a validated wiki index and a `contract.ts`. The
      preferences module's public `preferences` resource — kept only for
      `src/lib/remembered.ts`'s per-project layout stores — moves behind a feature of
      its own or is recorded as accepted debt with its one caller named. Existing
      trusted pilot mappings are preserved untouched.
- [ ] 13. No infrastructure escapes a context: the architecture checks refuse a
      bag, credential, broad client, repository or resource in delivery.
