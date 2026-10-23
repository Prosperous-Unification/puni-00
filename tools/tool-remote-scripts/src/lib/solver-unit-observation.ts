import { readClosed } from './managed-cohort';

export const SOLVER_UNIT_PROPERTIES = [
  'LoadState',
  'Id',
  'Names',
  'FragmentPath',
  'DropInPaths',
  'Transient',
  'NeedDaemonReload',
  'ExecStart',
  'ExecStartPre',
  'ExecStartPost',
  'ExecStop',
  'ExecStopPost',
  'Restart',
  'RestartPreventExitStatus',
  'Result',
  'ExecMainStatus',
  'KillMode',
  'Environment',
  'ActiveState',
  'SubState',
  'MainPID',
  'ControlPID',
  'InvocationID',
  'ControlGroup',
  'Job',
];
const EMPTY_HOOKS = ['ExecStartPre', 'ExecStartPost', 'ExecStop'];
type RunCommand = (argv: string[], signal?: AbortSignal) => Promise<string>;
/** Validates the closed native projection; only the three typed-proof empty hooks may be omitted. */
export function readSolverUnitProjection(stdout: string): Map<string, string> {
  const fields = new Map<string, string>();
  for (const line of stdout.replace(/\n$/, '').split('\n')) {
    const equals = line.indexOf('=');
    const key = line.slice(0, equals);
    // Proof: malformed native projection negatives reject unknown/duplicate properties before synthesis.
    if (equals < 1 || !SOLVER_UNIT_PROPERTIES.includes(key) || fields.has(key))
      throw new Error('solver observation has unknown or duplicate properties');
    fields.set(key, line.slice(equals + 1));
  }
  // Proof: missing Restart negative refuses rather than inventing unobserved authority.
  if (SOLVER_UNIT_PROPERTIES.some((key) => !fields.has(key) && !EMPTY_HOOKS.includes(key)))
    throw new Error('solver observation lacks required properties');
  return fields;
}
function readBus(stdout: string): Record<string, unknown> {
  try {
    const decoded: unknown = JSON.parse(stdout);
    return readClosed(decoded, ['type', 'data']);
  } catch {
    throw new Error('solver bus observation is malformed');
  }
}

/** Completes only omitted hooks proven empty by typed D-Bus reads bracketed by identical native observations.
 * Native execution records remain byte-identical. LoadUnit loads configuration without starting it.
 * Every transport must bound, cancel and reap its child; errors never retain observed command or environment bytes.
 */
export async function observeSolverUnit(
  service: string,
  run: RunCommand,
  signal?: AbortSignal,
): Promise<string> {
  const argv = [
    'systemctl',
    '--user',
    'show',
    service,
    ...SOLVER_UNIT_PROPERTIES.map((property) => `--property=${property}`),
  ];
  const first = await run(argv, signal);
  const fields = readSolverUnitProjection(first);
  const missing = EMPTY_HOOKS.filter((key) => !fields.has(key));
  if (missing.length === 0) return first;
  const loaded = readBus(
    await run(
      [
        'busctl',
        '--user',
        '--json=short',
        'call',
        'org.freedesktop.systemd1',
        '/org/freedesktop/systemd1',
        'org.freedesktop.systemd1.Manager',
        'LoadUnit',
        's',
        service,
      ],
      signal,
    ),
  );
  const path =
    '/org/freedesktop/systemd1/unit/' +
    Array.from(new TextEncoder().encode(service), (byte) =>
      /[A-Za-z0-9]/.test(String.fromCharCode(byte))
        ? String.fromCharCode(byte)
        : `_${byte.toString(16).padStart(2, '0')}`,
    ).join('');
  // Proof: unbound loaded unit identity negatives reject wrong paths, signatures and extra envelope fields.
  if (
    loaded['type'] !== 'o' ||
    !Array.isArray(loaded['data']) ||
    loaded['data'].length !== 1 ||
    loaded['data'][0] !== path
  )
    throw new Error('solver bus unit identity differs');
  for (const hook of missing) {
    const observed = readBus(
      await run(
        [
          'busctl',
          '--user',
          '--json=short',
          'get-property',
          'org.freedesktop.systemd1',
          path,
          'org.freedesktop.systemd1.Service',
          hook,
        ],
        signal,
      ),
    );
    // Proof: typed-empty omission fault admits wrong signature/nonempty hook in solver-unit-observation.test.ts.
    if (
      observed['type'] !== 'a(sasbttttuii)' ||
      !Array.isArray(observed['data']) ||
      observed['data'].length !== 0
    )
      throw new Error('solver omitted hook is not proven empty');
  }
  const second = readSolverUnitProjection(await run(argv, signal));
  // Proof: raced PID/invocation/cgroup/authority and changed omission set negatives reject mixed observations.
  if (fields.size !== second.size || [...fields].some(([key, value]) => second.get(key) !== value))
    throw new Error('solver service changed during hook observation');
  return first + (first.endsWith('\n') ? '' : '\n') + missing.map((key) => `${key}=\n`).join('');
}

/** Recognizes quiescence without resetting a controlled refusal's native failed evidence.
 * Callers supply the complete validated projection and separately prove the original cgroup empty.
 */
export function isStoppedSolverUnit(fields: ReadonlyMap<string, string>): boolean {
  // Proof: independently removing each PID/job/cgroup/prevent guard failed the actual cleanup terminal test in solver-drain-transport.test.ts.
  if (
    fields.get('MainPID') !== '0' ||
    fields.get('ControlPID') !== '0' ||
    !['', '0'].includes(fields.get('Job') ?? 'missing') ||
    fields.get('ControlGroup') !== '' ||
    fields.get('RestartPreventExitStatus') !== '78'
  )
    return false;
  if (fields.get('ActiveState') === 'inactive' && fields.get('SubState') === 'dead') return true;
  // Proof: independently omitting each failed-state/result/status guard failed the actual cleanup terminal test in solver-drain-transport.test.ts.
  return (
    fields.get('ActiveState') === 'failed' &&
    fields.get('SubState') === 'failed' &&
    fields.get('Result') === 'exit-code' &&
    fields.get('ExecMainStatus') === '78'
  );
}
