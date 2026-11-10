import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'bun:test';

const entrypoint = fileURLToPath(new URL('./lint-interrupts.ts', import.meta.url));

function runProbe(body: string) {
  const source =
    'const { createLintInterrupts } = await import(' + JSON.stringify(entrypoint) + ');\n' + body;
  return Bun.spawnSync(
    [process.execPath, '--no-env-file', '--config=/dev/null', '--eval', source],
    { env: {}, stdout: 'pipe', stderr: 'pipe', timeout: 10_000 },
  );
}

describe('executable-owned lint interrupts', () => {
  it('replays prior cancellation and forwards later native signals until unsubscribed', () => {
    const child = runProbe(`
const owner = createLintInterrupts();
async function deliver(signal) {
  const received = new Promise(resolve => process.once(signal, resolve));
  process.kill(process.pid, signal);
  await received;
}
await deliver('SIGINT');
const observed = [];
const unsubscribe = owner.subscribe(signal => observed.push(signal));
await deliver('SIGTERM');
const replay = [];
const releaseReplay = owner.subscribe(signal => replay.push(signal));
releaseReplay();
if (JSON.stringify(replay) !== '["SIGINT"]') throw new Error('late subscriber lost original cancellation');
unsubscribe();
await deliver('SIGINT');
owner.dispose();
process.stdout.write(JSON.stringify(observed));
`);
    expect(child.exitCode, child.stderr.toString()).toBe(0);
    expect(child.stdout.toString()).toBe('["SIGINT","SIGTERM"]');
    expect(child.stderr.toString()).toBe('');
  });

  it('disposal restores native signal termination and removes its listeners', () => {
    const child = runProbe(`
const before = ['SIGINT', 'SIGTERM'].map(signal => process.listenerCount(signal));
const owner = createLintInterrupts();
owner.dispose();
owner.dispose();
const after = ['SIGINT', 'SIGTERM'].map(signal => process.listenerCount(signal));
if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('interrupt listener leaked');
process.kill(process.pid, 'SIGTERM');
await Bun.sleep(1000);
process.stdout.write('native termination was swallowed');
`);
    expect(child.signalCode).toBe('SIGTERM');
    expect(child.stdout.toString()).toBe('');
    expect(child.stderr.toString()).toBe('');
  });

  it('refuses subscription after the executable releases its signal source', () => {
    const child = runProbe(`
const owner = createLintInterrupts();
owner.dispose();
try { owner.subscribe(() => undefined); }
catch (cause) { process.stdout.write(cause.message); process.exit(0); }
throw new Error('closed signal source accepted a subscriber');
`);
    expect(child.exitCode, child.stderr.toString()).toBe(0);
    expect(child.stdout.toString()).toBe('lint interrupt source is closed');
    expect(child.stderr.toString()).toBe('');
  });
});
