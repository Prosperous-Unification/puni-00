# Portable runtime request codec tasks

Implements [runtime request design](runtime-request-design.md) and the portable identity requirements in [WBS run bridge](specs/twilight/wbs-run-bridge/spec.md). Parent bridge/coordinator acceptance remains open.

## Global Constraints

- Start from reviewed integration `ebda8a216c73a38050579bdc46f5da927223b3eb` in the isolated codec worktree. Keep the integration candidate and its active gates fixed. One source implementer, Bun/Nx only, including fault/edit scripts.
- Root owns intent/spec/design/glossary/tasks/verify, index/HEAD/commits, reviews and exact-SHA full gates. Worker owns only the ten source/test/navigation paths below plus its ignored report/evidence. Report a concrete missing path/cause before expanding scope. No subagents or Git mutation.
- Preserve every version 1 canonical byte, strict parser predicate, copy-before-admission rule, endpoint response, ordinary batch behavior and migration SQL/hash. Move one implementation; no duplicate canonicalizer or app import from contracts. No credentials/auth/refusal/CTT/provider/RunStore change.
- Export the existing seven functions through `@wbs/contracts`; the application module explicitly re-exports the same functions. Hashing stays in existing injected adapters. Input parsing and byte correspondence grant no receipt authenticity or execution/spending authority.
- Use independent literal expected bytes and literal 0/200/201 boundaries. The existing HTTP receipt applied-array bound must stay aligned too. Do not derive every oracle from the constant or the function under test.
- Every new/changed check or dependency needs a production-path negative from green, watched failure, exact restoration and adjacent truthful Proof. Preserve unchanged guard history without claiming a fresh blanket recertification. Root will not edit held source during faults.

### Task 1: Publish the exact existing codec and one unchanged batch bound

**Files — exactly ten:**

1. Create `libs/wbs/domain/contracts/src/runtime-request.ts`.
2. Create `libs/wbs/domain/contracts/src/runtime-request.test.ts`.
3. Create `libs/wbs/domain/contracts/src/plan-command-values.ts`.
4. Modify `libs/wbs/domain/contracts/src/index.ts`.
5. Modify `libs/wbs/domain/contracts/src/http/runtime-command-shapes.ts`.
6. Modify `libs/wbs/domain/contracts/src/http/runtime-command-shapes.test.ts`.
7. Modify `libs/wbs/domain/contracts/README.md` for explicit navigation only.
8. Replace `libs/wbs/application/core/src/module/plan-commands/runtime-request.ts` with explicit compatibility exports.
9. Modify `libs/wbs/application/core/src/service/plan-command.ts` to re-export the shared constant, retaining its existing PlanCommand type export.
10. Modify `apps/wbs/be-01/src/controller/runtime-command.controller.db.test.ts` only for real public-codec/receipt correspondence and required fixture assertions.

**Interfaces:** Preserve names/signatures `canonicalRuntimeRequest`, `parseCanonicalRuntimeRequest`, `parseRuntimeAuthorityRequest`, `parseRuntimeLookup`, `parseRuntimeStateRequest`, `parseRuntimeClaimRequest`, `parseRuntimeWriteRequest`; export existing `MOST_COMMANDS_IN_A_BATCH = 200`. Contracts code imports relative portable values, ArkType and the contracts constant, never core or the contracts index itself. Existing application callers/tests continue through their old facade. Do not add a second byte/hash format.

- [x] 1.1 Add public-contract tests before implementation: independent literal authority, claim and ordered write bytes, shuffled caller keys, explicit null/zero, optional reference name and complete execution identity; strict decode rejects noncanonical bytes and malformed/extraneous inputs. Missing-export RED is setup evidence. Move the complete codec, wire the explicit facade and public index, then pass these tests plus existing unchanged `core/.../runtime-request.test.ts`.
- [x] 1.2 Publish and consume the one 200-command bound in codec, HTTP command/applied arrays and ordinary service re-export. Add independent empty/200/201 public codec and HTTP-shape cases. From green, fault the shared value to 201 and watch each independent canonical/HTTP boundary negative fail. Separately run unchanged real ordinary batch guard coverage under that fault: `controller/work-item.controller.test.ts` case `refuses a batch that is not a list of known commands before applying any` (literal 201, actual forbidden 200), and/or `service/plan-commands.db.test.ts` case `refuses two hundred and one commands before applying any`. Restore exact bytes and green output; distinguish cap-order 400-versus-404 evidence from actual forbidden success. No edits to those unchanged ordinary test files.
- [x] 1.3 Through the existing real mounted app/shared client in `runtime-command.controller.db.test.ts`, compare actual authority/claim/write receipt digests to SHA-256 of the public codec using the authenticated observed scope and exact operation. Existing `acquireAuthority`/claim helpers provide real state, requests and receipts; remove only the wire-only personId when constructing the strict operation. Independent literal fixtures still anchor byte compatibility. Exercise a narrowly targeted codec-consumer fault if needed to prove the producer uses the shared boundary; retain original strict/detachment tests and do not fake receiver acceptance or claim authentication from a digest.
- [x] 1.4 After all edits/faults, run final public codec/HTTP tests, unchanged application codec tests, actual backend runtime HTTP/authority and exact ordinary cap cases, plus generated MCP document coverage. Prepare a real Nx graph, then actual module/effective-policy checks and relevant uncached contracts/core/backend/MCP typecheck/lint. Run exact touched-file format/diff and normal scoped OpenSpec. No complete SQLite repeat for unchanged SQL/storage without a named new concern.
- [ ] 1.5 Report final hashes, exact counts/exits/durations, original/mutated/restored evidence and warning/skip limits; release the source hold. Root independently reviews and commits the candidate, then runs exact-commit host gate and applicable CI before packet acceptance. Parent bridge/coordinator/S0/S7a and activation stay open.

**Report:** `.superpowers/sdd/runtime-request-tasks/task-1-report.md`; evidence `task-1-evidence/`. No worker commits, docs/spec changes, extra source paths or full host gates.
