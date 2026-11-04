import { expect, test } from 'bun:test';

for (const fault of [
  'esrch-once',
  'esrch-repeated',
  'EACCES',
  'EPERM',
  'EIO',
  'non-error',
  'wrong-uid',
  'http-status',
] as const)
  test(`actual guard readiness candidate read ${fault}`, async () => {
    const source = await Bun.file(
      new URL('./registry-maintenance-guard.fixture.ts', import.meta.url),
    ).text();
    const first = "  const waitMode = async (mode: 'readonly' | 'writable') => {";
    const last = '  try {\n    await waitMode(proof?.initialMode';
    expect(source.split(first)).toHaveLength(2);
    expect(source.split(last)).toHaveLength(2);
    const body = new Bun.Transpiler({ loader: 'ts' }).transformSync(
      'let exited=false;\n' +
        source.slice(source.indexOf(first), source.indexOf(last)) +
        '\nreturn waitMode;',
    );
    const failure =
      fault === 'non-error'
        ? { code: 'ESRCH' }
        : Object.assign(new Error('fixed owned candidate read'), {
            code: fault.startsWith('esrch') ? 'ESRCH' : fault,
          });
    const paths: string[] = [];
    let elapsed = 0,
      sleeps = 0,
      cmdlineReads = 0,
      httpReads = 0,
      bodyReads = 0;
    const rescue = new Error('Modeled sleep bound rescue');
    // Boundary: only the exact owned source closure is executed; process/files/clock/HTTP are explicit modeled ports.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const createWaiter = new Function(
      'readFile',
      'child',
      'installed',
      'config',
      'fetch',
      'Date',
      'Bun',
      body,
    ) as (...ports: unknown[]) => (mode: string) => Promise<void>;
    const wait = createWaiter(
      (path: string, encoding: string) => {
        expect(encoding).toBe('utf8');
        paths.push(path);
        if (path === '/proc/123/task/123/children') return Promise.resolve('456');
        if (path === '/proc/456/cmdline') {
          cmdlineReads++;
          if (
            (fault === 'esrch-once' && cmdlineReads === 1) ||
            fault === 'esrch-repeated' ||
            ['EACCES', 'EPERM', 'EIO', 'non-error'].includes(fault)
          ) {
            // Boundary: the non-Error ESRCH-shaped input intentionally proves no untrusted retry classification.
            // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
            return Promise.reject(failure);
          }
          return Promise.resolve('/registry\0serve\0/config\0');
        }
        if (path === '/proc/456/environ')
          return Promise.resolve('REGISTRY_STORAGE_MAINTENANCE_READONLY={"enabled":true}\0');
        if (path === '/proc/456/status')
          return Promise.resolve(
            fault === 'wrong-uid' ? 'Uid:\t0\t0\t0\t0\n' : 'Uid:\t59001\t59001\t59001\t59001\n',
          );
        return Promise.reject(new Error('Unexpected modeled proc path'));
      },
      { pid: 123 },
      { distribution: { path: '/registry' } },
      '/config',
      (url: string) => {
        expect(url).toBe('http://127.0.0.1:5052/v2/');
        httpReads++;
        return Promise.resolve({
          status: fault === 'http-status' ? 503 : 200,
          arrayBuffer: () => {
            bodyReads++;
            return Promise.resolve(new ArrayBuffer(0));
          },
        });
      },
      { now: () => elapsed },
      {
        sleep: (milliseconds: number) => {
          expect(milliseconds).toBe(20);
          sleeps++;
          elapsed += 5000;
          return sleeps > 3 ? Promise.reject(rescue) : Promise.resolve();
        },
      },
    );
    const rejected = await wait('readonly').then(
      () => undefined,
      (cause: unknown) => cause,
    );
    if (fault === 'esrch-once') {
      expect(rejected).toBeUndefined();
      expect(cmdlineReads).toBe(2);
      expect(sleeps).toBe(1);
      expect(httpReads).toBe(1);
      expect(bodyReads).toBe(1);
      expect(paths.slice(-3)).toEqual([
        '/proc/456/cmdline',
        '/proc/456/environ',
        '/proc/456/status',
      ]);
    } else if (fault === 'esrch-repeated') {
      expect(rejected).toBeInstanceOf(Error);
      expect((rejected as Error).message).toBe('Actual guard mode did not converge');
      expect(cmdlineReads).toBe(2);
      expect(sleeps).toBe(2);
      expect(httpReads).toBe(0);
      expect(bodyReads).toBe(0);
    } else if (fault === 'wrong-uid' || fault === 'http-status') {
      expect(rejected).toBeInstanceOf(Error);
      expect((rejected as Error).message).toBe(
        fault === 'wrong-uid'
          ? 'Owned guard child has a foreign UID'
          : 'Unexpected guarded registry readiness',
      );
      expect(sleeps).toBe(0);
      expect(httpReads).toBe(fault === 'http-status' ? 1 : 0);
    } else {
      expect(rejected).toBe(failure);
      expect(cmdlineReads).toBe(1);
      expect(sleeps).toBe(0);
      expect(httpReads).toBe(0);
    }
  });
