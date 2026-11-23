import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import * as filesystem from 'node:fs';
import { Socket } from 'node:net';
import { join } from 'node:path';

import { createLaunch } from '@shared/bun-startup';
import { mock } from 'bun:test';

const [role, root, scenarioOperand] = Array.from({ length: 3 }, (_, index) =>
  process.argv.at(index + 2),
);
if (root === undefined || scenarioOperand === undefined)
  throw new Error('missing native API operands');
const scenario = scenarioOperand;
if (role === 'helper') {
  const nativeClose = filesystem.closeSync;
  const nativeWrite = filesystem.writeSync;
  const nativeRead = filesystem.readSync;
  let closeAttempts = 0;
  let zeroObserved = false;
  let readErrorObserved = false,
    writeErrorObserved = false;
  if (
    scenario === 'repeat-close' ||
    scenario === 'ambiguous-close' ||
    scenario === 'write-zero' ||
    scenario === 'read-error' ||
    scenario === 'write-error'
  ) {
    const original = { ...filesystem };
    await mock.module('node:fs', () => ({
      ...original,
      closeSync(descriptor: number) {
        if (descriptor === 3) closeAttempts++;
        nativeClose(descriptor);
        if (descriptor === 3 && scenario === 'ambiguous-close' && closeAttempts === 1)
          throw new Error('controlled ambiguity after actual native close');
      },
      writeSync(...arguments_: unknown[]): number {
        if (scenario === 'write-error' && arguments_.at(0) === 4 && !writeErrorObserved) {
          writeErrorObserved = true;
          throw Object.assign(new Error('controlled native write projection'), { code: 'EIO' });
        }
        if (scenario === 'write-zero' && arguments_.at(0) === 4 && !zeroObserved) {
          zeroObserved = true;
          return 0;
        }
        const written: unknown = Reflect.apply(nativeWrite, undefined, arguments_);
        if (typeof written !== 'number') throw new Error('unexpected native write projection');
        return written;
      },
      readSync(...arguments_: unknown[]): number {
        if (scenario === 'read-error' && arguments_.at(0) === 3 && !readErrorObserved) {
          readErrorObserved = true;
          throw Object.assign(new Error('controlled native read projection'), { code: 'EIO' });
        }
        const count: unknown = Reflect.apply(nativeRead, undefined, arguments_);
        if (typeof count !== 'number') throw new Error('unexpected native read projection');
        return count;
      },
    }));
  }
  if (scenario === 'missing') nativeClose(3);
  const platform = process.platform;
  if (scenario === 'unsupported')
    Object.defineProperty(process, 'platform', { value: 'unsupported' });
  const { openGatedDescriptors } = await import('../gated-payload-native');
  const observed: Record<string, unknown> = {};
  async function inspect(): Promise<void> {
    const admission = await openGatedDescriptors({ now: () => 1000 }).then(
      (owned) => ({ kind: 'opened' as const, owned }),
      (cause: unknown) => ({ kind: 'refused' as const, cause }),
    );
    observed['admission'] = admission.kind;
    Object.defineProperty(process, 'platform', { value: platform });
    if (admission.kind === 'refused') {
      observed['refusal'] =
        admission.cause instanceof Error ? admission.cause.message : 'unexpected thrown value';
      return;
    }
    const { owned } = admission;
    let controlClosed = false;
    if (
      scenario === 'read-abort' ||
      scenario === 'read-error' ||
      scenario === 'overlap' ||
      scenario === 'active-close'
    ) {
      const abort = new AbortController();
      const reading = owned.control.read(abort.signal).then(
        (observation) => ({ kind: 'read' as const, observation }),
        () => ({ kind: 'failed' as const }),
      );
      if (scenario === 'overlap') {
        try {
          owned.control.poll();
          observed['overlapRefused'] = false;
        } catch {
          observed['overlapRefused'] = true;
        }
      }
      if (scenario === 'active-close') {
        try {
          owned.control.close();
          controlClosed = true;
          observed['closeRefused'] = false;
        } catch {
          observed['closeRefused'] = true;
        }
      }
      abort.abort();
      const sampled = await reading;
      observed['readKind'] = sampled.kind === 'read' ? sampled.observation.kind : 'failed';
      observed['readErrorInjected'] = readErrorObserved;
    }
    if (scenario === 'repeat-close' || scenario === 'ambiguous-close') {
      try {
        owned.control.close();
        observed['firstCloseRefused'] = false;
      } catch {
        observed['firstCloseRefused'] = true;
      }
      controlClosed = true;
      try {
        owned.control.close();
        observed['repeatRefused'] = false;
      } catch {
        observed['repeatRefused'] = true;
      }
      observed['closeAttempts'] = closeAttempts;
    }
    if (scenario.startsWith('write-')) {
      const abort = new AbortController();
      if (scenario === 'write-abort') abort.abort();
      const bytes = new Uint8Array(scenario === 'write-pressure' ? 2097152 : 1).fill(0x62);
      observed['write'] = await owned.status
        .write(bytes, abort.signal, scenario === 'write-deadline' ? 1000 : 10000)
        .then(
          (pressure) => ({ kind: 'written', pressure }),
          () => ({ kind: 'refused' }),
        );
      observed['writeErrorInjected'] = writeErrorObserved;
    }
    if (!controlClosed) owned.control.close();
    owned.environment.close();
    owned.status.close();
  }
  void inspect().then(
    () => {
      filesystem.writeFileSync(join(root, 'native-api.json'), JSON.stringify(observed));
    },
    (cause: unknown) => {
      filesystem.writeFileSync(
        join(root, 'native-api.json'),
        JSON.stringify({
          unexpected: cause instanceof Error ? cause.message : 'unexpected thrown value',
        }),
      );
      process.exitCode = 1;
    },
  );
} else if (role === 'controller') {
  const launch = createLaunch(process.execPath, import.meta.path);
  const regular =
    scenario === 'nonsocket' ? filesystem.openSync(join(root, 'regular'), 'wx', 0o600) : undefined;
  const helper = spawn(launch[0] ?? '', [...launch.slice(1), 'helper', root, scenario], {
    cwd: root,
    env: { PATH: process.env['PATH'] },
    stdio: ['ignore', 'ignore', 'inherit', regular ?? 'pipe', 'pipe', 'pipe'],
  });
  if (regular !== undefined) filesystem.closeSync(regular);
  const status = helper.stdio.at(4);
  if (!(status instanceof Socket)) throw new Error('actual native status endpoint absent');
  const ending = once(helper, 'exit'),
    statusEnded = once(status, 'end');
  const chunks: Buffer[] = [];
  if (scenario === 'write-pressure') await Bun.sleep(300);
  status.on('data', (bytes: Buffer) => {
    chunks.push(bytes);
  });
  await statusEnded;
  const ended: unknown = await ending;
  if (!Array.isArray(ended)) throw new Error('actual native API ending absent');
  const code: unknown = ended[0],
    signal: unknown = ended[1];
  const bytes = Buffer.concat(chunks);
  filesystem.writeFileSync(
    join(root, 'native-api-controller.json'),
    JSON.stringify({
      code,
      signal,
      length: bytes.byteLength,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    }),
  );
} else throw new Error('unknown native API role');
