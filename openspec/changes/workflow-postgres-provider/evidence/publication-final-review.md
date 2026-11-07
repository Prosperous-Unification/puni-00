# PostgreSQL planning publication review

Reviewed the docs-only publication in `/home/df/.codex/worktrees/3abd/puni-00`, including ADR 0069, proposal/design/tasks/delta spec/publication record, evidence notes and compressed SQL packet. Only this review report was written. No source/docs/ref changes, databases or gates were run by this reviewer.

## Strengths and verified evidence

- ADR 0069 selects PostgreSQL and serialized writes. The proposal/design explicitly keep advisory-versus-row locking, bootstrap, lifecycle topology/observer behavior and the transfer envelope open. No adapter, public profile, operator migration or production deployment is represented as complete.
- The delta spec and open tasks cover all 26 RunStore and two ArtifactStore methods, awaited close, adapter guard precedence, exact byte identities/collisions, durable atomic commit, coherent reads, uncertain outcomes, complete transfer, real-process faults and production-path negatives. Implementation checkboxes remain open.
- The publication record separates SQL feasibility from Bun-driver/provider/durable-storage/R5 acceptance and retains unresolved P10 failures. Deferring implementation `verify.md` does not misrepresent this planning-only packet as applied work.
- Read-only Bun checks verified the gzip packet's SHA-256 and byte length, embedded original-index hash, all 304 entry hashes/lengths, total 1,285,442 original bytes, unique relative paths and absence of path traversal. The 72 run command/client receipts all have observed terminal status and matching original stdout/stderr hashes. Archived summary observations agree with the published nine roundtrips and three healthy/three duplicate-producing concurrency cases.
- A targeted scan of decoded packet text for common token/private-key/credentialed-PostgreSQL-URL patterns found no matches. This is a bounded scan, not a comprehensive secrets certificate.

## Critical

None identified.

## Important — resolved before commit

Follow-up read of the revised publication confirmed both findings below are addressed. No remaining Critical or Important issue was identified for the docs-only commit. The initial findings are retained for traceability.

1. **Publication references evidence absent from a fresh clone.**
   - `evidence/adapter-sdk-release-delta-20261103.md` has six unresolved Markdown links: omitted sibling reports `adapter-sdk-release-delta-20261101.md` and `acp-adapter-migration-20261102.md`, plus `metadata-receipt.json`, `source-receipt.json`, `extras-receipt.json` and `diff-receipt.json` under `/tmp/puni-sdk-release-delta-20261103-0451/`.
   - `evidence/provider-acceptance-inventory-v3.md:38` promises a JSON sidecar retaining signatures, locations and shared-suite registration sites, but that sidecar is absent from both the publication and SQL packet. The original metadata sidecar exists and is 591,674 bytes.
   - The SDK note's retained-evidence claims and the planning packet's 27-suite/54-registration inventory cannot be followed completely from the published files. The SQL packet itself is independently complete for its declared scope.
   - **Fix:** publish needed reports/receipts/inventory under tracked relative paths, using a documented hashed compressed packet where appropriate. Otherwise explicitly identify unavailable historical context and remove dead hyperlinks or claims that the omitted evidence is included. Preserve historical research scope; this does not adopt SDK versions or pending output/ACP choices.
   - **Resolution checked:** both sibling SDK reports are now included; historical capture paths are provenance labels, with relative links to two archived SDK packets/manifests. Omitted earlier intake/compiler companions are explicitly marked historical/unverified. The complete inventory sidecar is linked as gzip with compressed/original hash identities. A new link scan across all 13 Markdown files found zero missing local links.
   - **Independent packet checks:** every SDK entry hash/length and unique relative non-traversing path verified: November 1 has 68 files / 5,322,418 original bytes; November 3 has 82 files / 5,564,153 original bytes. Both compressed hashes/lengths match their manifests, and the packets include the referenced metadata/source receipts and official tarballs. Inventory compressed/original hashes and 591,674 original bytes match; its 26 contract files contain 27 unique exported shared-suite functions and 54 registrations. Acceptance/executed-test flags remain false. No archived code or package was executed.

2. **Lock-corruption task requests a refusal instead of a throwing trusted-state failure.**
   - `tasks.md:7` (task 1.1) says changed/removed retained lock metadata should “observe refusal before publication.” The design and delta spec correctly require changed/missing metadata to throw.
   - “Refusal” already names modeled business outcomes in this domain; using it here can encode the wrong acceptance oracle for corrupt trusted state.
   - **Fix:** require an explicit trusted-state error/throw before publication, preserving the stores. Keep the admitted-key comparison and its production-path negative.
   - **Resolution checked:** task 1.1 now requires a trusted-state error before publication.

## Minor / publication conditions

- ADR 0069 now says installed Bun SQL PostgreSQL support, resolving the compatibility overstatement. Its replacement sentence currently has the minor typo “has a installed”; remove “a”. This is not a commit blocker.
- `publication.md` now records reported scoped format, OpenSpec validation and diff checks and explicitly leaves CI/hooks pending. This reviewer did not rerun those reported checks and gives them no independent execution credit; the independent packet/link checks above were executed by this reviewer.
- Archived notes/reviews are historical evidence: their “unadopted” wording describes their review time. The live ADR/design correctly record the later selected engine/coarse-write direction without treating the private mechanism as adopted.

## Assessment

**Ready for the docs-only commit; no remaining Critical or Important finding.** Both publication corrections and the publication-check record are complete in the reviewed text. No new provider/runtime acceptance follows. Concrete private protocol design, lifecycle proof, transfer envelope, implementation conformance/R5, exact-source host gates and integration remain future work. Tests/lint/typecheck/build, database replay, CI/gate and production checks were intentionally not run by this reviewer.
