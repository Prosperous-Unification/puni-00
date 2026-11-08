import { chmod, readFile, stat, writeFile } from 'node:fs/promises';

import {
  instrumentRegistryGuard,
  registryGuardOriginalSha256,
} from './registry-guard-decision.fixture';
import {
  classifyRegistryFixtureChild,
  readRegistryFixtureStart,
  type RegistryFixtureChildObservation,
} from './registry-guard-observation.fixture';
import type { RegistryMaintenanceInstallation } from './registry-maintenance-installation';
import { verifyRegistryHostArtifact } from './registry-maintenance-installation';
import { awaitMaintenanceChild } from './registry-maintenance-process';

/** Own the pinned startup guard (or explicitly hashed diagnostic copy) and native Distribution group inside the disposable namespace. The diagnostic copy adds only assignments and post-decision output; no acknowledgement is synthesized. */
export async function startRegistryFixtureGuard(
  installed: RegistryMaintenanceInstallation,
  proof?: {
    signal: AbortSignal;
    initialMode: 'readonly' | 'writable';
    interceptPermissionReads: boolean;
    decisions?: true;
  },
) {
  if (process.getuid?.() !== 0 || process.pid !== 1)
    throw new Error('Guard fixture requires owned root PID1');
  if ((await readFile('/etc/task8-namespace', 'utf8')) !== 'owned-private-proof\n')
    throw new Error('Guard fixture namespace marker differs');
  let startup = '/etc/puni/registry-fixture-startup.sh';
  if (proof?.decisions === true) {
    const original = await verifyRegistryHostArtifact({
      path: startup,
      sha256: registryGuardOriginalSha256,
    });
    const diagnostic = instrumentRegistryGuard(original.toString('utf8'));
    startup = '/etc/puni/registry-fixture-decision.sh';
    await writeFile(startup, diagnostic.source, { mode: 0o644, flag: 'wx' });
    await chmod(startup, 0o644);
    await verifyRegistryHostArtifact({ path: startup, sha256: diagnostic.sha256 });
    console.log(
      JSON.stringify({
        guardDecisionArtifact: {
          originalSha256: diagnostic.originalSha256,
          transformedSha256: diagnostic.sha256,
          scope: 'fixture-instrumented-assignments-and-post-decision-output',
        },
      }),
    );
  }
  const observeAlias = async (writable: boolean) => {
    const [canonical, alias] = await Promise.all([
      stat(installed.ordinary.path),
      stat('/var/lib/registry'),
    ]);
    const entries: (string | undefined)[][] = (await readFile('/proc/self/mountinfo', 'utf8'))
      .trim()
      .split('\n')
      .map((line) => line.split(' '))
      .filter((fields) => fields[4] === '/var/lib/registry');
    const entry = entries.at(0);
    const modes = entry?.[5]?.split(',');
    // Proof: the whole starter refuses wrong-root, missing-mode and opposite-mode before a modeled remount in registry-alias-check.test.ts; independent predicate removals reach the launch boundary.
    if (
      !canonical.isDirectory() ||
      !alias.isDirectory() ||
      canonical.dev !== alias.dev ||
      canonical.ino !== alias.ino ||
      entries.length !== 1 ||
      entry?.[3] !== '/contents' ||
      modes === undefined ||
      !modes.includes(writable ? 'rw' : 'ro') ||
      modes.includes(writable ? 'ro' : 'rw')
    )
      throw new Error('Owned registry alias identity or access mode differs');
  };
  const changeAlias = async (writable: boolean) => {
    await observeAlias(!writable);
    const changed = Bun.spawnSync(
      [
        '/usr/bin/mount',
        '-o',
        writable ? 'remount,bind,rw' : 'remount,bind,ro',
        '/var/lib/registry',
      ],
      {
        env: { PATH: '/usr/bin:/bin', LANG: 'C' },
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
      },
    );
    if (changed.exitCode !== 0) throw new Error('Owned registry alias remount failed');
    await observeAlias(writable);
  };
  proof?.signal.throwIfAborted();
  await changeAlias(true);
  const config = '/etc/puni/ordinary-writer.json';
  let child: ReturnType<typeof spawnGuard>;
  const spawnGuard = () =>
    Bun.spawn(
      [
        '/usr/bin/setpriv',
        '--reuid=59001',
        '--regid=59001',
        '--clear-groups',
        '--',
        '/bin/sh',
        startup,
        '/registry-journal/identities',
        '/var/lib/registry',
        '/registry-managed-journal',
        installed.distribution.path,
        'serve',
        config,
      ],
      {
        env: {
          PATH: proof?.interceptPermissionReads
            ? '/etc/puni/guard-proof-bin:/usr/bin:/bin'
            : '/usr/bin:/bin',
          LANG: 'C',
        },
        stdin: 'ignore',
        stdout: 'ignore',
        stderr: proof === undefined ? 'ignore' : 'pipe',
        detached: true,
      },
    );
  try {
    child = spawnGuard();
  } catch (cause) {
    await changeAlias(false);
    throw cause;
  }
  let captured = Buffer.alloc(0);
  const errors = (async () => {
    if (proof === undefined) return;
    if (typeof child.stderr === 'number' || child.stderr === undefined)
      throw new Error('Missing owned guard diagnostic pipe');
    const reader = child.stderr.getReader();
    try {
      for (;;) {
        const fragment = await reader.read();
        if (fragment.done) break;
        if (captured.length + fragment.value.length > 256 * 1024)
          throw new Error('Owned guard diagnostics exceed bound');
        captured = Buffer.concat([captured, fragment.value]);
      }
    } finally {
      reader.releaseLock();
    }
  })().then(
    () => ({ ok: true as const }),
    (cause: unknown) => ({ ok: false as const, cause }),
  );
  let exited = false;
  void child.exited.then(() => {
    exited = true;
  });
  const terminal = awaitMaintenanceChild(child, proof?.signal ?? new AbortController().signal).then(
    () => ({ ok: true as const }),
    (cause: unknown) => ({ ok: false as const, cause }),
  );
  const close = async () => {
    if (!exited) child.kill('SIGTERM');
    const escalation = setTimeout(() => {
      if (!exited) child.kill('SIGKILL');
    }, 5000);
    try {
      const outcome = await terminal;
      if (
        !outcome.ok &&
        !(
          child.signalCode === 'SIGTERM' &&
          outcome.cause instanceof Error &&
          outcome.cause.message === 'Fixed maintenance child failed (exit 143)'
        )
      )
        throw outcome.cause;
      const diagnostic = await errors;
      // Only confirmed terminal group cleanup removes its writable alias capability.
      await changeAlias(false);
      if (!diagnostic.ok) throw diagnostic.cause;
    } finally {
      clearTimeout(escalation);
    }
  };
  const waitMode = async (mode: 'readonly' | 'writable') => {
    const deadline = Date.now() + 10000;
    for (;;) {
      // Proof (fixture): deadline removal lets repeated modeled ESRCH reach the explicit sleep rescue instead of refusing within the declared bound.
      if (exited || Date.now() >= deadline) throw new Error('Actual guard mode did not converge');
      const children = (
        await readFile(`/proc/${String(child.pid)}/task/${String(child.pid)}/children`, 'utf8')
      ).trim();
      if (children !== '' && !/^[1-9]\d*(?: [1-9]\d*)*$/.test(children))
        throw new Error('Malformed owned guard child census');
      for (const pid of children === '' ? [] : children.split(' ')) {
        try {
          const argv = (await readFile(`/proc/${pid}/cmdline`, 'utf8')).split('\0');
          if (
            JSON.stringify(argv) !==
            JSON.stringify([installed.distribution.path, 'serve', config, ''])
          )
            continue;
          const environment = (await readFile(`/proc/${pid}/environ`, 'utf8')).split('\0');
          const expected = `REGISTRY_STORAGE_MAINTENANCE_READONLY={"enabled":${mode === 'readonly' ? 'true' : 'false'}}`;
          if (
            environment.filter((entry) =>
              entry.startsWith('REGISTRY_STORAGE_MAINTENANCE_READONLY='),
            ).length !== 1 ||
            !environment.includes(expected)
          )
            continue;
          const status = await readFile(`/proc/${pid}/status`, 'utf8');
          if (!/^Uid:\s+59001\s+59001\s+59001\s+59001$/m.test(status))
            throw new Error('Owned guard child has a foreign UID');
          const response = await fetch('http://127.0.0.1:5052/v2/', {
            signal: AbortSignal.timeout(500),
          });
          await response.arrayBuffer();
          if (response.status !== 200) throw new Error('Unexpected guarded registry readiness');
          // Boundary: child.exited can settle during the awaited HTTP body read.
          if (exited as boolean) throw new Error('Guard exited during observation');
          return;
        } catch (cause) {
          // Proof (fixture): ESRCH removal propagates the observed candidate-read transition; Error-shape removal retries an untrusted object until deadline. Full tuple and HTTP200 remain required after convergence.
          if (
            !(cause instanceof Error) ||
            !(
              ('code' in cause &&
                ['ENOENT', 'ESRCH', 'ECONNREFUSED'].includes(String(cause.code))) ||
              ['TimeoutError', 'AbortError'].includes(cause.name)
            )
          )
            throw cause;
        }
      }
      await Bun.sleep(20);
    }
  };
  try {
    await waitMode(proof?.initialMode ?? 'readonly');
  } catch (cause) {
    await close();
    throw cause;
  }
  const observeMode = async (): Promise<RegistryFixtureChildObservation> => {
    if (exited) return { mode: 'exited', identity: null };
    try {
      const path = `/proc/${String(child.pid)}/task/${String(child.pid)}/children`;
      const before = (await readFile(path, 'utf8')).trim();
      if (before.length > 4096 || (before !== '' && !/^[1-9]\d*(?: [1-9]\d*)*$/.test(before)))
        throw new Error('Malformed guard observation child census');
      const modes: RegistryFixtureChildObservation[] = [];
      for (const pid of before === '' ? [] : before.split(' ')) {
        const started = readRegistryFixtureStart(await readFile(`/proc/${pid}/stat`, 'utf8'), pid);
        const argv = await readFile(`/proc/${pid}/cmdline`, 'utf8');
        const status = await readFile(`/proc/${pid}/status`, 'utf8');
        const environment = await readFile(`/proc/${pid}/environ`, 'utf8');
        const mode = classifyRegistryFixtureChild(argv, status, environment, [
          installed.distribution.path,
          'serve',
          config,
          '',
        ]);
        if (mode !== 'other') {
          const current = readRegistryFixtureStart(
            await readFile(`/proc/${pid}/stat`, 'utf8'),
            pid,
          );
          if (started !== current) return { mode: 'transition', identity: null };
          modes.push({ mode, identity: pid + ':' + started });
        }
      }
      // Boundary: the child-exit callback can run during the preceding proc reads.
      if (exited as boolean) return { mode: 'exited', identity: null };
      if ((await readFile(path, 'utf8')).trim() !== before)
        return { mode: 'transition', identity: null };
      if (modes.length > 1) throw new Error('Multiple owned guard servers observed');
      return modes[0] ?? { mode: 'transition', identity: null };
    } catch (cause) {
      // Proof (fixture observation only): HOST24 observed environ ESRCH; removing this case fails the exact-closure transition test, while Error/code removals swallow non-Error/access negatives. Proc/lifetime ports are modeled locally.
      if (
        cause instanceof Error &&
        'code' in cause &&
        (cause.code === 'ENOENT' || cause.code === 'ESRCH')
      )
        // Boundary: child.exited can settle before a failed proc read resumes this catch.
        return { mode: (exited as boolean) ? 'exited' : 'transition', identity: null };
      throw cause;
    }
  };
  return { close, waitMode, observeMode, readErrors: () => captured.toString('utf8') };
}
