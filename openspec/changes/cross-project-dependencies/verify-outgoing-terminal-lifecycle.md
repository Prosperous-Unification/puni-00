# Captured outgoing-boundary terminal lifecycle

Base: `10a7d21e8738c30d3d79a3e17d529e2459ff6f17`. This bounded test-only
packet closes the outgoing-successor lifecycle integration proof identified by
the task 7.4 audit. Parent 7.4, release, native acceptance and architectural main
merge remain open. Production changes are three adjacent `Proof:` comment lines;
removing them reconstructs the base repository source exactly.

## Genuine capture and mounted lifecycle

The existing SQLite fixture stores isolated A/C/B projects with independent
capacity-one pools and canonical ranks. Authored A duration0.2, B duration1 and
C's independent short duration1.2 force C's long successor to start1.2. Actual
installed capture observes A.finish `0.19999999999999998`, B.finish1.2 and
C.long.start1.2. The test retains the observed arithmetic without padding pins,
changing tolerances or replacing captured stages.

Both actual prepared Q1 objectives have quantum48 and contradictory lower10 >
upper9. Mounted tree admission produces two real terminal certificates and no
children, with empty queue/slots and the valid Fast placement retained. Initial
terminal/fanout event types and ordering are asserted. Complete certificate rows
are compared across subsequent phases.

The actual services and source close, and newly composed services reopen the same
database. Repeated mounted reads and same-question Retry409 retain the terminal
state without launches or logical persisted-row changes. The independent fixture
SQLite observer remains open: this proves service/source recompose, not an OS
process restart or closure of every database connection.

A mounted `setEstimate` command changes C.short to1.25. Genuine Q2 capture changes
its canonical hash, retains authored relationships and upstream A, and produces
lower10 <= upper12. Exactly two expected raw-child requests are admitted after
all source reads close. Their encoded responses pass real parsing, validation and
durable publication; both objectives become ready with baseline placement. C.long
stays1.25..2.25. Q1 certificate rows remain equal, queue/slots settle empty, and
repeated reads allocate nothing.

A second real command returns C.short to1.2. Capture recovers exact Q1 canonical
bytes while the installed generation remains Q2 generation2. Retry returns the
retained terminal409 before generation matching; logical store, generation and
launch count remain unchanged.

`wholeStore` enumerates every SQLite table and canonicalizes rows. These are full
logical-state comparisons, not claims about physical database/WAL bytes. Synthetic
auth/command access, fixture dependency authority and the raw solver transport
remain explicit limits. No actual Python/native execution or production activation
was performed.

## Watched omission

In a separate copy with its own frozen modules, remove only the
`retained?.outcome.kind === 'boundary-infeasible'` early-return block in
`retryPreflightIn`, immediately before `readGeneration`. Leave the retained lookup,
generation matching and other admission/publication guards installed.

```sh
bun test apps/wbs/be-01/src/services-connected-publication.db.test.ts \
  --timeout=15000 -t 'mounted outgoing terminal'
```

The frozen fault exited1: **0 pass, 1 fail, 84 assertions**, 4.62s. At the final
Q1-after-Q2 Retry, HTTP409, full logical store/generation equality and the two
historical launches all passed; the exact decision failed because its state was
`idle` instead of `boundary-infeasible`. This proves retained terminal
classification, not unsafe launch. Restoring source byte-exactly passed
**1 test, 91 assertions**, 4.66s.

Frozen receipts: `/tmp/puni-task74-retained-retry-fault-frozen.{log,json}` and
`/tmp/puni-task74-retained-retry-restored-frozen.log`. The exact omission diff is
`/tmp/puni-task74-retained-retry-omission.patch`. The retained Python snippet is a
transcription of the executed inline experiment, not a claim that the saved file
was executed. Restoration occurred in `finally`.

## Verification and independent review

From the candidate root, with both TMPDIR and BUN_TMPDIR set to the existing
`/tmp/puni-terminal-outgoing-bun-tmp`:

```sh
bun test apps/wbs/be-01/src/services-connected-publication.db.test.ts \
  apps/wbs/be-01/src/controller/connected-retry.controller.db.test.ts \
  apps/wbs/be-01/src/service/connected-optimization-publication.db.test.ts \
  apps/wbs/be-01/src/services-connected.db.test.ts --timeout=15000
bunx tsc --noEmit -p apps/wbs/be-01/tsconfig.spec.json --pretty false
NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx show projects
bunx eslint apps/wbs/be-01/src/services-connected-publication.db.test.ts \
  apps/wbs/be-01/src/repository/optimization.ts
git diff --check
```

Four complete suites passed **66 tests, 840 assertions**, 31.17s. The final frozen
changed file separately passed **7 tests, 259 assertions**, 9.29s. Backend spec
types, graph-backed two-file lint, formatting and diff checks passed. Logs:
`/tmp/puni-task74-four-suites.log`, `/tmp/puni-task74-changed-file-frozen.log` and
`/tmp/puni-task74-{types,lint-final,format-check,diff-check}.log`. Initial test
premise corrections concerned actual float spelling, modeled fanout and Q2 slack;
they are not production bug evidence.

Independent Astra review approved the bounded packet and replayed the lifecycle:
**1 pass, 91 assertions**, 4.92s. Both frozen hashes stayed unchanged. Review:
`/tmp/puni-task74-independent-review-10a7.md`; execution:
`/tmp/puni-task74-reviewer-focused.log`. The sequential idempotent fixture close
marks closed only after stop/close succeed; failed cleanup still throws.

| Frozen source                               | SHA-256                                                            |
| ------------------------------------------- | ------------------------------------------------------------------ |
| `services-connected-publication.db.test.ts` | `9dc3d8857685b9b858edc44f8234a88a043f12749f33a956962e1cbda328833a` |
| `repository/optimization.ts`                | `56bee58f5f63e8144bcb078c25bf42399614690136a9f6e865aa85f7050bb399` |

Manifest: `/tmp/puni-task74-candidate.sha256`, SHA-256
`1f9f8e895938c97296aa32ba0e0f0ce66504dcf59bc404072b0729f1ae5077de`.
No full build/browser/CI/host gate, deployment or native acceptance is claimed for
this private packet. Earlier field-identity sweeps retain their own attribution;
this is one lifecycle integration proof.
