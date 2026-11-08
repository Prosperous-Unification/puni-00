# Independent review: machine writer credential packet

**APPROVE packet `49217d86d3afb43cfb07d35a8ab948dfdb2f4060`**, relative to merged base `dc5f7a40c`, for its explicitly bounded current credential-row contract. No new blocking correctness defect found. This is not approval of complete machine authority freshness or of release readiness.

Reviewed `/tmp/puni-main-merge-architecture.md`, the packet diff, credential repository, production boot and composed test wiring, command/replay/ordinary/recovery admission paths, HTTP refusal mapping, mounted tests, delta spec, tasks, verification record and mutation logs. Application source was not edited.

## Severity-ranked findings

1. **P1, existing and explicitly deferred: restricted-project recovery can reconstruct an uncapped account role.** `libs/wbs/adapters/store-sqlite/src/project.ts:1468` reads raw membership into `classifyProjectEdit`; `runRecoveryWrite` and command project admission pass actor identity without the admitted machine/consent role ceiling. The new row check does not close that false-access route. This is the same issue identified by the architecture review, not introduced by this packet. Keep it as a separate integration security obligation; packet approval must not be presented as proving a complete member ceiling.
2. **P2, existing and explicitly deferred: retained verifier evidence remains insufficient for expiry and exact machine source freshness.** `CredentialAuthentication` preserves machine credential/person IDs but not API digest, trusted issuer choice, or verifier expiry; the new check cannot reject an expired rotation secret/token/delegation while queued, nor distinguish an API-key record changed to OIDC. The delta spec at lines 521–523 and unchecked tasks state this accurately. No regression introduced, but broader current-authority claims remain unsupported.
3. **No packet-local blocking finding.** The implemented predicates and tests satisfy the bounded row identity/revocation/source-family requirements.

## Why the boundary is sound within that scope

- Boot and the composed harness construct `MachineCredentialRepository` with exactly `source.db`; the source UoW holds its coordinator turn and `BEGIN IMMEDIATE` before `resolve` runs. The same database read therefore observes admitted transaction state. `findById` performs SQL reads and validation only; it never invokes its stored gate. No new writer reacquisition, last-use write, delegation consumption, or network verification was found.
- `command-access.ts:37–59` reads the verified credential ID, rejects absence/revocation, requires the verified person, matches the person's current bound account against the principal (which also rejects null), requires delegation context and matching organization, excludes consent source for machines, and requires consent source plus non-direct context plus equal family for consent. The repository validates the closed source set and malformed revocation state before the predicates. Valid organization membership cannot override a credential refusal.
- The check precedes organization resolution and the existing expected-context comparison. Execute, directory, undo, redo, admitted ordinary writes and recovery all resolve inside the UoW before graph/capture/mutation. Trusted storage exceptions propagate through rollback; no legacy fallback is added.
- `organizationRefusal` already maps the typed context refusal to HTTP 409. Seven new mounted machine HTTP queue cases assert both status and exact body, covering batch, directory, undo, redo, prelude, ordinary and recovery writes. Initial authentication remains unchanged.
- HTTP tests obtain the held writer only after request organization resolution, hence after API authentication's `touchLastUsed`; direct tests authenticate before holding the writer. This avoids the identified authentication/writer test deadlock. The completed focused run also exercises these paths without hanging.

## Evidence quality and fresh verification

Freshly ran in `/tmp/puni-machine-writer`:

`bun test apps/wbs/be-01/src/controller/command-current-authority.controller.db.test.ts libs/wbs/application/core/src/compose.test.ts`

**123 pass, 0 fail, 736 assertions, 48.21 seconds.** This includes machine/consent direct mismatch negatives, seven mounted machine HTTP queue cases, ten retained machine/consent queue cases, current-principal positive prechecks, four trusted-store faults, and existing composition/current-authority tests. `git diff --check` passed; `git status --short` remained empty.

Recorded R5 evidence is coherent with the code: all twelve proof logs contain the targeted failing assertions. Null-row/context guard removal produces a throw instead of the required typed refusal; other predicate bypasses reach forbidden capture; bypassing credential reads makes all four trusted-storage fault cases return successfully. The consent-direct proof correctly changes the explicit direct branch, avoiding a redundant family check masking the mutation. These are inspected author-run proofs, not independently rerun mutations: this review remained read-only.

Consent tests deliberately install verified consent-shaped evidence over persisted credentials; they prove writer behavior, not a newly exercised mounted MCP authentication queue. Existing MCP authentication regressions remain complementary evidence. The packet does not claim otherwise.

The five dependency-first claim fixture failures are excluded from this packet ruling as directed; their separate fixes `5b70fcadb` and `c5f1ad96c` were not included in this checkout or independently verified here. No full regression run, fresh typecheck/lint/OpenSpec validation, build, secrets/migration scan, or remote host gate was run by this review. The packet's recorded checks and the coordinator's integrated gate remain distinct from this fresh focused verification.
