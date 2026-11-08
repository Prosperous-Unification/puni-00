import { type } from 'arktype';

import { readRegistryBytes } from './registry-stream';

export const registryTagFaults = [
  'normal',
  'recovery-mode',
  'restore-kill-mode',
  'private-mode',
  'mode-drift',
  'unsupported-mode',
  'restore-noop',
  'restore-widen',
  'caller',
  'caller-action',
  'caller-namespace',
  'close-only',
  'report-only',
  'restore-only',
  'open',
  'server-signaled',
  'backup',
  'plan',
  'owner',
  'bytes',
  'not-unlinked',
  'dispatch',
  'reporter',
  'close',
  'server-unconfirmed',
  'group-alive',
  'group-access',
  'server-uid',
  'pending-state',
  'changed-before',
  'changed-after',
  'ready-missing',
  'ready-failure',
  'revision-access',
  'reporter-after',
  'restore-failure',
] as const;
export const RegistryTagRequest = type({
  fault:
    "'normal'|'recovery-mode'|'restore-kill-mode'|'private-mode'|'mode-drift'|'unsupported-mode'|'restore-noop'|'restore-widen'|'caller'|'caller-action'|'caller-namespace'|'close-only'|'report-only'|'restore-only'|'open'|'server-signaled'|'backup'|'plan'|'owner'|'bytes'|'not-unlinked'|'dispatch'|'reporter'|'close'|'server-unconfirmed'|'group-alive'|'group-access'|'server-uid'|'pending-state'|'changed-before'|'changed-after'|'ready-missing'|'ready-failure'|'revision-access'|'reporter-after'|'restore-failure'",
  '+': 'reject',
});
export const RegistryTagObservation = type({
  state: "'fulfilled'|'rejected'",
  value: 'unknown',
  message: 'string | null',
  isOriginalFailure: 'boolean',
  isAggregateError: 'boolean',
  hasOriginalFirst: 'boolean',
  diagnostic: 'unknown',
  records: 'unknown[]',
  ready: 'boolean',
  opened: 'boolean',
  spawned: 'boolean',
  readyModes: 'number[]',
  restoreStates: 'boolean[]',
  hasClosedDescriptor: 'boolean',
  hasRestoredSpawn: 'boolean',
  finalMode: 'number.safe >= 0',
  originalMode: 'number.safe >= 0',
  directory: 'string',
  probes: 'unknown[]',
  '+': 'reject',
});

/** Execute the actual tag fault helper on fresh owned files. Descriptor reads/chmod/unlink are real; eligibility, UID metadata, proc, server/group and root dispatch remain modeled. Observations precede descriptor/directory rescue, and no native server or privileged signal is forwarded. */
export async function observeRegistryTag(request: typeof RegistryTagRequest.infer) {
  const child = Bun.spawn(
    [
      process.execPath,
      new URL('./registry-tag-worker.fixture.ts', import.meta.url).pathname,
      JSON.stringify(request),
    ],
    { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe', signal: AbortSignal.timeout(12000) },
  );
  const [code, output, errors] = await Promise.all([
    child.exited,
    readRegistryBytes(child.stdout, 131072, 'Tag observation stdout'),
    readRegistryBytes(child.stderr, 131072, 'Tag observation stderr'),
  ]);
  if (code !== 0 || errors.byteLength !== 0)
    throw new Error('Tag observation setup failed: ' + new TextDecoder().decode(errors));
  return RegistryTagObservation.assert(JSON.parse(new TextDecoder().decode(output)));
}
