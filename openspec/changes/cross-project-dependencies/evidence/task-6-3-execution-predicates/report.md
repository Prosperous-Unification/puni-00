# Task 6.3 execution predicate proof (2026-10-23)

Base: `579f2fcf7fe86489cfebfdb4da44312b2b07a2da`. The existing mounted
`cross-project-startable.controller.db.test.ts` matrix sends real HTTP startable
reads and governed claim commands through composed SQLite. No production behavior
changed in this packet.

Two independent temporary faults were injected in
`libs/wbs/domain/domain/src/execution-eligibility.ts` and restored before the
green run:

| Fault                                                                                      | Command selection                                      | Observed failure                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Replace the FS `!predecessor.facts.done` branch with `false`                               | `-t 'FS advertised permission matches governed claim'` | Exit 1; isolated/shared local and remote FS all failed, 0 pass / 4 fail. The prerequisite reading said `canStart: true` where `false` was asserted; remote readings also lost the expected FS blocker. [Raw output](fs-fault.log). |
| Replace the SS `!predecessor.facts.started && !predecessor.facts.done` branch with `false` | `-t 'SS advertised permission matches governed claim'` | Exit 1; isolated/shared local and remote SS all failed, 0 pass / 4 fail, with the same incorrect `canStart: true` and absent remote blocker. [Raw output](ss-fault.log).                                                           |

Each fault used `BUN_TMPDIR=/tmp BUN_INSTALL=/tmp/puni-bun-install bun test --preload ./tools/test/scratch/preload.ts apps/wbs/be-01/src/controller/cross-project-startable.controller.db.test.ts` plus the selection shown above. After restoring both predicates, the unfiltered command exited 0: **37 pass, 0 fail, 447 assertions**. [Raw output](restored.log).

The failure occurs at the advertised permission assertion before the test reaches
its governed claim refusal assertion. The unchanged mounted matrix still checks
that refusal and atomic claim absence in the restored run. These faults prove that
the shared production evaluator influences mounted local/remote HTTP readiness;
the earlier admission-consumer bypass proofs remain separate. Parent task 6.3
remains open for MCP/skip-policy reconciliation and the integrated gate.

Focused verification on the restored packet: `wbs-be-01:lint:fast` and
`wbs-be-01:typecheck` exited 0; Prettier checked the changed test and Markdown
files; `openspec validate cross-project-dependencies --no-interactive` exited 0
with existing long-requirement warnings. The strict validator exited 1 on those
warnings. The full h2puni gate, MCP parity and integrated release checks were not
run for this bounded proof packet.
