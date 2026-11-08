import { type } from 'arktype';

import { readRegistryBytes } from './registry-stream';

export const RegistryInodePressureRequest = type({
  fault: type.enumerated(
    'none',
    'uid',
    'pid',
    'selector',
    'path',
    'receipt',
    'maximum',
    'identity',
    'measured-maximum',
    'zero-inodes',
    'excess-inodes',
    'preexisting-full',
    'parent-kind',
    'registry-kind',
    'parent-device',
    'journal-device',
    'root-device',
    'mkdir',
    'directory-kind',
    'directory-owner',
    'directory-group',
    'directory-mode',
    'directory-device',
    'directory-links',
    'open-error',
    'open-opaque',
    'open-hidden-code',
    'open-existing',
    'open-access',
    'file-kind',
    'file-device',
    'file-owner',
    'file-group',
    'file-links',
    'file-mode',
    'file-size',
    'close',
    'held-close',
    'file-close',
    'no-exhaustion',
    'zero-created',
    'terminal-identity',
    'terminal-maximum',
    'terminal-total',
    'terminal-inodes',
    'terminal-free-bytes',
    'terminal-directory',
    'verify',
    'verify-free-inode',
    'verify-bytes',
    'verify-missing',
    'verify-extra',
    'verify-name',
    'verify-swap',
    'verify-metadata',
    'verify-read',
    'verify-directory',
  ),
  '+': 'reject',
});
export const RegistryInodePressureObservation = type({
  state: "'fulfilled'|'rejected'",
  category: 'string',
  isPrimary: 'boolean',
  isClose: 'boolean',
  isAggregate: 'boolean',
  hasCloseMember: 'boolean',
  hasFirstCause: 'boolean',
  mkdirs: 'number.safe >= 0',
  opens: 'number.safe >= 0',
  closes: 'number.safe >= 0',
  created: 'number.safe >= 0',
  measured: 'number.safe >= 0',
  verified: 'boolean',
  settledBeforeClose: 'boolean | null',
  openedBeforeClose: 'number.safe >= 0 | null',
  commands: 'unknown[]',
  receipt: 'unknown',
  '+': 'reject',
});

/** Exercise the actual inode filler in a disposable worker with modeled filesystem counters, paths, descriptors and namespace identity. No allocation, subprocess or signal is forwarded. Native inode exhaustion needs a separate owned-volume rehearsal. */
export async function observeRegistryInodePressure(
  request: typeof RegistryInodePressureRequest.infer,
) {
  const child = Bun.spawn(
    [
      process.execPath,
      new URL('./registry-inode-pressure-worker.fixture.ts', import.meta.url).pathname,
      JSON.stringify(request),
    ],
    { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe', signal: AbortSignal.timeout(10000) },
  );
  const [code, output, errors] = await Promise.all([
    child.exited,
    readRegistryBytes(child.stdout, 131072, 'Inode pressure stdout'),
    readRegistryBytes(child.stderr, 131072, 'Inode pressure stderr'),
  ]);
  if (code !== 0 || errors.byteLength !== 0)
    throw new Error('Inode pressure worker setup failed: ' + new TextDecoder().decode(errors));
  return RegistryInodePressureObservation.assert(JSON.parse(new TextDecoder().decode(output)));
}
