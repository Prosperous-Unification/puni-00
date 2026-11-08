# Current-main integration, 2026-11-08

The session aggregate `c76cad59f552aa4110251df5866efa523eee5e86` was reconciled
with independently merged observability main
`e52bc3928736334c97bed5eebb2e03268c930db3` in
`c2a3640f992cd6d3d7e69afd8a450f73dd707317`.

The four textual conflicts retain both sets of domain terms and cached-input
proof comments. Shared scratch cleanup retains the session's synchronous
start/return tracing and current main's existing 60-second cleanup allowance;
its test injects into that same wrapper. Ordinary deadlines are unchanged.

Observed on the reconciled tree:

- `bun install --frozen-lockfile`: passed.
- `bun test --preload ./tools/test/scratch/preload.ts tools/test/scratch/cleanup-budget.test.ts tools/tool-devsync/src/workspace-targets.test.ts --timeout=60000`:
  29 passed, 0 failed, 133 assertions, 6.66 seconds. Inherited/reduced cleanup
  allowances and ordinary hangs remain negative controls.
- Prettier checked all four resolved paths: passed.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run tool-devsync:check:docs --output-style=stream`:
  passed, including four document tests and root/index validation. Its earlier
  unmerged-index refusal was expected before staging resolution. A subsequent
  sandboxed child write returned EPERM; the identical command passed outside
  that sandbox. Neither failed observation was treated as success.
- All 15 separately reviewed critical source hashes remained identical.
- Normal commit hooks passed; the reconciliation worktree was clean.
- Configured uncached `tool-remote-scripts:build` passed in 3.0 seconds. Its
  462191-byte supervisor bundle remains
  `bfc0b95fb8ae2915101883ff665df706f1df33d180a3e8a5fb94c2885ea8c102`.
- The actual adoption public API rebuilt seven dry-run steps from this tree.
  Reconstructing its three inert transport chunks produced exactly the reviewed
  67853-byte operation,
  `67d72d905118cb789b25b36246bb986810de69364c78f2ab6d6a61c70c2df178`.
  No host transport or adoption ran.

The original aggregate CI is historical after main moved. Its storage leaf
passed 69 tests and 6046 assertions, including all four genuine raw ready-drop
and ready-release controls, but it does not qualify this reconciled successor.
The original infrastructure rehearsal failed backup drain before its intended
SQL rollback oracle; a separate isolated API probe confirmed that removing an
old image from admission blocks even a terminal deleting Pod's finalizer-only
UPDATE. The initial failed Pod's image was not retained, so attribution of that
specific survivor remains unproven. That interaction and the newly inherited
synthetic backup CA mount require their separately reviewed repair.

Final-head CI, explicit qualified reader adoption with fresh independent host
readback, main merge, the canonical actual-main host gate and durable dev
boot/proven/synced evidence remain pending. No production deployment, full
39-case native qualification or cross-project semantic activation is claimed.
