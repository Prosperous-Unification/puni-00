# Model child reporter format

Hosted CI `40084491151` at checkpoint `78c92f21` completed with the checks,
backend, frontend, workspace and all eight browser shards passing. Twilight
failed on the separately corrected fixture/test classification overlap. Remote
completed in 68m27s with 3,322 passing tests, two declared real-Docker skips and
two failures. The earlier Init UID/network/CLI failures are absent from this
run; this is not a complete green gate.

The retained raw remote artifact shows all sixteen named model child cases
passing in order. The parent then refused their colored checkmark-prefixed
labels because its exact case-name parser expects plain `(pass)` lines. Actual
Bun 1.4.4 controls with and without `GITHUB_ACTIONS` reproduce the format change
when `FORCE_COLOR=1`; setting `FORCE_COLOR=0` retains the exact plain labels in
both cases. The parent's failure remains a failed run, rather than being
reclassified as a passing whole suite.

`runModelChild` now retains the supplied or inherited environment and fixes
only its reporter format with `FORCE_COLOR=0`. Its exact ordered case list,
footer, child exit/signal, output limit, watchdog and production observer
behavior are unchanged. A new actual tiny Bun child deliberately receives
inherited CI colors through the same helper and verifies its exact plain case
name and successful termination. Before the fix, this test failed on the
actual ANSI output. Independent Astra GREEN/RED/GREEN replay removed only the
format override, observed the same assertion failure, then restored it.

Root validation passed seven focused controls with 24 assertions in 117ms
under inherited `FORCE_COLOR=1` and `GITHUB_ACTIONS=true`. Independent official
Bun 1.4.4 replay passed the same seven controls with 24 assertions in 123ms.
Configured uncached tool lint/typecheck actually executed and passed in 21.9s;
normal commit hooks also run. The roughly seventeen-minute full model parent
was filtered from these focused commands; its next complete hosted result is
still required.

The reviewer's initial sandbox run could not exercise the existing oversized
output control: its child hit EPERM before writing the intended payload.
Repeating without the format fix produced the same refusal. Both transcripts
are retained privately. The authorized local-only replay outside that sandbox
exercised and passed the unchanged output bound and owned-child join. No
fixture or production guard was relaxed.

The second remote failure remains an unattributed unnamed hook timeout after
10.669s. A separate actual Bun control proves that a global `afterAll` can be
reported with that same beforeEach/afterEach message after the final file.
This identifies the diagnostic ambiguity; it does not prove the CI hook or
filesystem cause. Cleanup tracing and a fresh hosted observation are pending;
no global or per-case timeout is increased by this repair.

Native acceptance, the final canonical exact-SHA host gate, full green CI,
complete restoration and authorized activation/deployment remain open.
