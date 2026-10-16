# Verification

## Scope and identity

Isolated checkout `/tmp/wbs100-plan-export-sol`, exact public main base
`4f098bfe2bf64343b8f503b5bdebd6e1a6fa34f4`. The original writer blob is
`30c00e6ef3550b2e25971703d673826b7935f0a0`.

The six model declarations and their JSDoc moved to `plan-export-model.ts`.
`plan-export.ts` preserves all six public types through type reexports. Existing
callers and original tests are unchanged. The writer has 739 lines; the model has 267. An exact text comparison after removing the extracted model and imports
confirms every remaining runtime declaration, JSDoc and body is byte-identical.

## Checks observed

Commands ran from the checkout root unless marked frontend cwd.

| Command                                                                                                                                                                                                                         | Observed output                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `BUN_TMPDIR=/tmp/wbs100-plan-export-bun bun install --frozen-lockfile`                                                                                                                                                          | Checked 1573 installs across 1447 packages, no changes; exit 0. |
| `TZ=UTC bunx vitest run src/components/wbs/plan-export.test.ts src/components/wbs/plan-mermaid.test.ts src/components/wbs/plan-export-bytes.test.ts src/test-tiers.test.ts --no-file-parallelism --maxWorkers=1` (frontend cwd) | 4 files, 124 tests passed; exit 0.                              |
| `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck --skip-nx-cache`                                                                                                                                                               | Typecheck and module dependency passed; exit 0.                 |
| `bunx eslint apps/wbs/fe-01/src/components/wbs/plan-export.ts apps/wbs/fe-01/src/components/wbs/plan-export-model.ts apps/wbs/fe-01/src/components/wbs/plan-export-bytes.test.ts`                                               | Exit 0, no diagnostics.                                         |
| `bunx prettier --check` over the three changed source files and this change directory                                                                                                                                           | All matched files use Prettier code style; exit 0.              |
| `bunx @fission-ai/openspec@1.12.0 validate wbs-plan-export-size-boundary --json`                                                                                                                                                | 1 item passed, 0 failed; exit 0.                                |
| `git diff --check`                                                                                                                                                                                                              | Exit 0.                                                         |

The first typecheck found a missing local `FilteredScope` import, and the first
lint found an unused import and export ordering. These were corrected before the
passing reruns. An empty isolated Bun cache failed DNS resolution; using the
existing frozen cache with writable `BUN_TMPDIR` succeeded. Vite emits its existing
`__dirname` config warning. Nx reports sandbox socket denial and executes plugins
in process.

## Fixed-input bytes and failure proof

`plan-export-bytes.test.ts` pins SHA-256 fingerprints of complete UTF-8 CSV,
Markdown, Mermaid and bundled Mermaid documents for one fixed scheduled plan.
The fixture includes quotes, commas, pipes, formula-like text, a colon, a newline
and backticks. Fingerprints were captured against the original writer before
extraction, then retained unchanged. The original 123 tests remain intact.

Proof: appending a single LF to the actual production CSV return changed its hash
from `070768dfcba15195091fe1f1f8092fd978aae4715d2569dd73ce670eb02e5a57`
to `452b179f674f5c7b318599bc7f9ee78efe71e6b4bf873e30994e38ba210e7159`.
The new byte test failed with 1 failed test. The fault was restored before the
passing 124-test run. Its adjacent `Proof:` comment records the injected fault.
No production safety check changed.

## Installed production F7 proof

Installed executable:
`/tmp/burokrat-entrypoint-exact-consumer/node_modules/.bin/twib`.
Package source revision `ac774f0c358db369c2048e537151e263cc29361e`, toolkit identity
`db3dcf59b03555b34b0219b400c9a0ce077df031aa550eb2c1f2f03eae494a79`, executable
SHA-256 `3432dfb59cc8d2caa31ea4dbd561aa2963ceb1572174f7e98a5410ece455849c`.
Unchanged policy `/tmp/binary-assets-successor-policy.json`, SHA-256
`052a3aa30b1ae091968cf01318c7ad89a32e4e3dc144479e73d0c6da0ae965de`.
The policy observes F7 at an 800-line ceiling; no selectors or exemptions changed.

From the installed consumer cwd, with the existing survey environment:

```sh
twib check committed /tmp/wbs100-plan-export-sol <revision> /tmp/binary-assets-successor-policy.json --rule F7
```

The exact base reports 41 F7 findings, including the selected production writer
at 994 lines. The extracted implementation commit
`1d744ccf1aedb1a8a85c21848ee18c94479cdc62` reports 40 findings: removing only the
selected finding from the baseline yields the complete candidate findings array.
Both have empty selected-rule `unevaluated`, `allowed:true` and `certifies:false`.
That intermediate commit preceded the lint-only import cleanup; the immutable
final head is evaluated again after this evidence packet is committed. The final
SHA, tree and completed verdict are recorded in the worker handoff.

A disposable clone `/tmp/wbs100-plan-export-fault`, committed revision
`f5ddd7a3fb50378aa9ab617ebdedf01387869d5f`, restores the exact original production
file. The same installed evaluator reports the 994-line finding again. CLI exit 0
is expected for observed debt, so this explicit assertion is the failure oracle:

```python
# Proof: restoring the original production file yielded its 994-line finding and failed here.
assert not [f for f in verdict['findings'] if f['path'] == selected]
assert verdict['findings'] == [f for f in baseline['findings'] if f['path'] != selected]
assert verdict['unevaluated'] == baseline['unevaluated']
```

The assertion exits 0 on the extracted candidate and exits 1 on the restored-file
verdict with `AssertionError: selected plan-export.ts F7 finding remains`. Raw
verdicts and logs are retained under `/tmp/wbs100-plan-export-*`; the disposable
fault commit is never merged. No fault was applied to the implementation checkout
for the F7 proof.

## Full survey and deferred gate

The exact-base and immutable-final full installed surveys use the same command
without `--rule F7`. Their raw stdout/stderr, comparison and candidate identities
are retained externally under `/tmp/wbs100-plan-export-full-*` and reported in the
worker handoff after completion. The selected-rule proof above makes no claim
about full-rule unevaluated entries. Full-rule acceptance is not certification.

The parent reserves the host gate for the reviewed immutable commit. The full
monorepo gate, build, browser tests, CI secrets/migration lint and
`bin/h2puni-gate.sh <sha>` have not run in this worker packet. No push, publication,
deployment, WBS100 closure or debt elimination outside the selected file is claimed.
Delta spec sync and archive remain pending review. No domain terms or ADR were
introduced.
