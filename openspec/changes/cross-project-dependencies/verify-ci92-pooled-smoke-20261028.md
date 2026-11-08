# Published CI 92e4382: pooled smoke fixture correction

Published CI run `40767396174`, job `123095363059` (gate checks), failed
`wbs-be-01:solver-image-smoke` at the composed scenario terminal assertion.
Its baseline placement passed; the terminal list was empty instead of containing
two successful children. The original job completed cleanup. No rerun/cancellation
or duplicate workflow was dispatched during diagnosis.

A bounded local disposable-DB reproduction retained the real baseline/HTTP/drain
path and added one temporary error-sink print. Both child attempts failed the
original fixture guard: `installed admission retained its capture reader; 1 !== 0`.
The print was removed and the exact source restored. The count measured physical
SQLite connections, while the merged source now retains idle readers in its pool.
It did not measure outstanding observation borrows.

The fixture now tracks actual read-transaction controls only after its original
`db.run` succeeds. Every successful run must have supplied its SQL observation;
a missing observation is terminal even on a second physical reader. At child
launch the fixture requires observed transaction activity, no active transaction,
and matching observed settlements. Physical connections may remain idle until
`source.close`, when the separate physical-drain check requires zero. The final
drain assertion follows the existing SQLite close, directory cleanup and timeout
clear, so its own failure cannot skip those operations.

This instrumentation proves transaction settlement, not independently borrowed-handle
release. The unchanged owning pool test separately checks that a released borrow
cannot be used; the unchanged source test checks pool reuse and physical drain.
No production pool API, runtime authority or readiness callback was introduced.
Both successful-child terminal assertions, placement/durable cache/ledger checks,
image budgets and timeouts remain intact. The four direct unpooled close tests
were not changed. No native-image or historical qualification campaign was rerun.

Actual test sequence:

- Mechanically extracting the original count check preserved its behavior. New
  owner cases observed causal RED: 1 pass, 3 fail, 12 assertions. An earlier
  missing-access test setup failure is preserved separately.
- The added mixed-reader case then observed RED: 6 pass, 1 fail, 18 assertions.
- Final owning DB suite: 7 pass, 0 fail, 20 assertions.
- Packaging/source consumers: 160 pass, 0 fail, 583 assertions across four files.
- Existing borrowed-handle expiry and pooled source drain owners: 2 pass,
  34 filtered, 0 fail, 6 assertions.
- Normal `bunx tsc --project apps/wbs/be-01/tsconfig.tools.json --noEmit`: exit 0.
  An initial invocation of the absent legacy TypeScript bin failed before compiling;
  the repository's native TypeScript entry point was used unchanged.
- Scoped ESLint: exit 0 after mechanical import/callback-brace fixes. No disables,
  casts, assertion changes, skipped cases or relaxed limits were used.

Watched faults, each restored exactly before final GREEN:

- Omitting the grouped admission invariant made five intended owner cases fail.
- Omitting per-run SQL-observation refusal hid first/second-reader instrumentation
  loss and made both corresponding cases fail.
- Moving state updates into pre-execution `logQuery` made only the COMMIT rejection
  case fail: the injected logger rejects the real run before SQLite executes COMMIT.
  This is not an SQLite-engine COMMIT-failure claim.
- Omitting the physical-drain invariant made the idle-pooled-reader owner case fail.

The first exploratory early-settlement mutation failed too early on missing BEGIN
observation; it is retained but is not credited as the precise COMMIT proof. The
refined pre-execution logger mutation supplies that proof. Proof comments name only
the actually observed refined failures.

Private evidence prefix: `/tmp/puni-r18-ci92-solver-smoke-fix-20261028`.

- `diagnostic2.log`: SHA256 `807361f5db329f20b8ee673c1e1f42419460976c4295354f601fd1cc6798c9b4`.
- `owning-red2.log`: SHA256 `8500211eaa55e1828c8ea3b04954f8a1a8044351ed98305d00e3205bb88efccf`.
- `second-reader-red.log`: SHA256 `93ec6f1a837547b6237b5a8acb38d292a2d4c0806729b6570b5f4d5c0c78bc77`.
- `proof-receipts-v2.json`: SHA256 `446266c88d5370e7506c0deb1ce400d58af41df669302c23f6a969feeac8f11f`.
- `packaging-tests.log`: SHA256 `0fee5ee2f7b97f3e40a2e347b48c83d5178e54aa015a302cc34c974ec1bd7dd3`.
- `owning-final.log`: SHA256 `7bb9f7a99edefd7a558200b777295f21612a01c9f32ed01426b1e732f58569c6`.
- `borrow-release-owners.log`: SHA256 `6f563c4940e58434d22efb496142335a359d3972aa8a472bc5b390dd836e3979`.
- `tools-typecheck2.log`: SHA256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.
- `lint-final.log`: SHA256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.

The published run remains evidence for its own head. This local correction does not establish a corrected image run, full CI, native restoration, MAIN adoption or deployment.
