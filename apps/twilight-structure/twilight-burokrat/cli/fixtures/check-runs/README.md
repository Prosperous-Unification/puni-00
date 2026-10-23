# Golden check runs

Each directory here is a check-run ledger that `twilight-dash run-activation-checks` wrote, byte
for byte, for a reproducible relocation candidate (`createRelocationCandidate({ reproducible: true
})` in `src/policy/relocation-fixtures.ts`):

- `passing/`: the candidate's Nx check passes.
- `skipping/`: the `skippingCheck` variant, whose check passes and whose `bun test` skip probe
  reports one skipped test.

The packed-package suite (`src/packaging/install.test.ts`, `src/packaging/consumer-bootstrap.test.ts`)
passes them as `--check-runs` to the installed `bin.mjs prepare-activation`. A released binary is
thereby proved end to end on receipts Dash really writes: it certifies `passing` and refuses
`skipping` with `check skipped work`. Twilight Dash's `src/check-runs/run-activation-checks.test.ts`
proves its writer reproduces both ledgers from their parts.

| Ledger                     | SHA-256                                                            |
| -------------------------- | ------------------------------------------------------------------ |
| `passing/check-runs.json`  | `00ee2da0a8908338e8592e94459a536209b4e89530dc22891ac7979f49c50770` |
| `skipping/check-runs.json` | `bf437bb37cfb051d98c4370134fde1d674adc0a40ee7e283e81f6c59316cfd37` |

`streams/` holds each run's stdout and stderr, named by SHA-256. They are Nx and `bun test` output
with carriage returns, colour escapes and measured durations, kept as written. The adjacent
`.gitattributes` marks every file under the ledger directories `-text`, so a checkout with
`core.autocrlf` cannot change the bytes the digests pin.

`src/policy/check-run-golden.test.ts` pins every digest. When the reproducible candidate's
revision or tree identity moves, it fails and names this file. That happens when the fixture
builder, its placeholders or the workspace `.bun-version` change. Regenerate from the repository
root, with `--skipping-check` on the fixture command for `skipping/`:

```sh
golden=apps/twilight-structure/twilight-burokrat/cli/fixtures/check-runs/passing
candidate=$(bun apps/twilight-structure/twilight-burokrat/cli/src/policy/relocation-fixture-cli.ts)
rm -rf "$golden"
bun apps/twilight-structure/twilight-dash/cli/src/entrypoint.ts run-activation-checks \
  --candidate-repository "$(jq -r .repository <<<"$candidate")" \
  --candidate-sha "$(jq -r .candidateRevision <<<"$candidate")" \
  --candidate-policy docs/wiki-policy/policy.json \
  --check-runs "$golden"
rm -rf "$(jq -r .workspace <<<"$candidate")"
```

Then update the digests in this table and in `check-run-golden.test.ts`. The instants and the
durations are whatever the regeneration measured.
