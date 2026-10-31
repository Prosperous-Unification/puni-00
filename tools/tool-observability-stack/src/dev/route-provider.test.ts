import { createHash } from 'node:crypto';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import { routeChecks } from './route';
import { createRouteFixture } from './route.fixture.test';
import {
  inspectObserver,
  inspectRouteHealth,
  inspectRouteHistory,
  localObserverContext,
  probeRouteHealth,
  readRouteEvidence,
  renderRoutedObserverUnit,
  replaceObserverUnit,
  reserveRouteOperation,
} from './route-provider';

const roots: string[] = [];
test('Task79 actual process reader refuses oversized argv without unbounded capture', async () => {
  const child = Bun.spawn(
    [process.execPath, '--eval', 'setInterval(()=>{},1000)', '--', 'x'.repeat(9000)],
    { stdout: 'ignore', stderr: 'ignore' },
  );
  try {
    expect(() => localObserverContext().readProcess(child.pid)).toThrow('route-process-size');
  } finally {
    child.kill();
    await child.exited;
  }
});
async function expectRefusal(operation: Promise<unknown>, category: string) {
  const refusal: unknown = await operation.then(
    () => undefined,
    (failure: unknown) => failure,
  );
  expect(refusal).toBeInstanceOf(Error);
  if (!(refusal instanceof Error)) throw new Error('Expected route refusal');
  expect(refusal.message).toContain(category);
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function evidence() {
  const root = mkdtempSync(join(tmpdir(), 'route-evidence-'));
  roots.push(root);
  const put = (name: string, wire: unknown) => {
    const path = join(root, name);
    writeFileSync(path, JSON.stringify(wire), { mode: 0o600 });
    return { path, sha256: createHash('sha256').update(readFileSync(path)).digest('hex') };
  };
  const now = Date.now();
  const binding = (target: string) => ({
    environment: 'dev' as const,
    sourceRevision: 'a'.repeat(40),
    candidateRevision: 'b'.repeat(40),
    observedRevision: 'a'.repeat(40),
    adapterRevision: 'c'.repeat(40),
    artifactSHA256: 'd'.repeat(64),
    target: target.repeat(64),
    source: 'e'.repeat(64),
    stores: 'f'.repeat(64),
    routes: 'a'.repeat(64),
  });
  const window = (
    target: ReturnType<typeof binding>,
    role: string,
    observationId: string,
    observedAt: number,
  ) => {
    const identity = {
      environment: 'dev',
      service: 'be-01',
      revision: 'a'.repeat(40),
      observationId,
    };
    const found = { state: 'found', identity, observedAt, proof: { kind: 'record' } };
    const trace = {
      ...found,
      proof: {
        kind: 'trace',
        traceId: '1',
        parentSpanId: '2',
        childSpanId: '3',
        childParentSpanId: '2',
      },
    };
    return {
      observationId,
      observedAt,
      capture: put(`${role}-${observationId}`, {
        version: 1,
        kind: 'stored-observation',
        target: target.target,
        source: target.source,
        identity,
        observedAt,
        evidence: { log: found, metric: found, trace },
        queries: [put(`${role}-${observationId}-query`, { stored: observationId })],
      }),
    };
  };
  const member = (target: ReturnType<typeof binding>, role: string) => ({
    binding: target,
    startedAt: now - 120000,
    completedAt: now - 1,
    checks: routeChecks.map((check) => {
      const output = put(`${role}-${check}-stdout`, { observed: check });
      const capture = put(`${role}-${check}-capture`, {
        version: 1,
        kind: 'observed-runtime-commands',
        target: target.target,
        source: target.source,
        startedAt: now - 100000,
        completedAt: now - 1,
        commands: [{ argv: ['pinned-verifier', check], exitCode: 0, stdout: output }],
      });
      const projection = put(`${role}-${check}-projection`, {
        version: 1,
        kind: 'operator-reviewed-observation',
        check,
        target: target.target,
        captureSHA256: capture.sha256,
        finding: 'reviewed-satisfied',
        observations: [check],
      });
      return { check, capture, projection };
    }),
    windows: [window(target, role, 'one', now - 90000), window(target, role, 'two', now - 1000)],
  });
  const rehearsal = binding('1'),
    staged = binding('2');
  const cohort = {
    version: 1,
    kind: 'reviewed-observability-acceptance',
    rehearsal: member(rehearsal, 'rehearsal'),
    staged: member(staged, 'staged'),
  };
  return {
    root,
    put,
    cohort,
    expected: { rehearsal, staged, maxAgeMs: 300000, freshnessWindowMs: 60000 },
    now,
  };
}
test('Task79 full evidence refuses an unreferenced or incomplete advancing window', () => {
  const fixture = evidence();
  const capture = fixture.cohort.staged.windows[0].capture;
  const wire = JSON.parse(readFileSync(capture.path, 'utf8')) as {
    evidence: { trace: { proof: { childParentSpanId: string } } };
  };
  wire.evidence.trace.proof.childParentSpanId = 'foreign';
  fixture.cohort.staged.windows[0].capture = fixture.put('broken-window', wire);
  expect(() =>
    readRouteEvidence(fixture.put('cohort', fixture.cohort), fixture.expected, fixture.now),
  ).toThrow('route-window-evidence');
});
test('full reviewed evidence reads pinned command outputs and projections', () => {
  const fixture = evidence();
  expect(
    readRouteEvidence(fixture.put('cohort', fixture.cohort), fixture.expected, fixture.now).staged
      .checks,
  ).toHaveLength(15);
});
for (const fault of [
  'failed-command',
  'component',
  'capture-drift',
  'output-drift',
  'wrong-projection',
  'failed-review',
  'missing-output',
] as const) {
  test(`full reviewed evidence refuses ${fault} before admission`, () => {
    const fixture = evidence(),
      check = fixture.cohort.staged.checks[0];
    const capture = JSON.parse(readFileSync(check.capture.path, 'utf8')) as {
      kind: string;
      commands: { exitCode: number; stdout: { path: string } }[];
    };
    if (fault === 'failed-command') capture.commands[0].exitCode = 7;
    if (fault === 'component') capture.kind = 'component';
    if (fault === 'capture-drift') writeFileSync(check.capture.path, 'changed');
    if (fault === 'output-drift') writeFileSync(capture.commands[0].stdout.path, 'changed');
    if (fault === 'missing-output') rmSync(capture.commands[0].stdout.path);
    if (fault === 'failed-command' || fault === 'component') {
      check.capture = fixture.put('changed-capture', capture);
      const projection = JSON.parse(readFileSync(check.projection.path, 'utf8')) as {
        captureSHA256: string;
      };
      projection.captureSHA256 = check.capture.sha256;
      check.projection = fixture.put('changed-capture-projection', projection);
    }
    if (fault === 'wrong-projection') {
      const projection = JSON.parse(readFileSync(check.projection.path, 'utf8')) as {
        target: string;
      };
      projection.target = '9'.repeat(64);
      check.projection = fixture.put('changed-projection', projection);
    }
    if (fault === 'failed-review') {
      const projection = JSON.parse(readFileSync(check.projection.path, 'utf8')) as {
        finding: string;
      };
      projection.finding = 'reviewed-unresolved';
      check.projection = fixture.put('failed-review', projection);
    }
    expect(() =>
      readRouteEvidence(fixture.put('cohort', fixture.cohort), fixture.expected, fixture.now),
    ).toThrow();
  });
}

test('Task79 actual protocol canary preserves checkpoints and exact retained history', async () => {
  const fixture = await createRouteFixture();
  try {
    const checkpoint = readFileSync(join(fixture.state, 'probe.json'));
    const health = await probeRouteHealth(
      fixture.after,
      fixture.context,
      fixture.pin,
      'd'.repeat(40),
    );
    expect(health.producerVersion).toBe('d'.repeat(40));
    expect(health.observationId).not.toBe(fixture.initial.observationId);
    expect(readFileSync(join(fixture.state, 'probe.json'))).toEqual(checkpoint);
    await inspectRouteHistory(
      { receipt: fixture.history, routes: fixture.before },
      fixture.context,
    );
  } finally {
    fixture.close();
  }
});
test('Task79 post-switch stored acceptance converges on one fixed observation across scrape delay', async () => {
  const fixture = await createRouteFixture();
  try {
    fixture.faults.stored = true;
    setTimeout(() => {
      fixture.faults.stored = false;
    }, 50);
    expect(
      (await inspectRouteHealth(fixture.before, fixture.context, join(fixture.state, 'probe.json')))
        .observationId,
    ).toBe(fixture.initial.observationId);
  } finally {
    fixture.close();
  }
});
test('Task79 effective observer process and override refusals precede unit mutation', async () => {
  const fixture = await createRouteFixture();
  try {
    const unit = readFileSync(fixture.unit, 'utf8');
    expect((await inspectObserver(fixture.pin, fixture.before, unit, fixture.context)).routes).toBe(
      fixture.beforeSHA256,
    );
    fixture.faults.process = true;
    await expectRefusal(
      inspectObserver(fixture.pin, fixture.before, unit, fixture.context),
      'route-process',
    );
    fixture.faults.process = false;
    const manager = JSON.parse(readFileSync(fixture.managerState, 'utf8')) as { override: boolean };
    manager.override = true;
    fixture.put(fixture.managerState, manager);
    await expectRefusal(
      inspectObserver(fixture.pin, fixture.before, unit, fixture.context),
      'route-effective-unit',
    );
    expect(readFileSync(fixture.unit, 'utf8')).toBe(unit);
  } finally {
    fixture.close();
  }
});
test('Task79 actual process adapter replaces only its owned unit and refuses competing operation', async () => {
  const fixture = await createRouteFixture();
  try {
    const before = readFileSync(fixture.unit, 'utf8'),
      after = renderRoutedObserverUnit(fixture.pin.sourceRevision, fixture.after, fixture.home);
    const operation = reserveRouteOperation(
      fixture.context,
      '12345678-1234-1234-1234-123456789012',
    );
    expect(() =>
      reserveRouteOperation(fixture.context, '22345678-1234-1234-1234-123456789012'),
    ).toThrow();
    await replaceObserverUnit(fixture.context, before, after);
    expect(readFileSync(fixture.unit, 'utf8')).toBe(after);
    await expectRefusal(replaceObserverUnit(fixture.context, before, after), 'route-unit-drift');
    operation.release();
  } finally {
    fixture.close();
  }
});

for (const fault of [
  'host',
  'binary',
  'manifest',
  'tunnel',
  'checkpoint',
  'source',
  'directory',
  'binding-role',
] as const) {
  test(`Task79 current observer refuses ${fault} drift`, async () => {
    const fixture = await createRouteFixture();
    try {
      const unit = readFileSync(fixture.unit, 'utf8'),
        pin = { ...fixture.pin };
      const binary = join(
        fixture.home,
        '.local/lib/puni-dev-observability',
        pin.sourceRevision.slice(0, 9),
        'observer',
      );
      let category = '';
      if (fault === 'host') {
        pin.hostname = 'foreign';
        category = 'route-observer-identity';
      }
      if (fault === 'binary') {
        writeFileSync(binary, Buffer.alloc(readFileSync(binary).length, 120));
        category = 'route-binary';
      }
      if (fault === 'manifest') {
        pin.manifestSHA256 = fixture.put(join(binary, '..', 'manifest.json'), {
          sourceCommit: 'f'.repeat(40),
          binarySha256: pin.binarySHA256,
          binaryBytes: readFileSync(binary).length,
          target: 'bun-linux-x64',
          builtOn: 'local',
          bunVersion: '1.4.4',
        }).sha256;
        category = 'route-manifest';
      }
      if (fault === 'tunnel') {
        writeFileSync(
          join(fixture.home, '.config/systemd/user/puni-dev-observability-tunnel.service'),
          'changed',
        );
        category = 'route-tunnel';
      }
      if (fault === 'checkpoint') {
        fixture.put(join(fixture.state, 'probe.json'), {
          ...fixture.initial,
          producerVersion: 'f'.repeat(40),
        });
        category = 'route-checkpoint';
      }
      if (fault === 'source') {
        const script = readFileSync(fixture.context.ssh, 'utf8').replaceAll(
          pin.containerId,
          'f'.repeat(64),
        );
        writeFileSync(fixture.context.ssh, script);
        category = 'route-source';
      }
      if (fault === 'directory') {
        chmodSync(join(fixture.home, '.config/systemd/user'), 0o770);
        category = 'route-directory-ownership';
      }
      if (fault === 'binding-role') {
        const path = join(fixture.before.directory, 'otlp.json');
        const binding = JSON.parse(readFileSync(path, 'utf8')) as { authentication: unknown };
        binding.authentication = { kind: 'basic', username: 'reader', password: 'fixture-secret' };
        fixture.put(path, binding);
        category = 'route-authentication';
      }
      await expectRefusal(inspectObserver(pin, fixture.before, unit, fixture.context), category);
      expect(readFileSync(fixture.unit, 'utf8')).toBe(unit);
    } finally {
      fixture.close();
    }
  });
}

test('Task79 app progress never admits an invalid fresh source revision', async () => {
  const fixture = await createRouteFixture();
  try {
    fixture.advanceApplication('invalid-revision');
    await expectRefusal(
      inspectObserver(
        fixture.pin,
        fixture.before,
        readFileSync(fixture.unit, 'utf8'),
        fixture.context,
      ),
      'Invalid source measurement',
    );
    expect(readFileSync(join(fixture.state, 'probe.json'), 'utf8')).toBe(
      JSON.stringify(fixture.initial),
    );
  } finally {
    fixture.close();
  }
});

test('Task79 canaries coexist across producer scopes and app revisions without changing observer metrics', async () => {
  const fixture = await createRouteFixture();
  try {
    const checkpoint = readFileSync(join(fixture.state, 'probe.json'));
    const first = await probeRouteHealth(
      fixture.before,
      fixture.context,
      fixture.pin,
      'd'.repeat(40),
    );
    expect(
      await inspectRouteHealth(fixture.before, fixture.context, fixture.initial),
    ).toMatchObject({ revision: fixture.initialApplicationRevision });
    fixture.advanceApplication('e'.repeat(40));
    const second = await probeRouteHealth(
      fixture.before,
      fixture.context,
      fixture.pin,
      'f'.repeat(40),
    );
    expect(first.observationId).not.toBe(second.observationId);
    expect(second.revision).toBe('e'.repeat(40));
    expect(readFileSync(join(fixture.state, 'probe.json'))).toEqual(checkpoint);
    await fixture.tick(1000);
    expect(
      await inspectRouteHealth(fixture.before, fixture.context, join(fixture.state, 'probe.json')),
    ).toMatchObject({ revision: 'e'.repeat(40) });
  } finally {
    fixture.close();
  }
}, 20000);
