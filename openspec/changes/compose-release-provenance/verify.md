# Compose release provenance verification

## Scope and state

The implementation adds source/check and digest-bound image admission to the actual Compose command before remote preflight or swap. It uses existing CI verdicts and the existing registry reader. No provider writes, added CI jobs, production deployment, secret changes or host executor installation are part of this release.

Implementation source: ac334359b6, 021d74b5cd, dd58eec8ef, befd0730dd and 9355a99b1f. Independent task reviews approved the neutral core, GitHub adapter, corrected image adapter and CLI integration. Whole-branch review, canonical host qualification, exact-head PR checks and merge remain pending; this record does not claim them complete.

## Observed commands

Commands ran in the isolated implementation checkout with Bun/Nx on 2026-11-12. Task logs and mutation receipts are retained privately in /tmp/puni-compose-provenance-20261112; no credentials are included in the public record.

| Command                                                                                                                                                                                              | Observed outcome                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `bun test tools/tool-deploy/src/provenance.test.ts`                                                                                                                                                  | 78 passed, 0 failed; neutral revisions/providers and required-check/image claims.                                                         |
| `bun test tools/tool-deploy/src/provenance-github.test.ts tools/tool-deploy/src/provenance.test.ts libs/shared/adapters/delivery-github/src`                                                         | 332 passed, 0 failed, 572 assertions.                                                                                                     |
| `bun test tools/tool-deploy/src/provenance-images.test.ts tools/tool-deploy/src/k8s/registry.test.ts`                                                                                                | After the origin-binding fix: 69 passed, 0 failed, 134 assertions.                                                                        |
| `bun test --preload ./tools/test/scratch/preload.ts tools/tool-deploy/src/provenance-cli.test.ts tools/tool-deploy/src/legacy-delivery.test.ts tools/tool-deploy/src/deploy.test.ts --timeout=10000` | 118 passed, 0 failed, 380 assertions, 11.11 seconds. Real Bun CLI child, provider/core/OCI implementation and captured SSH command trace. |
| `bunx nx run tool-deploy:lint`                                                                                                                                                                       | Passed uncached after final CLI source changes.                                                                                           |
| `bunx nx run tool-deploy:typecheck`                                                                                                                                                                  | Passed uncached after final CLI source changes.                                                                                           |
| `bunx nx run-many -p tool-deploy shared-delivery-github -t build`                                                                                                                                    | All 16 targets/dependencies passed, no cache hits, 4.7 seconds.                                                                           |
| `bun node_modules/@fission-ai/openspec/bin/openspec.js validate --all --json`                                                                                                                        | 343 valid items: 323 changes and 20 specifications; 0 failed.                                                                             |
| `bun tools/tool-devsync/src/check-documents.ts`                                                                                                                                                      | Verified current documents and indexes.                                                                                                   |

Owned source and documentation passed targeted Prettier checks. Normal commit hooks ran without bypass; external Tool Wiki certification was visibly inactive because its activation root is not provisioned. This does not establish certification. Full-repository format and full test qualification remain pending below.

## Watched failure proofs

Production guards were temporarily removed or their external dependencies faulted, observed failing, then restored before green verification and commits. Adjacent Proof comments identify the corresponding fault/test.

| Boundary                             | Observed fault and negative proof                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Neutral source/check/image admission | No-op scaffolding: 61 rejection failures; added origin scaffolding: 10 failures. All 27 individual guard removals caught by real predicate tests. Includes absent/duplicate checks, wrong source/ref/pipeline, cancelled/incomplete outcomes and inconsistent image claims.                                                                                                 |
| GitHub observation                   | 45 mutations caught: wrong/malformed origin and records; incomplete/tied inventories; stale run or retry; missing/duplicate/latest bad checks; altered source identities; observation timeout and opening/closing drift. All restored before the 332-test green run. Boundary-message proofs are distinguished from unintended-admission proofs in the private task report. |
| OCI admission                        | 13 initial mutations caught, including missing/wrong frontend revision, selected-set timeout reset, corrupt metadata, ambiguous credentials and credential destination mismatch. Removing redirect refusal admits otherwise valid bytes and fails the actual redirect-server test.                                                                                          |
| Effective credential origin          | Initial host-only comparison failed six alias negatives. Changing to origin passed; restoring host-only comparison or removing origin binding again failed all six. Fetch interception observed attempted authenticated HTTPS origins without transmitting credentials or opening privileged ports.                                                                         |
| Actual command wiring                | Removing the main acceptance call caused nine wrong-label/hash/source/check/origin cases to reach forbidden SSH preflight/swap commands. Original command failed four malformed unselected MCP publication cases. Restored implementation refuses before remote preflight/swap, with no secret output.                                                                      |

Success cases cover a current verification, explicitly carried earlier pixels success with its original attempt, one all-tier swap, partial gateway publication, valid unselected MCP and release-file replacement during observation while using captured claims. Dry-run performs no provenance reads and explicitly remains unverified.

## Real read-only observation

At 2026-11-12T07:53:38Z the actual anonymous adapter read main source 7614ca5116e2b27831076f7bc7c9f9872051c388, GitHub execution 42880292473 attempt 1: gate failed, pixels passed. The core refused it with “Deployment verification execution did not pass.” No tests or provider writes were triggered. This proves live normalization/refusal for that source, not acceptance of a new release.

## Incomplete or unavailable verification

- A wider `bunx nx run tool-deploy:test` was deliberately interrupted with SIGINT at 3m57s during controller-release tests. It produced no complete verdict and is not credited as a pass.
- An unrelated baseline installer test had previously failed CI with exit 143. A read-only diagnostic run passed 50 tests and 376 assertions in 37.58s; the historical cause remains unknown and no fix is claimed.
- Canonical host gate, final independent review, exact implementation-head required CI and merge verification are pending. Host snapshots showed h2 disk pressure and another gate holder; no foreign state was deleted or process cancelled.
- No real registry publication, application rollout, installed-executor adoption or post-swap runtime identity was verified. Passing source admission cannot establish complete build reproducibility or close the prior production audit acceptance gaps.
