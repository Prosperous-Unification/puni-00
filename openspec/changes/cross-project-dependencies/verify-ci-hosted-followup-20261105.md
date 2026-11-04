# Hosted CI follow-up — 2026-11-05

Run41920289646 at c2132fbc2 (synthetic checkout de12e64a30d149daa15ae29d2ae1c23bba753fb4)
completed its source and workspace jobs with failures. Downloaded artifacts are
retained privately in `tmp/puni-delivery-evidence/20261105/hosted-ci-observations/`.
These observations are not current-head CI success or native acceptance.

## SQLite fixtures

The workspace artifact reported four SQLite failures. Three race cases claimed
all workflow steps and encountered `prerequisites_unmet` before resource
arbitration; the fourth upgrade fixture expected only four pending migrations
against its obsolete100-migration main pin, although capture correctly included
three newer main migrations.

The same two complete owning test files reproduced all four failures locally.
Race fixtures now select each project's checked first step and carry its stable
ID into the worker request. Both arrival orders, separate SQLite connections,
10GB claims competing for16GB, exactly-one-winner and retained occupancy checks
are unchanged. The upgrade fixture pins main645, with103 baseline migrations and
107 after the four private additions. Exact private identities, complete hashes,
ledger, schema, values and rollback assertions remain. Astra accepted both bounded
fixture corrections. No production guard or migration SQL changed.

The restored two-file run passed four tests, zero failures,683 assertions.
Configured forced uncached SQLite adapter typecheck and scoped three-file ESLint
passed. Raw commands, environments, source hashes and before/after streams live under
`tmp/puni-delivery-evidence/20261105/sqlite-ci-followup/`. The new missing-first-step
check validates fixture integrity; no independent production-guard negative is
claimed for it. Existing occupancy necessity proofs keep their historical scope.

## Real Vite producer

The source artifact reported151 passed and one failed. Both HTTP requests returned
complete responses and no primary failure was present. During `server.close()`,
watcher, WebSocket, SSR and HTTP close observations completed, while client
environment close stayed pending. Node exited13 for unsettled top-level await.
Frontend document/entry inspectors were not reached. The inner pending promise
is not identified by that telemetry.

Astra approved a bounded candidate ordering correction: await Vite's public
request-idle boundary after response/package checks and before successful shutdown,
inside the existing try/finally. Installed Vite source says that boundary waits
for static-import processing, while environment close first cancels its crawl
observer. This is a testable lifecycle hypothesis, not an established cure.
The exact two-request audit,90-second outer bound and all close/watcher/HTTP/custody
assertions must remain. Local qualification is limited to inert ordering/refusal
checks; no actual Vite or closed Source4/UC2 recipe is replayed locally. Hosted
producer acceptance is required before calling the lifecycle issue fixed.

The candidate adds only that awaited public call to the generated program. Its
inert tests parse the actual package/idle tail, catch/finally and terminal failure
statement; mocked package observations and a fake server perform no HTTP or Vite
execution. A held idle promise blocks close; rejecting it preserves the same Error
identity and still executes cleanup. Settlement handlers attach immediately and
each test releases/joins its subject in finally. Removing only the await failed
both current tests on premature close; exact program restoration passed both
with12 assertions. Strict lint refinement preserves this proof, using a typed
settlement helper, checked constructor reflection and explicitly fulfilled fake
Promise APIs. Configured forced uncached remote typecheck and two-file ESLint with
a populated graph passed. Astra accepted the source and proof scope. This does not
identify the original inner pending promise or prove a real Vite cure.
Current raw proof lives in
`tmp/puni-delivery-evidence/20261105/vite-idle-candidate/final/`.

## Final local batch

After final formatting, one controlled ordinary Bun invocation selected the two
SQLite files and the inert producer file together: six tests passed, zero failed,
695 assertions. This batch performs ordinary temporary SQLite work and inert
producer control flow, not a real Vite or closed native diagnostic. Required
current-head hosted acceptance remains separate.

## Source completion audit

Independent bounded audits found no concrete missing implementation in abbreviation
grammar/allocation, dotted addresses, alphabetic-only discovery, mounted desktop/
phone selection, stable rename/navigation, access confinement, connected optimization,
question identity, retry suppression, import revalidation and immutable saved history.
Their owning tests are present, but this source review does not substitute for fresh
current-head execution. No unchecked parent task was marked complete from an audit.

Full current-head CI, exact-SHA h2 gate, native/activation qualification, architectural
adoption and deployment remain open. The earlier native-test ownership implementation
approval question is unchanged by these ordinary fixture corrections.
