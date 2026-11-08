# Ordinary extracted pre-helper inputs — 2026-11-05

The ordinary `UC2 actual invalid build` case extracts checked source cuts into an
isolated in-memory consumer. Its actual `readAllocation()` requires three
centisecond allocation inputs before the first native operation, but the test
supplied none. The unchanged callback failed its four-operation assertion with
an empty operation roster. A transparent observation retained the actual cause:
`UC2 original centisecond allocation absent`; operations, clocks and children
were all zero. This is separate from the caller-umask failure recorded in
[the initial fixture verification](verify-initial-fixture-layouts-20261105.md).

The generated ordinary consumer now has a private lexical process facade with
the real platform/stderr identities and its own three-field environment. Directly
before its sole execute call, it samples real `/proc/uptime`, validates its strict
centisecond grammar and 128-byte bound, and supplies start=lower=sample and
end=start+18000. It does not change global process.env. The independent input
sample is outside the parent clock ledger: `readKernelTick()` is stateful and
would incorrectly add a sixth recorded observation if reused for preparation.

All extracted admission/clock/operation/refusal/reporting/catch/finally cuts,
42 callback bodies, cleanup, owner loop and exact diagnostic remain unchanged.
A byte-preservation check removes only the two exact added fixture blocks and
reconstructs the entire published 95b5a817 test file byte for byte. Production
files and the private helper remain unchanged. No private helper import,
constructor, plugin, historical metadata/clock receipt, pin refresh or renewal of
an earlier allocation occurs. These are fresh inputs for one ordinary isolated
invalid-build control.

## Observed verification

- Unchanged RED: the actual named case failed with zero operations and the
  retained missing-allocation cause.
- Repaired same consumer: 1 pass, 0 fail, 79 assertions, 65ms. It reaches the
  actual invalid Bun.build rejection, four original APIs/promises/observers,
  five real recorded clocks, zero children and the exact prior diagnostic.
- Omitting only the fixture START assignment: actual admission refuses before
  operations/clocks, with the original missing-allocation cause; the unchanged
  callback fails. Source bytes are restored exactly.
- Restored shared batch: 23 pass, 0 fail, 131 assertions, 253ms. It includes that
  actual consumer, three raw-layout boundary cases, 17 public-decoder cases and
  two custody-census cases. It filters the other 68 storage cases.
- Prettier and diff checks pass. Configured type/lint and document validation
  are recorded by Root with the PR publication receipt.

The omission demonstrates input-supply sensitivity through the actual admission
path. It does not independently falsify every predicate in the fixture's new
uptime-input parser. No production admission check is changed or bypassed.
Astra High reviewed the complete source diff and retained observations with no
Critical or Important finding.

Actual restored command (cwd is the isolated 1b31 worktree):

```bash
umask 022
TZ=UTC TMPDIR=/home/df/.codex/worktrees/1b31/puni-00/tmp/puni-delivery-evidence/20261105/prehelper-allocation/scratch PATH=/home/df/.bun/bin:/home/df/.volta/tools/image/node/24.20.0/bin:/usr/bin:/bin /home/df/.bun/bin/bun --no-env-file --config=/tmp/puni-initial-empty-bunfig.toml test --preload ./tools/test/scratch/preload.ts ./tools/tool-remote-scripts/src/lib/dependency-activation-storage.test.ts ./tools/tool-remote-scripts/src/lib/dependency-initial-layout-boundary.test.ts ./tools/tool-remote-scripts/src/lib/dependency-complete-activation.test.ts ./tools/tool-remote-scripts/src/lib/dependency-owner-custody-routing.test.ts --test-name-pattern='^UC2 actual invalid build retires pre-helper parent after original rejection and complete diagnostic$|^raw initial boundary|^ordinary storage callbacks|^native custody acceptance|^decodes detached|^refuses |^public request refusal' --timeout=10000
```

Evidence directory: `tmp/puni-delivery-evidence/20261105/prehelper-allocation/`.

| Artifact                       | SHA256                                                           |
| ------------------------------ | ---------------------------------------------------------------- |
| original-red.log               | 2f09f79862245ce747545e476e70d65b8293c9a67032eec5467a59e30ab09fa2 |
| start-omission.json            | 64308a3549600d5fedc7d2875433aba07dc1da80f3ce53b6bdce0ed635fc09f6 |
| restored-regressions-green.log | ed9653d56c73b75afecf0d91f732673415fe4b89553595b97647c391d9d09444 |
| source-preservation.log        | b2aff051e5cbc63f7aa76491c57b8ade30b5502fdf67ecc25d68b49c4b094456 |

Final storage-test SHA256:
`d2487b4da5a5d103fc0d2f551ed5bc19e3fb149ffee17ddb661448061e31c594`.
Removing only the added facade/allocation blocks recovers baseline
`02d32b92f0b8caf8490a4af1b8b14f7850236bcb217968162d8c915e1e2dabd9`.

Full 69-case qualification, final combined CI, exact-SHA h2 gate, mandatory
private acceptance, architectural main adoption and deployment remain separate.
The corrected whole-file run at the prior immutable 95b5a817 in cde5 does not
include this later fixture-input correction. No full-file or final delivery
success is inferred from these focused results.
