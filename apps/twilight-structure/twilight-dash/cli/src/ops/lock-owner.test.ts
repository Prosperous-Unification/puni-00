import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, expect, it } from 'bun:test';

import { reserveLog } from '../resources/hold-log';
const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});
function createFixture() {
  const root = mkdtempSync(join(tmpdir(), 'puni native lock owner '));
  roots.push(root);
  return { root, path: join(root, 'mutex'), payload: join(root, 'payload.ts') };
}
const helper = join(import.meta.dir, 'testing/lock-owner.test.fixture.ts');
it('owns observational status output without creating native lock or queue state', () => {
  const f = createFixture(),
    child = Bun.spawnSync(
      [
        process.execPath,
        '--no-env-file',
        '--config=/dev/null',
        helper,
        f.path,
        'ops',
        'lock',
        'status',
      ],
      { cwd: f.root, stdin: 'ignore', stdout: 'pipe', stderr: 'pipe', timeout: 4000 },
    );
  expect(child.exitCode).toBe(0);
  expect(child.stdout.toString()).toBe('heavy lock: holder none' + String.fromCharCode(10));
  expect(child.stderr.length).toBe(0);
  expect(existsSync(f.path)).toBe(false);
  expect(existsSync(f.path + '.queue')).toBe(false);
});
it('reports owned admission before native payload stderr and preserves its status', () => {
  const f = createFixture();
  // Exact native bytes keep this ordering/status oracle independent of Bun console colors.
  writeFileSync(
    f.payload,
    "import { writeSync } from 'node:fs';writeSync(1,'payload-out\\n');writeSync(2,'payload-err\\n');process.exitCode=37;",
  );
  const child = Bun.spawnSync(
    [
      process.execPath,
      '--no-env-file',
      '--config=/dev/null',
      helper,
      f.path,
      'ops',
      'lock',
      'run',
      '--',
      process.execPath,
      f.payload,
    ],
    { cwd: f.root, stdin: 'ignore', stdout: 'pipe', stderr: 'pipe', timeout: 4000 },
  );
  expect(child.exitCode).toBe(37);
  expect(child.stdout.toString().trim()).toBe('payload-out');
  const lines = child.stderr.toString().trimEnd().split(String.fromCharCode(10));
  expect(lines.at(0)).toMatch(/^heavy lock: waited [0-9]+s behind 0 tickets$/u);
  expect(lines.slice(1)).toEqual(['payload-err']);
});
it('reports a context capture failure inside the bounded owner without exposing its cause', () => {
  const f = createFixture(),
    child = Bun.spawnSync(
      [
        process.execPath,
        '--no-env-file',
        '--config=/dev/null',
        helper,
        f.path,
        'ops',
        'lock',
        'status',
      ],
      {
        cwd: f.root,
        env: { ...process.env, PUNI_LOCK_FIXTURE_CAPTURE_FAIL: '1' },
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
        timeout: 4000,
      },
    );
  expect(child.exitCode).toBe(70);
  expect(child.stderr.toString()).toBe('error: lock operation failed' + String.fromCharCode(10));
  expect(child.stderr.toString()).not.toContain('private capture sentinel');
  expect(existsSync(f.path)).toBe(false);
});
it('classifies a malformed user label before payload entry as usage64', () => {
  const f = createFixture(),
    marker = join(f.root, 'ran');
  writeFileSync(f.payload, 'await Bun.write(' + JSON.stringify(marker) + ',"ran");');
  const child = Bun.spawnSync(
    [
      process.execPath,
      '--no-env-file',
      '--config=/dev/null',
      helper,
      f.path,
      'ops',
      'lock',
      'run',
      '--label',
      'bad' + String.fromCharCode(10) + 'label',
      '--',
      process.execPath,
      f.payload,
    ],
    { cwd: f.root, stdin: 'ignore', stdout: 'pipe', stderr: 'pipe', timeout: 4000 },
  );
  expect(child.exitCode).toBe(64);
  expect(existsSync(marker)).toBe(false);
});

for (const mutation of ['run-to-status', 'status-to-run', 'argv'] as const)
  it('retains request ownership before selector-held mutation ' + mutation, () => {
    const f = createFixture(),
      decoy = join(f.root, 'decoy.ts'),
      marker = join(f.root, 'decoy-ran');
    writeFileSync(f.payload, 'process.exitCode=37;');
    writeFileSync(
      decoy,
      'await Bun.write(' +
        JSON.stringify(marker) +
        ',' +
        JSON.stringify('ran') +
        ');process.exitCode=91;',
    );
    const words =
      mutation === 'status-to-run'
        ? ['ops', 'lock', 'status']
        : ['ops', 'lock', 'run', '--', process.execPath, f.payload];
    const child = Bun.spawnSync(
      [process.execPath, '--no-env-file', '--config=/dev/null', helper, f.path, ...words],
      {
        cwd: f.root,
        env: {
          ...process.env,
          PUNI_LOCK_FIXTURE_MUTATION: mutation,
          PUNI_LOCK_FIXTURE_DECOY: decoy,
        },
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
        timeout: 4000,
      },
    );
    expect(child.exitCode).toBe(mutation === 'status-to-run' ? 0 : 37);
    expect(existsSync(marker)).toBe(false);
    if (mutation === 'status-to-run') expect(existsSync(f.path)).toBe(false);
  });

for (const mutation of ['environment', 'directory'] as const)
  it('retains context ownership before selector-held mutation ' + mutation, () => {
    const f = createFixture(),
      decoy = join(f.root, 'decoy-directory');
    mkdirSync(decoy);
    writeFileSync(
      f.payload,
      mutation === 'directory'
        ? 'process.stdout.write(process.cwd());'
        : 'const value=process.env.PUNI_OWNER_CAPTURE_VALUE;if(value===undefined)throw new Error("capture value missing");process.stdout.write(value);',
    );
    const child = Bun.spawnSync(
      [
        process.execPath,
        '--no-env-file',
        '--config=/dev/null',
        helper,
        f.path,
        'ops',
        'lock',
        'run',
        '--',
        process.execPath,
        f.payload,
      ],
      {
        cwd: f.root,
        env: {
          ...process.env,
          PUNI_LOCK_FIXTURE_MUTATION: mutation,
          PUNI_LOCK_FIXTURE_DECOY: decoy,
          PUNI_OWNER_CAPTURE_VALUE: 'original',
        },
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
        timeout: 4000,
      },
    );
    expect(child.exitCode, child.stderr.toString()).toBe(0);
    expect(child.stdout.toString()).toBe(mutation === 'directory' ? f.root : 'original');
  });

for (const order of ['native-first', 'controller-first', 'controller-only'] as const)
  it('residual owner preserves first interruption and controller abort ' + order, () => {
    const f = createFixture(),
      receipt = join(f.root, 'receipt.json'),
      holdFile = join(f.root, 'hold'),
      capture = process.env['PUNI_HOLDER_R5_CAPTURE'];
    const program = [
      'import{mock}from"bun:test";const fs=await import("node:fs");',
      'let aborted;const order=' + JSON.stringify(order) + ';',
      'const native=async()=>{const observed=Promise.withResolvers();process.once("SIGINT",()=>observed.resolve());process.kill(process.pid,"SIGINT");await observed.promise;};',
      'await mock.module(' +
        JSON.stringify(new URL('./holder.ts', import.meta.url).href) +
        ',()=>({runHolder:async(request,context)=>{if(order==="native-first")await native();context.recordControllerCancellation();aborted=context.signal.aborted;if(order==="controller-first")await native();return{kind:"cancelled"};}}));',
      'const{createLockOwner}=await import(' +
        JSON.stringify(new URL('./lock.ts', import.meta.url).href) +
        ');const status=await createLockOwner(async()=>' +
        JSON.stringify(f.path) +
        ')({command:"ops",words:"lock hold-internal-v1",holdFile:' +
        JSON.stringify(holdFile) +
        ',controllerPid:1,controllerBoot:"87a4d915-fb90-4771-b506-3654e35610c1",controllerStart:"1",label:"residual",waitSeconds:0,pollSeconds:1},{callerDirectory:' +
        JSON.stringify(f.root) +
        ',environment:{}});fs.writeFileSync(' +
        JSON.stringify(receipt) +
        ',JSON.stringify({status,aborted}));',
    ].join('\n');
    // Reservation is a separately proved boundary; fixture supplies the valid inherited physical log.
    const log = reserveLog(holdFile);
    if (capture !== undefined)
      writeFileSync(
        join(capture, 'residual-owner-' + order + '.json'),
        JSON.stringify({ program, controller: log.controller, holdFile }),
      );
    // The controller fields must describe the actual parent rather than the placeholder source template.
    const actual = program.replace(
      'controllerPid:1,controllerBoot:"87a4d915-fb90-4771-b506-3654e35610c1",controllerStart:"1"',
      'controllerPid:' +
        String(log.controller.pid) +
        ',controllerBoot:' +
        JSON.stringify(log.controller.boot) +
        ',controllerStart:' +
        JSON.stringify(log.controller.start),
    );
    if (capture !== undefined)
      writeFileSync(join(capture, 'residual-owner-' + order + '-actual.ts'), actual);
    let child;
    try {
      child = Bun.spawnSync(
        [process.execPath, '--no-env-file', '--config=/dev/null', '--eval', actual],
        { cwd: f.root, stdout: log.descriptor, stderr: log.descriptor },
      );
    } finally {
      log.closeDescriptor();
    }
    expect(child.exitCode).toBe(0);
    expect(JSON.parse(readFileSync(receipt, 'utf8'))).toEqual({
      status: order === 'native-first' ? 130 : 143,
      aborted: true,
    });
  });
