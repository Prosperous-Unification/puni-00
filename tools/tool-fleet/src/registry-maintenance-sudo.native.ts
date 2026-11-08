import { closeSync, openSync } from 'node:fs';
import { lstat, readdir, readFile, readlink, rename, unlink, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';

import { type } from 'arktype';
import { dlopen, read as memory } from 'bun:ffi';

import { measureFilesystem, measureVerifiedFilesystem } from './registry-capacity';
import {
  acceptMaintenanceChannel,
  authenticateMaintenanceChannel,
} from './registry-maintenance-channel';
import {
  RegistryMaintenanceCancellation,
  superviseRegistryMaintenance,
} from './registry-maintenance-control';
import { connectRegistryMaintenanceHost } from './registry-maintenance-host';
import { awaitMaintenanceChild, installMaintenanceReaper } from './registry-maintenance-process';
import { createMaintenanceSocketPair } from './registry-maintenance-socket';
import { verifyRegistryMaintenanceSudo } from './registry-maintenance-sudo';
import {
  executeRegistryCommand,
  parseRegistryCommandResponse,
  type RegistryJournalPorts,
  runRegistryMaintenance,
} from './registry-managed-journal';

const directory = '/var/lib/puni-registry/journal/contents';
const registry = '/var/lib/puni-registry/registry/contents';
const fixture = '/root/task8-fixture';
const helper = '/usr/local/libexec/puni-registry-maintenance-host';
const bundle = '/usr/local/libexec/puni-registry-maintenance/proof.js';
async function writePid(name: string, pid: number) {
  if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error('Invalid fixture PID');
  await writeFile(fixture + '/' + name + '.new', String(pid), { mode: 0o600 });
  await rename(fixture + '/' + name + '.new', fixture + '/' + name);
}
async function readPid(name: string): Promise<number> {
  const text = await readFile(fixture + '/' + name, 'utf8');
  const pid = Number(text);
  if (!/^[1-9]\d*$/.test(text) || !Number.isSafeInteger(pid))
    throw new Error('Invalid fixture PID marker');
  return pid;
}
const receipt = (name: string) => `/var/lib/puni-registry/journal/identities/${name}.receipt`;
const ports: RegistryJournalPorts = {
  measureJournal: async () => {
    const measured = await measureVerifiedFilesystem(directory, receipt('journal'));
    return {
      usableBytes: measured.usableBytes,
      allocationUnitBytes: measured.allocationUnitBytes,
      usedBytes: measured.usedBytes,
      totalInodes: measured.totalInodes,
      usedInodes: measured.usedInodes,
    };
  },
  measureRegistry: async () => {
    const measured = await measureVerifiedFilesystem(registry, receipt('registry'));
    const root = await measureFilesystem('/');
    return {
      maximumBytes: measured.maximumBytes,
      usableBytes: measured.usableBytes,
      usedBytes: measured.usedBytes,
      totalInodes: measured.totalInodes,
      usedInodes: measured.usedInodes,
      rootFreeBytes: root.availableBytes,
    };
  },
};

/** Fixture root action substitutes only a fixed owned process group for registry/provider effects; real bootstrap, authority, sudo, credentials, deadlines and descendant cleanup execute unchanged. */
async function rootHelper(): Promise<void> {
  if (
    process.getuid?.() !== 0 ||
    process.getgid?.() !== 0 ||
    process.env['LD_PRELOAD'] !== undefined
  )
    throw new Error('Expected fixture root helper');
  await writePid('helper.pid', process.pid);
  const inputLink = await readlink('/proc/self/fd/0');
  await writeFile(
    fixture + '/input-kind',
    inputLink.startsWith('socket:')
      ? 'socket'
      : /^pipe:\[[1-9]\d*\]$/.test(inputLink)
        ? 'pipe'
        : inputLink.startsWith('/dev/pts/')
          ? 'pty'
          : 'other',
    { mode: 0o600 },
  );
  installMaintenanceReaper();
  const channel = await acceptMaintenanceChannel(directory, 59001);
  try {
    const mode = await readFile(fixture + '/mode', 'utf8');
    await superviseRegistryMaintenance({
      directory,
      uid: 59001,
      descriptor: channel.descriptor,
      input: channel.input,
      deadlineMs: mode === 'deadline' ? 3000 : 10000,
      execute: async (_request, signal) => {
        const child = Bun.spawn(['/usr/bin/sh', fixture + '/effect.sh'], {
          env: { PATH: '/usr/bin:/bin', LANG: 'C' },
          stdio: [
            'ignore',
            'ignore',
            'ignore',
            ...(mode === 'early-drop' ? [] : [channel.descriptor]),
          ],
          detached: true,
        });
        await writePid('effect.pid', child.pid);
        await channel.frame('ready', 'owned-native-effect');
        if (mode === 'early-drop') {
          // Deliberate removal witness: drop helper/descendant descriptor coupling while this actual root effect remains alive.
          channel.close();
          await Bun.sleep(2000);
        }
        try {
          await awaitMaintenanceChild(child, signal);
        } catch (cause) {
          if (cause !== signal.reason) throw cause;
          await writeFile(fixture + '/reaped', 'terminal', { mode: 0o600 });
          throw cause;
        }
        await writeFile(fixture + '/reaped', 'terminal', { mode: 0o600 });
        return 'verified';
      },
    });
    await channel.frame('complete', 'verified');
  } catch (cause) {
    if (cause instanceof RegistryMaintenanceCancellation)
      await channel.frame('cancelled', 'owned-effects-terminated');
    else {
      await channel.frame('failed', 'effect-failed');
      throw cause;
    }
  } finally {
    channel.close();
  }
}

async function owner(mode: string): Promise<void> {
  if (
    process.getuid?.() !== 59001 ||
    process.getgid?.() !== 59001 ||
    process.getgroups?.().some((group) => group !== 59001)
  )
    throw new Error('Expected fixture authority UID');
  if (mode === 'initialize') {
    const registryMount = await measureVerifiedFilesystem(registry, receipt('registry'));
    const journalMount = await measureVerifiedFilesystem(directory, receipt('journal'));
    await executeRegistryCommand(
      directory,
      {
        command: 'initialize',
        enrollment: {
          registryId: 'namespace-proof',
          storageId: registryMount.identity,
          registryPath: registry,
          rootPath: '/',
          maximumBytes: registryMount.maximumBytes,
          journalMaximumBytes: journalMount.maximumBytes,
          owners: ['operator'],
        },
      },
      ports,
    );
    await executeRegistryCommand(directory, { command: 'upgrade-maintenance' }, ports);
    console.log('initialized');
    return;
  }
  if (mode === 'contender') {
    const argument = process.argv.at(3);
    if (
      argument !== 'no-effect' &&
      (argument === undefined ||
        !/^[1-9]\d*$/.test(argument) ||
        !Number.isSafeInteger(Number(argument)))
    )
      throw new Error('Invalid fixture expected effect');
    const probe = openSync(directory + '/authority.lock', 'r+');
    const lock = dlopen('libc.so.6', {
      flock: { args: ['i32', 'i32'], returns: 'i32' },
      __errno_location: { args: [], returns: 'ptr' },
    });
    try {
      const code = lock.symbols.flock(probe, 2 | 4);
      const address = lock.symbols.__errno_location();
      if (code !== -1 || address === null || memory.i32(address) !== 11)
        throw new Error('Contender did not observe actual authority contention');
    } finally {
      closeSync(probe);
      lock.close();
    }
    console.log('contended');
    // Boundary: The canonical measure callback updates this internal flag while the command is awaited.
    let observed = false as boolean;
    const deadline = Date.now() + 10000;
    for (;;) {
      try {
        const current = await executeRegistryCommand(
          directory,
          { command: 'check-capacity' },
          {
            ...ports,
            measureJournal: async (enrollment) => {
              // This callback runs INSIDE the supported command's canonical flock, before its capacity check persists anything.
              if (argument !== 'no-effect') {
                let absent = false;
                try {
                  process.kill(-Number(argument), 0);
                } catch (cause) {
                  if (cause instanceof Error && 'code' in cause && cause.code === 'ESRCH')
                    absent = true;
                  else if (!(cause instanceof Error && 'code' in cause && cause.code === 'EPERM'))
                    throw cause;
                }
                if (!absent) {
                  console.log('acquired-with-live-effect');
                  throw new Error('Acquired authority while owned effect remained alive');
                }
              }
              observed = true;
              return ports.measureJournal(enrollment);
            },
          },
        );
        if (!observed) throw new Error('Missing acquired-lock observation');
        console.log(
          JSON.stringify({
            acquired: true,
            effect: 'absent-under-lock',
            fenced: current.state.fenced,
          }),
        );
        return;
      } catch (cause) {
        if (
          !(cause instanceof Error) ||
          cause.message !== 'Registry operation authority is busy' ||
          Date.now() >= deadline
        )
          throw cause;
        await Bun.sleep(5);
      }
    }
  }
  const existing = (await executeRegistryCommand(directory, { command: 'read' }, ports)).state;
  await runRegistryMaintenance(
    directory,
    {
      operationId: 'native-control',
      owner: 'operator',
      kind: 'backup',
      recover: existing.maintenance !== null,
    },
    ports,
    async (session) => {
      if (session.read().maintenance?.phase === 'acquired') {
        const evidence = session.read().maintenanceEvidence;
        if (evidence === null) throw new Error('Missing owned evidence');
        await session.record({ ...evidence, runtime: 'synthetic-control-fixture' });
        await session.advance('reconciled');
        await session.advance('fenced');
        await session.advance('stopped');
      }
      if (mode === 'before-transfer' || mode === 'after-ack') {
        await verifyRegistryMaintenanceSudo();
        const pair = createMaintenanceSocketPair();
        const child = Bun.spawn(['/usr/bin/sudo.ws', '-n', '--', helper], {
          env: { PATH: '/usr/bin:/bin', LANG: 'C' },
          stdio: [pair.helper.descriptor, 'pipe', 'pipe'],
        });
        pair.helper.close();
        const diagnostics = Promise.all([
          new Response(child.stdout).text(),
          new Response(child.stderr).text(),
        ]);
        try {
          if (mode === 'after-ack')
            await authenticateMaintenanceChannel(pair.parent, session.authorityDescriptor);
          console.log(mode);
          await Bun.sleep(60000);
        } finally {
          pair.parent.close();
          await child.exited;
          await diagnostics;
        }
        throw new Error('Fixture owner was not killed');
      }
      process.env['LD_PRELOAD'] = '/must-not-cross-maintenance-boundary';
      const connection = await connectRegistryMaintenanceHost(session, 'serve-readonly');
      console.log('ready');
      if (mode === 'kill' || mode === 'early-drop') await Bun.sleep(60000);
      if (mode === 'deadline') await Bun.sleep(3500);
      if (mode === 'cancel' && (await Bun.stdin.text()) !== 'continue\n')
        throw new Error('Missing fixture cancellation handshake');
      await connection.close();
      throw new Error('Fixture operation intentionally remains fenced');
    },
  );
}

async function controller(): Promise<void> {
  if (
    process.getuid?.() !== 0 ||
    (await readFile('/etc/task8-namespace', 'utf8')) !== 'owned-private-proof\n'
  )
    throw new Error('Expected owned private namespace');
  installMaintenanceReaper();
  const native = dlopen('libc.so.6', { waitpid: { args: ['i32', 'ptr', 'i32'], returns: 'i32' } });
  const spawn = (mode: string, argument?: string) =>
    Bun.spawn(
      [
        '/usr/bin/setpriv',
        '--reuid=59001',
        '--regid=59001',
        '--clear-groups',
        '--',
        process.execPath,
        bundle,
        mode,
        ...(argument === undefined ? [] : [argument]),
      ],
      { env: { PATH: '/usr/bin:/bin', LANG: 'C' }, stdio: ['pipe', 'pipe', 'pipe'] },
    );
  const complete = async (child: {
    exited: Promise<number>;
    stdout: ReadableStream<Uint8Array>;
    stderr: ReadableStream<Uint8Array>;
  }) => {
    const [code, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    return { code, stdout, stderr };
  };
  const initialized = await complete(spawn('initialize'));
  if (
    initialized.code !== 0 ||
    initialized.stdout.trim() !== 'initialized' ||
    initialized.stderr !== ''
  )
    throw new Error('Fixture physical authority initialization failed');
  let checks = 1;
  const command = async (
    uid: number,
    executable: string,
    args: string[],
    input: 0 | 'ignore' = 'ignore',
  ) => {
    const child = Bun.spawn(
      [
        '/usr/bin/setpriv',
        `--reuid=${String(uid)}`,
        `--regid=${String(uid)}`,
        '--clear-groups',
        '--',
        executable,
        ...args,
      ],
      { env: { PATH: '/usr/bin:/bin', LANG: 'C' }, stdio: [input, 'pipe', 'pipe'] },
    );
    return complete(child);
  };
  for (const [uid, executable, args, permitted] of [
    [59002, '/usr/bin/sudo', ['-n', '--', '/usr/bin/true'], true],
    [59002, '/usr/bin/sudo', ['-n', '--', '/usr/bin/true', 'unexpected'], false],
    [59001, '/usr/bin/sudo.ws', ['-n', '--', '/usr/bin/true'], false],
    [59001, '/usr/bin/sudo.ws', ['-n', '-l', '--', helper], true],
    [59001, '/usr/bin/sudo.ws', ['-n', '-l', '--', helper, 'unexpected'], false],
    [59001, helper, [], false],
  ] as const) {
    const outcome = await command(uid, executable, [...args]);
    if ((outcome.code === 0) !== permitted)
      throw new Error('Native narrow sudo permission mismatch');
    checks++;
  }
  // sudo -l with an exact command tests policy matching without confusing a helper's own argument refusal with denial.
  // Contract: https://raw.githubusercontent.com/sudo-project/sudo/main/docs/sudo.man.in (--list).
  const narrowPolicy = await readFile('/etc/sudoers', 'utf8');
  try {
    const relaxed = narrowPolicy
      .replace(helper + ' ""', helper)
      .replace('/usr/bin/true ""', '/usr/bin/true');
    if (relaxed === narrowPolicy) throw new Error('Missing exact fixture no-argument rules');
    await writeFile('/etc/sudoers', relaxed);
    const unrelated = await command(59002, '/usr/bin/sudo', [
      '-n',
      '--',
      '/usr/bin/true',
      'unexpected',
    ]);
    const helperArguments = await command(59001, '/usr/bin/sudo.ws', [
      '-n',
      '-l',
      '--',
      helper,
      'unexpected',
    ]);
    if (unrelated.code !== 0 || helperArguments.code !== 0)
      throw new Error('No-argument policy removal did not admit the forbidden arguments');
    checks += 2;
    console.log(
      JSON.stringify({
        noArgumentPolicyRemoval: 'detected',
        defaultCommand: 'incorrectly-admitted',
        fixedHelperPolicy: 'incorrectly-admitted-without-executing-helper',
      }),
    );
  } finally {
    await writeFile('/etc/sudoers', narrowPolicy);
  }
  const clearMarkers = async () => {
    for (const marker of ['helper.pid', 'effect.pid', 'reaped', 'input-kind']) {
      try {
        const status = await lstat(fixture + '/' + marker);
        if (!status.isFile() || status.uid !== 0 || status.nlink !== 1)
          throw new Error('Fixture marker identity mismatch');
        await unlink(fixture + '/' + marker);
      } catch (cause) {
        if (!(cause instanceof Error && 'code' in cause && cause.code === 'ENOENT')) throw cause;
      }
    }
  };
  try {
    for (const mode of [
      'cancel',
      'kill',
      'deadline',
      'before-transfer',
      'after-ack',
      'early-drop',
    ]) {
      await clearMarkers();
      await writeFile(fixture + '/mode', mode);
      const child = spawn(mode);
      const reader = child.stdout.getReader();
      const first = await Promise.race([
        reader.read(),
        Bun.sleep(10000).then(() => {
          throw new Error('Fixture owner readiness deadline');
        }),
      ]);
      const expected = mode === 'before-transfer' || mode === 'after-ack' ? mode : 'ready';
      if (first.done || new TextDecoder().decode(first.value).trim() !== expected)
        throw new Error('Fixture owner failed before expected boundary');
      const started = Date.now() + 10000;
      for (;;) {
        try {
          await readPid('helper.pid');
          break;
        } catch (cause) {
          if (
            !(cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') ||
            Date.now() >= started
          )
            throw cause;
        }
        await Bun.sleep(10);
      }
      const expectedEffect = ['before-transfer', 'after-ack'].includes(mode)
        ? 'no-effect'
        : String(await readPid('effect.pid'));
      const contender = spawn('contender', expectedEffect);
      await contender.stdin.end();
      const contentionReader = contender.stdout.getReader();
      const contention = await contentionReader.read();
      if (contention.done || new TextDecoder().decode(contention.value).trim() !== 'contended')
        throw new Error('Missing actual flock contention handshake');
      if (mode === 'cancel') {
        await child.stdin.write('continue\n');
        await child.stdin.end();
      }
      if (
        mode === 'kill' ||
        mode === 'early-drop' ||
        mode === 'before-transfer' ||
        mode === 'after-ack'
      )
        child.kill('SIGKILL');
      const code = await child.exited;
      await reader.cancel();
      reader.releaseLock();
      const errors = await new Response(child.stderr).text();
      if (code === 0 || ![1, 137].includes(code))
        throw new Error('Fixture owner did not retain an interrupted operation');
      if (errors !== '' && !errors.includes('Fixture authority operation failed'))
        throw new Error('Unexpected fixture owner diagnostics');
      const chunks: Uint8Array[] = [];
      for (;;) {
        const chunk = await contentionReader.read();
        if (chunk.done) break;
        chunks.push(chunk.value);
      }
      contentionReader.releaseLock();
      const competingCode = await contender.exited;
      const competingError = await new Response(contender.stderr).text();
      const competingOutput = Buffer.concat(chunks).toString();
      if (mode === 'early-drop') {
        if (competingCode !== 1 || competingOutput.trim() !== 'acquired-with-live-effect')
          throw new Error(
            'Early descriptor drop removal witness did not fail at actual acquisition',
          );
      } else if (
        // Proof: exit/stderr omissions let failed contenders continue in the actual-caller observation tests.
        competingCode !== 0 ||
        competingError !== '' ||
        // Proof: acquired/fenced/effect/extra-key or decoder faults each accept malformed evidence in registry-sudo-observation.test.ts.
        !type({
          acquired: 'true',
          effect: "'absent-under-lock'",
          fenced: 'true',
          '+': 'reject',
        }).allows(JSON.parse(competingOutput))
      )
        throw new Error('Contender did not prove effect absence while holding the authority');
      const deadline = Date.now() + 10000;
      for (;;) {
        while (native.symbols.waitpid(-1, null, 1) > 0) {
          /* Exact owned namespace descendants after direct subprocesses settled. */
        }
        const helperPid = await readPid('helper.pid');
        const present = (await readdir('/proc')).includes(String(helperPid));
        if (!present) break;
        if (Date.now() >= deadline) throw new Error('Fixture privileged helper did not terminate');
        await Bun.sleep(10);
      }
      if (
        !['before-transfer', 'after-ack'].includes(mode) &&
        (await readFile(fixture + '/reaped', 'utf8')) !== 'terminal'
      )
        throw new Error('Root effect cleanup was not recorded');
      if (!['before-transfer', 'after-ack'].includes(mode)) {
        const effectPid = await readPid('effect.pid');
        let absent = false;
        try {
          process.kill(-effectPid, 0);
        } catch (cause) {
          if (cause instanceof Error && 'code' in cause && cause.code === 'ESRCH') absent = true;
          else throw cause;
        }
        if (!absent) throw new Error('Owned effect process group survived root acknowledgement');
      }
      checks += 3;
      console.log(
        JSON.stringify({
          mode,
          checks,
          exclusion: mode === 'early-drop' ? 'deliberate-removal-detected' : 'verified',
          fence: 'retained',
          helper: 'terminal',
        }),
      );
    }
    const policy = await readFile('/etc/sudoers', 'utf8');
    try {
      for (const pty of [false, true]) {
        await clearMarkers();
        await writeFile(fixture + '/mode', 'interposed');
        const logDirectory = fixture + (pty ? '/iolog-pty-policy' : '/iolog-plain-policy');
        try {
          await lstat(logDirectory);
          throw new Error('Fixture policy case already has I/O logs');
        } catch (cause) {
          if (!(cause instanceof Error && 'code' in cause && cause.code === 'ENOENT')) throw cause;
        }
        await writeFile(
          '/etc/sudoers',
          policy +
            `\nDefaults!${helper} ${pty ? '' : '!'}use_pty, log_input, iolog_dir="${logDirectory}"\n`,
        );
        const checked = Bun.spawnSync(['/usr/sbin/visudo.ws', '-cf', '/etc/sudoers'], {
          env: { PATH: '/usr/bin:/bin', LANG: 'C' },
        });
        if (checked.exitCode !== 0) throw new Error('Fixture interposition policy does not parse');
        const refused = await complete(spawn('interposed'));
        if (refused.code !== 1 || refused.stdout !== '')
          throw new Error('Interposed input reached an authenticated effect');
        // Pinned sudo 1.9.17p2 exec_pty.c1138–1161 relays non-TTY socket stdin through a pipe even with use_pty.
        if ((await readFile(fixture + '/input-kind', 'utf8')) !== 'pipe')
          throw new Error('Native socket logging did not produce actual pipe interposition');
        try {
          await lstat(fixture + '/effect.pid');
          throw new Error('Interposed input started a privileged effect');
        } catch (cause) {
          if (!(cause instanceof Error && 'code' in cause && cause.code === 'ENOENT')) throw cause;
        }
        // Proof: canonical-parser omission certifies a token-only malformed journal in registry-sudo-journal.test.ts.
        const state = parseRegistryCommandResponse({
          state: JSON.parse(await readFile(directory + '/journal.json', 'utf8')),
        } satisfies { state: unknown }).state;
        const token = state.maintenance?.token;
        // Proof: owner-guard omission enumerates logs before later token refusal; this proves early refusal, not false certification.
        if (token === undefined) throw new Error('Missing owned fixture token');
        let files = 0;
        const inspect = async (path: string): Promise<void> => {
          for (const name of await readdir(path)) {
            const child = path + '/' + name;
            const status = await lstat(child);
            if (status.isDirectory()) await inspect(child);
            else {
              if (!status.isFile() || status.isSymbolicLink() || status.size > 1024 ** 2)
                throw new Error('Unexpected fixture I/O log');
              let bytes = await readFile(child);
              if (bytes[0] === 0x1f && bytes[1] === 0x8b)
                bytes = gunzipSync(bytes, { maxOutputLength: 1024 ** 2 });
              if (bytes.includes(Buffer.from(token)))
                throw new Error('Operation token reached sudo input logging');
              files++;
            }
          }
        };
        await inspect(logDirectory);
        if (files === 0) throw new Error('Missing actual sudo I/O logging evidence');
        checks += 3;
        console.log(
          JSON.stringify({
            interposition: 'logged-pipe',
            policyUsePty: pty,
            actualInput: await readFile(fixture + '/input-kind', 'utf8'),
            token: 'absent-from-all-logs',
            effect: 'absent',
          }),
        );
      }
      await clearMarkers();
      // Receiver-boundary proof: actual private controlling-terminal stdin reaches the same fixed sudo helper.
      // No request/token is supplied here; sender withholding is proved by the two production socket/logging cases above.
      const terminalRefusal = await command(59001, '/usr/bin/sudo.ws', ['-n', '--', helper], 0);
      if (
        terminalRefusal.code !== 1 ||
        terminalRefusal.stdout !== '' ||
        (await readFile(fixture + '/input-kind', 'utf8')) !== 'pty'
      )
        throw new Error('Actual private PTY did not reach and fail receiver bootstrap');
      try {
        await lstat(fixture + '/effect.pid');
        throw new Error('Actual PTY receiver started a privileged effect');
      } catch (cause) {
        if (!(cause instanceof Error && 'code' in cause && cause.code === 'ENOENT')) throw cause;
      }
      checks += 2;
      console.log(
        JSON.stringify({
          receiverInput: 'actual-private-pty',
          bootstrap: 'refused',
          effect: 'absent',
          scope: 'receiver-boundary; no-request-supplied',
        }),
      );
    } finally {
      await writeFile('/etc/sudoers', policy);
    }
    for (const validator of ['/usr/sbin/visudo', '/usr/sbin/visudo.ws']) {
      const checked = Bun.spawnSync([validator, '-cf', '/etc/sudoers'], {
        env: { PATH: '/usr/bin:/bin', LANG: 'C' },
      });
      if (checked.exitCode !== 0) throw new Error('Restored fixture policy fails a shared parser');
    }
    console.log(
      JSON.stringify({
        checks,
        scope: 'actual-sudo-socket-authority-control; fixed-process-effect-substitution',
      }),
    );
  } finally {
    native.close();
  }
}

if (import.meta.main) {
  const mode = process.argv.at(2);
  try {
    if (mode === undefined) await rootHelper();
    else if (mode === 'prove') await controller();
    else if (
      [
        'initialize',
        'contender',
        'cancel',
        'kill',
        'deadline',
        'before-transfer',
        'after-ack',
        'interposed',
        'early-drop',
      ].includes(mode)
    )
      await owner(mode);
    else throw new Error('Unexpected fixture mode');
  } catch (cause) {
    console.error(
      mode === 'prove' && cause instanceof Error
        ? cause.message
        : 'Fixture authority operation failed',
    );
    if (mode === 'prove') process.exit(1);
    process.exitCode = 1;
  }
}
