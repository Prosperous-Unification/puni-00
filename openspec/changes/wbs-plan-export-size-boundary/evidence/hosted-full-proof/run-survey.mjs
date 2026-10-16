import process from 'node:process';
import { clearInterval, setInterval } from 'node:timers';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { closeSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const [consumer, repository, revision, policyPath, receiptRoot, label] = process.argv.slice(2);
const policySha256 = createHash('sha256').update(readFileSync(policyPath)).digest('hex');
assert.equal(policySha256, '3cff7523646c98f4b405c7aea21df6b913ce90f0c1f6545157007fc31f73a00c');
const executable = join(consumer, 'node_modules/.bin/twib');
const argv = ['check', 'committed', repository, revision, policyPath];
const stdoutPath = join(receiptRoot, `${label}.json`);
const stderrPath = join(receiptRoot, `${label}.stderr`);
const stdout = openSync(stdoutPath, 'w');
const stderr = openSync(stderrPath, 'w');
const startedAt = new Date().toISOString();
const samples = [];
const captureMemory = () =>
  samples.push({
    at: new Date().toISOString(),
    meminfo: readFileSync('/proc/meminfo', 'utf8'),
    memoryPressure: readFileSync('/proc/pressure/memory', 'utf8'),
  });
captureMemory();
const sampling = setInterval(captureMemory, 15000);
const child = spawn(executable, argv, {
  cwd: consumer,
  env: process.env,
  stdio: ['ignore', stdout, stderr],
});
let exitCode;
let signal;
try {
  [exitCode, signal] = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, receivedSignal) => resolve([code, receivedSignal]));
  });
} finally {
  clearInterval(sampling);
  captureMemory();
  closeSync(stdout);
  closeSync(stderr);
  writeFileSync(join(receiptRoot, `${label}.memory.json`), JSON.stringify(samples, null, 2) + '\n');
  writeFileSync(
    join(receiptRoot, `${label}.command.json`),
    JSON.stringify(
      {
        executable,
        argv,
        revision,
        policySha256,
        startedAt,
        endedAt: new Date().toISOString(),
        exitCode: exitCode ?? null,
        signal: signal ?? null,
      },
      null,
      2,
    ) + '\n',
  );
}
// A wrapper failure with empty stdout is never accepted as a survey verdict.
const verdict = JSON.parse(readFileSync(stdoutPath, 'utf8'));
assert.equal(signal, null, 'survey wrapper terminated by signal');
assert.equal(typeof verdict.allowed, 'boolean');
assert.equal(exitCode, verdict.allowed ? 0 : 1, 'wrapper exit does not match verdict');
assert.equal(createHash('sha256').update(readFileSync(policyPath)).digest('hex'), policySha256);
