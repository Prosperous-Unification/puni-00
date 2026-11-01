import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, readFileSync } from 'node:fs';

import { wallClock } from '../clock';
import type { JobTypeDescriptor } from './host-pool';
import { declaredContainersOnly, loadResourceConfiguration, ResourceRuntime } from './runtime';

/**
 * A launcher process against one ledger, as slice 3's `ops job run` will be.
 *
 * `surviving <config> <descriptor-json> <ready-file>`: admit, launch a payload whose leader
 * forks a child that outlives it, settle once while the leader is alive (so the child's
 * identity is captured), record the leader's exit 0, print `ready <job id> <child pid>`, then
 * wait to be killed.
 *
 * `race <config> <descriptor-json> <go-file> <rounds>`: wait for the go file, then `rounds`
 * times admit (waiting up to 60 s), launch a short payload, wait for it and settle until
 * released; print `done`. The parent judges the ledger's event history.
 */
const [mode, config, descriptorJson, path, rounds] = process.argv.slice(2);
if (!mode || !config || !descriptorJson || !path) throw new Error('launcher fixture arguments');
const descriptor = JSON.parse(descriptorJson) as JobTypeDescriptor;
// Tickets carry epoch deadlines that every contender compares, so each reads the host clock.
const runtime = ResourceRuntime.open(loadResourceConfiguration(config), wallClock());
const report = (line: string): void => {
  process.stderr.write(`${line}\n`);
};
const never = new AbortController().signal;

async function admit(label: string) {
  const admission = await runtime.admitHostJob(
    { descriptor, label, waitSeconds: 60 },
    { pollMs: 2, signal: never, report },
  );
  if (admission.kind !== 'admitted') throw new Error(`launcher not admitted: ${admission.kind}`);
  return runtime.prepareHostJob(admission.job.id);
}

if (mode === 'surviving') {
  const job = await admit('gate:surviving');
  const payload = spawn(
    'python3',
    [
      '-c',
      [
        'import os,sys,time',
        'child=os.fork()',
        'if child==0:',
        ' while True: time.sleep(1)',
        "open(sys.argv[1],'w').write(str(child))",
        'time.sleep(1)',
      ].join('\n'),
      path,
    ],
    { detached: true, stdio: 'ignore' },
  );
  const exited = once(payload, 'exit') as Promise<[number | null]>;
  if (payload.pid === undefined) throw new Error('payload did not start');
  runtime.recordHostJobLaunch(job.id, payload.pid);
  for (let attempt = 0; attempt < 500 && !existsSync(path); attempt++) await Bun.sleep(10);
  runtime.settleHostJob(job.id, declaredContainersOnly);
  const [code] = await exited;
  runtime.recordHostJobExit(job.id, code ?? 1);
  process.stdout.write(`ready ${job.id} ${readFileSync(path, 'utf8')}\n`);
  for (;;) await Bun.sleep(1000);
}

if (mode === 'race') {
  for (let attempt = 0; attempt < 3000 && !existsSync(path); attempt++) await Bun.sleep(2);
  for (let round = 0; round < Number(rounds); round++) {
    const job = await admit(`race:${String(process.pid)}:${String(round)}`);
    const payload = spawn('/bin/sh', ['-c', 'read gate'], {
      detached: true,
      stdio: ['pipe', 'ignore', 'ignore'],
    });
    const exited = once(payload, 'exit');
    if (payload.pid === undefined) throw new Error('payload did not start');
    runtime.recordHostJobLaunch(job.id, payload.pid);
    payload.stdin.end('go\n');
    await exited;
    for (let attempt = 0; runtime.inspectHostJob(job.id).state !== 'released'; attempt++) {
      if (attempt > 500) throw new Error('race job did not settle');
      runtime.settleHostJob(job.id, declaredContainersOnly);
      await Bun.sleep(2);
    }
  }
  process.stdout.write('done\n');
  runtime.close();
}
