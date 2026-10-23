import { type SolverContainer, solverIdentity, solverInspectArgs } from '../src/lib/solver-cohort';

/** Fixture transport only: bounded real subprocess, exact argv, no shell expansion. */
export async function boundedCommand(
  argv: string[],
  milliseconds: number,
  signal?: AbortSignal,
): Promise<string> {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0)
    throw new Error('command deadline exhausted');
  const cancellation = AbortSignal.timeout(Math.ceil(milliseconds));
  const abort = signal === undefined ? cancellation : AbortSignal.any([signal, cancellation]);
  const child = Bun.spawn(argv, {
    stdout: 'pipe',
    stderr: 'pipe',
    signal: abort,
    killSignal: 'SIGKILL',
  });
  async function read(stream: ReadableStream<Uint8Array>): Promise<string> {
    const reader = stream.getReader();
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let length = 0;
    let contents = '';
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        length += chunk.value.length;
        // Proof: removing bound admits 70KB output in solver-drain-transport.test.ts.
        if (length > 65536) throw new Error('fixture command output exceeds bound');
        contents += decoder.decode(chunk.value, { stream: true });
      }
      return contents + decoder.decode();
    } finally {
      reader.releaseLock();
    }
  }
  try {
    const [stdout, , code] = await Promise.all([
      read(child.stdout),
      read(child.stderr),
      child.exited,
    ]);
    if (abort.aborted) throw new Error('fixture command deadline/cancellation');
    if (code !== 0) throw new Error(`fixture command ${argv[0]} exit ${String(code)}`);
    return stdout;
  } catch (cause) {
    // Proof: malformed UTF8 and deadline tests require rejection without a live pipe child.
    if (child.exitCode === null) child.kill('SIGKILL');
    await child.exited;
    throw cause;
  }
}

/** Adds ownership to either reviewed discovery without broadening its original census. */
export function scopeDiscovery(args: string[], token: string): string[] {
  const managed = [
    'ps',
    '--all',
    '--no-trunc',
    '--filter',
    'label=wbs-managed-solver=true',
    '--format',
    '{{.ID}}',
  ];
  const named = [
    'ps',
    '--all',
    '--no-trunc',
    '--filter',
    'name=^/wbs-solver-',
    '--format',
    '{{.ID}}',
  ];
  // Proof: omitting recognition accepts an unfiltered census in solver-drain-transport.test.ts.
  if (![managed, named].some((expected) => JSON.stringify(args) === JSON.stringify(expected)))
    throw new Error('unrecognized fixture discovery');
  return [...args, '--filter', `label=wbs-solver-drain-owner=${token}`];
}

/** Changes just validated executable path and argv; native execution bookkeeping survives. */
export function translateExecution(
  actual: string,
  physicalPath: string,
  physicalArgv: string,
  logicalPath: string,
  logicalArgv: string,
): string {
  const prefix = `{ path=${physicalPath} ; argv[]=${physicalArgv} ; ignore_errors=no ; `;
  // Proof: omitting exact prefix check admits alien argv in solver-drain-transport.test.ts.
  if (!actual.startsWith(prefix)) throw new Error('fixture execution identity differs');
  // Proof: unknown-serialization/extra-record tests refuse cleanup authority before an effect.
  if (
    !/^start_time=\[[^\]\n]*\] ; stop_time=\[[^\]\n]*\] ; pid=[0-9]+ ; code=(?:\(null\)|[a-z-]+) ; status=[0-9]+(?:\/[^ ;}]+)? \}$/.test(
      actual.slice(prefix.length),
    )
  )
    throw new Error('fixture execution serialization is unrecognized');
  return `{ path=${logicalPath} ; argv[]=${logicalArgv} ; ignore_errors=no ; ${actual.slice(prefix.length)}`;
}

/** Exact narrow projection; label and inventory both authorize every fixture operation. */
export function assertFixtureContainer(
  projected: unknown,
  id: string,
  owner: string,
  inventory: readonly { readonly id: string; readonly name: string }[],
): void {
  // Proof: foreign-owner/name/ID tests would perform the exact kill if this guard were removed.
  if (
    !/^[a-f0-9]{64}$/.test(id) ||
    typeof projected !== 'object' ||
    projected === null ||
    !('id' in projected) ||
    projected.id !== id ||
    !('owner' in projected) ||
    projected.owner !== owner ||
    !('name' in projected) ||
    !inventory.some((attempt) => attempt.id === id && projected.name === `/${attempt.name}`)
  )
    throw new Error('fixture container ownership differs');
}

/** Effects cannot bypass an independent immediately preceding ownership observation. */
export async function runFixtureEffect(
  args: string[],
  id: string,
  verify: (id: string) => Promise<void>,
  run: (args: string[]) => Promise<string>,
): Promise<string> {
  await verify(id);
  return run(args);
}

/** Cleanup obtains native terminal proof before removing an exact owned child. */
export async function removeFixtureContainer(
  id: string,
  inspect: () => Promise<SolverContainer>,
  effect: (args: string[]) => Promise<string>,
): Promise<string> {
  const original = await inspect();
  if (original.phase === 'running') {
    await effect(['kill', id]);
    const waited = await effect(['wait', id]);
    const terminal = await inspect();
    // Proof: no-op-kill and changed-terminal tests forbid removal without native same-child agreement.
    if (
      !/^(?:0|[1-9][0-9]*)\n?$/.test(waited) ||
      terminal.phase !== 'terminal' ||
      terminal.exitCode !== Number(waited.trim()) ||
      solverIdentity(terminal) !== solverIdentity(original)
    )
      throw new Error('cleanup terminal evidence differs');
  }
  return effect(['rm', id]);
}

export { SOLVER_UNIT_PROPERTIES as FIXTURE_UNIT_PROPERTIES } from '../src/lib/solver-unit-observation';
import { SOLVER_UNIT_PROPERTIES as FIXTURE_UNIT_PROPERTIES } from '../src/lib/solver-unit-observation';

/** Effective prestart authority rejects global/prefix drop-ins before any fixture command executes. */
export function assertFixtureUnitAuthority(
  fields: ReadonlyMap<string, string>,
  expected: { service: string; unit: string; link: string; edgeState: string },
): void {
  // Proof: effective-unit negatives reject prefix drop-ins, extra commands and alien identity before start.
  if (
    fields.size !== FIXTURE_UNIT_PROPERTIES.length ||
    [...fields.keys()].some((key) => !FIXTURE_UNIT_PROPERTIES.includes(key)) ||
    fields.get('Id') !== expected.service ||
    fields.get('Names') !== expected.service ||
    fields.get('Environment') !== `WBS_EDGE_STATE=${expected.edgeState}` ||
    ![expected.unit, expected.link].includes(fields.get('FragmentPath') ?? '')
  )
    throw new Error('fixture effective identity differs');
  for (const [property, value] of Object.entries({
    LoadState: 'loaded',
    DropInPaths: '',
    Transient: 'no',
    NeedDaemonReload: 'no',
    Restart: 'always',
    KillMode: 'control-group',
    ExecStartPre: '',
    ExecStartPost: '',
    ExecStop: '',
  }))
    if (fields.get(property) !== value)
      throw new Error(`fixture authority property differs: ${property}`);
}

/** Only reviewed exact-ID observations/effects follow the independent fixture ownership check. */
export async function runFixtureDockerCommand(
  args: string[],
  id: string,
  verify: (id: string) => Promise<void>,
  run: (args: string[]) => Promise<string>,
): Promise<string> {
  // Proof: exact-argv omission admits broad/extra-argument inspect in solver-drain-transport.test.ts.
  if (
    ![solverInspectArgs(id).slice(1), ['inspect', id], ['kill', id], ['wait', id]].some(
      (expected) => JSON.stringify(args) === JSON.stringify(expected),
    )
  )
    throw new Error('unexpected exact-ID argv');
  // Proof: ownership omission admits foreign full inspect in solver-drain-transport.test.ts.
  return runFixtureEffect(args, id, verify, run);
}
