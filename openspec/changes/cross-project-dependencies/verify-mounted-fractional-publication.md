# Mounted fractional publication proof, 2026-10-25

This test-only packet starts from draft feature head
`d9cdc5f305b9c96fc3d4cfae543074543f5c942d`. It adds a genuine mounted
fractional foreign-pin refusal and neighboring healthy control. Production changes
are an adjacent `Proof:` comment only; transpiled runtime bytes match the base.
This receipt does not complete parent acceptance, native acceptance or release.

## Actual path and preconditions

The migrated SQLite fixture uses the installed source and genuine private dependency
context. A, C, B have canonical ranks1,2,3, isolated project-local team pools and
real authored A.anchor→B.dep→C.long FS edges. B priorities1/2 select dep before
short. Production capture establishes C.short0..8/48 and C.long start8/48;
B.dep finishes earlier. No captured pin, boundary or private brand is fabricated.

Both emitted objective requests retain canonical capture/question identity, quantum48,
local duration units3/5 and incoming/outgoing bounds5/5. The actual response parser
and integer validator accept B.short0 and B.dep5. Complete real replay moves C.long
from `8/48` (`0.16666666666666666`) to `5/48 + 3/48`
(`0.16666666666666669`), while its finish remains equal.

Mounted HTTP admission→installed coordinator→raw child adapter→exit→durable publication
rejects both Pri and Time as `failed/invalid-output`. Complete prior placement and
actual target/foreign tree timings remain intact. The entire store equals its prior
state plus exact terminal bookkeeping: one generation, two failed cache rows,
12 events (two failure events and ten foreign notifications), event sequences2/5/5
and the event-log SQLite sequence. Queue and slots are empty; no success envelope
or success event is published. Repeated settled mounted reads preserve the whole
store byte-for-byte and launch no additional children.

Changing only C.short to9/48 admits the same integer candidate: both objectives are
READY, durable cache rows are successful and C.long remains exactly9/48.

## Watched omission and restored checks

A disposable archive clone omitted **only** the foreign-start comparison. All other
guards, including foreign-finish equality, remained installed. The negative became
READY for both objectives and published C.long at `0.16666666666666669`: intended
RED, with the9/48 neighbor still passing. This is observed unsafe acceptance, not a
later alternate refusal. No combined start/finish omission was needed. Restoring
runtime bytes exactly to the base passed the mounted pair:2 tests,94 assertions.

Commands ran from `/tmp/puni-fractional-publish-proof-d9` with Bun1.4.4 and
`TMPDIR=BUN_TMPDIR=/tmp/puni-fractional-proof-bun-tmp`:

```sh
bun test --preload ./tools/test/scratch/preload.ts \
  apps/wbs/be-01/src/services-connected-publication.db.test.ts \
  libs/wbs/domain/domain/src/connected-publication.test.ts \
  libs/wbs/domain/contracts/solver/src/connected-solver-outcome.test.ts \
  libs/wbs/domain/contracts/solver/src/solver-exit-outcome.test.ts --timeout=30000
bun test --preload ./tools/test/scratch/preload.ts \
  apps/wbs/be-01/src/services-connected-publication.db.test.ts \
  --timeout=30000 -t 'mounted genuine fractional'
bun x tsc --noEmit -p apps/wbs/be-01/tsconfig.spec.json
bun x eslint apps/wbs/be-01/src/services-connected-publication.db.test.ts \
  libs/wbs/domain/domain/src/connected-publication.ts
```

Final full replay:66 tests,327 assertions,0 failures,7.97s. Restored focused
pair:2/94. TypeScript, ESLint and changed-file formatting passed. Package and lockfile
bytes remain unchanged. Logs and commands are pinned by the private packet
`/tmp/puni-fractional-mounted-proof-packet.json`, including
`/tmp/puni-fractional-start-only-omission.log`,
`/tmp/puni-fractional-faultclone-restored.log` and
`/tmp/puni-fractional-final-tests2.log`.

| Frozen path                                                    | SHA256                                                             |
| -------------------------------------------------------------- | ------------------------------------------------------------------ |
| `apps/wbs/be-01/src/services-connected-publication.db.test.ts` | `9ea415eff7e073e770e03f648bc45820c3f96b8885aefc6a371a17b4164a1371` |
| `libs/wbs/domain/domain/src/connected-publication.ts`          | `f6401f95638bdec4d1750c41d4f539eac45cfac3b4bc379127d856e4a4541d73` |

The raw child response is injected through the existing process adapter seam. This
proves the mounted application publication path, not actual Python/OS-child execution
or native/provider acceptance. No Docker build, host gate, SSH, production operation
or release action was performed for this packet.
