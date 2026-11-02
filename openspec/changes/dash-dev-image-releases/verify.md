## Commands and outcomes

- Baseline `bun test .../src/cli.test.ts` with Bun default 5-second timeout: 26 pass, 2 startup timeouts. No source change was made to hide the timeouts. Re-run using the project timeout budget (`--timeout 30000`): 28 pass, 0 fail.
- `bun test .../src/ops/release.test.ts .../src/cli.test.ts --timeout 60000`: 50 pass, 0 fail, 176 assertions. Includes real Bun adapter invocation and both profile branches.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t typecheck build -p twilight-dash --output-style=stream`: exit 0, both targets passed.
- Initial Nx lint: nine new-file findings. Imports, expressions and index typing were corrected; covering ESLint autofix run exited 0. Final complete Dash lint target passed (exit 0, 1m12s).
- `bun node_modules/.bin/openspec validate dash-dev-image-releases --strict`: valid.

## Failure-proof table

Faults were injected into the production module, each named test was run against the real entrypoint, and the original file was restored in a `finally` block. Raw local evidence: `/tmp/dash-release-proofs.json`.

| Check                         | Injected fault                                       | Observed test                             | Outcome                                                                     |
| ----------------------------- | ---------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------- |
| Flag grammar                  | Removed grammar refusal                              | Unknown and duplicate flag cases          | 2 failures                                                                  |
| Request schema                | Broadened action/environment/profile enums           | Invalid action and profile cases          | 2 failures; independent development guard still refused invalid environment |
| Development-only fast profile | Removed environment guard                            | Production fast with valid adapter        | 1 failure; adapter executed                                                 |
| Protected configuration       | Replaced descriptor-bound reader with unchecked read | Exposed 0640 config                       | 1 failure; adapter executed                                                 |
| Dispatch schema               | Bypassed shape validation                            | Version-2 configuration with valid target | 1 failure; adapter executed                                                 |
| Unknown target context        | Removed modeled refusal                              | Unknown target case                       | 1 failure; required target-specific outcome lost                            |

The protected reader's existing unreadability, absence, regular-file, ownership and symlink guards are reused unchanged, and are also exercised through the new command.

## Review and additional checks

- Independent scoped code/spec review: no actionable findings. Reviewer's sandboxed test run hit EPERM (17 pass/5 fail), so it is not counted as acceptance; the root's escalated production-entrypoint run above supplies passing evidence.
- `bun test .../src/compute/report-capacity.test.ts --timeout 60000`: 23 pass, 0 fail, 61 assertions; covers the existing protected-configuration consumer.
- `git diff --check`: exit 0.

- Real cross-repository divergent-branch integration (`bun /tmp/website-facade-branch-proof.ts`): passed from the public cwd, exact selected private/public feature commits differ from main, original dirty/private and public checkouts preserved, and no builder/Fleet mutation. Local evidence: `/tmp/website-facade-proof-yGtDxN`.
- Independent actual full-builder/fast-builder/Docker/registry proof (`bun /tmp/website-fast-real-builder-proof.ts`): passed. A site-only update compiled/built neither app nor API, reused both exact registry digests and preserved API writer ENV/runner identity. Compilation alone used controlled synthetic Nx output; no live deployment was exercised. Local evidence: `/tmp/website-real-fast-proof-pbPeNT`.
- The early entrypoint dispatch is restricted to `ops release`, so future sibling `ops job`/`ops pool` commands continue to their own dispatcher rather than being intercepted by this facade.

## Remaining acceptance

Companion adapter implementation, combined review, full exact-SHA host gate, required CI and merges remain pending. No live release or production action was requested or performed.
