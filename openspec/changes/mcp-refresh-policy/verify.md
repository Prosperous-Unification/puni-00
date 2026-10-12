# Verification Report

**Change**: `mcp-refresh-policy`
**Verified at**: 2026-10-13
**Scope**: First inert authority slice only; policy implementation remains incomplete.

## Task completion

Tasks 1.1–1.2 are implemented. Tasks 2.1–3.3 remain open: continuous binding and trusted-time transport, authoritative current policy reader, shared credential-rule admission, held-provider rechecks, end-to-end no-tool/successor proofs, and race proofs. Task 4.1 awaits the PM's exact-SHA host gate. This change is not ready to archive or activate.

## Failure proofs

| Check                                                          | Fault injected                                          | Production-path negative                                                                 | Observed result                                                                                                                   |
| -------------------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Shared authority guard before fresh-token return in `oauth.ts` | Guard absent before implementation                      | `refuses organization-bound automatic refresh without authority before provider contact` | Expected refusal; received resolved caller session with still-fresh upstream token. Restored guard: pass.                         |
| Same guard, forced path                                        | Guard absent before implementation                      | `refuses organization-bound forced refresh without authority before provider contact`    | Expected refusal; received resolved provider credential. Restored guard: pass.                                                    |
| Same guard, token endpoint                                     | Guard absent before implementation                      | `refuses organization-bound grant refresh without authority before provider contact`     | Expected 400; received 200. Restored guard: pass; zero provider contact, no successor session, refresh secret remains unconsumed. |
| Epoch classification                                           | Replaced epoch test with unconditional legacy admission | `refuses a corrupt nonzero-epoch family read before returning a fresh token`             | Expected SessionRefreshRefused; received upstream credential and session. Restored epoch test: pass.                              |

Tests compose a real durable SQLite store that attaches the existing organization/user/issuer binding during family insertion. The real OAuth consent/code/token flow creates credentials and each real entry path reaches the guard. No production bound issuance or epoch advance was added. Existing store-migration tests cover unsupported/malformed/missing durable epoch startup refusal; the new unsupported classification is additionally exercised by a corrupted family-read dependency on the automatic production path.

## Focused commands and output

`bun test apps/wbs/mcp-01/src/oauth.test.ts --test-name-pattern 'without authority'` before implementation:

```text
0 pass
153 filtered out
3 fail
9 expect() calls
Ran 3 tests across 1 file. [306.00ms]
```

Same command after implementation and final assertion correction:

```text
3 pass
153 filtered out
0 fail
18 expect() calls
Ran 3 tests across 1 file. [356.00ms]
```

`bun test apps/wbs/mcp-01/src/oauth.test.ts apps/wbs/mcp-01/src/session-store.test.ts apps/wbs/mcp-01/src/store-migrations.test.ts`:

```text
206 pass
0 fail
605 expect() calls
Ran 206 tests across 3 files. [12.30s]
```

`bunx eslint apps/wbs/mcp-01/src/oauth.ts apps/wbs/mcp-01/src/oauth.test.ts`: final exit 0. Initial run found four errors from awaiting Bun's void-typed rejection assertions; corrected to await the production promise and assert its caught outcome. Final warning twice:

```text
warning No cached ProjectGraph is available. The rule will be skipped.
          If you encounter this error as part of running standard `nx` commands then please open an issue on https://github.com/nrwl/nx
          @nx/enforce-module-boundaries
```

`bunx tsc --build --force apps/wbs/mcp-01/tsconfig.json`: exit 0, no output.

`git diff --check`: exit 0, no output.

Final additional epoch fault proof and restored focused run:

`bun test apps/wbs/mcp-01/src/oauth.test.ts --test-name-pattern 'without authority|corrupt nonzero-epoch'`:

```text
4 pass
153 filtered out
0 fail
20 expect() calls
Ran 4 tests across 1 file. [304.00ms]
```

`bunx prettier --check` on all changed files: exit 0, `All matched files use Prettier code style!`.

## Pending checks and limits

- Local `openspec` executable is absent; structural validation is pending the host gate.
- Full `bunx nx format:check --all` and test/lint/typecheck/build gate not run locally; PM will run `bin/h2puni-gate.sh <committed-sha>` on h2puni. Direct ESLint skipped module-boundary enforcement because its cached graph is absent.
- No full MCP suite, build, mounted tool refusal, provider-held policy mutation or new identity/time/race proof was run for this inert slice. Existing focused regression coverage passed; new policy contracts remain specified only.
- Delta specs are not synced. No merge, deploy, production migration or activation performed.

## Architecture review follow-up

Astra approved the bounded inert implementation at `add78a3cc703b677fa3ce969f7c2d1091b59d7ed` with no P1/P2 findings. A future activation caveat remains: `server.ts` catches forced-refresh `SessionRefreshRefused` and subsequently calls `endSession`, so the mounted caller ends the family even when a direct authority refusal leaves it intact. Bound requests are currently refused earlier in request authentication and cannot reach this branch. Task 3.3 explicitly owes the caller outcome distinction and mounted family-preservation/terminal-refusal proofs before activation; existing direct refresh tests provide no mounted proof.

The review follow-up changes only proposal-supporting documentation. `bunx prettier --check openspec/changes/mcp-refresh-policy` exited 0 with `All matched files use Prettier code style!`; `git diff --check` exited 0 with no output. A focused Python syntax check exited 0: `Delta-spec syntax: 6 requirements, each with a four-hash scenario and WHEN/THEN; passed. This is not OpenSpec CLI validation.` The absent local OpenSpec CLI and pending exact-SHA host validation remain unchanged.

## Controlled reader and provider-wait follow-up

Base: #383 exact head `fb881b53a95687337883150733fd8c281bec64b2`.
Worktree: `.worktrees/mcp-refresh-authority`; no release branch edits. Separate
OpenAPI expectation repair is commit
`ae5691a9657bdb0f8e5065c06870355439e2f911`, so it can be cherry-picked independently.

Implemented tasks 2.3, 3.1a and 3.1b only: optional constructor authority reader,
explicit trusted delegation lifecycle evaluation, fresh-token admission on all
three paths, identity matching, pre-provider and post-provider checks, rival
completion check, and non-consuming direct refusal with rotated-secret retention.
Production composition still installs no reader, issues only legacy unbound
epoch-0 families, and leaves `SUPPORTED_CREDENTIAL_EPOCH=0`. Existing be-01 calls
supply no delegation lifecycle and retain policy refusal.

### Test-first evidence

- Baseline OAuth/rule run: 166 passed, zero failed.
- Fresh policy matrix before implementation: 18 passed, 12 failed (admission and
  outage cases hit the inert refusal). After implementation: 30 passed, zero failed.
- Explicit trusted delegation lifecycle rule test: one failed before implementation;
  all ten core credential-rule tests passed after implementation.
- Initial held-provider matrix: zero passed, 12 failed. After implementation:
  12 passed, zero failed. Expanded identity and family-change cases also passed.
- Current source suite, explicit source filenames (excluding compiler output):
  `bun test ./apps/wbs/mcp-01/src/*.test.ts ./libs/wbs/application/core/src/ports/credential-rules.test.ts`:
  **429 passed, zero failed**, 17 files, 1824 assertions in the final run,
  including the additional lease-preservation assertions.

### R5 injected faults (restored after every run)

Each command used `bun test apps/wbs/mcp-01/src/oauth.test.ts --test-name-pattern <pattern>`.
The tests invoke real OAuth entry points and durable stores; provider and authority
services are controlled at their injected boundaries. No source-string assertion
is used to establish behavior.

| Injected production fault                          | Observed negative                                                                                                           |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Return before authority reading                    | `fresh provider token`: 48 failures; credentials escaped current membership/policy/identity/outage refusal                  |
| Default unknown lifecycle times to now             | `unknown .*fresh provider token`: six failures                                                                              |
| Compare bounds with `>=`                           | `equality.*fresh provider token`: six failures                                                                              |
| Omit each identity comparison separately           | `substituted <field>`: three failures for each familyId/clientId/subject/scope/credentialEpoch/organizationId/userId/issuer |
| Omit stored identity comparison after reader await | `family change during reader`: three failures                                                                               |
| Omit original/current identity comparison          | `family binding change`: three failures                                                                                     |
| Omit check after lease acquisition                 | `policy change at lease acquisition`: one failure; provider contacted before refusal                                        |
| Omit lease release after pre-provider refusal      | `policy change at lease acquisition`: one failure; lease remained held                                                      |
| Omit post-provider authority read                  | `after held provider`: 15 failures; stale completion escaped                                                                |
| Omit release after post-provider refusal           | `after held provider`: 15 lease assertion failures                                                                          |
| Omit retaining provider-rotated secret             | `after held provider`: 15 rotated-secret assertion failures                                                                 |
| Omit rival completion authority read               | `after a rival lease`: one failure; denied waiter received provider replacement                                             |
| Accept nonzero credential epochs                   | `corrupt nonzero-epoch`: two failures, including bound family with admitting reader                                         |
| Map unexpected reader failure to an outage         | `trusted reader defect`: three failures; defects lost their identity                                                        |

Production `Proof:` comments name these faults adjacent to the corresponding
checks. All mutations were removed before final checks.

### Checks and scope limits

- `BUN_TMPDIR=/tmp bun install --frozen-lockfile`: installed/checked locked dependencies;
  the initial attempt without the temporary-directory override refused read-only temp access.
- `BUN_TMPDIR=/tmp bunx @fission-ai/openspec@1.12.0 instructions apply --change mcp-refresh-policy --json`:
  succeeded. This uses CI's pinned version; a bare `openspec` was unavailable.
- `BUN_TMPDIR=/tmp bunx @fission-ai/openspec@1.12.0 validate mcp-refresh-policy --type change --json`:
  valid, one passed, zero failed, no issues.
- `NX_ISOLATE_PLUGINS=false NX_DAEMON=false bunx nx run wbs-mcp-01:typecheck`:
  succeeded, uncached. Direct TypeScript build also passed.
- `NX_ISOLATE_PLUGINS=false NX_DAEMON=false bunx nx run wbs-mcp-01:lint`:
  succeeded, uncached, with graph available and no skipped boundary warning. The first
  lint found two optional-chain style errors in the new tests; corrected and rerun.
- Direct ESLint on both changed core credential-rule files: exit zero, no output.
- Initial graph attempt printed a sandbox socket failure despite exit zero; the
  plugin-isolation/daemon overrides generated the actual JSON graph before lint.
- A broad Bun directory filter collected emitted `dist/out-tsc` tests and failed
  on 14 compiler-output module/proof errors plus a duplicate OpenAPI assertion.
  Explicit source filenames exclude those artifacts. The sole source failure was
  independently reproduced on #383: step patch now includes `estimateUnit`.
  The separate test-only commit updates that expectation and verifies string type,
  body location and preserved required path keys. Focused red: one failed;
  focused green: one passed, nine assertions. The repaired source suite is green.
- Full host gate, full repository format/test/lint/typecheck/build, production
  migration, merge, deploy and activation were not run or performed in this packet.
  The exact committed-SHA host gate remains PM-owned.
- Real organization binding issuance/session agreement (2.1), production reader
  (2.2), policy revision convergence and async-signing/publication fence (3.1c),
  signed final-use delegation/races (3.2), and mounted forced-refresh family
  semantics (3.3) remain open. Controlled direct OAuth tests do not prove those
  activation prerequisites or mounted tool dispatch behavior.
