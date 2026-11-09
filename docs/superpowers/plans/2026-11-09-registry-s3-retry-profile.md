# Registry S3 retry profile implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task by task. Steps use checkbox syntax for tracking.

**Goal:** Enforce one MinIO request attempt in every staged S3 Restic command and bind the actual fixed CLI inputs into its existing effect profile.

**Architecture:** Use one deterministic profile factory from both the store child launcher and the existing effect fingerprint. Preserve the local-file command profile. Verify the S3 behavior through the real store and pinned child against an owned HTTPS receiver with two committed-but-unacknowledged PUTs. This is a retry-profile prerequisite of Task 4.3; it grants no physical admission.

**Tech Stack:** Bun 1.4.4, TypeScript, Python 3, existing pinned Restic 0.19.1, ordinary localhost TLS and owned files.

**Spec:** `openspec/changes/bound-registry-storage/specs/registry-storage-lifecycle/spec.md` (backup budget reservations), its design/task 4.3, and `docs/findings/registry-backup-workspace.md` (upload attempts).

## Global Constraints

- Keep the full bounded-registry goal intact; Task 4.3 remains open. Do not open `admitRegistryBackup` or invent funding/resource allowances.
- No product migration, installed state, SSH/provider requests, protected credentials, deployment or notifications.
- Preserve the existing stop on privileged/chroot/namespace/queued-descriptor proof work. Ordinary owned child processes and local TLS tests are permitted.
- Preserve default backend-error-redesign behavior, all deadlines, existing authority/effect calls, environment allowlist, local repository compatibility and binary pins.
- Do not introduce endpoint or CA overrides into production. The test-only wrapper adds its owned CA while preserving the real pinned executable, actual arguments and inherited FD 3.
- Use Bun/Nx only for tasks. Python/OpenSSL implement ordinary test protocol helpers, not a second test runner. No new dependency package.
- Read callers/tests before behavior changes, use TDD, and observe a production-option omission fail before adding its adjacent Proof comment. Preserve all failed harness evidence.
- No subagents from the implementer. Commit normally only named files; do not push or modify PRs. Root handles review/publication.

## Preflight relationship and ruling

| Interfaces sharing files                 | Producer / consumer                                                      | Ruling                                                                                                               |
| ---------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| store launcher / root effect fingerprint | one fixed profile factory / actual child argv and persisted profile hash | Use one actual descriptor; do not maintain a separately spelled profile label that omits CLI options.                |
| local and S3 fixtures                    | scheme-selected profile / existing fixed command arguments               | Local-file arguments remain `--no-cache`; S3 adds exactly `-o s3.retries=1`.                                         |
| replay receiver / real store             | actual commit/drop history / pinned retry notices                        | Two faults on one selected key; assert completed notices and three identical versions, avoiding cross-stream timing. |

Ruling: pin one SDK attempt while preserving outer retries. Public source and the root's completed owned TLS characterization show this supported option; disabling feature flags would change broader behavior and is outside the task. A conditional per-Save retry bound is not a whole-command or physical-budget grant.

### Task 1: Enforce and bind the staged S3 retry profile

**Files:**

- Modify `tools/tool-fleet/src/registry-backup-store.ts` for a small exported profile factory and its actual child argv.
- Modify only the existing `profileSha256` construction in `tools/tool-fleet/src/registry-maintenance-backup.ts` to include that exact profile descriptor.
- Create `tools/tool-fleet/src/registry-backup-retry.test.ts`, `registry-backup-retry.fixture.ts`, and `registry-backup-retry.fixture.py` for the ordinary owned HTTPS witness. Keep one responsibility per helper; do not alter existing test assertions.
- Update existing OpenSpec design/tasks/verify for this prerequisite without checking Task 4.3 complete. Integrate the existing untracked retry-source findings into the linked workspace findings rather than introducing an unowned documentation route.

**Interfaces:**

Create `createRegistryBackupProfile(repository: string)` in the existing store module. It returns an immutable descriptor (name plus fixed argument tuple); never accept an external retry count. The S3 descriptor contains the exact fixed option, while the local descriptor preserves the prior CLI. Both consumers call this same factory.

Minimal shape (use precise readonly types and project naming):

```typescript
export function createRegistryBackupProfile(repository: string) {
  return repository.startsWith('s3:')
    ? Object.freeze({
        name: 'restic/s3-single-attempt/locked-commands/v2',
        arguments: Object.freeze(['--no-cache', '-o', 's3.retries=1']),
      })
    : Object.freeze({
        name: 'restic/no-cache/locked-commands/v1',
        arguments: Object.freeze(['--no-cache']),
      });
}
```

The actual child must consume that descriptor:

```typescript
const profile = createRegistryBackupProfile(environment.RESTIC_REPOSITORY);
const child = Bun.spawn(
  [configuration.binary, ...profile.arguments, ...arguments_],
  existingOptions,
);
```

The existing fingerprint must retain its binary and configuration binding and include the same descriptor, rather than only a stale descriptive string:

```typescript
profile: createRegistryBackupProfile(configuration.environment.RESTIC_REPOSITORY);
```

A changed fixed profile must not silently reuse established effect history. Keep the existing profile mismatch refusal; do not reset or migrate any installed state.

- [x] **Step 1: Establish RED through the actual store.**

Use the root's completed standalone protocol characterization at `/tmp/registry-restic-retry-wire-v3-20261109.py` as the server starting point (exact executed source and logs must be preserved). Its receipt is `/tmp/registry-restic-retry-wire-evidence-v3-20261109/receipt.json`; both profile variants already completed. It has a real verified owned TLS CA, bounded known-length MD5 PUT bodies, standard Last-Modified metadata, opaque encrypted-byte history, and loopback-only synthetic credentials. It models signature validation and DELETE cleanup, so claim no provider-accounting or cryptographic-auth proof.

Adapt it to call an ordinary Bun fixture that imports the actual store. Reuse `openBackupSourceFixture()` and `modelRegistryBackupEffects()`, call `installMaintenanceReaper()`, write one small known source body and call `store.snapshot(fixture.source, fixture.authority)` with the real source limits and the owned endpoint. Admission/effect persistence remain explicitly modeled for this retry-only test. Use `lifetime: 'worker'` so the driver's exclusively owned process group contains all test descendants. An outer timeout must kill/reap only that group, close the receiver and fail; repaired cleanup cannot pass.

The only executable wrapper is test-owned: it forwards unchanged args to the hash-verified real Restic with `--cacert <owned cert>`, preserves FD 3, drains stdout/stderr fully, relays both, and records bounded stderr for the completed observation. Do not add CA/environment seams to production.

Select one unique data-key prefix. Commit and drop its first TWO replies, then acknowledge the third; all other requests work. No sleeps or elapsed-time threshold decides the result. On the current unmodified store the three copied versions must be identical, snapshot/verification succeeds, but outer Save retry notices are zero; the new test expects two and must fail for that reason.

Example test observation contract:

```typescript
const observed = await observeOwnedRetryProfile();
expect(observed.snapshotVerified).toBe(true);
expect(observed.committedVersions).toBe(3);
expect(observed.identicalEncryptedBodies).toBe(true);
expect(observed.outerSaveRetries).toBe(2);
expect(observed.successAfterTwoRetries).toBe(true);
expect(observed.receiverClosed).toBe(true);
expect(observed.descendantsAbsent).toBe(true);
```

Define `observeOwnedRetryProfile()` in the test as a real owned Python-fixture subprocess with bounded stdout/stderr and a parsed closed response. Use the repository's optional `PUNI_TEST_RESTIC_BINARY` convention, but run this selected test with the actual supplied pin before claiming success. Missing required tools in that selected run throw; do not turn them into a pass.

- [x] **Step 2: Implement only the fixed profile and existing fingerprint binding above.** Preserve every other argv, command, call order, timeout, allowlist and compatibility route. JSDoc must distinguish fixed execution inputs from conditional single-PUT counting and still-absent complete admission evidence.
- [x] **Step 3: Verify GREEN and omission.** Run the selected test with `/tmp/registry-local-backup-tools-20261109/restic-0.19.1` (SHA256 `20d4142678d0d95ec11a4759def1b73fd9190abc9ca19e4b62d067c0b387e639`). Omit only the S3 retry option in an owned production-source copy or a precisely restored mutation: the same completed real store must again show zero outer notices and fail its expected two. Restore exact bytes; only then add the adjacent Proof comment. Retain the failed and corrected protocol-harness logs; the original missing Last-Modified timeout did not reach the upload fault.
- [x] **Step 4: Verify fingerprint/compatibility integration.** Exercise the actual root-action profile selection only through ordinary modeled caller fixtures; confirm the persisted fingerprint includes the actual fixed descriptor and profile drift is refused without reset. Retain existing local-file command/receipt tests. Do not execute a root installation, authority/profile proof campaign or live operation. Do not use an expectation computed by the same helper as the only fingerprint check.
- [x] **Step 5: Owning checks and record.** Run focused new and affected existing tests, owning uncached lint/typecheck/build, strict change validation and exact formatting; run a broader owning suite once only if justified by the real launcher change. Record all exclusions/skips. Root observes the separate current-main CI and canonical gate; do not poll or duplicate them. Commit named source/tests/docs/plan normally and write the report with RED/GREEN/omission, scope limits and exact commands. Do not mark the full goal or Task 4.3 complete.

Task 1 implementation evidence: [owning verification](../../../openspec/changes/bound-registry-storage/verify.md#staged-s3-retry-profile-prerequisite-2026-11-09).
The staged prerequisite is complete; Task 4.3 remains open. Existing modeled
provider/retention caller mocks also preserve the newly imported real profile
factory; no existing assertion changed. Final affected integration passed 76 cases,
with the real selected pin. The broader explicit ordinary suite's 12 mock-export
failures were repaired and retested; stopped privileged work was not collected.
