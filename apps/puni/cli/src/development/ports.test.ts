import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createConnection, createServer } from 'node:net';
import { constants, tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, it } from 'bun:test';

import { main } from '../entrypoint';
import type { Context } from '../execute-command';

interface Request {
  readonly command: 'dev-ports';
  readonly action: 'resolve' | 'check' | 'release';
  readonly repository: string;
  readonly pairs: readonly string[];
}
function createRequest(
  repository: string,
  action: Request['action'],
  pairs: readonly string[] = [],
): Request {
  return { command: 'dev-ports', action, repository, pairs };
}
function createContext(repository: string, path = process.env['PATH']) {
  const stdout: string[] = [],
    stderr: string[] = [];
  return {
    context: {
      installation: {
        directory: join(repository, 'absent installation'),
        entrypoint: join(repository, 'absent installation/puni.mjs'),
      },
      runtime: process.execPath,
      temporaryDirectory: tmpdir(),
      callerDirectory: repository,
      lookup: { directory: repository, path },
      environment: {},
      stdout: (bytes: string | Uint8Array) => {
        stdout.push(Buffer.from(bytes).toString());
      },
      stderr: (bytes: string | Uint8Array) => {
        stderr.push(Buffer.from(bytes).toString());
      },
    },
    stdout,
    stderr,
  };
}

/** Uses the actual existing root even in the missing-operation epoch; no future core import. */
async function runPorts(selected: Request, caller: Context): Promise<number> {
  const completion = await main(
    ['dash', 'dev-ports', selected.action, '--repository', selected.repository, ...selected.pairs],
    caller,
  );
  expect(completion.kind).toBe('drain');
  return completion.status;
}

/** Actual Bun1.4.4 callback names are validated against this OS, independently of stale numeric declarations. */
function isSignal(value: unknown): value is NodeJS.Signals {
  return typeof value === 'string' && Object.hasOwn(constants.signals, value);
}

/** One real listener child; its native callback, numeric exit and both streams are joined before removal. */
async function withHolder(
  ignoreTerm: boolean,
  foreign: boolean,
  use: (fixture: {
    readonly root: string;
    readonly repository: string;
    readonly port: number;
    readonly term: string;
    readonly pid: number;
  }) => Promise<void>,
): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), 'puni dev-port owner '));
  const repository = join(root, 'repository');
  const elsewhere = join(root, 'foreign');
  mkdirSync(repository);
  mkdirSync(elsewhere);
  const ready = join(root, 'ready.json'),
    term = join(root, 'term');
  const program = [
    'const fs=await import("node:fs");',
    'const server=Bun.serve({hostname:"127.0.0.1",port:0,fetch:()=>new Response("listener remains")});',
    'process.on("SIGTERM",()=>{fs.writeFileSync(' +
      JSON.stringify(term) +
      ',"TERM");' +
      (ignoreTerm ? '' : 'server.stop(true).then(()=>process.exit(0));') +
      '});',
    'fs.writeFileSync(' +
      JSON.stringify(ready) +
      ',JSON.stringify({port:server.port,pid:process.pid}));',
  ].join('\n');
  const native = Promise.withResolvers<{
    readonly code: number | null;
    readonly signal: unknown;
    readonly failure: unknown;
  }>();
  const lifecycle = { hasEnded: false };
  const child = Bun.spawn(
    [process.execPath, '--no-env-file', '--config=/dev/null', '--eval', program],
    {
      cwd: foreign ? elsewhere : repository,
      env: {},
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
      onExit(_child, code, signal, failure) {
        lifecycle.hasEnded = true;
        native.resolve({ code, signal, failure });
      },
    },
  );
  const stdout = new Response(child.stdout).text(),
    stderr = new Response(child.stderr).text();
  let primary: { readonly cause: unknown } | undefined;
  try {
    let waited = 0;
    while (!existsSync(ready)) {
      if (lifecycle.hasEnded) throw new Error('listener exited before ready');
      if (waited++ >= 200) throw new Error('listener did not publish ready');
      await Bun.sleep(20);
    }
    const selected: unknown = JSON.parse(readFileSync(ready, 'utf8'));
    if (
      selected === null ||
      typeof selected !== 'object' ||
      !('port' in selected) ||
      !('pid' in selected) ||
      typeof selected.port !== 'number' ||
      !Number.isSafeInteger(selected.port) ||
      selected.port < 1 ||
      selected.port > 65535 ||
      selected.pid !== child.pid
    )
      throw new Error('listener ready record is malformed');
    expect(await (await fetch('http://127.0.0.1:' + String(selected.port))).text()).toBe(
      'listener remains',
    );
    await use({ root, repository, port: selected.port, term, pid: child.pid });
  } catch (cause: unknown) {
    primary = { cause };
  }
  let cleanup: { readonly cause: unknown } | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    if (!lifecycle.hasEnded) child.kill('SIGKILL');
    const settled = await Promise.race([
      Promise.all([native.promise, child.exited, stdout, stderr]),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new Error('listener native settlement missing; fixture retained'));
        }, 5000);
      }),
    ]);
    if (settled[0].failure !== undefined && settled[0].failure !== null)
      throw new Error('listener native observation failed', { cause: settled[0].failure });
    if (settled[0].code === null && settled[0].signal === null)
      throw new Error('listener has no native terminal status');
    if (settled[0].code !== null && settled[0].code !== settled[1])
      throw new Error('listener numeric/native status disagrees');
    const signal = settled[0].signal;
    if (signal !== null) {
      if (!isSignal(signal)) throw new Error('listener native signal is not a supported OS signal');
      const signalNumber = constants.signals[signal];
      if (!Number.isSafeInteger(signalNumber) || signalNumber <= 0)
        throw new Error('listener OS signal has no positive numeric identity');
      if (settled[1] !== 128 + signalNumber)
        throw new Error('listener signal/numeric status disagrees');
    }
  } catch (cause: unknown) {
    cleanup = { cause };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
  if (cleanup === undefined) {
    try {
      rmSync(root, { recursive: true });
    } catch (cause: unknown) {
      cleanup = { cause };
    }
  }
  if (primary !== undefined && cleanup !== undefined)
    throw new AggregateError(
      [primary.cause, cleanup.cause],
      'listener case and settlement failed',
      { cause: primary.cause },
    );
  if (primary !== undefined) throw primary.cause;
  if (cleanup !== undefined) throw new Error('listener fixture retained', { cause: cleanup.cause });
}
function requireLsof(): void {
  if (Bun.which('lsof') === null) throw new Error('actual dev-port release controls require lsof');
}

it('development release asks the actual own-cwd IPv4 holder for TERM and verifies socket release', async () => {
  requireLsof();
  await withHolder(false, false, async ({ repository, port, term }) => {
    const output = createContext(repository);
    expect(
      await runPorts(
        createRequest(repository, 'release', ['be-01:' + String(port)]),
        output.context,
      ),
    ).toBe(0);
    expect(readFileSync(term, 'utf8')).toBe('TERM');
    expect(output.stdout.join('')).toContain('freed port ' + String(port));
    expect(output.stderr.join('')).not.toContain('SIGKILL');
  });
}, 20000);

it('development release leaves an actual foreign-cwd IPv4 holder alive and serving', async () => {
  requireLsof();
  await withHolder(false, true, async ({ repository, port, term }) => {
    const output = createContext(repository);
    expect(
      await runPorts(
        createRequest(repository, 'release', ['be-01:' + String(port)]),
        output.context,
      ),
    ).toBe(1);
    expect(output.stderr.join('')).toContain('which is not this checkout');
    expect(existsSync(term)).toBe(false);
    expect(await (await fetch('http://127.0.0.1:' + String(port))).text()).toBe('listener remains');
  });
}, 20000);

it('development release escalates only after actual TERM is recorded by its ignoring own holder', async () => {
  requireLsof();
  await withHolder(true, false, async ({ repository, port, term }) => {
    const output = createContext(repository);
    expect(
      await runPorts(
        createRequest(repository, 'release', ['be-01:' + String(port)]),
        output.context,
      ),
    ).toBe(0);
    expect(readFileSync(term, 'utf8')).toBe('TERM');
    expect(output.stderr.join('')).toContain('through SIGTERM; sending SIGKILL');
    expect(output.stdout.join('')).toContain('freed port ' + String(port));
  });
}, 25000);

it('development release refuses missing lsof without signaling the actual holder', async () => {
  await withHolder(false, false, async ({ repository, port, term }) => {
    const output = createContext(repository, '');
    expect(
      await runPorts(
        createRequest(repository, 'release', ['be-01:' + String(port)]),
        output.context,
      ),
    ).toBe(1);
    expect(output.stderr.join('')).toContain('no lsof on PATH');
    expect(existsSync(term)).toBe(false);
    expect(await (await fetch('http://127.0.0.1:' + String(port))).text()).toBe('listener remains');
  });
}, 20000);

it('development check refuses an unreadable environment before connecting to a real frontend listener', async () => {
  const root = mkdtempSync(join(tmpdir(), 'puni dev-port unreadable '));
  const apps = join(root, 'apps/wbs/be-01');
  mkdirSync(apps, { recursive: true });
  const file = join(apps, '.env');
  writeFileSync(file, 'PORT=43117\n');
  chmodSync(file, 0);
  let connections = 0;
  const server = createServer((socket) => {
    connections++;
    socket.destroy();
  });
  let primary: { readonly cause: unknown } | undefined;
  try {
    await new Promise<void>((resolveListen, rejectListen) => {
      server.once('error', rejectListen);
      server.listen(0, '127.0.0.1', resolveListen);
    });
    const address = server.address();
    if (address === null || typeof address === 'string')
      throw new Error('frontend listener has no TCP address');
    await new Promise<void>((resolveProbe, rejectProbe) => {
      const socket = createConnection({ host: '127.0.0.1', port: address.port });
      socket.once('error', rejectProbe);
      socket.once('close', () => {
        resolveProbe();
      });
    });
    expect(connections).toBe(1);
    const output = createContext(root);
    const status = await runPorts(createRequest(root, 'check'), {
      ...output.context,
      environment: { PORT: String(address.port) },
    });
    await Bun.sleep(20);
    expect(connections).toBe(1);
    expect(status).toBe(1);
    expect(output.stderr.join('')).toContain('unreadable environment file');
  } catch (cause: unknown) {
    primary = { cause };
  }
  let cleanup: { readonly cause: unknown } | undefined;
  try {
    await new Promise<void>((resolveClose, rejectClose) =>
      server.close((cause) => {
        if (cause !== undefined) rejectClose(cause);
        else resolveClose();
      }),
    );
  } catch (cause: unknown) {
    cleanup = { cause };
  }
  try {
    chmodSync(file, 0o600);
  } catch (cause: unknown) {
    cleanup = {
      cause:
        cleanup === undefined
          ? cause
          : new AggregateError(
              [cleanup.cause, cause],
              'listener close and mode restoration failed',
              { cause: cleanup.cause },
            ),
    };
  }
  if (cleanup === undefined) {
    try {
      rmSync(root, { recursive: true });
    } catch (cause: unknown) {
      cleanup = { cause };
    }
  }
  if (primary !== undefined && cleanup !== undefined)
    throw new AggregateError(
      [primary.cause, cleanup.cause],
      'unreadable case and listener close failed',
      { cause: primary.cause },
    );
  if (primary !== undefined) throw primary.cause;
  if (cleanup !== undefined) throw cleanup.cause;
}, 10000);

for (const mode of ['ignores-term', 'overflows-output'] as const) {
  it(
    'development inspection owns a fixed tool that ' + mode,
    async () => {
      await withHolder(false, false, async ({ root, repository, port }) => {
        const tools = join(root, 'controlled inspection dependency');
        mkdirSync(tools);
        const ready = join(root, 'inspector-ready');
        const inspectorPid = join(root, 'inspector-pid');
        const script = join(tools, 'lsof');
        const body =
          [
            '#!' + process.execPath,
            'const fs=await import("node:fs");',
            'fs.writeFileSync(' + JSON.stringify(ready) + ',"ready");',
            'fs.writeFileSync(' + JSON.stringify(inspectorPid) + ',String(process.pid));',
            'process.on("SIGTERM",()=>{});setInterval(()=>{},1000);',
            'setTimeout(()=>process.exit(0),20000);',
            ...(mode === 'overflows-output'
              ? ['process.stdout.write("x".repeat(2*1024*1024));']
              : []),
          ].join('\n') + '\n';
        writeFileSync(script, body, { mode: 0o700 });
        const output = createContext(repository, tools);
        const started = performance.now();
        expect(
          await runPorts(
            createRequest(repository, 'check', ['be-01:' + String(port)]),
            output.context,
          ),
        ).toBe(1);
        expect(output.stderr.join('')).toContain(
          'dev-port process inspection did not finish normally',
        );
        const elapsed = performance.now() - started;
        expect(readFileSync(ready, 'utf8')).toBe('ready');
        const pid = Number(readFileSync(inspectorPid, 'utf8'));
        expect(Number.isSafeInteger(pid) && pid > 0).toBe(true);
        expect(pid).not.toBe(process.pid);
        if (mode === 'ignores-term') {
          expect(elapsed).toBeGreaterThanOrEqual(9000);
          expect(elapsed).toBeLessThan(15000);
        } else expect(elapsed).toBeLessThan(5000);
        expect(await (await fetch('http://127.0.0.1:' + String(port))).text()).toBe(
          'listener remains',
        );
      });
    },
    25000,
  );
}
