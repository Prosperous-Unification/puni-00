import { createHash, randomUUID } from 'node:crypto';
import { readFile, readlink } from 'node:fs/promises';

import { type } from 'arktype';

const Uuid = type(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
const Identity = type('0 < string <= 256');
const Hash = type(/^[a-f0-9]{64}$/);
export const RegistryBackupAction = type(
  "'backup-preflight'|'backup-snapshot'|'backup-verify'|'backup-restore'",
);
export type RegistryBackupAction = typeof RegistryBackupAction.infer;

/** Bounded authenticated terminal payload binds the fixed action's response to its durable attempt. */
export const RegistryBackupCompletion = type({
  attemptId: Uuid,
  receipt: '0 < string <= 16000',
  '+': 'reject',
});

/** Current root peer identity observed after the kernel-authenticated socket acknowledgement; start ticks and boot distinguish PID reuse. Persisted PIDs use the same positive int32 range as {@link readRegistryBackupGuardian}. */
export const RegistryBackupGuardian = type({
  // Proof: removing the upper bound admits both malformed attempt construction and persisted-origin cases in the paired tests; origin reads are modeled.
  pid: '0 < number.safe <= 2147483647',
  startTicks: /^[1-9][0-9]{0,19}$/,
  pidNamespace: /^pid:\[[1-9][0-9]{0,19}\]$/,
  bootId: Uuid,
  machineId: /^[0-9a-f]{32}$/,
  '+': 'reject',
});
export type RegistryBackupGuardian = typeof RegistryBackupGuardian.infer;

/** Durable pre-write ownership of one root guardian's single backup worker. The public nonce becomes its private UTS hostname, independently of stable snapshot grouping. See docs/adr/0059-registry-backup-locks-identify-their-owning-attempt.md. */
export const RegistryBackupAttempt = type({
  id: Uuid,
  operationId: Identity,
  action: RegistryBackupAction,
  configurationSha256: Hash,
  snapshotHost: Identity,
  utsHostname: /^prb-[0-9a-f-]{36}$/,
  guardian: RegistryBackupGuardian,
  tokenSha256: Hash,
  journalRevision: 'number.safe > 0',
  createdAt: 'string.date.iso',
  state: "'prepared'|'settled'|'reconciled'",
  settlementSha256: Hash.or('null'),
  '+': 'reject',
});
export type RegistryBackupAttempt = typeof RegistryBackupAttempt.infer;
const hash = (text: string) => createHash('sha256').update(text).digest('hex');

/** Only the authority creates an attempt; callers cannot select or reuse its nonce. Persist this value before sending the existing single action request to its exact guardian. */
export function prepareRegistryBackupAttempt(input: {
  operationId: string;
  token: string;
  action: RegistryBackupAction;
  configurationSha256: string;
  registryId: string;
  guardian: RegistryBackupGuardian;
  journalRevision: number;
  now: string;
}): RegistryBackupAttempt {
  const id = randomUUID();
  return RegistryBackupAttempt.assert({
    id,
    operationId: input.operationId,
    action: input.action,
    configurationSha256: input.configurationSha256,
    snapshotHost: input.registryId,
    utsHostname: `prb-${id}`,
    guardian: structuredClone(input.guardian),
    tokenSha256: hash(input.token),
    journalRevision: input.journalRevision,
    createdAt: input.now,
    state: 'prepared',
    settlementSha256: null,
  });
}

/** The root guardian re-reads current canonical state after the pre-write persistence; one request/one worker cannot be replayed on a different root process. */
export function requireRegistryBackupAttempt(
  attempt: RegistryBackupAttempt,
  current: {
    operationId: string;
    token: string;
    action: RegistryBackupAction;
    configurationSha256: string;
    registryId: string;
    guardian: RegistryBackupGuardian;
    journalRevision: number;
  },
): void {
  RegistryBackupAttempt.assert(attempt);
  RegistryBackupGuardian.assert(current.guardian);
  // Proof: all fourteen lineage/replay faults returned successfully before these predicates (backup-attempt-red.log).
  if (
    attempt.state !== 'prepared' ||
    attempt.settlementSha256 !== null ||
    attempt.operationId !== current.operationId ||
    attempt.tokenSha256 !== hash(current.token) ||
    attempt.action !== current.action ||
    attempt.configurationSha256 !== current.configurationSha256 ||
    attempt.snapshotHost !== current.registryId ||
    attempt.utsHostname !== `prb-${attempt.id}` ||
    attempt.journalRevision !== current.journalRevision ||
    attempt.guardian.pid !== current.guardian.pid ||
    attempt.guardian.startTicks !== current.guardian.startTicks ||
    attempt.guardian.pidNamespace !== current.guardian.pidNamespace ||
    attempt.guardian.bootId !== current.guardian.bootId ||
    attempt.guardian.machineId !== current.guardian.machineId
  )
    throw new Error('Backup attempt differs from its current one-shot root guardian');
}

/** Fresh same-host root peer observation. PID namespace is initially the observer's (SCM_CREDENTIALS uses its PID view); the root pre-effect check must independently match its own namespace and PID. Mounted proc must expose that same view. The optional read port is only for modeled fixture faults; production always reads kernel /proc and root-owned machine identity. */
export async function readRegistryBackupGuardian(
  pid: number,
  read: (path: string) => Promise<string> = (path) =>
    ['/proc/self/ns/pid', '/proc/self'].includes(path) ? readlink(path) : readFile(path, 'utf8'),
): Promise<RegistryBackupGuardian> {
  // Proof (modeled reads): input omission performs invalid-PID reads before the final schema refusal in registry-backup-attempt.test.ts.
  if (!Number.isSafeInteger(pid) || pid < 1 || pid > 2147483647)
    throw new Error('Invalid root guardian PID');
  const observe = async () => {
    const [serialized, status, boot, machine, pidNamespace, procSelf] = await Promise.all([
      read(`/proc/${String(pid)}/stat`),
      read(`/proc/${String(pid)}/status`),
      read('/proc/sys/kernel/random/boot_id'),
      read('/etc/machine-id'),
      read('/proc/self/ns/pid'),
      read('/proc/self'),
    ]);
    // Proof (modeled reads): bounds omission admits oversized stat/status/boot/machine values; namespace still schema-refuses in registry-backup-attempt.test.ts.
    if (
      serialized.length > 4096 ||
      status.length > 65536 ||
      boot.length > 37 ||
      machine.length > 33 ||
      pidNamespace.length > 26
    )
      throw new Error('Root guardian observation exceeds bound');
    // Proof (modeled reads): mounted-proc omission admits ancestor-proc in registry-backup-attempt.test.ts.
    if (procSelf !== String(process.pid))
      throw new Error('Mounted proc differs from observer PID namespace');
    const boundary = serialized.lastIndexOf(') ');
    // Proof (modeled reads): grammar omission admits foreign PID, missing opening delimiter and short boundary in registry-backup-attempt.test.ts.
    if (!serialized.startsWith(`${String(pid)} (`) || boundary < 3)
      throw new Error('Malformed root guardian process observation');
    const fields = serialized
      .slice(boundary + 2)
      .trim()
      .split(/\s+/);
    const startTicks = fields.at(19);
    // Proof (modeled reads): liveness omission admits UID/GID/dead-leader faults in registry-backup-attempt.test.ts.
    if (
      !/^Uid:[ \t]+0[ \t]+0[ \t]+0[ \t]+0$/m.test(status) ||
      !/^Gid:[ \t]+0[ \t]+0[ \t]+0[ \t]+0$/m.test(status) ||
      !['R', 'S', 'D', 'T', 't', 'I'].includes(fields[0] ?? '')
    )
      throw new Error('Guardian is not a live current root process');
    // Proof (modeled reads): final-schema omission admits six malformed fields plus truncated start ticks in registry-backup-attempt.test.ts.
    // This required schema is also the sole truncated-field boundary; a separate field-count check had no independent witness.
    return RegistryBackupGuardian.assert({
      pid,
      startTicks,
      pidNamespace,
      bootId: boot.trim(),
      machineId: machine.trim(),
    });
  };
  const first = await observe();
  // Proof (modeled reads): bypassing this read loses twelve-read freshness and accepts all four races in registry-backup-attempt.test.ts.
  const second = await observe();
  // Proof (modeled reads): comparison omission admits start/boot/PID-namespace/machine races in registry-backup-attempt.test.ts.
  if (
    first.startTicks !== second.startTicks ||
    first.pidNamespace !== second.pidNamespace ||
    first.bootId !== second.bootId ||
    first.machineId !== second.machineId
  )
    throw new Error('Root guardian identity changed during fresh observation');
  return second;
}
