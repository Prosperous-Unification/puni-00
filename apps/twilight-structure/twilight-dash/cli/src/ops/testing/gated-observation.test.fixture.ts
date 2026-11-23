import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { mock } from 'bun:test';

import { monotonicClock } from '../../clock';
import { openGatedDescriptors } from '../gated-payload-native';

const root = process.cwd();
const nativeOpen = openGatedDescriptors;
const scenario = process.argv.at(-3);
await mock.module('../gated-payload-native', () => ({
  async openGatedDescriptors(monotonic: Parameters<typeof openGatedDescriptors>[0]) {
    const descriptors = await nativeOpen(monotonic);
    let written = false,
      gated = false;
    return {
      ...descriptors,
      environment: {
        ...descriptors.environment,
        close() {
          descriptors.environment.close();
          if (scenario === 'environment-close-fault')
            throw new Error('controlled ambiguous environment close');
        },
      },
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
          if (scenario === 'queued-before-transition' && written && !gated) {
            gated = true;
            writeFileSync(join(root, 'before-final-poll'), 'entered');
            while (!existsSync(join(root, 'release-final-poll'))) Bun.sleepSync(1);
          }
          return descriptors.control.poll();
        },
      },
    };
  },
}));
const { parseDashCommand, isGatedPayloadCommand } = await import('../../cli-parser');
const { runGatedPayload } = await import('../gated-payload');
const request = parseDashCommand(process.argv.slice(3));
if (!isGatedPayloadCommand(request)) throw new Error('missing gated request');
process.exitCode = await runGatedPayload(request, {
  callerDirectory: root,
  monotonic: monotonicClock(),
});
