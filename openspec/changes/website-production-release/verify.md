# Website production release verification

Status: public platform/protocol prerequisite implemented and independently reviewed. Private artifacts, fleet target, rollback rehearsal and live release readiness remain incomplete. No deployment or activation occurred.

## Public isolation and capability — 2026-10-25

Commit `5a634e9e51ffa54b9d3b1b3be7614ff630b7c852` adds one platform-owned `website-prod` Namespace with restricted admission/latest policy and an all-pod default-deny for Ingress and Egress. Production participates in the existing tenant validator; other tenants remain unchanged. The API build emits `conversion-scoping/1` alongside `retention-journal/1`; its package smoke requires the actual built values. Capability is independent of inference/analytics enablement.

The underlying persisted protocol is covered by the reviewed conversion implementation and [conversion verification](../conversion-scoping/verify.md): versioned draft state, raw Retry, structured replay/failure accounting, references, retention and proposal recovery. This capability slice does not itself implement private rollback enforcement.

All checks used `env -u FORCE_COLOR -u NO_COLOR` in the isolated launch worktree. Parent inspected the command logs in `/tmp/task9-public-release/`.

| Check                                                                                                                                 | Observed result                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `bun test --preload ../test/scratch/preload.ts src/platform.test.ts --timeout=30000` from `tools/tool-fleet`, after fault restoration | 93 passed,0 failed;194 expectations                                                      |
| `bunx nx run-many -t test lint typecheck -p tool-fleet --skip-nx-cache`                                                               | All3 targets passed uncached,1m41s                                                       |
| `bunx nx run-many -t test lint typecheck build -p website-be-01 --skip-nx-cache`                                                      | All4 targets and2 build dependencies passed uncached,2m37s                               |
| `bunx nx run website-be-01:test:package --skip-nx-cache` after capability restoration                                                 | Package and3 dependencies passed uncached                                                |
| Strict production OpenSpec validation, exact6-file Prettier check and `git diff --check`                                              | Passed                                                                                   |
| Normal commit hooks                                                                                                                   | Lint,format,plaintext-secrets,private-nesting and agent trailer checks passed; no bypass |

Successful Nx summaries suppressed individual full-suite case counts; none are invented here. Tool Wiki reported inactive/uncertified because its external activation root is unprovisioned. Migration/doc-caps checks skipped by file filters; this slice changed neither migrations nor LLM_README.

## Observed failure proofs

Five mutable production-manifest cases exercised the actual `validatePlatform`: absent namespace, removed restricted label, missing deny, Ingress-only and Egress-only deny. Before production membership, all five rejection assertions failed because invalid fixtures were accepted. After membership they passed. Removing only production membership again made all five fail; exact source restoration yielded93/93 platform tests. Existing namespace uniqueness/latest/all-pod checks were inspected but their unrelated historical fault catalogue was not repeated.

The updated package smoke first failed against the old actual built capability list. After the emitter changed it passed. Removing only `conversion-scoping/1` from the actual built file then made direct `bun run apps/website/be-01/build-smoke.ts` fail with the named capability refusal before journal smoke. Restoring the file and running the declared package target passed. Adjacent Proof comments name these observed faults; logs retain red/green/restored outcomes.

Independent scoped review approved all six files with no Critical, Important or Minor finding. It inspected existing tenant validation for the new namespace's exact protection, without rerunning green suites.

## Remaining evidence

No manifest apply, DNS change, production health-probe activation, secret provisioning, live release pin, traffic switch, provider call or analytics activation occurred. Private five-tree projection/environment-aware tools, capability-enforced pin/rollback, isolated fleet workloads/storage, built compatibility baseline/candidate, disposable runtime rollback, exact-SHA host gate and current live backup/provider/request evidence remain open. Source-only policy success does not prove current cluster isolation or production readiness.
