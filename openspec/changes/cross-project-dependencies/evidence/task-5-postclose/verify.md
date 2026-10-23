# Task 5.1: expired connected derivation and cache selection

Base: `6f46687a8`, isolated clone `/tmp/puni-postclose-proof`, Bun
`1.4.2 (744846f84)`. Production source and test behavior are unchanged in this
packet; only adjacent proof comments and evidence are committed.

The mounted `saved-plan-connected.controller.db.test.ts` fixture composes real
HTTP routes, SQLite observation ownership and the production captured scheduler.
Its history conversion/serialization runs after the read connection closes.
The existing current/current case explicitly checks zero live read connections
inside `captureConnectedHistory`.

Two independent mutations of `readConnectedLivePlanIn` were observed:

1. [derive.patch](derive.patch) makes returned `projection.placement` lazy.
   On access it reruns the actual `deriveConnectedPlan` with the captured Fast
   scheduler and lifetime. The eager derivation remains necessary to supply the
   authored graph used for readiness; this fault adds a real forbidden late
   placement derivation, rather than postponing every part of graph derivation.
   The mounted current/current GET returned 500 instead of 200. The
   [receipt](derive-red.log) shows `read snapshot is closed` from
   `read-snapshot-lifetime.ts:12`, through the schedule callback in
   `chain-snapshot.ts:616`, `deriveConnectedPlan` and history conversion.
2. [cache.patch](cache.patch) retains the exact optimization question passed
   through the real connected reader during eager derivation. Returned placement
   access repeats that question through the same captured adapter. The enabled
   mounted Saved plan POST returned 500 instead of 201. Its
   [receipt](cache-red.log) reaches `captured-scheduler.ts:78` and throws
   `read snapshot is closed` before the expired reader can issue SQL. This proves
   the production cache capability boundary, without substituting a fake reader,
   cache value or explicit test-only throw.

Each red run exited 1 with exactly one failing mounted test. Both mutations were
restored separately. The [restored full file](restored.log) exited 0 with
**5 pass, 0 fail, 35 assertions**. Its intentional schedule-insert failure logs
an error as part of the passing atomic rollback case.

Reproduction from the base (one patch at a time):

```sh
git apply openspec/changes/cross-project-dependencies/evidence/task-5-postclose/derive.patch
bun test apps/wbs/be-01/src/controller/saved-plan-connected.controller.db.test.ts --test-name-pattern 'connected current/current captures once'
git restore libs/wbs/adapters/store-sqlite/src/chain-snapshot.ts

git apply openspec/changes/cross-project-dependencies/evidence/task-5-postclose/cache.patch
bun test apps/wbs/be-01/src/controller/saved-plan-connected.controller.db.test.ts --test-name-pattern 'enabled connected capture never'
git restore libs/wbs/adapters/store-sqlite/src/chain-snapshot.ts

bun test apps/wbs/be-01/src/controller/saved-plan-connected.controller.db.test.ts
```

The red receipts record actual process exit codes. A first evidence-driver
attempt incorrectly searched stderr alone for the service error (the logger
writes stdout); it stopped after recording the derive failure and restored the
mutation. The final driver checked combined streams and reran both faults and
the restored suite successfully.

This closes only the post-close derive/cache observation gap. It does not prove
all task 5.1 guards, active production authoring, live optimizer execution or the
canonical exact-SHA host gate. Full Nx gates, CI and host gates were not run for
this comment/document packet. Formatting, diff check and scoped OpenSpec results
are recorded in the parent delivery message.
