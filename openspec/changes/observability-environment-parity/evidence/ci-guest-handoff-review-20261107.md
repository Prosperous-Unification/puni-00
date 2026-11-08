# Task 121 review

## Spec compliance

✅ **PASS.** The sole source diff matches the approved fixture-only handoff correction. Reviewed baseline `021a6ac3bd664765bf35c4e64bee7803594150d0`; independently hashed current `tools/tool-fleet/src/lab-guest-preparation.test.ts` to the frozen SHA256 `349de65fd7ff750a71462d63f9800baef61c1e55386288a9e965726ab664566f`.

The parent ruling at `.superpowers/sdd/observability-environment-parity/progress.md:3440` is technically appropriate: these component tests need to reach terminal and durability behavior despite coordinator scheduling/fsync latency. The new phase pipe changes fixture scheduling while retaining native ACK bytes and checks. It does not purport to validate production timing or native service admission.

- `tools/tool-fleet/src/lab-guest-preparation.test.ts:265` and `:286`: the child requires the exact initial/durability token before the existing native `.2`/`.5` receive checks. Tokens follow completion of `original_send` at `:349`, with the explicit missing-ACK exception at `:344` starting the original missing-frame timeout.
- `tools/tool-fleet/src/lab-guest-preparation.test.ts:341` and `:343`: ACK witnesses require the ready record and all four durability files to have completed real fsync. `:366` calls original fsync before recording completion. The native file and process paths remain exercised.
- `tools/tool-fleet/src/lab-guest-preparation.test.ts:364` and `:365`: controlled `.3`/`.6` native-fsync delays cross both original receive budgets without enlarging either; the four new cases at `:430` cross each phase with success/group outcomes.
- `tools/tool-fleet/src/lab-guest-preparation.test.ts:376` and `:384`: eight retained files and the exact existing refusal-category matrix remain asserted. The final 23-case log includes every existing lifecycle/fault case plus the four delayed cases. Outer limits remain 10000 ms/65536 bytes at `:419` and `:435`.
- `tools/tool-fleet/src/lab-guest-preparation.test.ts:388`: fixture finally restores Popen and closes both original pipe ends. No retries, skips, alternate accepted categories, production modifications, CI changes, or service/audit/KVM operations occur in the supplied source diff.

⚠️ The task-scoped diff does not establish hosted-load stability, an actual production regression, native provider/service admission, or a full gate/CI result. These remain explicitly outside this review. Parent-owned documentation changes were not reviewed as source changes.

## Strengths

The correction is small and directly addresses the observed causal path, including the second ACK phase rather than only the failing CI phase. The existing missing-ACK case remains a genuinely missing frame (`tools/tool-fleet/src/lab-guest-preparation.test.ts:344`). The new witnesses use completion of real fsync rather than substituting fake persistence (`:362`). Exact success and refusal checks remain intact (`:372`, `:384`).

## Findings

- Critical: none.
- Important: none.
- Minor: none.

## Concrete risks checked outside the diff

1. **Pipe inheritance could alter another subprocess call or conflict with existing launch keywords.** Checked the native guest coordinator launch at `tools/tool-fleet/src/lab-guest-preparation.py:1020`: its Popen call has the original stdin/stdout/stderr pipes, environment and client limits, with no existing pass_fds argument. The fixture wrapper at `tools/tool-fleet/src/lab-guest-preparation.test.ts:313` passes only its original read descriptor and forwards the native launch arguments. This per-invocation Python fixture owns the patch.
2. **A token-waiting child could outlive early native refusal.** Checked `tools/tool-fleet/src/lab-raw-preparation.py:998`: the native finally kills a still-running original client, waits, closes all streams and releases its selector/directory descriptor. The existing 10-second outer bound remains in the fixture; no independent longer wait was added.
3. **Fsync recording or tokens could hide ACK-before-persistence behavior.** Checked native `persist` at `tools/tool-fleet/src/lab-raw-preparation.py:426`, initial/durable sends at `:930`/`:954`, and `Evidence.durable` at `tools/tool-fleet/src/lab-guest-preparation.py:981`. They perform original file/directory fsync and evidence publication before ACK. Inspected the retained proof driver: it compiles the real persist function with only the named regular-file fsync omitted; both omission logs fail at the added witnesses. Corrupting each phase token also fails acceptance through the native coordinator. No production source is edited by that driver.

## Evidence inspected and verification

Read the supplied diff once. No changed-file context reread or git diff derivation was needed. Source line references were derived from the supplied hunk coordinates. No checkout/index/HEAD changes and no subagents.

Inspected actual retained RED, GREEN, final lifecycle, and four injected-fault logs. RED contains four BrokenPipeError failures at native raw lines 930/954, including exact unwanted group/raw-interrupted outcomes. GREEN has 4 pass/0 fail; final frozen cohort has 23 pass/0 fail/69 assertions in 5.55 seconds with no warnings. Fsync-omission logs show the exact initial/durability witness assertions; corrupted-token logs reach raw-protocol-incomplete/raw-terminal-invalid and reject success.

Independently verified all **33** retained evidence artifacts against manifest byte counts and SHA256 values, plus the frozen source hash and RED/GREEN/final/format/lint/whitespace hashes against the report. Inspected the recorded final-run and lint argv/exit codes. Scoped format/lint/whitespace evidence is clean. Parent reports independently successful owning Fleet native typecheck (exit 0); observed its log at `/tmp/puni-task121-fleet-native-typecheck.log` is empty, without rerunning it.

No tests or statics were rerun: existing runs resolve the concrete risks reviewed. Broad Fleet/app/browser/full-host gates and old matrices were intentionally not run. Historical hosted log provenance was not independently reaudited; controlled reproduction and retained RED/GREEN logs suffice for this scoped correction.

## Assessment

**Code quality: APPROVED.** No blocking or optional findings. The fixture handoff removes the premature child receive deadline while preserving the native frame checks, durability order, process cleanup and exact existing outcomes.
