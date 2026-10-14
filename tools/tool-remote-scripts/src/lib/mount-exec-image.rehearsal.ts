import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runDockerExec } from './docker-exec';
import { verifyContainerNamespace } from './mount-audit';
import { GROUP_PROGRAM, SUPERVISOR_PROGRAM } from './mount-exec-program';

const backend = 'wbs-be-01:f8-v1';
const binary = '/tmp/puni-audit-busybox';
const directory = await mkdtemp(join(tmpdir(), 'backend-audit-'));
const database = join(directory, 'wbs.db');
await Bun.write(database, 'audit fixture');
const namespace = join(directory, 'namespace');
await mkdir(namespace);
await Bun.write(join(namespace, 'ordinary'), 'metadata fixture');
function describeFailure(failure: unknown): string {
  if (!(failure instanceof Error)) throw new Error('rehearsal received non-error failure');
  const messages = [failure.message];
  if (failure instanceof AggregateError)
    for (const cause of failure.errors) messages.push(describeFailure(cause));
  if (failure.cause !== undefined) messages.push(describeFailure(failure.cause));
  return messages.join(' | ');
}
async function docker(args: string[]): Promise<string> {
  const process = Bun.spawn(['docker', ...args], { stdout: 'pipe', stderr: 'pipe' });
  const [output, errors, code] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);
  if (code !== 0)
    throw new Error(`docker ${args[0]} failed ${code.toString()}: ${errors}${output}`);
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
      let absentBinary = '';
      if (fault === 'binary-absent') {
        try {
          await docker(['exec', identity, '/bin/busybox', 'true']);
        } catch (cause) {
          absentBinary = describeFailure(cause);
        }
      }
      let failure: unknown = null;
      const receipts = { session: false, cleanupReap: false };
      const started = performance.now();
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
            if (
              command.at(5) !== '/bin/busybox' ||
              command.at(6) !== 'sh' ||
              command.at(7) !== '-c' ||
              command.at(8) !== SUPERVISOR_PROGRAM
            )
              throw new Error('audit command layout changed');
            if (fault === 'debian-shell' && command.at(11) !== GROUP_PROGRAM) {
              command.splice(5, 2, '/bin/sh');
              const supervisor = command.at(7);
              if (supervisor !== SUPERVISOR_PROGRAM) throw new Error('dash supervisor missing');
              command[7] = supervisor.replace('/bin/busybox sh -c', '/bin/sh -c');
            }
            if (fault === 'stalled-descendant' && command[11] !== GROUP_PROGRAM)
              command[11] = '/bin/busybox sleep 60 & wait';
            return runDockerExec(
              command,
              nonce,
              (token) => {
                if (args[11] !== GROUP_PROGRAM && token === 'SESSION') receipts.session = true;
                if (args[11] === GROUP_PROGRAM && token === 'REAPED') receipts.cleanupReap = true;
                return consume(token);
              },
              signal,
            );
          },
        );
      } catch (cause) {
        failure = cause;
      }
      if ((fault === 'none') !== (failure === null))
        throw new Error(
          `unexpected ${fault}: ${failure instanceof Error ? failure.message : 'non-error failure'}`,
        );
      const diagnostic = failure === null ? 'admitted' : describeFailure(failure);
      if (
        fault === 'debian-shell' &&
        (!diagnostic.includes('read: Illegal option -t') ||
          !receipts.session ||
          !receipts.cleanupReap ||
          diagnostic.includes('cleanup unproved'))
      )
        throw new Error(
          `dash fault did not prove shell incompatibility and cleanup: ${diagnostic}`,
        );
      if (
        fault === 'binary-absent' &&
        (!absentBinary.includes('/bin/busybox') ||
          !absentBinary.includes('no such file or directory'))
      )
        throw new Error(`binary absence was not diagnosed: ${absentBinary}`);
      if (
        fault === 'stalled-descendant' &&
        (!diagnostic.includes('exec receipt is incomplete') ||
          diagnostic.includes('cleanup unproved') ||
          !receipts.session ||
          !receipts.cleanupReap ||
          performance.now() - started < 14000)
      )
        throw new Error(`deadline fault did not prove timeout and cleanup: ${diagnostic}`);
      console.log(
        `${fault}: ${diagnostic}; session=${receipts.session.toString()}; cleanup-reaped=${receipts.cleanupReap.toString()}; absence=${absentBinary}`,
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
