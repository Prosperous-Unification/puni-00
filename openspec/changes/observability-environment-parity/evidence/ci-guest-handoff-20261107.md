# Task121 — deterministic guest coordinator component handoff

Status: implemented and frozen for parent independent review and publication. No commit or push. Sole owned source is `tools/tool-fleet/src/lab-guest-preparation.test.ts`:49 additions,3 deletions. Parent approved the concrete inherited-pipe proposal before edits; parent-owned OpenSpec/proposal/evidence changes were preserved.

## Identity and scope

- Baseline HEAD: `021a6ac3bd664765bf35c4e64bee7803594150d0` (PR760).
- Original owned-source SHA256: `a2457261417631e5c00cdcf3a9f1d4c4169a9dca6daf66b26c01d9fdf740900e`.
- Frozen owned-source SHA256: `349de65fd7ff750a71462d63f9800baef61c1e55386288a9e965726ab664566f`.
- Guest production Python unchanged: `6d180f9c1d2cd116ef314215a75c88774789d29daa882f81fbbf06a2e9263f2c`.
- Raw production Python unchanged: `3e78d2ea8aecced76bd82ea07fb006ce99a1b2212fec15fb805a8e8f7b27e8e8`.
- Provider startup fixture unchanged: `c00e48b53be208f4a14419034194c8da4d6806c105c0adc597cdd6792ba12b7d`.
- Native tools observed: Bun1.4.4 (`38afee6c8`), `/usr/bin/python3`3.12.3. Every shell command used `login:false`. aa39 source/report writes used approved escalation. No subagents.
- Source file is frozen after the adjacent proof comments and Prettier formatting, before the one final23-case run. No source edits followed that final run.

## Read-only diagnosis before the proposal

Read `LLM_README.md`, `AGENTS.md`, the Task121 brief, the existing lifecycle callers/fault matrix, native `lab-guest-preparation.py` coordinator/worker/evidence paths, `lab-raw-preparation.py` frame/persistence/coordinator paths, focused raw and seed lifecycle examples, and provider startup fixture. Applied systematic-debugging/TDD/verification-before-completion.

CI42179928044/job127767585765's sole actual workspace Fleet failure was the ordinary `group` component case (430.46ms). Its traceback reaches `lab-raw-preparation.py:930` sending the initial ACK and fails with `BrokenPipeError32`; failure.json says `raw-interrupted`, where the test requires `raw-terminal-invalid`. The group-events terminal check at raw:961–962 is later and was not reached. The original complete workspace had5695passes/7existing skips/1fail; same-source standalone infra had5696/7/0, so this report makes no production regression claim.

Full original log: `/tmp/puni-021-workspace-gate-artifact-20261107/nx-gate.log`, SHA256 `d615553d3496556b323d22c15100b1ec8a50e13198fc2ed7863a508c2f6a193f`. Sanitized original log: `/tmp/puni-021-workspace-gate-artifact-clean-20261107.log`, SHA256 `fed51de4bfdf31fec9b95372b42d7dc3e399e65eb908371d2a1d49429204c90c`.

The fixture child starts its0.2s initial receive deadline immediately after publishing ready, before the coordinator performs native /proc/file identity validation and native worker-ready persistence/fsync. It similarly starts its0.5s durability deadline before native worker-counter,serial,stderr,collector persistence/fsync. A delayed coordinator can outlive either child timer; the child exits through the existing refusal path, and the coordinator then writes to a closed pipe, overriding the intended fault category before terminal checking. The broad CI traceback alone does not prove which individual native operation was slow; controlled fsync delay proves a sufficient concrete cause with the same broken-pipe/category path.

Before source edits, `/usr/bin/python3 /tmp/task121-diagnose.py` extracted the baseline actual lifecycle and inserted native fsync delays only:0.3s for worker-ready.json and0.6s for worker-counter.json. Both group invocations deterministically exited1 with `BrokenPipeError` at raw:930 and raw:954 respectively and exact unwanted `group`/`raw-interrupted`. Timings0.504s/0.787s; initial log SHA256 `aeb2d06826a701836c34f4b85d96c0703578cbefa5334199cfa955c1798e846e`; durability log SHA256 `df767a0333bc1e5c0e1bff5b7a81cd2dc4c6bb5884d05dbbfa7da307c5d58f7f`. The diagnostic script was run against the baseline; rerunning its extractor against repaired source tests a different source identity.

## Minimal correction and preserved contract

One ordinary fixture pipe carries an initial `R` or durability `D` token. The child inherits only the original read end. The coordinator wrapper first completes the actual whole ACK write, then writes the token. Child validates the exact phase token before starting its unchanged0.2s/0.5s native `receive_frame` checks. The intentional missing-ACK fault still sends `R`, allowing the unchanged receive timer to expire and preserve `raw-protocol-incomplete`. Wrong initial/durability ACK contents still traverse their original validation. A refusal before sending any ACK leaves the child waiting until the existing native coordinator finally kills/waits it. Fixture finally restores the original Popen and closes both original pipe ends. The existing10s invocation/65536-byte output bounds and all native production timing/runtime/capacity/safety checks remain unchanged.

Real private files, raw writes, process identities, staging exclusion, actual EOF, pipe transport, and actual fsync remain on the exercised path. New recording wraps real fsync and marks a file only after its call returns; pre-ACK witnesses require worker-ready fsync and complete counter/evidence/collector fsync respectively. Both intentional delay cases delay the native fsync without replacing it. Existing fault categories and success retained-file counts remain exact; the production helpers and CI selection are unchanged.

## RED, GREEN and frozen focused verification

Four tests cross the initial/durability real-fsync delays with success/group. Before the handoff correction all four failed at the expected original ACK write; success cases could not publish acceptance and group cases retained the unwanted `raw-interrupted`. RED:0pass/4fail/4Bun assertions,253filtered,2.687s. After the pipe correction all four passed:4pass/0fail/12assertions,253filtered,2.506s.

After proof comments and formatting, the causally affected final cohort ran exactly once:19 existing lifecycle/fault cases plus4 new delayed cases,23pass/0fail/69Bun assertions,234filtered,5.550s. All cases assert empty stderr,exit0 and their exact success marker; Python additionally asserts exact refusal categories, receipt absence/presence, normal retained evidence and guarded raw-write outcomes. Existing missing/wrong/durable ACK faults stayed exact. Final delayed timings: initial success458.90ms/group453.27ms; durability success753.39ms/group753.36ms. Scoped format, ESLint and whitespace checks all exited0.

Commands below were run from `/home/df/.codex/worktrees/aa39/puni-00` via the retained `/tmp/task121-run.py` capture wrapper. These are the exact captured underlying command argv; wrapper invocation was `/usr/bin/python3 /tmp/task121-run.py <label> <argv...>`. Logs and command JSON copies are beside this report in `task-121-evidence/`.

```sh
/home/df/.bun/bin/bun test --preload ./tools/test/scratch/preload.ts --timeout=30000 tools/tool-fleet/src/lab-guest-preparation.test.ts -t 'after delayed native fsync'
```

Exit 1; elapsed 2.687s; log `task121-red.log`; SHA256 `55cd9e82a669a449ae7e1de90a23c8c2f77ae385f72ebe894f175ef094416113`.

```sh
/home/df/.bun/bin/bun test --preload ./tools/test/scratch/preload.ts --timeout=30000 tools/tool-fleet/src/lab-guest-preparation.test.ts -t 'after delayed native fsync'
```

Exit 0; elapsed 2.506s; log `task121-green.log`; SHA256 `3f250da8d8342433e2c5a121d870b0a10a16d490e608dee203c5decf6950a894`.

```sh
/home/df/.bun/bin/bun test --preload ./tools/test/scratch/preload.ts --timeout=30000 tools/tool-fleet/src/lab-guest-preparation.test.ts -t 'guest coordinator .* (joins native pipes, original files and durable ACK|handoff after delayed native fsync)'
```

Exit 0; elapsed 5.550s; log `task121-final-lifecycle.log`; SHA256 `3d00bd6d472c79fdaf63584a5ba82de981173d1d62bf4c0bdb254cad4c225463`.

```sh
/home/df/.bun/bin/bun node_modules/prettier/bin/prettier.cjs --check tools/tool-fleet/src/lab-guest-preparation.test.ts
```

Exit 0; elapsed 0.402s; log `task121-format.log`; SHA256 `17aa973d3f004560237d9a95171210b0671deff23d61628eecf7322ff5938f20`.

```sh
/home/df/.bun/bin/bun node_modules/eslint/bin/eslint.js tools/tool-fleet/src/lab-guest-preparation.test.ts
```

Exit 0; elapsed 2.302s; log `task121-lint.log`; SHA256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.

```sh
git diff --check -- tools/tool-fleet/src/lab-guest-preparation.test.ts
```

Exit 0; elapsed 0.008s; log `task121-whitespace.log`; SHA256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.

Formatting write before freeze: `/home/df/.bun/bin/bun node_modules/prettier/bin/prettier.cjs --write tools/tool-fleet/src/lab-guest-preparation.test.ts` exited0.

## Watched negatives and proof boundaries

Exact reproduction command: `/usr/bin/python3 /tmp/task121-proofs.py` (retained alongside its extracted scripts). This runs the real lifecycle against the native production coordinator; it never edits a production file. The two fsync faults compile the actual native `persist` function in memory while omitting only the named regular-file fsync call, retaining native writes/directory fsync. The two token faults replace only the respective pipe token with X. Every controlled invocation exited1 and reached the expected refusal/assertion. These were fault injections, not accepted alternate test outcomes.

| Injected fault           | Exit | Observed witness                       | Log / SHA256                                                                                                      |
| ------------------------ | ---- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| omit-worker-counter.json | 1    | durability ACK preceded evidence fsync | `task121-proof-omit-worker-counter.json.log` / `f30185f79582556b98f1530a1d30f98e757dd754f2f4423ae725f84223ac35fd` |
| omit-worker-ready.json   | 1    | initial ACK preceded ready fsync       | `task121-proof-omit-worker-ready.json.log` / `2cc6f9a7259b73fbb297a117fd2b6340c41803982470f7a7e68338ad3cd1e7b1`   |
| wrong-durability-token   | 1    | AssertionError: b''                    | `task121-proof-wrong-durability-token.log` / `b4cdcb81578fef2b2c2f19f330ea05279be58c8b7d36e45c02f2d32351188769`   |
| wrong-initial-token      | 1    | AssertionError: b''                    | `task121-proof-wrong-initial-token.log` / `8c50b14cdb10643bb7b4ecd3d493329dfecac11e9e03c4a2dc26034d29a0ae8e`      |

Initial token corruption reached native `raw-protocol-incomplete`; durability corruption reached native `raw-terminal-invalid`; the normal success expectation then failed. Existing child exception/exit semantics were preserved. Adjacent `Proof:` comments name each observed injection. The RED delays also prove both handoff coordination omissions are causally observable. No new production safety check was introduced or relaxed.

The complete retained local artifact inventory and byte/hash identities are in `task-121-evidence/manifest.json`. Captured `.json` command records retain original `/tmp` log paths; byte-identical log/script copies live beside that manifest. Full historical CI logs remain at the original `/tmp` paths and are not duplicated into the evidence directory.

## Self-review and unverified work

Self-review compared the complete owned diff to the brief and native caller paths. All19 existing faults remain unchanged, the missing ACK remains an actual missing ACK, the durability token follows the complete native ACK write, evidence is fsynced before acknowledgment, both original fixture pipe ends close in finally, and the existing coordinator owns child kill/wait on early refusal. The delayed group cases require exactly `raw-terminal-invalid`; the two delayed success cases require normal acceptance and eight retained files. No retry/skip, broad timeout change, error suppression, alternate category, production/helper edit or service/audit/KVM operation was added. No leftover source mutation remains from watched negatives.

The handoff gate intentionally relies on the existing finite10s outer invocation for whole-fixture liveness, as approved; it adds no independent longer clock. The unchanged0.2s/0.5s receive clocks still bound native frame parsing after bytes are available. The tests establish controlled fixture lifecycle/protocol behavior on this local host; they do not establish provider admission, actual systemd/QEMU/KVM service operation, loaded-host stability, a complete Fleet/app/browser matrix or a fresh CI/full gate result.

Parent explicitly owns final tool-fleet typing, independent review, combined source/OpenSpec publication, commit and fresh push. Those checks/actions were not run by this subagent. Full Fleet/app/browser/full host gates and old passing matrices were intentionally excluded by the brief. No missing required tool or unresolved local failure was encountered.
