# Website production release implementation plan

Continue the authorized launch plan in its isolated worktrees using subagent-driven-development. Read [intent](proposal.md), [specification](specs/website-production-release/spec.md) and [design](design.md). This plan supplies the previously missing production/recovery part of conversion-scoping 5.3; it does not duplicate the funnel, analytics or model-evaluation slices.

## Constraints and dependencies

Production is `website-prod`, `https://puni.dev`, `https://app.puni.dev`. Development retains `website-dev` and its existing hosts. New active releases require `conversion-scoping/1`; inference/analytics toggles cannot waive it. No live pin, DNS, secret copying, provider-cap increase, erasure activation or development prospect migration belongs to preparation. Private source stays private. Record observed negative proofs and exact command output; do not substitute fixture success for live evidence.

Finish public funnel/analytics and the bounded real-provider evaluation before choosing the final public snapshot SHA. Public namespace/capability changes below also precede that gate. Preserve a private compatibility-baseline commit/artifact before changing the landing flow; do not lose that ordering while integrating private UI work.

## 1. Public platform and protocol contract

- [x] 1.1 Add `website-prod` restricted namespace and bidirectional default-deny in `infra/platform/policy/{namespaces,network-policy}.yaml`, extend `tenantNamespaces`/validation in `tools/tool-fleet/src/platform-manifests.ts`, and add the API build capability in `apps/website/be-01/build.ts`. Tests: `tools/tool-fleet/src/platform.test.ts` refuses missing production namespace, removed restricted admission and missing/one-way default-deny; `apps/website/be-01/build-smoke.ts` requires the actual built capability. Negatives: bypass each changed isolation/capability check while its corresponding rendered/built fixture is broken, observe failure, restore and add precise Proof comments. No live apply or unrelated platform refactor.

## 2. Private snapshot, build and pin identity

- [ ] 2.1 Project the committed public dependency closure into `puni-pr-00`, preserving exact tree identities and copying required prompt/test support. Update `docs/website/baseline.json`, `deploy/website/release-package.ts`, `dev/build-release.sh`, `k8s/release-pin.ts` and their tests for the fifth analytics tree. Tests refuse a modified analytics snapshot and accept historical four-tree records without inventing a fifth identity. Negative: bypass analytics tree verification and observe the drift fixture become incorrectly pinnable. Preserve the existing landing at this stage; create the compatibility-baseline source revision before private hero/service changes.
- [x] 2.2 Add a small explicit environment descriptor consumed by private build/pin/live-check/secret-provisioning tools. Extend the existing development CLI compatibly; new metadata always declares environment, exact origins and checksum participation. Separate build output/receipt destinations. Add tests in `dev/build-release.test.ts`, `k8s/release-pin.test.ts` `k8s/live-checks.test.ts` and `k8s/encrypt-secret.test.ts` for production origins, exact target Secret namespace/output path, unsupported environment, target mismatch, disabled analytics without ID and refusal of the known development ID when production tracking is enabled. Negatives: exchange environment metadata or restore a development origin/tag in a production fixture; the production-path build/pin test must fail before writes. Update private OpenSpec integration/runbook links before observable changes.
- [x] 2.3 Require `conversion-scoping/1` in private pin and rollback independent of inference/analytics. Tests in `k8s/release-pin.test.ts` refuse incompatible previous receipts, including when paid inference is disabled, leaving pins/receipts unchanged; a compatible prior receipt succeeds. Negative: remove the capability check and observe the exact incompatible rollback fixture mutate fleet state and fail its refusal assertion. Preserve the separate active retention-journal check. Document this stronger compatibility requirement in the private deployment contract.

- [x] 2.4 Make pin chronology explicit in private committed receipts and fleet selection without changing opaque build IDs. Use environment-scoped positive safe-integer pinOrder, strict unique modern order, and recognized historical-four-tree ordering before new pins. Add same-day reversed-hash pin/policy/rollback cases, malformed/duplicate/missing order negatives and observed guard-removal/restoration proofs before mutation. Record the private release ADR and preserve all compatibility floors. Source implementation and the sealed fleet draft are reviewed; enforcing fleet changes remain uncommitted until the real compatible pins required by 3.1/3.2 exist.

## 3. Isolated fleet target and compatible records

- [ ] 3.1 On an owned `puni-fleet` branch, add `apps/website-prod` and its suspended production Flux unit. Extend `tools/fleet-check/src/policy.ts` and tests to inspect both fixed environments, their receipts/dependency closure, capabilities, origins, namespace-scoped Secret references, isolated PVC/backup prefix and activation. Historical four-tree development receipts remain readable. Tests refuse cross-environment state, unknown target, missing capability and unsafe production activation; negative mutations bypass the specific checks and must make those real policy fixtures fail. Update project metadata and reuse existing rehearsal helpers without duplicating the full harness. Do not commit plaintext/generated secrets or a deployable fake receipt; report any required operator material explicitly.
- [ ] 3.2 Build the compatibility baseline and launch candidate for both development and production after private landing/services/privacy/analytics integration is verified. Keep their environment outputs/receipts distinct; production artifacts cannot satisfy development pin requirements. Extend the private release rehearsal (new focused `deploy/website/k8s/scoping-rollback.test.ts` plus its executable helper if needed) to start their actual built APIs against disposable storage containing legacy and versioned drafts. Verify raw Retry, structured replay/failure, accounting, exact body/references, pending proposal recovery and disabled-inference manual submission before/after rollback. Negative: select a pre-scoping build or strip the compatibility capability and observe refusal before rollback writes. No destructive migration or database restore is part of code rollback.

## 4. Evidence and activation handoff

- [ ] 4.1 Run affected public `tool-fleet`/API checks, private `website-deploy`/site checks and fleet policy/render/rehearsal checks; run the exact-SHA host gate from a clean isolated gate tree under its lock. Record actual output and all new failure proofs in verify.md after implementation. Keep original/public and licensed/private revisions and evidence separate. Any failed, absent or unrun required check is explicitly incomplete.
- [ ] 4.2 Produce the concrete compatibility-baseline/candidate identities and remaining operator commands for image publication, secret provisioning, fresh backup/restore, TLS/origin/release identity, capped provider identity and a preview request visible to Danylo Fedorov. Verify what available authorization/access permits; never claim the retained h2 key is the current h4 Secret. Keep production Flux suspended and DNS/live activation unchanged until the final concrete approval. Unavailable account/cluster evidence is an activation prerequisite, not a fabricated passing check.

## Verification commands

Use focused tests while editing, then the applicable existing project targets. The following are the scoped public commands; private tools use the same Bun/Nx commands inside their own repository:

```sh
bunx nx run-many -t test lint typecheck -p tool-fleet
bunx nx run-many -t test lint typecheck build -p website-be-01
bunx nx run website-be-01:test:package
./node_modules/.bin/openspec validate website-production-release --strict
```

The API `test:package` target depends on its build and runs the declared build smoke. The host-wide final gate remains `bin/h2puni-gate.sh <sha>` on h2puni or the documented h4claw gate tree. Its printed running SHA is authoritative. No raw full Nx gate on those hosts.
