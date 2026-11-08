# Focused integrated R18 verification — 2026-10-28

This record supplements [the verification index](verify.md). It records selected integration checks at their executed source epochs. It is not a full gate, CI result, MAIN/PR630 adoption, provider acceptance, or architecture decision. Evidence identifiers below are SHA-256 hashes of retained private receipts/reviews; their infrastructure paths and credentials are deliberately omitted.

## Source epochs and commands

The first mounted grant sequence used source manifest `827504206719e0c83d43983087c1bb6282c8b7fd74336a07cae6821a3e22e143` (staged tree `6975b29bad835e3b179553d277ac08d61c7f103a`). The later SQLite typing/model, MCP ordinary owner and runtime renewal sequence used source manifest `2f941cd2a5bdb66cf9db42f777561c799a3489f686917a5d682bb4df86fa15d1` (staged tree `b39f181c1b0165b305aadf2b362bc66c98512685`). The intervening proxy-config and SQLite model fixture repairs were separately reviewed; old failed executions remain failed at their original epochs.

Commands ran from the integrated repository root. Below, `$BUN` denotes the pinned Bun executable; `$NATIVE_TSC` denotes the installed native ELF at `node_modules/@typescript/typescript-linux-x64/lib/tsc`, not a JavaScript or Nx wrapper. These aliases render the actual executable identities without private host paths; all arguments are unchanged. Pinned executable SHA-256: Bun `10702245766b225e70bbf6235fd6b47214fd94b4760d00ffaed8ab0df57ac235`, native tsc `4f2de678286401759b3fb4475bafe35b8f32b4b3a07d92642bbf37eadc9b34a4`.

```sh
$BUN --no-env-file --no-install test ./apps/wbs/be-01/src/controller/machine-grant-run.controller.db.test.ts --timeout=10000
$BUN --no-env-file --no-install test ./apps/wbs/be-01/src/controller/runtime-write.db.test.ts --timeout=10000
$NATIVE_TSC --project libs/wbs/adapters/store-sqlite/tsconfig.spec.json --noEmit --listFiles --pretty false
$BUN --no-env-file --no-install test ./libs/wbs/adapters/store-sqlite/src/claim-run-lease-race.db.test.ts
$BUN --no-env-file --no-install test ./apps/wbs/mcp-01/src/connected-command-parity.test.ts
```

Each execution had its own admission and original direct-file capture, process-group cleanup and source/dependency/cache custody. Phase/child/cleanup bounds were respectively 300/120/2 seconds for each grant/runtime owner, 300/60/2 for native typing, 450/300/2 for the model and 900/600/2 for MCP parity. Model and MCP commands had no CLI timeout override: the source retained its 240000ms property and 45000ms default per-test bounds. No retries or extended allowances are credited here. These were trusted ordinary executions, not network or universal filesystem confinement.

## Two scoped production-path renewal proofs

Production `plan-commands.feature.ts` originally and after each exact restoration was `8a54c246a1b7995bec62cc90c9ae4e912c61429f3e0683d6bd78f1e4f4fca894`. The faults were isolated and separately admitted; failed wrappers and raw output remain FAILED. Failed wrappers did not reach ordinary postflight; separately admitted file-only custody did not change their FAILED classification.

| Fault and reached assertion                                                                                                                                                                                                                                                                                                                                                                                                                | Actual negative                                                                                                                    | Exact restoration and same owner                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Renewal run argument `commandCredential.runId ?? null` replaced only with `null`. `adds a successor-owned link and renews due A and pre-opt-in leases, leaving B unchanged` reached the actual lease comparison: B incorrectly renewed, while A/null were correct.                                                                                                                                                                         | Full17: 15 pass, 2 fail. The other run-scoped write also failed.                                                                   | Full17: 17 pass, 0 fail, 57 expectations.                                                  |
| All four renewal predicate/call references to `commandCredential` replaced with outer `credential`. The runtime execute path's outer credential was null, so renewal was skipped. `rolls back renewed leases and announcements after a late runtime receipt failure` reached the real receipt INSERT, but its cause was `late runtime receipt missing staged renewal or progress`, rather than `late runtime receipt after lease renewal`. | Full61: 57 pass, 4 fail, 343 expectations. The other failures were actual renewal/replay and two late mixed-receipt trigger cases. | Full61: 61 pass, 0 fail, 364 expectations. All61 ordered names matched the negative owner. |

The runtime fault did not forward a stale run or cause a null dereference. Assertions after each negative's failing boundary were not credited until the restored owner passed. Restored runtime success includes admitted agent/sess-42 forwarding despite the corrupted caller alias, run separation, snapshot rollback, no escaped publication/delivery, and the subsequent successful renewal/receipt assertions implemented by the owner. These proofs cover these two renewal roles; they do not establish every admission, rollback or concurrency guard.

Retained proof joins:

- First role ROOT adoption: `969574816ecb065442f0ced127854257576d8f8f73f7eac76f58ce537d154c93`; negative review `4cff2f47c1a474864c237533e81ec7b862d99cbfbd20fb9ba0ef0d3affe72d7a`; restored review `559a7c38193e2cb6994d790d74807dcae49a62c73458220c6702b7027d7483dd`; restored final `3ab6145c2cec164ae1b45a2de9a032fb8ff72434fb9b2347a42169a6e3296838`.
- Second role negative review: `ba927dd7515a67cccfd27f689fa141cda77754d3e575e3da224fd991850623ab`; exact restoration `9f40e7196e19759a71bf839f1361b01e8782887d7d02d0bb5e0a58b29d716d59`; restored review `bbac12228990f7c31aba394f44dccbebac5148151294d8334884a1ffecd59aac`; restored final `792064ba0bfd541f3ded0d09da733abbfba089c784d76d9a92842d358e9d91d3`; ROOT aftercheck `c76ef4574cf8804c3b7e7d15a7628c2d3f1fa2e4e6e786698480abcc6c1b33af`.

## Fixture repairs and actual selected results

SQLite native typing passed after the supported API fixture repair: 1802 unique actual listFiles paths, zero diagnostics, and all four required selected files each once, including `claim-run-lease-race.db.test.ts`. Native review `20ce2299a21de0e1bd610c29eb2790ec03ec9b704555075172cb488dcad953ca`; final `4b4e9a527f385aff4b507a1e5ac0d76e2119c5acf8d96c507924013af574a215`. This preserves configured skipLibCheck/skipDefaultLibCheck and proves only that selected native program. The preceding six-diagnostic failure was not relabeled.

The whole run-lease model then passed one test, zero failures, 755 expectations. Its unchanged seed20261027,100 runs,max24 commands and four counter thresholds remained active, with real SQLite composition and preserved optional run identity. Review `f05ddd467bd2aa9bbb5d79d9ad32a7a7bc46942f21b5b24ad28bf84353d115a5`; final `77cbdf0db4e4a3b18ebde3f61d86ad83770cadab9154e70e87f03ca63792cb2a`. The result covers that seeded one-step-per-leaf model, not arbitrary schedules, mounted authentication or a new mutation proof.

The complete MCP ordinary parity owner FAILED: 74 pass, 7 fail, 963 expectations across81 cases. Review `89ffaa66f0dca363a384afbd78d20f68bdb9cc3f6ab36f42002a1a845a8814a2`; failed final `9784fe0d4a22639adb5095c7c44c52118a4fdc075bb651c8dde98ae4401bb0f6`. All seven exact request comparisons omitted the production `redirect: 'manual'` and AbortSignal fields; their later assertions were not reached. The four-line fixture proposal `2717cb305c8326e30ec7d0c37d09f7bf52b044333508348b4b523e6fbc81649e` has source-only acceptance `afb32568ff4c186a7fd5fb1ba8bcf4b8c8a7e15a44890fadef0fac06091103c3`; it was not applied or rerun at the recorded execution epoch. Its strict URL/header/body equality and prior Proof comment remain intact. A future applied epoch needs its own source binding and complete-owner result; this document predicts no pass.

MCP process-group cleanup completed, but one private SQLite DB/WAL/SHM fixture directory remained. Separate file custody preserved it; the deliberate forced-SIGKILL case is a source-supported likely origin, not a captured case-to-directory attribution. No empty-scratch or full storage-cleanup claim is made. No DB contents or ephemeral bearer values are included here.

## Remaining verification

The two new adjacent renewal Proof comments are comment-only; the proposed MCP expectation repair is a test-only compatibility change. Neither retroactively changes the tested epochs or makes this proposed source the executed full baseline. Existing historical qualification evidence retains its original input bindings. No fresh performance, memory or native generation campaign is implied.

Full current-source formatting, lint, broader tests/typechecking/build, OpenSpec validation, exact-commit host gate and CI remain open. MAIN/PR630, merge, deployment, provider and architecture adoption remain held. Individual normal and negative successes above do not settle those requirements.
