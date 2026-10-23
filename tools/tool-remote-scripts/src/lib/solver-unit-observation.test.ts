import { readFile, writeFile } from 'node:fs/promises';

import { scratchSync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

import { parseSolverUnit, runSolverHost } from './solver-host';
import {
  SOLVER_SUPERVISOR_BUN,
  SOLVER_SUPERVISOR_BUNDLE,
  SOLVER_SUPERVISOR_CONFIG,
  SOLVER_SUPERVISOR_SERVICE,
  SOLVER_SUPERVISOR_UNIT,
} from './solver-supervisor-install-contract';
const hooks = ['ExecStartPre', 'ExecStartPost', 'ExecStop'];
const execution = (path: string, argv: string) =>
  `{ path=${path} ; argv[]=${argv} ; ignore_errors=no ; start_time=[n/a] ; stop_time=[n/a] ; pid=0 ; code=(null) ; status=0 }`;
const fields = {
  LoadState: 'loaded',
  Id: SOLVER_SUPERVISOR_SERVICE,
  Names: SOLVER_SUPERVISOR_SERVICE,
  FragmentPath: SOLVER_SUPERVISOR_UNIT,
  DropInPaths: '',
  Transient: 'no',
  NeedDaemonReload: 'no',
  ExecStart: execution(
    SOLVER_SUPERVISOR_BUN,
    `${SOLVER_SUPERVISOR_BUN} ${SOLVER_SUPERVISOR_BUNDLE.remote} --config=${SOLVER_SUPERVISOR_CONFIG}`,
  ),
  ExecStartPre: '',
  ExecStartPost: '',
  ExecStop: '',
  ExecStopPost: execution('/bin/rm', '/bin/rm -f /run/user/1000/wbs-solver/supervisor.sock'),
  Restart: 'always',
  KillMode: 'control-group',
  Environment: 'WBS_EDGE_STATE=/home/puni1/wbs/state',
  ActiveState: 'inactive',
  SubState: 'dead',
  MainPID: '0',
  ControlPID: '0',
  InvocationID: '',
  ControlGroup: '',
  Job: '',
};
const projection = (values: Record<string, string>, omitted = hooks) =>
  Object.entries(values)
    .filter(([key]) => !omitted.includes(key))
    .map(([key, value]) => `${key}=${value}\n`)
    .join('');
const objectPath = '/org/freedesktop/systemd1/unit/wbs_2dsolver_2dsupervisor_2eservice';
async function observe(
  first: string,
  bus: string,
  second = first,
  load = JSON.stringify({ type: 'o', data: [objectPath] }),
  fault?: string,
) {
  const root = scratchSync('solver-observation-');
  await writeFile(`${root}/first`, first);
  await writeFile(`${root}/second`, second);
  await writeFile(`${root}/load`, load);
  await writeFile(`${root}/bus`, bus);
  await writeFile(
    `${root}/systemctl`,
    `#!/bin/sh\nif [ -e '${root}/seen' ]; then exec /bin/cat '${root}/second'; fi\n/bin/touch '${root}/seen'\nexec /bin/cat '${root}/first'\n`,
    { mode: 0o755 },
  );
  await writeFile(
    `${root}/busctl`,
    `#!/bin/sh\nif [ "$3" = call ]; then exec /bin/cat '${root}/load'; fi\nexec /bin/cat '${root}/bus'\n`,
    { mode: 0o755 },
  );
  if (fault !== undefined) {
    const script =
      fault === 'missing'
        ? undefined
        : fault === 'nonzero'
          ? '#!/bin/sh\nprintf secret >&2\nexit 1\n'
          : fault === 'oversize'
            ? '#!/bin/sh\nexec /usr/bin/head -c 70000 /dev/zero\n'
            : fault === 'utf8'
              ? "#!/bin/sh\nprintf '\\377'\n"
              : `#!/bin/sh\nprintf '%s' "$$" > '${root}/pid'\nexec /bin/sleep 30\n`;
    const { unlink } = await import('node:fs/promises');
    if (script === undefined) await unlink(`${root}/busctl`);
    else await writeFile(`${root}/busctl`, script, { mode: 0o755 });
  }
  const path = process.env['PATH'];
  if (path === undefined) throw new Error('PATH absent');
  process.env['PATH'] = fault === 'missing' ? root : `${root}:${path}`;
  try {
    return await runSolverHost(
      { kind: 'show' },
      fault === 'cancel' ? AbortSignal.timeout(100) : undefined,
    );
  } finally {
    process.env['PATH'] = path;
    if (fault === 'cancel') {
      const pid = Number(await readFile(`${root}/pid`, 'utf8'));
      expect(() => process.kill(pid, 0)).toThrow();
    }
  }
}
const empty = JSON.stringify({ type: 'a(sasbttttuii)', data: [] });
test('native omitted empty hooks gain only typed proven empty lines and pass strict authority', async () => {
  const shown = await observe(projection(fields), empty);
  expect(parseSolverUnit(shown, false).pid).toBe(0);
  expect(shown).toContain(`ExecStart=${fields.ExecStart}\n`);
});
test('complete native projection remains byte identical', async () => {
  const shown = projection(fields, []);
  expect(await observe(shown, 'invalid')).toBe(shown);
});
for (const bus of [
  'invalid',
  '{}',
  JSON.stringify({ type: 'as', data: [] }),
  JSON.stringify({ type: 'a(sasbttttuii)', data: [[]] }),
  JSON.stringify({ type: 'a(sasbttttuii)', data: { length: 0 } }),
  JSON.stringify({ type: 'a(sasbttttuii)', data: null }),
  JSON.stringify({ type: 'a(sasbttttuii)', data: [], extra: true }),
])
  test(`rejects unproven hook ${bus}`, async () => {
    await refuses(observe(projection(fields), bus).then((text) => parseSolverUnit(text, false)));
  });
for (const first of [
  projection(fields).replace('Restart=always\n', ''),
  projection(fields) + 'Unknown=secret\n',
  projection(fields) + 'Id=secret\n',
])
  test('refuses malformed native projection before bus synthesis', async () => {
    await refuses(observe(first, empty));
  });
for (const [key, value] of Object.entries({
  MainPID: '3',
  InvocationID: 'a'.repeat(32),
  ControlGroup: '/changed',
  Environment: 'secret',
  ExecStart: 'secret',
  Job: '1',
}))
  test(`refuses raced ${key}`, async () => {
    await refuses(observe(projection(fields), empty, projection({ ...fields, [key]: value })));
  });
test('refuses changed omission set', async () => {
  await refuses(observe(projection(fields), empty, projection(fields, ['ExecStop'])));
});
for (const load of [
  JSON.stringify({ type: 'o', data: ['/wrong'] }),
  JSON.stringify({ type: 's', data: [objectPath] }),
  JSON.stringify({ type: 'o', data: { 0: objectPath, length: 1 } }),
  JSON.stringify({ type: 'o', data: [objectPath], extra: true }),
])
  test('refuses unbound loaded unit identity', async () => {
    await refuses(observe(projection(fields), empty, undefined, load));
  });

for (const fault of ['missing', 'nonzero', 'oversize', 'utf8', 'cancel'])
  test(`bus transport refuses ${fault} and reaps cancellation`, async () => {
    await refuses(observe(projection(fields), empty, undefined, undefined, fault));
  });

async function refuses(promise: Promise<unknown>): Promise<void> {
  let failure: unknown;
  try {
    await promise;
  } catch (cause) {
    failure = cause;
  }
  expect(failure).toBeInstanceOf(Error);
  if (failure instanceof Error) expect(failure.message).not.toContain('secret');
}
