# Verification

Implementation base: `bad12a7c83ac9de48c4b9fe51b73e7145dddbe20`, including closure implementation
`1ae4142bd34d37fa15678fabeb8fc6b34242c14f`. Work performed 2026-10-15 in isolated clone
`/tmp/puni-burokrat-entrypoint-owner-sol`.

## Production CLI regressions

Every new test invokes committed `extract-relationships` through the production CLI. Before the
patch the five focused cases returned 2 pass and 3 fail: the valid provider plus two importers
was refused as three owners, and zero/multiple explicit roots lacked their config provenance.
Single-transitive-emitter compatibility and missing-entrypoint refusal already passed.

With the patch the same cases passed: 5 pass, 0 fail, 55 assertions in 33.94 seconds. They cover
the provider's exact configuration identity and public selector identity compared with its
sole-program extraction, all five transitive declarations, configuration reorder equality,
a transitive declaration edit changing only the public identity, both ambiguity refusals with
sorted paths, the absent entrypoint and a sole transitive emitter.

## Watched faults

All injected changes were temporary and restored before the focused suite.

| Boundary                    | Injected fault                 | Observed production oracle                                                                                                                                                                       |
| --------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Explicit-root uniqueness    | Remove the root-count refusal  | Two explicit roots incorrectly exit 0; no explicit roots lose the named refusal to an undefined-owner error. Both negatives fail.                                                                |
| Shared-entrypoint ownership | Restore emitter-count refusal  | Valid provider with two importing programs exits 1 instead of 0; unique-provider success fails before identity/closure assertions. The original pre-patch run separately reported three configs. |
| Missing-entrypoint context  | Remove the zero-emitter branch | The absent entrypoint reaches shared-root refusal without the missing-emitter diagnostic; the exact boundary assertion fails.                                                                    |

Adjacent `Proof:` comments identify these observed cases. No check is inferred from test text
alone. Logs: `/tmp/entrypoint-owner-{red,green}.log` and
`/tmp/entrypoint-owner-mutation-{root-guard,old-emitter-count,missing-emitter}.log`.

## Focused checks

- Frozen Bun install passed: 1573 installs across 1447 packages checked, no changes. The first
  invocation needed `BUN_TMPDIR=/tmp` because the default temporary location was read only.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false NX_CACHE_DIRECTORY=/tmp/burokrat-entrypoint-nx-cache bun nx run twilight-burokrat:lint:source --skip-nx-cache`: exit 0, complete project source lint; 31.7 seconds.
- `bun node_modules/.bin/tsc --build --force apps/twilight-structure/twilight-burokrat/cli/tsconfig.json`: exit 0.
- Pinned installed OpenSpec 1.12.0 CLI `validate --all --json`: exit 0; 207 items passed, zero failed (189 changes, 18 specs). The raw cached package lacked its commander dependency; the installed cached CLI supplied the complete tool without adding repository dependencies.
- Changed-file Prettier and `git diff --check`: exit 0 before this record; final record formatting is checked below.

The full focused suite passed: `TOOL_WIKI_TRUSTED_NODE_MODULES=$PWD/node_modules bun test
./apps/twilight-structure/twilight-burokrat/cli/src/relationships/relationships.test.ts
./apps/twilight-structure/twilight-burokrat/cli/src/relationships/selectors.test.ts
./apps/twilight-structure/twilight-burokrat/cli/src/relationships/committed-target-facts.test.ts
--timeout=60000`: exit 0, 74 pass, 0 fail, 1192 assertions in 212.08 seconds.
Log: `/tmp/entrypoint-owner-focused.log`.

## Exact packed same-policy survey

Built and packed clean implementation commit `ac774f0c358db369c2048e537151e263cc29361e`
with the production packaging entrypoints, then installed the tarball in external consumer
`/tmp/burokrat-entrypoint-exact-consumer`. The installed package manifest authenticated that
exact source SHA. The first harness invocation rejected a mistyped expected SHA before running
the survey; the corrected assertion matched both Git HEAD and the installed manifest.

- Tarball SHA-256: `b4868c698019f66a2fad6cc2b1ed3a3a40658763304dd9ba8cbfbbcb462d1a56`; 31,757,584 bytes.
- Toolkit identity: `db3dcf59b03555b34b0219b400c9a0ce077df031aa550eb2c1f2f03eae494a79`; 348 trusted module instances.
- Unchanged diagnostic policy SHA-256: `afbf5c8a64200e7b60d603496c74e4223777a58891a69e3524ce161e822025fa`.
- Unchanged candidate revision: `7e160ba6911504d8bf46bb8674774d1006fb51d5`; candidate identity `27439665644653b40db7ffd26bcda465de1a65e0739d167459c72a0fb0629f12`.

From the external consumer, the installed executable ran the complete unchanged policy:

```sh
./node_modules/.bin/twib check committed /tmp/puni-burokrat-survey-20261015 7e160ba6911504d8bf46bb8674774d1006fb51d5 /tmp/burokrat-closure-diagnostic-policy.json
```

The command returned typed JSON, exit 1 in 241.855 seconds, `allowed:false` and
`certifies:false`. REL-EXTRACT and F1/K2–K6 no longer appear as unevaluated. The survey
preserves 123 debt findings: F1 1, F7 41, K6 77 and MOD-LAYOUT 4. Three independent
refusals remain: INV-CLASSIFY names the undeclared website apple-touch-icon PNG;
PERF-THRESHOLD reports its configuration differs from reviewed authority; SPEC-SCENARIOS
reports the competing wbs-domain overlay. No policy scope, observation mode or adoption changed.

Raw identity and streams remain outside Git at `/tmp/burokrat-entrypoint-exact-identity.json`
and `/tmp/burokrat-entrypoint-exact-survey.{stdout,stderr}`. No raw survey bundle is included.

## Remaining work

No full host gate, merge, push, publication, deployment or certification has run in
this worker; the coordinator owns the host gate and review/publication decisions. Existing
independent survey debt and refusals remain required outcomes, and the denied raw survey bundle
is excluded.
