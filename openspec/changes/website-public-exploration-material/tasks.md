## 1. Public content boundary

- [x] 1.1 Reproduce captured public exploration prose and candidate through mounted evaluator, then separate public material from private instructions — tests: captured safe public-exploration-message/candidate and captured exploration closure; negative: restore embedded examples to reproduce noPromptLeak failure.
- [x] 1.2 Preserve private-instruction and stage-hint rejection alone and mixed with public content in messages/candidates — tests: public material never exempts private disclosure; negative: disable private leak guard and observe mixed disclosure tests fail.
- [x] 1.3 Verify separate reviewed public/private inputs, one outbound public catalogue, user injection isolation and complete reservation pricing — tests: reviewed public material and scoping answers preserve and price full text; negative: remove public catalogue composition and observe outbound test fail.

## 2. Version and verification

- [x] 2.1 Record v11 and add its exact omission identity while retaining v1–v10/opaque history — tests: mounted current/historical replay and v11 question duplication; negative: remove v11 alias and observe mounted fresh/store/replay test fail.
- [x] 2.2 Run focused backend/shared tests, scoped lint/typecheck/build, changed-file format and OpenSpec validation; record fresh commands, causal proofs and limitations in verify.md and task report, then create a normal local commit.
