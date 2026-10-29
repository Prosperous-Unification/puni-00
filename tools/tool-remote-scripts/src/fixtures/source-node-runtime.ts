import { realpath } from 'node:fs/promises';

/** Explicit local program-test runtime; never changes the fixed production source command or installs a tool. */
export async function sourceNodeTestRuntime(): Promise<string> {
  const requested = process.env['SOURCE_NODE_TEST_BINARY'] ?? Bun.which('node');
  if (!requested?.startsWith('/'))
    throw new Error('source Node program test requires an installed absolute Node binary');
  const resolved = await realpath(requested);
  if (!resolved.endsWith('/node'))
    throw new Error(
      'source Node program test requires the actual Node binary, not a tool-manager shim; set SOURCE_NODE_TEST_BINARY',
    );
  return resolved;
}

/** One owned test user/PID namespace maps the caller to numeric1000; host network observations remain read-only. Missing namespace support refuses. */
export function sourceNodeTestNamespace(directory: string): string[] {
  return [
    '/usr/bin/bwrap',
    '--die-with-parent',
    '--new-session',
    '--unshare-user',
    '--uid',
    '1000',
    '--gid',
    '1000',
    '--unshare-pid',
    '--ro-bind',
    '/',
    '/',
    '--bind',
    directory,
    directory,
    '--dev',
    '/dev',
    '--proc',
    '/proc',
    '--',
  ];
}
