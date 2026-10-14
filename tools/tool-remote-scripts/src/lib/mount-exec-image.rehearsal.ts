import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runDockerExec } from './docker-exec';
import { verifyContainerNamespace } from './mount-audit';
import { GROUP_PROGRAM } from './mount-exec-program';

const backend = 'wbs-be-01:f8-v1';
const binary = '/tmp/puni-audit-busybox';
const directory = await mkdtemp(join(tmpdir(), 'backend-audit-'));
const database = join(directory, 'wbs.db');
await Bun.write(database, 'audit fixture');
const namespace = join(directory, 'namespace');
await mkdir(namespace);
await Bun.write(join(namespace, 'ordinary'), 'metadata fixture');
async function docker(args: string[]): Promise<string> {
  const process = Bun.spawn(['docker', ...args], { stdout: 'pipe', stderr: 'pipe' });
  const [output, errors, code] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);
  if (code !== 0) throw new Error(`docker ${args[0]} failed ${code.toString()}: ${errors}`);
  return output.trim();
}
try {
  for (const fault of ['none', 'binary-absent', 'debian-shell', 'stalled-descendant']) {
    const name = `puni-audit-proof-${randomUUID()}`;
    const mounts =
      fault === 'binary-absent'
        ? []
        : ['--mount', `type=bind,src=${binary},dst=/bin/busybox,readonly`];
    const identity = await docker([
      'run',
      '-d',
      '--name',
      name,
      '--init',
      '--network',
      'none',
      ...mounts,
      '--mount',
      `type=bind,src=${namespace},dst=/audit`,
      '--entrypoint',
      '/bin/sleep',
      backend,
      '120',
    ]);
    try {
      const container: unknown = JSON.parse(
        await docker(['inspect', '--format', '{{json .}}', identity]),
      );
      let failure: unknown = null;
      try {
        await verifyContainerNamespace(
          container,
          ['/audit'],
          database,
          `registry/wbs-be-01@sha256:${'c'.repeat(64)}`,
          (args) =>
            docker(
              args[0] === 'image' ? ['image', 'inspect', '--format', '{{.Id}}', backend] : args,
            ),
          null,
          { totalMs: 22000, cleanupMs: 4000 },
          (args, nonce, consume, signal) => {
            const command = [...args];
            if (fault === 'debian-shell') {
              command.splice(6, 2, '/bin/sh');
              const supervisor = command.at(8);
              if (supervisor === undefined) throw new Error('supervisor missing');
              command[8] = supervisor.replace('/bin/busybox sh -c', '/bin/sh -c');
            }
            if (fault === 'stalled-descendant' && command[11] !== GROUP_PROGRAM)
              command[11] = '/bin/busybox sleep 60 & wait';
            return runDockerExec(command, nonce, consume, signal);
          },
        );
      } catch (cause) {
        failure = cause;
      }
      if ((fault === 'none') !== (failure === null))
        throw new Error(
          `unexpected ${fault}: ${failure instanceof Error ? failure.message : 'non-error failure'}`,
        );
      console.log(
        `${fault}: ${failure === null ? 'admitted' : failure instanceof Error ? failure.message : 'non-error failure'}`,
      );
      const processes = await docker([
        'exec',
        identity,
        '/bin/sh',
        '-c',
        'for path in /proc/[0-9]*/comm; do cat "$path"; done',
      ]);
      if (fault === 'stalled-descendant' && processes.includes('busybox'))
        throw new Error(`audit descendants remain: ${processes}`);
    } finally {
      await docker(['rm', '-f', identity]);
    }
  }
} finally {
  await rm(directory, { recursive: true });
}
