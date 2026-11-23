import { appendFileSync, existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { mock } from 'bun:test';

import { readReservation } from '../../resources/hold-log';
import { identifySelf } from '../../resources/process-identity';
import { runHolder } from '../holder';
const args = process.argv.slice(2),
  path = args.at(0),
  holdFile = args.at(1),
  record = args.at(2),
  controllerPid = args.at(3),
  controllerBoot = args.at(4),
  controllerStart = args.at(5),
  poll = args.at(6);
if (
  path === undefined ||
  holdFile === undefined ||
  record === undefined ||
  controllerPid === undefined ||
  controllerBoot === undefined ||
  controllerStart === undefined ||
  poll === undefined
)
  throw new Error('holder fixture arguments missing');
const requestedHoldFile = process.env['PUNI_HOLDER_REQUEST_HOLD_FILE'] ?? holdFile;
const capture = process.env['PUNI_HOLDER_R5_CAPTURE'];
if (capture !== undefined)
  writeFileSync(
    join(capture, 'holder-child-input.json'),
    JSON.stringify(
      {
        pid: process.pid,
        identity: identifySelf(),
        path,
        holdFile,
        requestedHoldFile,
        record,
        controllerPid,
        controllerBoot,
        controllerStart,
        poll,
        reportFailure: process.env['PUNI_HOLDER_REPORT_FAIL'],
        observeRetention: process.env['PUNI_HOLDER_OBSERVE_RETENTION'],
      },
      null,
      2,
    ),
    { flag: 'wx', mode: 0o600 },
  );
if (process.env['PUNI_HOLDER_OBSERVE_RETENTION'] === '1') {
  const sleep = Bun.sleep.bind(Bun);
  Bun.sleep = async (milliseconds: number | Date) => {
    if (existsSync(record) && readFileSync(record, 'utf8').includes('unconfirmed'))
      writeFileSync(record + '.retention-poll', 'native retention wait');
    await sleep(milliseconds);
  };
}
if (process.env['PUNI_HOLDER_RELEASE_BEFORE_CALLBACK'] === '1') {
  const library = await import('@shared/heavy-lock'),
    run = library.runQueuedWork;
  const intercepted: typeof run = async (request, work, runtime) =>
    await run(
      request,
      async (admission) => {
        unlinkSync(holdFile);
        return await work(admission);
      },
      runtime,
    );
  await mock.module('@shared/heavy-lock', () => ({ ...library, runQueuedWork: intercepted }));
}
const controller = new AbortController();
let first: 'SIGINT' | 'SIGTERM' | undefined;
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    first ??= signal;
    controller.abort();
  });
function cancellationStatus(): 130 | 143 {
  if (first === undefined) throw new Error('holder cancellation reason missing');
  return first === 'SIGINT' ? 130 : 143;
}
try {
  const outcome = await runHolder(
    {
      holdFile: requestedHoldFile,
      label: 'native durable holder',
      waitSeconds: 30,
      pollSeconds: Number(poll),
    },
    {
      path,
      reservation: readReservation(holdFile, {
        pid: Number(controllerPid),
        boot: controllerBoot,
        start: controllerStart,
      }),
      signal: controller.signal,
      recordControllerCancellation: () => {
        first ??= 'SIGTERM';
        controller.abort();
      },
      reportAdmission: async () => {
        if (process.env['PUNI_HOLDER_REPORT_FAIL'] === '1')
          throw new Error('controlled admission output failure');
        if (process.env['PUNI_HOLDER_ABORT_ON_ADMISSION'] === '1') {
          const observed = Promise.withResolvers<undefined>();
          process.once('SIGINT', () => {
            observed.resolve(undefined);
          });
          process.kill(process.pid, 'SIGINT');
          await observed.promise;
          writeFileSync(
            record + '.abort-observed',
            JSON.stringify({ first, aborted: controller.signal.aborted }),
          );
        }
        appendFileSync(record, 'admitted' + String.fromCharCode(10));
        return Promise.resolve();
      },
      reportUnconfirmed: () => {
        appendFileSync(record, 'unconfirmed' + String.fromCharCode(10));
        return Promise.resolve();
      },
    },
  );
  if (outcome.kind === 'released') process.exit(0);
  if (outcome.kind === 'cancelled') process.exit(cancellationStatus());
  if (outcome.kind === 'refused') process.exit(75);
  if (outcome.value.kind === 'cancelled') process.exit(cancellationStatus());
  process.exit(0);
} catch (_cause) {
  process.stderr.write('error: holder operation failed\n');
  process.exit(70);
}
