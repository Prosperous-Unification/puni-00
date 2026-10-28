# Machine grant caller dependency claim — 2026-10-28

Supplement to [the integration verification index](verify.md). This records one real caller compatibility fix, not all-table atomicity, actual old-binary boot, deployment, native/provider behavior, gate or full parity.

## Actual RED and GREEN

RED used source `4cc0aa34c3babbba91751fb8aa9078b3dc6961c6775dc98ae67468a3e957b395` and unchanged caller `b733faa3e9fa70c97886eae6aaaa6e7a2f605d5ae1284555de506a98e85fd70a`, without the shared dependency claim. Full boot file:18 pass,1 fail,109 expectations. `the real client claims V1 and changing only that header refuses issuance` stopped on real dependency-enabled HTTP409 `client_dependency_incompatible` before positive issuance. Later supported-case controls were not reached. The separate immutable unsupported fixture case passed. RED remains FAILED.

GREEN applied only the shared header to that caller. Source `bb5709689160ad98e198ef61c9f895505c84efa850901b382c9806e89faf369f`, caller `17b697cfd0202e3e9ba86549f0c915d8b5deeaeff62b67ab464568817fcd5961`. SAME complete file:19 pass,0 fail,123 expectations. Its executed assertions establish:

- Real caller issuance200, with one added issuance audit entry.
- Missing and wrong-version semantic claims409, exact `client_dependency_incompatible`/required value, and unchanged observed audit array.
- Wrong dedicated secret401 `internal_unauthorized` and unchanged observed audit array.
- Restored exact caller issuance200 with audit deduplication.
- Separate immutable unsupported-capability fixture409 even with exact V1 claim, with unchanged observed issuance audit.

Those are implemented audit-array comparisons, not complete-table snapshots. The unsupported fixture is a fresh real composition with immutable capability setting; no previous binary was booted. Dedicated secret and semantic compatibility are independently checked.

## Invocation and records

Both original executions used this same argument vector from repository root (`$BUN` renders the pinned executable without private infrastructure paths):

```sh
$BUN --no-env-file --no-install test ./apps/wbs/mcp-01/src/machine-token.boot.test.ts --timeout=60000
```

Original command300 seconds, single cleanup2 seconds and testcase60000ms stayed unchanged. RED elapsed10.450341s; GREEN10.796693s. Receipts record original leader reaped/final group absent; ROOT reports all owned child groups settled with no kill. No universal process containment is inferred. RED original session83141/terminalbf0ada exited1; GREEN session21331/terminalbf8e3a exited0. No earlier epoch is relabeled.

| Retained record | SHA-256                                                            |
| --------------- | ------------------------------------------------------------------ |
| RED receipt     | `88010a063b244560557c0674105e1f6dca1a63d0f5b44ee0a76bf715659a7382` |
| RED stderr      | `c4bccb80f5dd02a7eaf592fc11342cb79e65bc4b2f0fc874c772097128099fcf` |
| RED observation | `8c2b43eb19eebe6d067f5f07f649ff78dead5069607cf279ea27091e665fd9be` |
| GREEN receipt   | `9c76968a8bbc918d6b2807ef3da3f6c0db66ab0602c9d471b128022d3e26400c` |
| GREEN stderr    | `690c89d46b46ccd62daeb7bfaf56d797e099e1621b0dd4f123d2e42207d9e321` |
| Both stdout     | `bbe6a94c29cc8d3ff5a1792a5abae1f1122aed0642111b52036ab7e0b2b2ca47` |

## Additional actual whole-file checks

Both checks used the same GREEN source `bb5709689160ad98e198ef61c9f895505c84efa850901b382c9806e89faf369f` and caller `17b697cfd0202e3e9ba86549f0c915d8b5deeaeff62b67ab464568817fcd5961`:

```sh
$BUN --no-env-file --no-install test ./apps/wbs/mcp-01/src/machine-token.test.ts --timeout=10000
$BUN --no-env-file --no-install test ./apps/wbs/be-01/src/http/elysia/dependency-client.db.test.ts --timeout=10000
```

The complete machine-token unit file passed26 tests,0 failures,175 expectations (original session88920/terminal3ca298, exit0;4.826237s). The whole unchanged backend dependency-client file passed5 tests,0 failures,36 expectations (session19998/terminaldcb70a, exit0;2.871606s). Original command300/cleanup2 seconds and testcase10000ms remained unchanged. Both receipts record original leader reaping/final group absence; ROOT reports no cleanup kill. Complete raw output remains retained. Scratch residue has not been audited here, so no empty-scratch or storage-cleanup claim follows.

| Additional record          | SHA-256                                                            |
| -------------------------- | ------------------------------------------------------------------ |
| Machine-token unit receipt | `1d999a71af36b9baf3bc21d5129ba85019ef1ae7f11eb6369730acb8585e886c` |
| Machine-token unit stderr  | `42af60a3ce8d114019eb363c2c4f7c82090a429350df78c85013a43c609f22dd` |
| Backend admission receipt  | `767fb9ea3ff3b982d2d69aa53593d7ff5fac403841591c69bc54956a03cfa568` |
| Backend admission stderr   | `a67cfff5998570fa7fb53d65574318a40676d870aa74216c7fbd663ffae1bcdb` |

## Follow-up and limits

The proposed adjacent Proof/JSDoc and scoped `client`→`createClient`, `control`→`callFixture` helper renames preserve production executable tokens and every test assertion/value/order. These later source bytes are not the executed GREEN manifest. Normal formatting/lint/hooks, current native checks, the whole MCP suite, exact-commit host gate and CI remain pending for the later checkpoint. The two additional checks above belong to their recorded GREEN epoch; old9f CI failures and host-gate scopes remain unchanged. Full MAIN/PR630 architecture/adoption, merge, deployment and broader parity remain held.

## Later ordinary verification

After Proof documentation and helper renames, normal lint found 15 test errors and the native MCP spec program found three audit-array typing errors. The reviewed fixture correction adds explicit audit-array types, fixes imports and required headers, and awaits each actual issue promise before checking its unchanged error class. A fulfilled promise yields undefined and fails that assertion; a different error class also fails. No production guard or assertion value was relaxed.

At source `38ff54b80b03a43d3a090855af6edc8ad31884e66c2773884130888339739ffe`, six changed TypeScript files passed ESLint, the MCP native spec program passed without diagnostics, and the same complete mounted boot file passed19/0/123 in11.23 seconds with the original command300/cleanup2/testcase60000ms bounds. This is the corrected test form's actual runtime check, separate from the earlier RED/GREEN epochs. The protected-operation matrix file also passed2/0/6; full OpenSpec validation passed306/306.

The configured `bunx nx run wbs-mcp-01:test --skip-nx-cache` then performed ordinary document preparation and ran823 tests across35 files:820 pass,3 fail,301.54 seconds. It remains FAILED. The failures are poisoned eager runtime-barrel startup, a headless claim refused by actual workflow prerequisites, and an exact request-header expectation missing the shared V1 claim. A diagnostic-only message exposed real HTTP409 `prerequisites_unmet` with FS workflow provenance; no successful headless claim is asserted. During this full target, only an unrelated devsync test fixture changed; a complete16036-entry comparison confirmed every other source entry unchanged. Generated OpenAPI remains `d9846e784bba69f53bfd6197b5c04f385a3dc523dede8529f1a9770cb92f4680`.

Separately, adding the required explicit proxy-hop setting to devsync's private valid environment restored its complete document-sync owner:11 pass,0 fail,41 expectations,24.90 seconds, with the existing30000ms budget and scratch preload. Production configuration guards are unchanged. Neither this owner nor the earlier checks constitutes a full host gate or CI pass. MAIN/adoption/activation/deployment remain held.

## Subsequent owning-suite restoration

Astra reviewed the narrow runtime imports and the now-confirmed headless fixture correction. MCP now imports the existing URL/key functions directly, and the unchanged dedicated-header constant lives in an import-free leaf while retaining its original public reexport. The same real first workflow step is used for both person assertions. The unchanged startup poison guard, exact service-header comparison and complete headless owner then passed together:39 tests,0 failures,127 expectations across3 files,9.96 seconds. Native MCP spec typing also passed. Dash's complete real token boot owner passed8/0/253 in14.66 seconds; its actual Nx task graph has exactly one dependency on the existing MCP prepare producer. This is graph plus owner evidence; it does not claim a clean full Dash target.

The subsequent configured full MCP target passed823 tests,0 failures across35 files in320.60 seconds, including its normal OpenAPI preparation. Full contracts target passed726/0/2872 across68 files in10.92 seconds. These runs used the existing testcase budgets, assertions and uncached normal targets. The only later executable MCP edit sorts two imports from import-free constant leaves to satisfy lint; no values, function bodies, requests or assertions change. Exact-checkpoint gate/CI remains required.

Two separate SQLite test corrections retain all production guards: identify the standalone membership FROM query rather than the credential query's join, and expect all five actual pending migration identities while retaining the exact four older identities. Complete owner files passed40/0/851 in9.71 seconds, reaching rollback/idempotence and queued-revocation phases. Native SQLite spec typing passed. No production migration bytes changed. These focused results do not replace the complete SQLite target or exact-SHA host/CI gates.
