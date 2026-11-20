# Registry Pressure Source Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Acquire a bounded original registry status frame from one explicitly enrolled SSH peer for the independent monitor.

**Architecture:** A pure enrollment/command module binds a fixed OpenSSH invocation to a trusted target and exact host/client identities. An owned reader supplies bounded IO, the caller's original monotonic deadline and visible cleanup failures. An uncached native verifier exercises this public reader against a temporary non-root SSH server with generated fixture-only keys.

**Tech Stack:** Bun1.4.4, TypeScript7.0.2, ArkType, node filesystem/crypto APIs, OpenSSH9.6p1, Bun test and Nx.

**Spec:** [Authenticated status client](../../../openspec/changes/bound-registry-storage/design.md#authenticated-status-client--2026-11-21) and [delta requirements](../../../openspec/changes/bound-registry-storage/specs/registry-storage-lifecycle/spec.md#requirement-enrolled-bounded-ssh-status-acquisition).

## Global Constraints

- Existing Task5.1b and the full bound-registry-storage goal remain open; this plan supplies its client prerequisite only. No product migration, production installation or alert submission.
- Read AGENTS.md and LLM_README.md; Bun and Nx only. Missing/unreadable trusted state and absent required tools throw. Preserve unrelated changes.
- Do not import, execute, bundle or modify registry-pressure-observer-store.ts, registry-pressure-metrics.ts or their tests, or any stopped storage/file-admission campaign. No stopped artifact is a fixture.
- Use the exact immutable enrollment, SSH restrictions, output bounds and lifecycle in the owning design section. No production executable, clock, command, credential-discovery or arbitrary option override.
- One original absolute performance.now() deadline, at most5000ms ahead; reserve1000ms for local cleanup. Retain at most65537 stdout and4096 stderr bytes; identity at most4096 bytes and pin at most512 bytes.
- Every changed safety check needs an observed production-path negative and selected guard/dependency fault; record the actual failing test and restore exact source before an adjacent honest Proof comment. A passing mutant is not evidence.
- All native credentials and responses are generated synthetic fixtures. No personal SSH configuration, installed services or existing host permissions change. No raw private key, raw source stderr or credential hash in diagnostics/metrics.
- Follow the scoped names and precise types in AGENTS.md; symbol behavior belongs in JSDoc. No unannotated any, unchecked casts, non-null assertions or lint suppression in production.

## Files and interfaces

- `registry-pressure-source-contract.ts`: strict trusted enrollment parsing, reply types, canonical pin rendering and fixed SSH argv.
- `registry-pressure-source-contract.test.ts`: production parser/render/argv negatives and immutable-copy tests.
- `registry-pressure-source-process.ts`: fixed SSH subprocess, concurrent bounded drains, absolute deadline, abort and owned cleanup.
- `registry-pressure-source.ts`: existing private directory/key/pin admission, one-reader actor and close lifecycle.
- Paired `.test.ts` files test actual public functions and controlled subprocess fixtures.
- `registry-pressure-source-native.ts`: genuine temporary OpenSSH fixture and production reader verification; no automatic execution on import.
- `registry-pressure-source-native.test.ts`: native harness refusal contracts that do not start a server in ordinary fleet tests.
- `registry-pressure-source-tools.json`: scoped native fixture archive/executable/version pin.
- `tools/tool-fleet/project.json`: explicit noncached native target only; existing default routing is unchanged.
- Owning `verify.md`: exact commands, selected-fault observations, scope and limitations. Owning `tasks.md`: close5.1c only after every plan task passes review and validation.

All new TypeScript/JSON files above are under `tools/tool-fleet/src/`.

### Task 1: Strict enrollment and fixed SSH command

**Files:** Create `tools/tool-fleet/src/registry-pressure-source-contract.ts` and its paired test. Update owning `verify.md` with scoped evidence only.

**Interfaces produced:**

```ts
export interface RegistryStatusEnrollment {
  readonly schemaVersion: 1;
  readonly protocol: 'registry-pressure-status/1';
  readonly target: Readonly<{
    machineId: string;
    registryId: string;
    storageId: string;
    registryPath: string;
  }>;
  readonly peer: Readonly<{
    address: string;
    port: number;
    user: string;
    hostKey: string;
  }>;
  readonly identity: Readonly<{
    path: string;
    sha256: string;
    publicKey: string;
  }>;
}
export type RegistryStatusReply =
  | { readonly state: 'received'; readonly bytes: Uint8Array }
  | { readonly state: 'invalid-status'; readonly code: 'status-too-large' }
  | { readonly state: 'unavailable'; readonly reason: 'source-timeout'; readonly code: 'deadline' }
  | { readonly state: 'unavailable'; readonly reason: 'source-refused'; readonly code: 'refused' }
  | {
      readonly state: 'unavailable';
      readonly reason: 'source-command-failed';
      readonly code: 'ssh-exit' | 'stderr-too-large';
    };
export function parseRegistryStatusEnrollment(input: unknown): RegistryStatusEnrollment;
export function renderRegistryStatusPin(enrollment: RegistryStatusEnrollment): string;
export function buildRegistryStatusSshArguments(
  enrollment: RegistryStatusEnrollment,
  pinPath: string,
): readonly string[];
```

The argument builder includes executable `/usr/bin/ssh` at index0. The enrollment
argument of the two pure renderers is an already parsed internal value; pinPath is
still validated as a canonical ASCII file path before interpolation. No IO occurs
in this task. Private key matching is the actor's responsibility in Task2.

- [x] **Step 1: Write failing parser/command tests.** Generate a canonical synthetic public key from the actual SSH wire format, without private material. Build a complete enrollment and exercise the exported functions.

```ts
import { expect, it } from 'bun:test';
import {
  parseRegistryStatusEnrollment,
  buildRegistryStatusSshArguments,
  renderRegistryStatusPin,
} from './registry-pressure-source-contract';

const wire = Buffer.alloc(51);
wire.writeUInt32BE(11, 0);
wire.write('ssh-ed25519', 4, 'ascii');
wire.writeUInt32BE(32, 15);
wire.fill(7, 19);
const key = `ssh-ed25519 ${wire.toString('base64')}`;
const enrollment = () => ({
  schemaVersion: 1,
  protocol: 'registry-pressure-status/1',
  target: {
    machineId: 'a'.repeat(32),
    registryId: 'platform',
    storageId: 'images',
    registryPath: '/srv/registry',
  },
  peer: { address: '10.1.0.4', port: 22, user: 'puni-registry-status', hostKey: key },
  identity: {
    path: '/run/credentials/registry-status/key',
    sha256: 'b'.repeat(64),
    publicKey: key,
  },
});
it('copies and freezes enrollment and emits only the pinned fixed command', () => {
  const input = enrollment();
  const admitted = parseRegistryStatusEnrollment(input);
  input.peer.address = '10.1.0.99';
  expect(admitted.peer.address).toBe('10.1.0.4');
  expect(Object.isFrozen(admitted)).toBe(true);
  expect(Object.isFrozen(admitted.peer)).toBe(true);
  expect(Object.isFrozen(admitted.target)).toBe(true);
  expect(Object.isFrozen(admitted.identity)).toBe(true);
  expect(renderRegistryStatusPin(admitted)).toBe(`puni-registry-pressure-source ${key}\n`);
  const argv = buildRegistryStatusSshArguments(admitted, '/run/registry-status/known_hosts');
  expect(argv[0]).toBe('/usr/bin/ssh');
  expect(argv.slice(-3)).toEqual([
    '--',
    'puni-registry-status@10.1.0.4',
    'registry-pressure-status-v1',
  ]);
  expect(argv).toContain('StrictHostKeyChecking=yes');
  expect(argv).toContain('IdentityAgent=none');
  expect(argv).toContain('HostKeyAlias=puni-registry-pressure-source');
});
it('rejects unknown enrollment fields on the production parser path', () => {
  expect(() => parseRegistryStatusEnrollment({ ...enrollment(), command: 'other' })).toThrow();
});
```

Add table-driven production-parser cases for unknown nested fields at every object,
wrong schema/protocol, empty/overlong/control-containing identities, malformed
machine/hash, root/invalid login, all non-RFC1918 blocks, IPv6/DNS/leading-zero
IPv4, octet overflow, port0/65536/fraction, wrong key algorithm, SSH length field,
base64 tail/comment/newline and all path segment/length/control failures. Include
positive private address boundaries, ports1/65535 and canonical key/path forms.
Check every fixed SSH option in the produced argv and no free-form extra option.
Test rejected pin paths directly through the builder.

- [x] **Step 2: Run RED.** `bun test tools/tool-fleet/src/registry-pressure-source-contract.test.ts`; capture the missing export/module failure before implementation.
- [x] **Step 3: Implement the pure boundary.** ArkType exact objects reject unknown fields, including nested target/peer/identity. Bound strings before detailed parsing. Validate code-point identity length and controls, ASCII canonical paths, decimal RFC1918 octets and integer port. Decode public-key base64 only after exact bounded shape; the exact68-character standard-base64 grammar establishes canonical51-byte decoding; check the algorithm header and32-byte payload length without redundant decoded-length/round-trip predicates. Copy and freeze each returned object. Reject with fixed nonsecret diagnostics.

Use the following fixed option sequence with `-o` before every entry, followed by
`-i <identity.path> -p <decimal-port> -- <user>@<address> registry-pressure-status-v1`:

```ts
const options = [
  'BatchMode=yes',
  'IdentitiesOnly=yes',
  'IdentityAgent=none',
  'AddKeysToAgent=no',
  'StrictHostKeyChecking=yes',
  `UserKnownHostsFile=${pinPath}`,
  'GlobalKnownHostsFile=/dev/null',
  'HostKeyAlias=puni-registry-pressure-source',
  'CheckHostIP=no',
  'VerifyHostKeyDNS=no',
  'UpdateHostKeys=no',
  'HostKeyAlgorithms=ssh-ed25519',
  'PubkeyAcceptedAlgorithms=ssh-ed25519',
  'PreferredAuthentications=publickey',
  'PasswordAuthentication=no',
  'KbdInteractiveAuthentication=no',
  'GSSAPIAuthentication=no',
  'HostbasedAuthentication=no',
  'ProxyCommand=none',
  'ProxyJump=none',
  'CanonicalizeHostname=no',
  'ControlMaster=no',
  'ControlPersist=no',
  'ControlPath=none',
  'ForwardAgent=no',
  'ClearAllForwardings=yes',
  'PermitLocalCommand=no',
  'KnownHostsCommand=none',
  'NumberOfPasswordPrompts=0',
  'ConnectionAttempts=1',
  'ConnectTimeout=3',
];
const argv = [
  '/usr/bin/ssh',
  '-F',
  '/dev/null',
  '-T',
  '-n',
  ...options.flatMap((option) => ['-o', option]),
  '-i',
  enrollment.identity.path,
  '-p',
  String(enrollment.peer.port),
  '--',
  `${enrollment.peer.user}@${enrollment.peer.address}`,
  'registry-pressure-status-v1',
];
```

- [x] **Step 4: GREEN and breakability.** Run focused tests. Remove each new validation family or break its dependency in a separate temporary source edit, run its selected negative and observe failure; restore source exactly. Include unknown-field, address, key wire, identity/path, version, root/port, immutable-copy and fixed-command/SSH restriction negatives. Record failures that actually occurred; consolidate only guards genuinely exercised by the same selected mutant. Add adjacent Proof comments naming the observed tests. Do not fabricate a proof for an equivalent mutant that still passes because a downstream check catches it.
- [x] **Step 5: Verify and commit.** Run scoped ESLint/Prettier, owning TypeScript typecheck and focused tests. Append commands, RED/GREEN and mutant observations to verify.md. Commit only this task's code/tests/evidence using normal hooks; report exact counts, skipped checks and concerns to the controller.

### Task 2: Owned bounded reader

**Files:** Create `registry-pressure-source.ts`, `registry-pressure-source-process.ts` and paired tests under `tools/tool-fleet/src/`; update owning verify.md. Consume the exact Task1 exports; do not edit accepted Task1 contracts without a recorded controller ruling and covering regression.

**Interfaces produced:**

```ts
import type { RegistryStatusReply } from './registry-pressure-source-contract';
export interface RegistryPressureSource {
  read(signal: AbortSignal, deadline: number): Promise<RegistryStatusReply>;
  close(): Promise<void>;
}
export class RegistrySourceCleanupError extends Error {
  readonly outcome: RegistryStatusReply | undefined;
}
export function openRegistryPressureSource(
  input: unknown,
  directory: string,
): Promise<RegistryPressureSource>;
```

The process module is an internal implementation interface accepting the parsed
fixed argv, signal and original deadline; it is not an alternate executable or
clock entrypoint. Export only the public actor and typed cleanup error from source.ts.

- [ ] **Step 1: Write RED actor tests through the public factory.** Use generated fixture-only private bytes and their true SHA-256; Task2 unit tests do not claim those bytes authenticate. Every test creates a fresh mode0700 existing directory and mode0400 key. Controlled Bun.spawn interception may forward to an owned Bun fixture process for framing/cleanup tests, with restoration in finally; it must still receive and assert the exact production argv and spawn policy. No production test override is added.

```ts
it('refuses missing local state rather than inventing enrollment or a directory', async () => {
  const source = validSourceFixture(); // test helper creates key and enrollment only
  await expect(
    openRegistryPressureSource(source.enrollment, source.absentDirectory),
  ).rejects.toThrow();
  expect(await Bun.file(source.absentDirectory + '/known_hosts').exists()).toBe(false);
});
it('uses the supplied expired deadline without spawning', async () => {
  const source = await openRegistryPressureSource(fixture.enrollment, fixture.directory);
  expect(await source.read(new AbortController().signal, performance.now() - 1)).toEqual({
    state: 'unavailable',
    reason: 'source-timeout',
    code: 'deadline',
  });
  expect(spawnCalls).toBe(0); // scoped test interception captures actual Bun.spawn
  await source.close();
});
```

Implement `validSourceFixture`, `fixture` and scoped interception as concrete test
helpers in the test file before running. Tests must cover exact EOF/exit0 bytes;
valid prefix then exit1; exits77/255; stdout65537/65538; stderr4096/4097; concurrent
streams; caller abort before spawn and while reading; busy read and close; deadline
including preflight; timeout cleanup; missing/unreadable/wrong-mode/wrong-owner or
symlink/nonregular/multilink/key-hash/pin state; unknown directory contents; close
preserves parent and unexpected files; repeat close; fault latch after unresolved
cleanup and known overflow carried on the cleanup error. For owner failures use
modeled metadata only when real nonroot ownership changes are unavailable and say
so; native/installed ownership remains separately owed. Do not chmod existing
external paths or use root just to make a fixture.

- [ ] **Step 2: Run RED** for actor tests before source exists; save command/output.
- [ ] **Step 3: Implement lifecycle and IO.** Open the exact preexisting empty private directory, create its only pin exclusively0400 and retain its ownership for close. Bounded no-follow/nonblock file reads check required regular/single-link metadata, owner/mode, EOF, exact pin bytes and key hash; close descriptors in finally and surface closure failures. Check local executable existence/executability before spawn. One busy/fault/closed state owns all work. Keep immutable configuration per actor lifetime. No state genesis or hidden retries.

Use one acquisition cutoff `deadline - 1000`; never replace the caller deadline.
Before spawn require finite deadline no more than5000ms ahead, nonaborted signal
and positive acquisition interval. Pass a scrubbed environment and fixed cwd,
stdin ignored, stdout/stderr piped, no shell, detached owned process group.
Read both streams concurrently into bounded buffers and await exit plus complete
EOF. Map only the modeled fixed outcomes from the owning design. On abort, cap
or cutoff terminate the owned group, cancel/settle both readers and await the
actual child exit within the original deadline. A cleanup failure throws
RegistrySourceCleanupError with its known primary outcome; a cancellation remains
controlled after cleanup. Latch unresolved work and forbid all overlapping/retry
reads until process supervision accounts for it. Never expose raw stderr.

- [ ] **Step 4: GREEN and R5 faults.** Run selected actor tests, then genuine guard/dependency faults against directory/key/pin admission, deadline, EOF+exit, both caps, abort/cleanup settlement and no-overlap. Capture failures and restore exact source before adjacent Proof comments. A stubbed exit result is not native reaping evidence; keep that claim for Task3.
- [ ] **Step 5: Verify and commit.** Scoped source tests/ESLint/Prettier, owning TypeScript typecheck, source module bundle without stopped imports, and normal commit hooks. Record limitations and precise checks in verify.md; leave5.1c open pending native qualification/review.

### Task 3: Real SSH qualification and noncached target

**Files:** Create native harness, its refusal test and scoped tool JSON from the file map; modify `tools/tool-fleet/project.json`; update owning verify.md/tasks.md only after full reviewed qualification.

**Interfaces:** The executable harness takes `--sshd=<absolute extracted binary> --listen=<owned RFC1918 IPv4> --source=<permitted actual RFC1918 source IPv4>`. Its main function executes only under `import.meta.main`. It calls Task2's production `openRegistryPressureSource` without process interception or configurable command/executable. Ordinary test import performs no server startup.

- [ ] **Step 1: Write failing harness admission tests.** Cover missing/unknown arguments, wrong executable hash/version, nonprivate/invalid listen/source addresses and unsafe fixture ancestry. The production native entrypoint's validators must actually be invoked by these tests. For the success/negative integration add case definitions in the harness that assert complete production reader replies and error categories, not just SSH exit codes.

```ts
it('refuses missing required native tool rather than skipping qualification', async () => {
  await expect(
    validateRegistrySourceNative({
      sshd: '/absent/puni-sshd',
      listen: '10.1.0.4',
      source: '10.1.0.2',
    }),
  ).rejects.toThrow();
});
```

`validateRegistrySourceNative(input:unknown):Promise<void>` validates only the exact
harness arguments, pinned executable and safe home ancestry; running qualification
is a separate `rehearseRegistryPressureSource(input:unknown)` function that calls
it and then creates the owned fixture.

- [ ] **Step 2: Run RED.** Focused native refusal tests fail before implementation.
- [ ] **Step 3: Implement tool admission and real fixture.** Use this already observed extracted-only package profile; do not install the server or alter a system account/service:

```json
{
  "packageVersion": "1:9.6p1-3ubuntu13.20",
  "sourceUrl": "http://apt.pop-os.org/ubuntu/pool/main/o/openssh/openssh-server_9.6p1-3ubuntu13.20_amd64.deb",
  "archiveSha256": "5d0d5eb672ddc27601e2da4e8465c5736dc73375a21bc1cd1834fcb08fb155bf",
  "executableSha256": "95b291d957f87dd200796c4986c97b6f4d970e26ad620ec9174e69c13ec5c137",
  "version": "OpenSSH_9.6p1 Ubuntu-3ubuntu13.20, OpenSSL 3.0.13 30 Jan 2024"
}
```

Confirm the exact actual `sshd -V` string before adopting this version spelling;
package/executable hashes above are actual observed pins. If output spelling
differs, correct this literal and report the observed output; do not weaken it to
a generic prefix. Read the fixture profile as trusted exact JSON. Bounded read
and SHA/version checks precede execution; no alternate fallback download occurs.
Document the extraction recipe (`apt-get download`, verify archive hash,
`dpkg-deb --extract`) in JSDoc/runbook-linked verification. Required arguments and
native tool/hash failures return nonzero with no successful receipt.

Create a new0700 directory directly under the safe current nonroot user's actual
home. Validate every ancestor against StrictModes without chmod. Generate fresh
host/client/wrong-host/wrong-client Ed25519 keys. Bind an ephemeral listener only
to the explicitly owned listen address; authorized_keys uses restrict and the
separately declared permitted source address. Keep StrictModes=yes, PAM and all
alternate auth off, forwarding/PTY/user rc/env off, one fixed forced dispatcher
and small server timeout. The current user's fixture account is not a qualification
of the production dedicated account or run-as59001 bridge. Use a clean fixture HOME
and no shell preload variables. Test-only mode selection remains inside this
owned fixture dispatcher, never an option to the production client.

Actual cases: complete exact frame; wrong client key; wrong host key; dispatcher
rejects the client's fixed verb; valid prefix followed by exit1; stdout overflow;
stderr overflow; absolute timeout; mid-read abort; no concurrent actor read or
close; repeated bounded reads and final owned parent reaping. Record each case,
fixed reply category, original byte count and bounded completion time. A case
failure prevents a success receipt. Finally terminate/wait only owned processes,
remove only owned fixture artifacts and preserve any failure evidence safely;
never retain private fixture keys in tracked evidence. Qualification cannot assert
that local SSH exit proves remote cleanup: separately observe fixture/server
settlement within its own configured timeout and record the precise scope.

Add the explicit cache:false Nx target `rehearse-registry-pressure-source` invoking
this harness. Arguments must be passed explicitly by the operator/CI; missing
tool/address fails, and ordinary fleet test never silently starts the native daemon.

- [ ] **Step 4: Run GREEN and native negatives.** Run focused test files and then
      `bunx nx run tool-fleet:rehearse-registry-pressure-source --skip-nx-cache --sshd=<verified-path> --listen=<owned-address> --source=<actual-source-address>`.
      Use exact current paths/addresses from independent observations, not placeholders
      in the evidence. Record all cases, child settlement and limitations. Observe
      selected guard/dependency removal failures for harness admission and any production
      safety guard not yet qualified by Task1/2; restore source and add truthful Proof.
- [ ] **Step 5: Verify source and close only the client prerequisite.** Run all
      owning tool-fleet tests, lint, typecheck and build if that target exists; explicitly
      state unavailable targets. Run strict OpenSpec, scoped format, secret/migration
      checks applicable to the diff and a final broad review. Record actual commands,
      outputs, exclusions and blockers. Mark5.1c complete only after all three tasks and
      reviews pass;5.1b/5.1/5.2/S4 and full goal stay open. Normal source PR/current-head
      CI and exact-revision host gate precede adoption; no installation in this plan.
