import { expect, it } from 'bun:test';

import { ROOT } from './lib/docker';
import { parseRegistryTierState } from './lib/registry-state';
import { type ComposeRegistryPorts, prepareComposeImages } from './registry-compose';

function composeFixture() {
  const scope = {
    registryId: 'proof',
    product: 'wbs',
    environment: 'prod',
    target: `compose:${ROOT}`,
  };
  const refs = (fill: string) =>
    ['be', 'gw', 'fe', 'mcp'].map((tier) => ({
      repository: `wbs-${tier}-01`,
      digest: `sha256:${fill.repeat(64)}`,
    }));
  const images = (fill: string) => ({
    be: `registry.test/wbs-be-01@sha256:${fill.repeat(64)}`,
    gw: `registry.test/wbs-gw-01@sha256:${fill.repeat(64)}`,
    fe: `registry.test/wbs-fe-01@sha256:${fill.repeat(64)}`,
  });
  const previous = {
    operationId: 'previous',
    references: refs('1'),
    receipt: { state: 'promoted' as const, at: '2026-10-25T12:00:00.000Z' },
  };
  const history = {
    ...scope,
    schemaVersion: 1,
    source: `${ROOT}/state/be.json`,
    genesis: { at: '2026-10-25T11:00:00.000Z', sourceRevision: 'empty' },
    authorityRevision: 4,
    releases: [previous],
    promotion: { operationId: 'old-swap', candidate: 'previous', at: '2026-10-25T12:00:00.000Z' },
  };
  let bytes = JSON.stringify({
    tier: 'be',
    activeColor: 'blue',
    lastDeployedSha: 'old',
    registry: { schemaVersion: 1, history, operation: null },
  });
  let current = images('1');
  const calls: string[] = [];
  const ports: ComposeRegistryPorts = {
    prepareSmoke: () => Promise.resolve(() => Promise.resolve()),
    select: () =>
      Promise.resolve({
        ...scope,
        registryUrl: 'https://registry.test',
        owner: 'operator',
        sshHost: 'registry',
        requiredRepositories: refs('2').map((ref) => ref.repository),
        publicationReceiptPath: '/receipt.json',
      }),
    read: (path) =>
      Promise.resolve(
        path === '/receipt.json'
          ? JSON.stringify({ operationId: 'candidate', references: refs('2') })
          : bytes,
      ),
    write: (_path, contents) => {
      bytes = contents;
      calls.push('write');
      return Promise.resolve();
    },
    observe: () =>
      Promise.resolve({
        sourceRevision: 'observed',
        references: refs(current.be.includes('1'.repeat(64)) ? '1' : '2'),
        active: current,
        running: { be: true, gw: true, fe: true },
        phases: { be: 'committed', gw: 'committed', fe: 'committed' },
        hasReleaseEvidence: true,
      }),
    protect: (_enrollment, _receipt, full, outgoing, operationId) => {
      calls.push('protect');
      expect(full).toHaveLength(4);
      expect(outgoing).toHaveLength(4);
      return Promise.resolve({
        ...scope,
        operationId,
        references: [...refs('1'), ...refs('2')],
        finish: () => {
          calls.push('promote');
          return Promise.resolve({
            ...scope,
            authorityRevision: 9,
            releases: [
              {
                operationId: 'candidate',
                references: refs('2'),
                receipt: { state: 'promoted' as const, at: '2026-10-25T12:01:00.000Z' },
              },
              previous,
            ],
            promotion: { operationId, candidate: 'candidate', at: '2026-10-25T12:01:00.000Z' },
          });
        },
      });
    },
  };
  return {
    ports,
    calls,
    images: images('2'),
    read: () => parseRegistryTierState(bytes),
    setCurrent: () => {
      current = images('2');
    },
    replace: (value: unknown) => {
      bytes = JSON.stringify(value);
    },
  };
}
it('admits four published images for exactly three configured Compose tiers and refuses incomplete requests before writes', async () => {
  const f = composeFixture();
  await expectRejection(
    prepareComposeImages(['be'], { be: f.images.be }, 'commit', f.ports),
    'all configured',
  );
  expect(f.calls).toEqual([]);
  const session = await prepareComposeImages(['be', 'gw', 'fe'], f.images, 'commit', f.ports);
  expect(f.calls).toEqual(['protect', 'write']);
  expect(f.read().registry?.operation?.references).toHaveLength(8);
  await expectRejection(session?.complete(), 'not verified');
  expect(f.calls).not.toContain('promote');
  f.setCurrent();
  await session?.complete();
  expect(f.read().registry?.history.releases.map((bundle) => bundle.operationId)).toEqual([
    'candidate',
    'previous',
  ]);
});
it('refuses erased Compose ownership and foreign candidate references before mutation', async () => {
  const missing = composeFixture();
  missing.replace({ tier: 'be', activeColor: 'blue', lastDeployedSha: 'old' });
  await expectRejection(
    prepareComposeImages(['be', 'gw', 'fe'], missing.images, 'commit', missing.ports),
  );
  expect(missing.calls).toEqual([]);
  const foreign = composeFixture();
  foreign.images.fe = `registry.test/wbs-fe-01@sha256:${'f'.repeat(64)}`;
  await expectRejection(
    prepareComposeImages(['be', 'gw', 'fe'], foreign.images, 'commit', foreign.ports),
    'publication bundle',
  );
  expect(foreign.calls).toEqual([]);
});

it('retries a fully verified interrupted Compose promotion without swapping any tier again', async () => {
  const f = composeFixture();
  let lose = true;
  const write = f.ports.write;
  f.ports.write = (path, bytes) => {
    if (
      (JSON.parse(bytes) as { registry: { operation?: { phase: string } } }).registry.operation
        ?.phase === 'promoted' &&
      lose
    ) {
      lose = false;
      return Promise.reject(new Error('lost persistence'));
    }
    return write(path, bytes);
  };
  const session = await prepareComposeImages(['be', 'gw', 'fe'], f.images, 'commit', f.ports);
  f.setCurrent();
  await expectRejection(session?.complete(), 'lost persistence');
  const resumed = await prepareComposeImages(['be', 'gw', 'fe'], f.images, 'commit', f.ports);
  expect(resumed?.skip).toBe(true);
  await resumed?.complete();
  expect(f.read().registry?.operation?.phase).toBe('promoted');
});

it('keeps Compose ownership pending when shared smoke fails and requires smoke again on complete-candidate retry', async () => {
  const f = composeFixture();
  let fail = true;
  f.ports.prepareSmoke = () =>
    Promise.resolve(() => {
      f.calls.push('smoke');
      return fail ? Promise.reject(new Error('smoke failed')) : Promise.resolve();
    });
  const session = await prepareComposeImages(['be', 'gw', 'fe'], f.images, 'commit', f.ports);
  f.setCurrent();
  await expectRejection(session?.complete(), 'smoke failed');
  expect(f.calls).not.toContain('promote');
  expect(f.read().registry?.operation?.phase).toBe('protected');
  fail = false;
  const resumed = await prepareComposeImages(['be', 'gw', 'fe'], f.images, 'commit', f.ports);
  expect(resumed?.skip).toBe(true);
  await resumed?.complete();
  expect(f.calls.filter((call) => call === 'smoke')).toHaveLength(2);
  expect(f.calls.indexOf('promote')).toBeGreaterThan(f.calls.lastIndexOf('smoke'));
});

import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { scratchSync } from '@tools/test-scratch';

import { pinComposeSmoke } from './registry-compose-smoke';
it('refuses a missing or changed installed smoke artifact before protection or consumer writes', async () => {
  const root = scratchSync('compose-smoke-pin-');
  const path = join(root, 'smoke.js');
  try {
    for (const missing of [true, false]) {
      if (!missing) writeFileSync(path, 'changed smoke');
      const f = composeFixture();
      f.ports.prepareSmoke = async () => {
        await pinComposeSmoke(path, 'a'.repeat(64));
        return () => Promise.resolve();
      };
      await expectRejection(prepareComposeImages(['be', 'gw', 'fe'], f.images, 'commit', f.ports));
      expect(f.calls).toEqual([]);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
it('refuses a managed subset even when the caller supplies all three image arguments', async () => {
  const f = composeFixture();
  await expectRejection(
    prepareComposeImages(['be'], f.images, 'commit', f.ports),
    'all configured',
  );
  expect(f.calls).toEqual([]);
});

it('resumes a protected partial first-install without mistaking its started tier for prior history', async () => {
  const f = composeFixture();
  const owner = f.read();
  if (owner.registry === undefined) throw new Error('fixture registry missing');
  f.replace({
    ...owner,
    registry: {
      ...owner.registry,
      history: { ...owner.registry.history, releases: [], promotion: null },
    },
  });
  let started = false;
  const observe = f.ports.observe;
  f.ports.observe = async (enrollment) => ({
    ...(await observe(enrollment)),
    active: { be: started ? f.images.be : null, gw: null, fe: null },
  });
  f.ports.protect = (_enrollment, _receipt, full, current, operationId) => {
    expect(current).toBeNull();
    expect(full).toHaveLength(4);
    return Promise.resolve({
      registryId: 'proof',
      product: 'wbs',
      environment: 'prod',
      target: `compose:${ROOT}`,
      operationId,
      references: full.map((image) => {
        const [repository, digest] = image.slice('registry.test/'.length).split('@');
        return { repository, digest };
      }),
      finish: () => Promise.reject(new Error('partial environment must not finish')),
    });
  };
  await prepareComposeImages(['be', 'gw', 'fe'], f.images, 'first', f.ports);
  started = true;
  const resumed = await prepareComposeImages(['be', 'gw', 'fe'], f.images, 'first', f.ports);
  expect(resumed?.skip).toBe(false);
  await expectRejection(resumed?.complete(), 'not verified');
});

import type { RegistryAuthority } from '@tools/registry-publication';

import { verifyComposeRecovery } from './registry-compose';
it('verifies dormant recovery ownership without any authority transition', async () => {
  const originalArgs = [...process.argv];
  try {
    for (const fault of [
      'none',
      'missing',
      'foreign',
      'terminal',
      'unprotected',
      'token',
      'candidate',
      'previous',
      'maintenance',
    ]) {
      const f = composeFixture();
      await prepareComposeImages(['be', 'gw', 'fe'], f.images, 'commit', f.ports);
      const owner = f.read();
      const registry = owner.registry!;
      const operation = registry.operation!;
      const enrollment = await f.ports.select([], `compose:${ROOT}`);
      if (enrollment === undefined) throw new Error('Fixture enrollment missing');
      const candidate = f.images.be;
      const previous = `registry.test/wbs-be-01@sha256:${'1'.repeat(64)}`;
      const state = {
        enrollment: { registryId: 'proof' },
        maintenance: null,
        environments: [
          { owner: enrollment.owner, product: 'wbs', environment: 'prod', retiredAt: null },
        ],
        deployments: [
          {
            operationId: operation.operationId,
            owner: enrollment.owner,
            environment: 'prod',
            phase: 'recovery-required',
            reconciledBy: null,
            token: 'owned',
            candidate: 'candidate',
            current: 'previous',
            references: operation.references,
          },
        ],
        protections: [
          {
            operationId: operation.operationId,
            owner: enrollment.owner,
            token: 'owned',
            references: operation.references,
          },
        ],
        bundles: [
          {
            operationId: 'candidate',
            product: 'wbs',
            references: operation.references.filter((reference) =>
              reference.digest.endsWith('2'.repeat(64)),
            ),
          },
          {
            operationId: 'previous',
            product: 'wbs',
            references: operation.references.filter((reference) =>
              reference.digest.endsWith('1'.repeat(64)),
            ),
          },
        ],
      };
      if (fault === 'missing') delete owner.registry;
      if (fault === 'foreign') registry.history.environment = 'foreign';
      if (fault === 'terminal') state.deployments[0].phase = 'promoted';
      if (fault === 'unprotected') state.protections = [];
      if (fault === 'token') state.protections[0].token = 'foreign';
      if (fault === 'candidate')
        operation.images.be = `registry.test/wbs-be-01@sha256:${'f'.repeat(64)}`;
      if (fault === 'previous') operation.current = [];
      if (fault === 'maintenance') Object.assign(state, { maintenance: { phase: 'acquired' } });
      let locked = false;
      let probes = 0;
      const commands: unknown[] = [];
      const authority: RegistryAuthority = (request) =>
        Promise.resolve().then(() => {
          expect(locked).toBe(true);
          commands.push(request);
          return { state } as Awaited<ReturnType<RegistryAuthority>>;
        });
      const run = async () => {
        locked = true;
        try {
          await verifyComposeRecovery(previous, candidate, {
            select: () => Promise.resolve(enrollment),
            read: () => Promise.resolve(JSON.stringify(owner)),
            authority: () => authority,
          });
          probes++;
        } finally {
          locked = false;
        }
      };
      if (fault === 'none') {
        await run();
        expect(probes).toBe(1);
      } else {
        await expectRejection(run());
        expect(probes).toBe(0);
      }
      expect(commands.every((command) => JSON.stringify(command) === '{"command":"read"}')).toBe(
        true,
      );
      expect(locked).toBe(false);
    }
  } finally {
    process.argv.splice(0, process.argv.length, ...originalArgs);
  }
});

async function expectRejection(
  promise: Promise<unknown> | undefined,
  expected?: string | RegExp,
): Promise<void> {
  const refusal = await Promise.resolve(promise).then(
    () => {
      throw new Error('Expected refusal');
    },
    (cause: unknown) => cause,
  );
  expect(refusal).toBeInstanceOf(Error);
  if (expected !== undefined)
    expect(() => {
      throw refusal;
    }).toThrow(expected);
}
