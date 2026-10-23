import { isDeepStrictEqual } from 'node:util';

import type { RunDocker } from '../src/lib/docker-deadline';
import { EDGE_CONTAINER } from '../src/lib/env';
import { readFields, readIdentity, readString } from '../src/lib/managed-cohort';
import { solverInspectArgs } from '../src/lib/solver-cohort';

export const SOURCE_FIXTURE_OWNER = 'puni.source-exclusion';
export interface FixtureContainerPlan {
  readonly name: string;
  /** Captured creation/recovery identity; a reviewed getter may expose a during-stop child after acknowledgement. */
  readonly id: string;
  readonly imageRef: string;
  readonly imageId: string;
  /** Additional independently planned physical coordinates, checked before translation. */
  readonly validate?: (container: Record<string, unknown>) => void;
}
interface FixtureDockerOptions {
  token: string;
  root: string;
  sourceName: string;
  sourceTag: string;
  runtime: string;
  caddyName: string;
  plans: readonly FixtureContainerPlan[];
  run: RunDocker;
}
function assertProof(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/**
 * Native fixture JSON may contain credentials; diagnostics never retain it.
 * Proof: omit-private-parser exposed the sentinel in the malformed native inspection test (exit 1).
 */
export function parseFixtureInspection(contents: string): unknown {
  try {
    const decoded: unknown = JSON.parse(contents);
    return decoded;
  } catch {
    throw new Error('private fixture inspection malformed');
  }
}
const same = (left: unknown, right: unknown) => isDeepStrictEqual(left, right);
function parseIds(output: string): string[] {
  const ids = output.trim() === '' ? [] : output.trim().split('\n');
  for (const id of ids) readIdentity(id);
  assertProof(new Set(ids).size === ids.length, 'fixture census duplicate identity');
  return ids;
}
/**
 * One live label universe for every participant. Each call observes all labelled objects,
 * verifies their physical coordinates, then translates only exact source/edge names,
 * the private source tag and the private runtime bind. No native lifecycle/startup is synthesized.
 */
export function createFixtureDocker(options: FixtureDockerOptions): RunDocker {
  const { token, root, sourceName, sourceTag, runtime, caddyName, plans, run } = options;
  assertProof(/^[a-f0-9-]{36}$/.test(token), 'fixture UUID required');
  assertProof(root.startsWith('/tmp/') && root.includes(token), 'fixture root must contain UUID');
  assertProof(runtime.startsWith(`${root}/`), 'fixture runtime outside root');
  assertProof(
    [sourceName, sourceTag, caddyName].every((name) => name.includes(token)),
    'fixture names must contain UUID',
  );
  async function census(signal?: AbortSignal): Promise<Map<string, Record<string, unknown>>> {
    const ids = parseIds(
      await run(
        [
          'ps',
          '-a',
          '--no-trunc',
          '--filter',
          `label=${SOURCE_FIXTURE_OWNER}=${token}`,
          '--format',
          '{{.ID}}',
        ],
        signal,
      ),
    );
    const inventory: unknown[] = [];
    // Per-object native output keeps the shared subprocess’s 64KiB bound intact.
    for (const id of ids) {
      const inspected: unknown = parseFixtureInspection(await run(['inspect', id], signal));
      assertProof(Array.isArray(inspected) && inspected.length === 1, 'fixture census incomplete');
      inventory.push(inspected[0]);
    }
    const observed = new Map<string, Record<string, unknown>>();
    for (const raw of inventory) {
      const container = readFields(raw);
      const id = readIdentity(container['Id']);
      const config = readFields(container['Config']);
      // Proof: omit-owner-label let the foreign-label negative reach its exact stop (exit 1).
      assertProof(
        ids.includes(id) &&
          !observed.has(id) &&
          readFields(config['Labels'])[SOURCE_FIXTURE_OWNER] === token,
        'fixture ownership differs',
      );
      const plan = plans.find((candidate) => container['Name'] === `/${candidate.name}`);
      // Proof: omit-unplanned-writer admitted the extra child in the unplanned labelled child negative (exit 1).
      assertProof(plan !== undefined, 'fixture child is not planned');
      // Proof: omit-image-pin made the image substitution negative reach its effect (exit 1).
      assertProof(
        config['Image'] === plan.imageRef && container['Image'] === plan.imageId,
        'fixture image differs',
      );
      // Proof: captured-ID omission admitted replacement before first census; its production transport negative failed.
      assertProof(plan.id === id, 'fixture captured identity differs');
      const mounts: unknown = container['Mounts'];
      assertProof(Array.isArray(mounts), 'fixture mounts absent');
      for (const rawMount of mounts) {
        const mount = readFields(rawMount);
        // Proof: omit-mount-root admitted the production bind in the physical mount escape negative (exit 1).
        assertProof(
          mount['Type'] === 'tmpfs' ||
            (mount['Type'] === 'bind' && readString(mount['Source']).startsWith(`${root}/`)),
          'fixture mount outside private root',
        );
      }
      plan.validate?.(container);
      observed.set(id, container);
    }
    return observed;
  }
  function translate(container: Record<string, unknown>): Record<string, unknown> {
    const translated = structuredClone(container);
    if (translated['Name'] === `/${sourceName}`) {
      translated['Name'] = '/wbs-dev-src';
      readFields(translated['Config'])['Image'] = 'wbs-dev-src:1';
      const mounts = translated['Mounts'];
      assertProof(Array.isArray(mounts), 'fixture mounts absent');
      for (const raw of mounts) {
        const mount = readFields(raw);
        if (
          mount['Source'] === runtime &&
          mount['Destination'] === '/run/wbs-solver' &&
          mount['RW'] === false
        )
          mount['Source'] = '/run/user/1000/wbs-solver';
      }
    }
    if (translated['Name'] === `/${caddyName}`) translated['Name'] = `/${EDGE_CONTAINER}`;
    return translated;
  }
  return async (args, signal) => {
    const inventory = await census(signal);
    if (args[0] === 'ps') {
      const full = ['ps', '-a', '--no-trunc', '--format', '{{.ID}}'];
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
      // Proof: unsupported-discovery omission admitted a narrowed audit query; its named negative failed.
      assertProof(
        [full, managed, named].some((expected) => same(args, expected)),
        'unrecognized fixture discovery',
      );
      // Proof: reverting to a second-list subset hid the unrelated writer; full inventory negative failed.
      const ids = same(args, full)
        ? [...inventory.keys()]
        : parseIds(
            await run([...args, '--filter', `label=${SOURCE_FIXTURE_OWNER}=${token}`], signal),
          );
      assertProof(
        ids.every((id) => inventory.has(id)),
        'fixture discovery outside census',
      );
      return ids.join('\n') + (ids.length === 0 ? '' : '\n');
    }
    if (args[0] === 'image') {
      const mapped = args.map((argument) => (argument === 'wbs-dev-src:1' ? sourceTag : argument));
      const reference = mapped.at(-1);
      assertProof(
        mapped[1] === 'inspect' &&
          plans.some((plan) => plan.imageRef === reference || plan.imageId === reference) &&
          (mapped.length === 3 ||
            same(mapped.slice(0, -1), ['image', 'inspect', '--format', '{{.Id}}'])),
        'unplanned fixture image query',
      );
      return run(mapped, signal);
    }
    if (args[0] === 'inspect' && args[1] !== '--format') {
      const requested = args
        .slice(1)
        .map((name) =>
          name === EDGE_CONTAINER
            ? [...inventory].find(([, container]) => container['Name'] === `/${caddyName}`)?.[0]
            : name,
        );
      assertProof(
        requested.length > 0 &&
          requested.every((id) => typeof id === 'string' && inventory.has(id)),
        'fixture inspect outside census',
      );
      return JSON.stringify(
        requested.map((id) => {
          assertProof(typeof id === 'string', 'fixture ID absent');
          const container = inventory.get(id);
          assertProof(container !== undefined, 'fixture member absent');
          return translate(container);
        }),
      );
    }
    const id = args[0] === 'exec' ? args[1] : args.at(-1);
    assertProof(typeof id === 'string' && inventory.has(id), 'fixture effect outside census');
    // Proof: omit-exact-argv admitted alien exec/restart in the exact owned-operation negative (exit 1).
    assertProof(
      same(args, ['update', '--restart=no', id]) ||
        same(args, ['stop', '--time', '10', id]) ||
        same(args, ['kill', id]) ||
        same(args, ['wait', id]) ||
        same(args, solverInspectArgs(id).slice(1)) ||
        same(args, ['inspect', '--format', '{{json .}}', id]) ||
        (inventory.get(id)?.['Name'] === `/${caddyName}` &&
          (same(args.slice(2), ['wget', '-qO-', 'http://127.0.0.1:2019/config/']) ||
            ['adapt', 'reload'].some((action) =>
              same(args.slice(2), [
                'caddy',
                action,
                '--config',
                '/etc/caddy/Caddyfile',
                '--adapter',
                'caddyfile',
              ]),
            ))),
      'unrecognized fixture Docker operation',
    );
    return run(args, signal);
  };
}
