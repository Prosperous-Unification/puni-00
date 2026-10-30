# Retained activation publication continuity

This bounded slice follows the retained-record snapshot ruling. Numbered activation
records preserve the original successful publication observation across return to
the caller and all later publication-monitor checks. Ordinary migration capture
files remain outside the numbered-record grammar. Storage preserves its full
`0o7777` private-mode refusal; public summaries, explicit `{name, sha256}` references,
record bytes, owner capabilities and solver-only restoration grammar are unchanged.

The actual publication wrapper awaits `retainActivationRecord`, renames the exact
numbered file aside so its original inode remains allocated, writes identical bytes
exclusively at mode 0600 under the original name, verifies a different inode and
identical bytes, then returns the original snapshot. No preparation or complete
exclusion capability is constructed by the tests. Fixtures use real local SQLite,
source input capture and native child protocols with controlled Docker byte
transports; these are local algorithm tests, not live Docker or image acceptance.

The production-path cases cover activation-capture before backup, fenced-only
completion after commit, and participant preparation after commit. They require
refusal at the intended stage, no starts/restarts/removals, stopped application
participants and unchanged ordinary policy. Storage refusal requires both stores
DISABLED, no backup and no activation intent/fenced-complete publication. Final
completion refusals require exact original committed receipt bytes to remain in
the selected store and the nonselected store to remain DISABLED. Each test has an
explicit 300-second bound, independent of the ordinary target's 10-second default.
Unexpected successful preparation is released under its original owner, so watched
regressions cannot leak its retained monitor descriptors.

## Fresh evidence

Base: `39fde26e9ed31603402ee79fb5523545aa99ff5d`, isolated worktree
`/tmp/puni-retained-record`, Bun 1.4.4 (`38afee6c8`).

- Direct original API contract RED: missing five capture fields;
  `/tmp/puni-record-contract-red.log`. Then full record suite GREEN: 6 tests,
  30 assertions, `/tmp/puni-record-contract-green.log`.
- Unmodified production return-gap negatives RED: 0 pass, 3 fail, 370 assertions,
  219.23s, `/tmp/puni-record-continuity-red.log`. Each failed the explicit expected
  refusal oracle because the old production path incorrectly returned success.
- Initial strengthened production replay GREEN: 3 pass, 336 assertions, 123.33s,
  `/tmp/puni-record-continuity-green.log`. Final replay below includes additional
  explicit authority-state and exact durable receipt assertions.

## Scope limits

No host, SSH, Docker daemon, privileged namespace, CI dispatch, live activation or
remote gate was run. Full P2b3 orchestration, measured source four-role profile,
Stage B native image acceptance, policy handoff and production authority remain
outside this slice. This work does not claim protection against inode reuse or
same-inode changes that are restored entirely between observations.

## Watched identity continuity regressions

`/tmp/puni-watch-record-continuity.py` independently changed one production
boundary at a time and restored both source files in `finally`:

- Storage replaced the returned original snapshot with a fresh capture before
  retention. The capture replacement case failed its expected-refusal assertion
  (`Received value: undefined`), 0 pass / 1 fail, 120 assertions, 52.54s;
  `/tmp/puni-record-watch-storage-rebaseline.log`.
- Core compared contents only instead of complete snapshots. Both fenced-only and
  preparation replacement cases failed that same explicit oracle, 0 pass / 2 fail,
  250 assertions, 121.45s; `/tmp/puni-record-watch-core-contents-only.log`.

The watched cases incorrectly reached completion/preparation rather than throwing
an unrelated later error. Unexpected preparation is released immediately under
its actual owner. `/tmp/puni-record-watches.log` records both expected nonzero
outcomes. Adjacent production Proof comments name these observed faults.

## Restored final replay

`bun test` selected the three new production-path negatives, all six existing
activation-record tests and the existing genuine post-finalizer one-shot
preparation control: **10 pass, 0 fail, 506 assertions, 213.78s**;
`/tmp/puni-record-final-focused.log`. This replay includes explicit authority rows
and exact committed receipt bytes after each late refusal. The preparation control
also consumed the actual opaque preparation under the same original live owner,
rejected copied/reused context and released its retained monitors.

The existing selected-prod fenced-only positive also passed: **1 test, 133
assertions, 61.15s**, `/tmp/puni-record-fenced-control.log`. It independently
checked the nonselected DISABLED authority, complete migration ledgers, native
ordinary-admission refusal and released locks, stopped participants and no starts.

Exact focused commands from the isolated root (Bun 1.4.4 on PATH):

```sh
bun test tools/tool-remote-scripts/src/lib/dependency-activation-record-continuity.test.ts tools/tool-remote-scripts/src/lib/dependency-activation-records.test.ts tools/tool-remote-scripts/src/lib/dependency-participant-restoration.test.ts -t 'original numbered|one-shot|retains activation evidence|activation record readback|actual owner activation publication'
bun test tools/tool-remote-scripts/src/lib/complete-dependency-exclusion.test.ts -t 'real joint owner activation prod preserves'
NX_DAEMON=false bun x nx run-many -t lint,typecheck,build -p tool-remote-scripts --skip-nx-cache
bun x openspec validate --all --json
```

Configured uncached lint/typecheck/build passed **8 tasks, 18.5s** after all fixture
processes exited; `/tmp/puni-record-static-final.log`. The actual Nx graph and its
normal boundary policy were used. The initial configured run exposed test-only
implicit-bigint interpolation and import-order diagnostics; the sandbox child
suppressed details, so a static-output local rerun exposed them in
`/tmp/puni-record-lint-diagnostic.log`. Explicit `String` conversions and sorted
imports fixed those diagnostics without changing production source or test
meaning. The final shared injection/API replay below covers those test-only edits.

All OpenSpec items validated: **285 passed, 0 failed**;
`/tmp/puni-record-openspec.log`. The actual built complete-activation bundle imported
successfully without actions, `/tmp/puni-record-bundle-import-final.log`:

```sh
bun -e 'await import("./dist/tool-remote-scripts/dependency-complete-activation.js"); process.stdout.write("complete activation bundle import safe\n");'
```

Prettier and `git diff --check` passed. No full remote gate was run; the parent owns
final integration and gate execution.

After the test-only lint cleanup, the shared actual capture replacement injection
and six record API cases passed again: **7 tests, 102 assertions, 23.56s**,
`/tmp/puni-record-lint-cleanup-replay.log`. Fenced-only/preparation assertions and
production source were unchanged from the 10-test final replay. Prettier then
wrapped the explicit inode-string assertion without semantic changes.
