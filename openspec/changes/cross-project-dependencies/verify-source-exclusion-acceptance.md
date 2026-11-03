# Bounded source/solver composition runner source

Intent: exercise the unchanged `excludeSourceAndManagedDependencies` coordinator
against invocation-owned physical namespaces, after source review and a separately
authorized exact-SHA invocation. This source packet performs no host operations.
It grants no activation, restoration, installed adoption or application semantics.

## Fixture authority

`test/source-exclusion.ts` reuses the solver runner's existing guarded unit,
installed tuple, process/cgroup observation, during-stop child creation and bounded
cleanup through one optional callback. It does not fork those transports. The
solver children now have real private `/attempts` tmpfs mounts and the same fresh
UUID ownership label used by every other container in the integrated fixture.

The shared transport freshly lists **all** invocation-labelled containers before
all observations/effects, obtains each native full inspection, checks full ID,
planned name, label, immutable image and private bind coordinates, and rejects any
unplanned labelled child. The managed/source audit receives the complete fixture
inventory. Solver role discovery retains its production selection only after the
whole fixture universe was validated. Native per-container output remains under
the existing 64 KiB subprocess bound; no static ID list replaces the census.

Only the exact unique source name → `wbs-dev-src`, unique source tag →
`wbs-dev-src:1`, unique runtime bind → `/run/user/1000/wbs-solver` and unique Caddy
name → `wbs-caddy-1` are translated. Existing strict solver unit/tuple/cgroup
translation is reused. Actual IDs, immutable image inspections, inherited source
entrypoint, `bun run dev`, UID, effective argv, security, mount flags, lifecycle and
restart observations survive. Source binds the scratch source/data directories;
this is a namespace proof using the supported command, not an actual app proof.

The initialized backend fixture writes SQLite before exclusion. The initialized
gateway is a mount-free runtime fixture; it has no persistent database authority.
The coordinator uses real streaming scanners and requires DONE/REAPED receipts.
A running initialized Caddy serves both sites before the coordinator and both
maintenance responses inside the awaited callback. The source parent and real
child write repeatedly before stop; terminal PID-zero, restart inhibition and
unchanged writes are observed afterward. The callback checks exact raw-reference
source recognition against its complete inventory and source-token expiry after
final readbacks. A real mutable-tag substitution must fail before source stop;
a planned stopped unrelated mounted child must fail ordinary namespace admission.

Every Docker mutation and cleanup rechecks the fresh UUID label, planned name and
captured full ID. Both distinct prod/dev networks are owned and checked before container creation;
Caddy genuinely attaches both. Network cleanup checks each captured ID/label/name; only the
invocation-created source tag is ever created/removed. No production tag, root,
runtime directory or installed service is targeted. Component cleanup has a
separate 60-second budget, followed by the solver lifecycle's 45-second cleanup
budget. The external receipt is exclusively created private; raw Docker JSON and
credential-bearing parser excerpts are not retained. It records hashes/mappings.

## Local source verification

The transport tests were written before implementation and failed against the
explicit missing-implementation seam, then passed. The configured runner tests
include the new transport suite. Independent injected faults in owner-label,
image pin, private mount root, captured full identity, private parser and unplanned
writer handling each failed their named transport test; adjacent `Proof:` comments
and `evidence/source-exclusion-acceptance/omit-*.log` identify the observations.

Focused tests, lint, explicit test typecheck, build and focused OpenSpec validation
are recorded below after their final invocation. The canonical host gate, actual
Docker/systemd acceptance and CI are not run by this source packet. Full local
suite attempts were cancelled at the parent's request to reserve the full suite
for the integrated P1/terminal/source packet; the restricted run also encountered
Unix-socket EPERM. Neither incomplete attempt supplies passing evidence.

## Execution inputs and unproved scope

The opt-in Nx target is `tool-remote-scripts:test:source-exclusion`. Execution
requires `SOURCE_EXCLUSION_SHA` matching clean committed HEAD, an external private
`SOURCE_EXCLUSION_RECEIPT`, and independently selected already-installed immutable
pins in `SOURCE_EXCLUSION_SOURCE_IMAGE`, `SOURCE_EXCLUSION_BACKEND_IMAGE`,
`SOURCE_EXCLUSION_GATEWAY_IMAGE`, `SOURCE_EXCLUSION_CADDY_IMAGE` and
`SOURCE_EXCLUSION_SOLVER_IMAGE`. The backend/gateway pins use their actual
`wbs-be-01`/`wbs-gw-01` repositories. The gateway substitution image must resolve to
an immutable ID different from the source image. No image is built or pulled.

The bounded physical fixture is an alternative to a disposable VM for this
namespace proof. A global host census, installed authority adoption, literal
production-path execution, source application semantics and absence of live
writers remain unproved. X5b, D5b, S1/S2/O4, parent 10.2, activation and compatible
restoration remain open. Root must merge the reviewed P1 policy and typed terminal
refusal corrections before independent final runner review and exact-SHA execution.

Final source checks: focused runner suites passed **25 tests, zero failures,
86 assertions** with sandbox pipe/socket restrictions removed (269 ms), including
12 new transport cases. Uncached Nx lint passed (10.9 s); explicit
`tsc --project tools/tool-remote-scripts/tsconfig.spec.json --noEmit` passed;
uncached Nx build passed all four production bundles and three dependency tasks.
Normal focused OpenSpec validation passed one change. `--strict` instead reports
19 existing long-requirement warnings as failures; no spec text was changed in
this packet. Restricted Bun 1.4.4 initially returned EPERM from child pipe writes,
so its two inherited bounded-command failures supply no passing evidence.

Final parent-pinned Bun 1.4.2 rerun: **28 tests passed, zero failures, 92 assertions** across the three configured runner suites; explicit test typecheck passed. The additional preflight negatives reject option-like image pins and production receipt/temp roots before any fixture effects; each independently omitted preflight check failed its named negative. This supersedes the earlier 25-test focused count.

## Independent physical runner review corrections

Astra found three deterministic source-only runner failures before execution: the
shared prod/dev network looked like transitional dev backends, the stopped gateway
retained a writable production DB bind, and a second native `ps` could narrow a
complete fixture census to a subset. The source transport tests alone had not
exercised the first two actual runner topology decisions.

The actual runner now uses one shared renderer for distinct physical prod/dev
networks and managed container arguments. Production-path tests materialize that
rendered topology, enter `withSourceDevExcluded` under a real joint owner, recognize
the source against the complete inventory, parse the actual managed backend cohort
and execute strict owner-backed unmanaged mount audit. A second test subjects the
rendered stopped gateway directly to ordinary unmanaged audit. Both failed first
with the reviewer’s exact transitional/DB-family errors, then passed. Source lives
only on dev, managed participants only on prod; Caddy genuinely joins both. Only
BE binds/writes the persistent SQLite fixture; GW remains initialized and mount-free.
No production exemption or audit rule changed.

Complete fixture `ps` now exposes the validated census keys directly. Only the
exact full-census and two solver-discovery argv forms are accepted; solver-only
queries remain validated subsets of that complete census. The actual unrelated
negative first finds its exact raw ID/name in a fresh complete transport inventory,
then invokes ordinary admission on that object. The source-tag absence lookup uses
an exact reference filter. Every transport member additionally matches the full ID
recorded by creation or reviewed recovery, including replacement before the first
census; first observation is no longer an identity authority.

Fresh independent omissions restore shared networks, restore the gateway DB bind,
allow a second-list census subset, bypass discovery grammar and bypass captured-ID
binding. Each fails its named production-path test. These receipts live under
`evidence/source-exclusion-acceptance/review-fixes/`. Earlier full-ID proof receipts
remain historical; the creation/recovery binding is the current stronger guard.
No actual host runner has executed. Reviewed P1/typed-terminal integration and
independent final runner review still precede any exact-SHA execution.

Final review-fix checks with parent-pinned Bun 1.4.2: **37 tests passed, zero
failures, 117 assertions** across the transport, rendered topology, existing solver
fixtures and configured-target contract (471 ms). Both new source suites are in
the standard local test command; independently removing each suite failed the
configured-target contract, while actual host execution remains opt-in. Explicit
test typecheck, uncached Nx lint/build and normal focused OpenSpec validation
passed. Ten earlier transport/preflight fault receipts remain historical; the
seven review-fix receipts cover the stronger current topology/census/identity and
configured-target boundaries. Normal hooks are required on the fix commit.
