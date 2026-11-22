import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { Socket } from 'node:net';
import { join } from 'node:path';

import { createLaunch } from '@shared/bun-startup';
import { mock } from 'bun:test';

import { monotonicClock } from '../../clock';
import { openGatedDescriptors } from '../gated-payload-native';
import { encodeGatedEnvironment } from '../gated-payload-protocol';

const [role, root, scenario] = Array.from({ length: 3 }, (_, index) => process.argv.at(index + 2));
if (root === undefined || scenario === undefined) throw new Error('missing kill fixture operands');
async function waitFile(path: string): Promise<void> {
  const deadline = performance.now() + 5000;
  while (!existsSync(path)) {
    if (performance.now() >= deadline) throw new Error('kill fixture witness absent: ' + path);
    await Bun.sleep(1);
  }
}
if (role === 'payload') {
  writeFileSync(join(root, 'payload-ready'), String(process.pid));
  if (scenario === 'running' || scenario === 'duplicate-running')
    await waitFile(join(root, 'release-payload'));
  process.exitCode = 37;
} else if (role === 'helper') {
  const nativeSpawn = Bun.spawn,
    helperRoot = root;
  function observedSpawn(
    argv: readonly string[],
    options: Bun.Spawn.SpawnOptions<'inherit', 'inherit', 'inherit'>,
  ) {
    const callback = options.onExit?.bind(options);
    const child = nativeSpawn([...argv], {
      ...options,
      onExit(child, code, signal, cause) {
        writeFileSync(
          join(helperRoot, 'actual-native.json'),
          JSON.stringify({ code, signal, hadCause: cause !== undefined }),
        );
        void callback?.(child, code, signal, cause);
      },
    });
    writeFileSync(join(helperRoot, 'acquired-native'), String(child.pid));
    const nativeKill = child.kill.bind(child);
    Object.defineProperty(child, 'kill', {
      value(signal?: number | NodeJS.Signals) {
        appendFileSync(join(helperRoot, 'kill-calls'), String(signal) + '\n');
        nativeKill(signal);
      },
    });
    void child.exited.then((status) => {
      writeFileSync(join(helperRoot, 'actual-numeric'), String(status));
    });
    return child;
  }
  Object.defineProperty(Bun, 'spawn', { value: observedSpawn });
  const nativeOpen = openGatedDescriptors;
  await mock.module('../gated-payload-native', () => ({
    async openGatedDescriptors(monotonic: Parameters<typeof openGatedDescriptors>[0]) {
      const descriptors = await nativeOpen(monotonic);
      let written = false,
        gated = false;
      return {
        ...descriptors,
        status: {
          ...descriptors.status,
          async write(...operands: Parameters<typeof descriptors.status.write>) {
            const pressure = await descriptors.status.write(...operands);
            written = true;
            return pressure;
          },
        },
        control: {
          ...descriptors.control,
          poll() {
            if (scenario.startsWith('prefix-') && written && !gated) {
              gated = true;
              writeFileSync(join(helperRoot, 'before-final-poll'), 'entered');
              const deadline = performance.now() + 5000;
              while (!existsSync(join(helperRoot, 'release-final-poll'))) {
                if (performance.now() >= deadline) throw new Error('final poll release absent');
                Bun.sleepSync(1);
              }
            }
            return descriptors.control.poll();
          },
        },
      };
    },
  }));
  const { parseDashCommand, isGatedPayloadCommand } = await import('../../cli-parser');
  const { runGatedPayload } = await import('../gated-payload');
  const request = parseDashCommand([
    'ops',
    'job',
    'payload-internal-v1',
    '--',
    ...createLaunch(process.execPath, import.meta.path),
    'payload',
    root,
    scenario,
  ]);
  if (!isGatedPayloadCommand(request)) throw new Error('invalid kill helper command');
  process.exitCode = await runGatedPayload(request, {
    callerDirectory: root,
    monotonic: monotonicClock(),
  });
} else if (role === 'controller') {
  const launch = createLaunch(process.execPath, import.meta.path);
  const helper = spawn(launch[0] ?? '', [...launch.slice(1), 'helper', root, scenario], {
    cwd: root,
    env: { PATH: process.env['PATH'] },
    stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe', 'pipe'],
  });
  const control = helper.stdio.at(3),
    status = helper.stdio.at(4),
    environment = helper.stdio.at(5),
    stderr = helper.stderr;
  if (
    !(control instanceof Socket) ||
    !(status instanceof Socket) ||
    !(environment instanceof Socket) ||
    stderr === null
  )
    throw new Error('kill fixture pipes absent');
  const nativeEnded = once(helper, 'exit'),
    statusEnded = once(status, 'end');
  let statusText = '',
    diagnostics = '';
  status.on('data', (bytes: Buffer) => {
    statusText += bytes.toString('utf8');
  });
  stderr.on('data', (bytes: Buffer) => {
    diagnostics += bytes.toString('utf8');
  });
  const ownedControl = control;
  async function writeControl(text: string): Promise<void> {
    await new Promise<void>((resolve, reject) =>
      ownedControl.write(text, (cause) => {
        if (cause) reject(cause);
        else resolve();
      }),
    );
  }
  const frame = encodeGatedEnvironment({ PATH: process.env['PATH'] });
  if (scenario === 'early-before-start' || scenario === 'early-before-environment') {
    if (scenario === 'early-before-start') {
      await new Promise<void>((resolve, reject) =>
        environment.end(frame, (cause?: Error | null) => {
          if (cause) reject(cause);
          else resolve();
        }),
      );
      await writeControl('kill\nstart\n');
    } else {
      await writeControl('start\nkill\n');
      // The kill is observed while FD5 EOF is withheld, then the real startup input settles.
      await Bun.sleep(100);
      if (environment.writableEnded || environment.destroyed) {
        await nativeEnded;
        if (helper.exitCode !== 125) throw new Error('environment closed without startup refusal');
      } else {
        await new Promise<void>((resolve, reject) =>
          environment.end(frame, (cause?: Error | null) => {
            if (cause) reject(cause);
            else resolve();
          }),
        );
      }
    }
    const deadline = performance.now() + 5000;
    while (helper.exitCode === null && !existsSync(join(root, 'acquired-native'))) {
      if (performance.now() >= deadline)
        throw new Error('startup refusal or native acquisition absent');
      await Bun.sleep(1);
    }
    if (existsSync(join(root, 'acquired-native'))) {
      await statusEnded;
      await writeControl('done\n');
      control.end();
    }
  } else {
    await new Promise<void>((resolve, reject) =>
      environment.end(frame, (cause?: Error | null) => {
        if (cause) reject(cause);
        else resolve();
      }),
    );
    await writeControl('start\n');
    await waitFile(join(root, 'payload-ready'));
    if (scenario === 'running' || scenario === 'duplicate-running') {
      await writeControl(scenario === 'running' ? 'kill\n' : 'kill\nkill\n');
      // Explicit actual-child release makes the old no-kill implementation finish RED.
      await Bun.sleep(100);
      writeFileSync(join(root, 'release-payload'), 'release');
    }
    if (scenario.startsWith('prefix-')) {
      await waitFile(join(root, 'before-final-poll'));
      await writeControl(scenario === 'prefix-other' ? 'do' : 'ki');
      writeFileSync(join(root, 'release-final-poll'), 'release');
    }
    await statusEnded;
    if (scenario === 'late' || scenario === 'duplicate-late')
      await writeControl(scenario === 'late' ? 'kill\n' : 'kill\nkill\n');
    if (scenario === 'prefix-kill') await writeControl('ll\n');
    if (scenario === 'after-done') await writeControl('done\nkill\n');
    else if (scenario !== 'prefix-truncated' && scenario !== 'prefix-other')
      await writeControl('done\n');
    control.end();
  }
  const ending: unknown = await nativeEnded;
  if (!Array.isArray(ending)) throw new Error('kill helper native end absent');
  environment.destroy();
  const code: unknown = ending[0],
    signal: unknown = ending[1];
  const native: unknown = existsSync(join(root, 'actual-native.json'))
    ? JSON.parse(readFileSync(join(root, 'actual-native.json'), 'utf8'))
    : null;
  writeFileSync(
    join(root, 'kill-observation.json'),
    JSON.stringify({
      code,
      signal,
      status: statusText,
      diagnostics,
      acquired: existsSync(join(root, 'acquired-native')),
      kills: existsSync(join(root, 'kill-calls'))
        ? readFileSync(join(root, 'kill-calls'), 'utf8')
        : '',
      numeric: existsSync(join(root, 'actual-numeric'))
        ? readFileSync(join(root, 'actual-numeric'), 'utf8')
        : null,
      native,
    }),
  );
} else throw new Error('unknown kill fixture role');
