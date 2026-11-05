# Ordinary runtime ledger — implementation and review evidence

The [accepted design](ordinary-runtime-custody-design-20261105.md) leases only
the existing custody fixture and owner test. The generated import-free ledger
is real code used by the fixed forwarding ports. Its inert consumers use local
sentinels and actual test-owned Promises; they do not execute the full image,
ports, production modules, native objects, timers, helper or HOLD controller.
Existing owning regressions retain their ordinary finite native coverage.

## Initial candidate

Fixture SHA256
`b9013ccd362b95028bf10c4f80610c0cb6da3d3de1b7975e91e9bf4040afae71`;
owner test SHA256
`ee42cd1d53b9b07abf0580834f8c2f70b8ee49f1375dc9c32cee1ad32b55aa45`.
The historical95701fixture bytes remain SHA256
`50281b36a01665b83062e7bb7d065361037182581fb791a89e1b049d65cf4b04`.
The new plan has16fixed source rows,30literal cuts and19ports; production
owner/storage/complete files are unchanged and unenrolled.

Root independently ran the complete owning file on those exact hashes:

```sh
bun test --no-env-file --config=/tmp/puni-initial-empty-bunfig.toml \
  --preload=./tools/test/scratch/preload.ts \
  tools/tool-remote-scripts/src/lib/edge-ownership.test.ts --timeout=10000
```

Actual output: **104passed,0failed,651assertions**,104tests/1file,4.48s,
exit0; scratch cleanup returned; both hashes remained exact. Configured forced
TypeScript, populated-graph two-file ESLint and formatting passed for the same
candidate. The earlier missing graph-cache and sandbox-dist-write attempts are
failed setup checks, not passing statics.

## Twelve bounded fixture necessity observations

The first campaign observed12negative exits and restored the source after each,
then ran a later whole positive. It did not run a restored positive between
every fault, so it is not described as12complete pairs.

A separate final campaign under
`/tmp/puni-ordinary-ledger-sol-proof-pairs-20261105` retained12exact
before/fault/restored triplets. Receipt SHA256
`e2db57735f44c2245650eaa59b3c4380c28ec0bb88a919b37d1e1a53cc9fe8a4`
records SAMEselected consumer/argv for each, exits0/1/0, raw log hashes and
source pre/post identities. The selected faults cover reservation omission,
512total/64SQLite/32Dir/256Promise caps, native re-entry, alias linkage,
original-Promise projection substitution,8owner-frame cap, keeper identity,
readonly snapshots and closed-boundary admission. These qualify those named
inert generated-ledger guards only. Other internal ticket/attachment/wrapper,
Promise-bind/observer/native-return/association checks and event-cap necessity
remain unproved; no all-check or native custody claim follows.

## Review finding requiring correction

The initial candidate's close admission applies the sticky fixture STOP gate to
all closes. An unknown close must block new acquisitions and retries of that
same native original while allowing first cleanup of independent existing
originals. Otherwise instrumentation changes production attempt-all semantics.
This finding requires a new failing consumer, bounded correction and review.
The initial104pass result is not acceptance of this missing behavior.

The prior successful actual image compile belongs to the precedingf8d/816
source epoch. This new ledger candidate has not yet had an actual builder
invocation. All seven explicit qualification gaps (including the new ledger runtime entry), actual child/readwrite migration
custody, complete transitive/emitted closure, coupled enrollment/migrated cases,
full R5, CI/host gate, architecture/main and deployment remain open.

Initial TDD chronology is distinct from later preserved necessity evidence.
The first API-absence failure, a misplaced-scaffold syntax failure and an earlier
wrong Bun argv yielding no tests receive no behavioral proof credit. The
stronger scaffold consumer did fail the intended native-reservation assertion
(`natives` was empty),0pass/1fail/5assertions, exit1, in original direct transcript
chunkbdd11d; no original raw file was retained. It must not be relabeled as a
raw-file receipt. The later reserve-before-entry physical triplet above has
complete genuine raw captures and is separate evidence, not rewritten history.

## Cleanup-only correction

Both newly added consumers failed on the initialb901 candidate when independent
Bfirstclose reached the sticky acquisition gate:0pass/2fail,exit1. Separate
rawcounter RED failed its bounds assertion. Corrected focused consumers passed
6/0, including prior reservation/cap/no-retry controls. Original raw captures
remain in `cleanup-stop-red.log`, `cleanup-counter-red.log` and
`cleanup-green.log` under the separate proof-pairs directory.

The correction removes acquisition/event admission from closing an already
retained original. It still validates exact ticket/origin/association and the
existing native-phase no-retry guard. Per-record production+fixture attempts
are conservatively bounded at8192 before increment; cleanup allocates no new
events. StickySTOP continues to prohibit new acquisitions. The original unknown
native close cause is retained independently, including a thrownundefined value;
a later cap diagnostic does not replace it. Neither test claims fixture retirement.

Final fixture SHA256
`d8e705f3e1625f34765591ce7f42141dcbfd3474957c211ef58e5f14a308d90c`;
owner test SHA256
`5ded95b8e87b2670d130f300f62277be1295774676e12f023e15173ee94e33cc`.
Immutable copies and full mapping/port digests remain under
`/tmp/puni-ordinary-ledger-corrected-freeze-20261105`.

The new cleanup-counter guard has its own complete SAMEconsumer
before/fault/restored0/1/0 triplet, exact restored final source and raw hashes:
receipt SHA256
`91d1727decc88c5ce4026dd5ce4dcb5e2c054a8ffda554e52ce264345c45199f`.
Earlier12triplets remain atb901, with unchanged guard scopes; the close-no-retry
mutant fails at its first returned-native branch. Its unknown-native branch has
ordinary control coverage, not separately reached physical necessity credit.
Other unproved internal checks remain explicit above.

Root independently reran the entire owning file with the same explicit Bun
configuration/preload on finald8e705f3/5ded95b8: **107passed,0failed,
676assertions**,107tests/1file,3.85s,exit0. Scratch cleanup returned; both final
hashes remained exact. Separate raw captures preserve the initial104test epoch
and corrected107test epoch. Configured forced types, populated-graph uncached
lint and formatting also passed on the corrected frozen source.

## Final source review and actual instrumented compile

Independent source/proof review SHA256
`e7a7e55f3c5b4450ca692f3b575f79d164221c0b6435e03a9342ddb3684611ac`
accepted publication of the unwired corrected slice with the explicit proof
limits above. Code/design/evidence committed locally as
`41bc5fd3e3eecc7a4b6adf1a2dce2de8da91ee95` with normal hooks. Tool Wiki
reported inactive because its external activation root is not provisioned;
migration and README-cap hooks had no matching files. No hook was bypassed.

Independent compiler preflight review SHA256
`791d466c686741652f6902cc737422b4d8799a957a935364104d4479a27a0b75`
accepted one fresh build-only run. Driver SHA256
`46fa12f56d678257b0a2c4494c106135398163cf27ed6b63abd643162e49b813`;
expected manifest SHA256
`b2455f75d550d07c61c079b9372dc1094eb0cd450b298324484300359f5989d1`;
launcher SHA256
`d1d37d7100cd8362c62037cf462a1a5755851d6657a715c120fd12f9badb5e51`.
Root invoked exactly once:

```sh
python3 /tmp/puni-ordinary-image-instrumented-build-20261105/launch.py
```

Actual PID/PGID2123794 exited0, no signal, both streams EOF, empty stderr.
All44setup/compiler originals and separately retained observers fulfilled and
joined. The one1136264-byte entry bundle has SHA256
`5d2501a95b71538dbd4e4c8c8862b3e7262ab3b17d0b51af5cd8c60824b81206`;
the569455-byte metadata file has SHA256
`c7f31a76b3d864946d9daecb665c06b2e714e6a4504e6fe9e3d6be58fce5fdb4`.
There are275compiler inputs,15fixed bundled modules and4scanner external edges.
Source/driver/configuration/compiler pre/post identities matched. All7exact
unqualified strings remained present. No generated image or port was imported
or executed.

Private receipt SHA256
`645493328ce149e205e3d379d35aa13ab527019f9b48e46df72a694dfe98b066`;
success observation SHA256
`7da401eef8ec482a49aa1da5c386af296a266bc5ee19f3daea52613425187e73`;
raw compiler metafile SHA256
`2daeac00bda52113e573bd31e8619bee1e0fbd50923746b9025884b66a46e761`.
This proves syntax/link/metadata qualification of the actual instrumented image,
not execution of its native/resource/owner observations or finite retirement.
The following publication commit changes documentation only; the actual built
fixture/test byte identities remain the finald8e/5ded epoch.

Independent actual compiler receipt review SHA256
`dd4fcab3a2d4730b38b377c83386e5437906d8f24f6981cc9925a98fa4aced09`
matched original streams, all44joined operations, complete artifact/metadata
hashes and unchanged source pins. Compiler-only acceptance and draft publication
GO stand; all7runtime qualifications remain open. All evidence readers ended.
