import { createHash } from 'node:crypto';
import * as filesystem from 'node:fs';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { hashHistory } from '@tools/observability-route';
import { routeChecks } from '@tools/observability-route-contract';
import { createRouteFixture } from '@tools/observability-route-fixture';
import { expect, spyOn, test } from 'bun:test';

import { type DiscoveryCommand, runDiscoveryCommand } from './discover';
import { fixture as createPreflightFixture } from './observability-preflight.fixture';
import { runObservabilityRoute } from './observability-route';

async function expectRefusal(operation: Promise<unknown>, category: string) {
  const refusal: unknown = await operation.then(
    () => undefined,
    (failure: unknown) => failure,
  );
  expect(refusal).toBeInstanceOf(Error);
  if (!(refusal instanceof Error)) throw new Error('Expected route refusal');
  expect(refusal.message).toContain(category);
}

test('route CLI refuses missing reviewed request before mutation with a fixed diagnostic', () => {
  const invocation = Bun.spawnSync([
    process.execPath,
    new URL('./observability-route-cli.ts', import.meta.url).pathname,
    'switch',
    '/tmp/puni-task79-deliberately-absent-request.json',
  ]);
  expect(invocation.exitCode).toBe(1);
  expect(invocation.stdout.toString()).toBe('');
  expect(invocation.stderr.toString().trim()).toBe('route-file-absent');
});

async function composedFixture() {
  const observer = await createRouteFixture(),
    preflight = await createPreflightFixture();
  const oldAgent = process.env['SSH_AUTH_SOCK'];
  process.env['SSH_AUTH_SOCK'] = join(preflight.directory, 'agent.sock');
  const renameNamespace = (wire: unknown): unknown =>
    Array.isArray(wire)
      ? wire.map(renameNamespace)
      : wire !== null && typeof wire === 'object'
        ? Object.fromEntries(
            Object.entries(wire).map(([key, value]) => [key, renameNamespace(value)]),
          )
        : wire === 'observability'
          ? 'observability-dev'
          : wire;
  const request = renameNamespace(preflight.request) as typeof preflight.request;
  const snapshot = renameNamespace(preflight.snapshot) as typeof preflight.snapshot;
  const artifact = readFileSync(request.candidate[0].artifactPath, 'utf8').replace(
    'namespace: observability\n',
    'namespace: observability-dev\n',
  );
  writeFileSync(request.candidate[0].artifactPath, artifact);
  request.candidate[0].artifactSHA256 = createHash('sha256').update(artifact).digest('hex');
  const preflightReference = observer.put(join(observer.home, 'preflight.json'), request);
  const adapterRevision = 'd'.repeat(40);
  const adapterBundleSHA256 = observer.put(join(observer.home, 'operation-bundle'), {
    componentFixture: true,
    sourceRevision: adapterRevision,
  }).sha256;
  const producer = { revision: adapterRevision, bundleSHA256: adapterBundleSHA256 };
  const staged = {
    environment: 'dev' as const,
    sourceRevision: request.candidateRevision,
    candidateRevision: request.candidateRevision,
    observedRevision: observer.pin.applicationRevision,
    adapterRevision,
    artifactSHA256: hashHistory(
      request.candidate.map((candidate) => ({
        path: candidate.artifactPath,
        sha256: candidate.artifactSHA256,
      })),
    ),
    target: hashHistory({
      fleetId: request.fleetId,
      targetMarker: request.targetMarker,
      identityUID: request.identityUID,
      context: request.context,
      controllerContext: request.controllerContext,
    }),
    source: hashHistory({
      containerId: observer.pin.containerId,
      applicationRevision: observer.pin.applicationRevision,
      observerSourceRevision: observer.pin.sourceRevision,
    }),
    stores: hashHistory({
      claims: request.claims,
      docker: request.docker,
      candidateClaims: request.candidate.map((candidate) => ({
        namespace: candidate.namespace,
        name: candidate.name,
        claims: candidate.claims,
      })),
    }),
    routes: observer.afterSHA256,
  };
  const acceptance = () => {
    const now = Date.now();
    const window = (
      binding: typeof staged,
      role: string,
      observationId: string,
      observedAt: number,
    ) => {
      const identity = {
        environment: 'dev',
        service: 'be-01',
        revision: observer.pin.applicationRevision,
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
        capture: observer.put(join(observer.home, `${role}-${observationId}-${String(now)}`), {
          version: 1,
          kind: 'stored-observation',
          target: binding.target,
          source: binding.source,
          identity,
          observedAt,
          evidence: { log: found, metric: found, trace },
          queries: [
            observer.put(join(observer.home, `${role}-${observationId}-${String(now)}-query`), {
              stored: observationId,
            }),
          ],
        }),
      };
    };
    const member = (binding: typeof staged, role: string) => ({
      binding,
      startedAt: now - 120000,
      completedAt: now - 1,
      checks: routeChecks.map((check) => {
        const output = observer.put(join(observer.home, `${role}-${check}-stdout`), {
          componentFixture: true,
          observation: check,
        });
        const capture = observer.put(join(observer.home, `${role}-${check}-capture`), {
          version: 1,
          kind: 'observed-runtime-commands',
          target: binding.target,
          source: binding.source,
          startedAt: now - 100000,
          completedAt: now - 1,
          commands: [{ argv: ['fixture-verifier', check], exitCode: 0, stdout: output }],
        });
        const projection = observer.put(join(observer.home, `${role}-${check}-projection`), {
          version: 1,
          kind: 'operator-reviewed-observation',
          check,
          target: binding.target,
          captureSHA256: capture.sha256,
          finding: 'reviewed-satisfied',
          observations: [check],
        });
        return { check, capture, projection };
      }),
      windows: [
        window(binding, role, 'one', now - 90000),
        window(binding, role, 'two', now - 1000),
      ],
    });
    const rehearsal = { ...staged, target: '9'.repeat(64) };
    return {
      receipt: observer.put(join(observer.home, `acceptance-${String(now)}.json`), {
        version: 1,
        kind: 'reviewed-observability-acceptance',
        rehearsal: member(rehearsal, 'rehearsal'),
        staged: member(staged, 'staged'),
      }),
      rehearsal,
      staged,
      maxAgeMs: 300000,
      freshnessWindowMs: 30000,
    };
  };
  const operation = {
    version: 1,
    observer: observer.pin,
    adapterRevision,
    adapterBundleSHA256,
    before: observer.before,
    after: observer.after,
    beforeSHA256: observer.beforeSHA256,
    afterSHA256: observer.afterSHA256,
    preflight: preflightReference,
    sshTransportPath: preflight.transportPath,
    clusterHost: 'h3mon',
    history: { receipt: observer.history, routes: observer.before },
    grafana: observer.put(join(observer.home, 'grafana.json'), {
      schema: 1,
      owner: 'puni-dev-observability',
      phase: 'applied',
      baseline: 'a'.repeat(64),
      datasourceHash: 'b'.repeat(64),
      dashboardHash: 'c'.repeat(64),
    }),
    acceptance: acceptance(),
  };
  const run = async (command: DiscoveryCommand) => {
    observer.put(join(preflight.directory, 'snapshot.json'), snapshot);
    if (command.source.startsWith('ssh-facts:'))
      return runDiscoveryCommand({ ...command, executable: join(preflight.bin, 'ssh') });
    const remote = command.arguments.at(-1);
    if (!remote?.startsWith("'sudo' '-n' 'k3s' 'kubectl'"))
      throw new Error('fixture requires the actual remote preflight command');
    return runDiscoveryCommand({
      ...command,
      executable: '/bin/sh',
      arguments: [
        '-c',
        remote.replace("'sudo' '-n' 'k3s' 'kubectl'", `'${join(preflight.bin, 'kubectl')}'`),
      ],
    });
  };
  return {
    observer,
    preflight,
    operation,
    request,
    snapshot,
    acceptance,
    producer,
    run,
    invoke: (kind: string, wire: unknown = operation, wait = observer.tick) =>
      runObservabilityRoute(
        [kind, observer.put(join(observer.home, `request-${kind}.json`), wire).path],
        { context: observer.context, producer, run, wait },
      ),
    close() {
      preflight.server.stop(true);
      if (oldAgent === undefined) delete process.env['SSH_AUTH_SOCK'];
      else process.env['SSH_AUTH_SOCK'] = oldAgent;
      observer.close();
    },
  };
}

test('Task79 failed candidate keeps source unit and all historical receipts unchanged', async () => {
  const fixture = await composedFixture();
  try {
    const before = readFileSync(fixture.observer.unit),
      history = readFileSync(fixture.observer.history.path);
    fixture.snapshot.resources[1].ready = false;
    await expectRefusal(fixture.invoke('switch'), 'route-operation-refused');
    expect(readFileSync(fixture.observer.unit)).toEqual(before);
    expect(readFileSync(fixture.observer.history.path)).toEqual(history);
  } finally {
    fixture.close();
  }
});

test('Task79 two concurrent composed operations admit only one owned mutation', async () => {
  const fixture = await composedFixture();
  try {
    const outcomes = await Promise.allSettled([fixture.invoke('switch'), fixture.invoke('switch')]);
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toHaveLength(1);
    expect(
      readdirSync(fixture.observer.state).filter((name) => name.startsWith('route-')),
    ).toHaveLength(1);
  } finally {
    fixture.close();
  }
});

test('Task79 occupied prepared capture prevents mutation and preserves earlier bytes', async () => {
  const fixture = await composedFixture();
  try {
    const before = readFileSync(fixture.observer.unit),
      readProcess = fixture.observer.context.readProcess;
    let occupiedPath = '';
    fixture.observer.context.readProcess = (pid) => {
      const directory = readdirSync(fixture.observer.state).find((name) =>
        name.startsWith('route-'),
      );
      if (directory !== undefined && occupiedPath === '') {
        occupiedPath = join(fixture.observer.state, directory, 'prepared.json');
        writeFileSync(occupiedPath, 'earlier-capture', { mode: 0o600 });
      }
      return readProcess(pid);
    };
    await expectRefusal(fixture.invoke('switch'), 'route-operation-refused');
    expect(readFileSync(fixture.observer.unit)).toEqual(before);
    expect(readFileSync(occupiedPath, 'utf8')).toBe('earlier-capture');
  } finally {
    fixture.close();
  }
});

test('Task79 candidate inventory expiry before mutation preserves the current unit', async () => {
  const fixture = await composedFixture();
  try {
    const before = readFileSync(fixture.observer.unit);
    let inspections = 0;
    await expectRefusal(
      runObservabilityRoute(
        [
          'switch',
          fixture.observer.put(join(fixture.observer.home, 'expiry.json'), fixture.operation).path,
        ],
        {
          context: fixture.observer.context,
          producer: fixture.producer,
          wait: fixture.observer.tick,
          run: async (command) => {
            const observed = await fixture.run(command);
            if (command.source.startsWith('ssh-facts:') && ++inspections === 2)
              await fixture.observer.tick(fixture.request.maxAgeMs + 1);
            return { ...observed, observedAt: new Date().toISOString() };
          },
        },
      ),
      'route-operation-refused',
    );
    expect(readFileSync(fixture.observer.unit)).toEqual(before);
  } finally {
    fixture.close();
  }
});

test('Task79 forged completed parent cannot detach its operation request from prepared evidence', async () => {
  const fixture = await composedFixture();
  try {
    const switched = await fixture.invoke('switch');
    const forged = JSON.parse(readFileSync(switched.receipt, 'utf8')) as {
      request: { adapterBundleSHA256: string };
    };
    forged.request.adapterBundleSHA256 = '0'.repeat(64);
    const parent = fixture.observer.put(switched.receipt, forged);
    const before = readFileSync(fixture.observer.unit);
    const refusal = await fixture
      .invoke('rollback', {
        ...fixture.operation,
        before: fixture.observer.after,
        after: fixture.observer.before,
        beforeSHA256: fixture.observer.afterSHA256,
        afterSHA256: fixture.observer.beforeSHA256,
        parent,
      })
      .then(
        () => undefined,
        (failure: unknown) => failure,
      );
    expect(refusal).toBeInstanceOf(Error);
    expect(readFileSync(fixture.observer.unit)).toEqual(before);
  } finally {
    fixture.close();
  }
});

for (const phase of ['file', 'directory'] as const) {
  test(`Task79 failed prepared ${phase} sync prevents unit mutation`, async () => {
    const fixture = await composedFixture();
    const original = filesystem.fsyncSync;
    let injected = false;
    const sync = spyOn(filesystem, 'fsyncSync').mockImplementation((descriptor) => {
      const path = filesystem.readlinkSync(`/proc/self/fd/${String(descriptor)}`);
      if (
        !injected &&
        (phase === 'file'
          ? path.endsWith('/prepared.json')
          : path.startsWith(`${fixture.observer.state}/route-`) &&
            filesystem.statSync(`/proc/self/fd/${String(descriptor)}`).isDirectory())
      ) {
        injected = true;
        throw new Error('injected-prepared-sync');
      }
      original(descriptor);
    });
    try {
      const before = readFileSync(fixture.observer.unit);
      await expectRefusal(fixture.invoke('switch'), 'route-operation-refused');
      expect(readFileSync(fixture.observer.unit)).toEqual(before);
      const directories = readdirSync(fixture.observer.state).filter((name) =>
        name.startsWith('route-'),
      );
      expect(
        directories.every(
          (name) => !existsSync(join(fixture.observer.state, name, 'mutation-started.json')),
        ),
      ).toBe(true);
    } finally {
      sync.mockRestore();
      fixture.close();
    }
  });
}

test('Task79 failed compensation stays uncertain and retains both operation receipts and lock', async () => {
  const fixture = await composedFixture();
  try {
    await expectRefusal(
      fixture.invoke('switch', fixture.operation, async (milliseconds) => {
        await fixture.observer.tick(milliseconds);
        fixture.observer.faults.candidateStored = true;
        const manager = JSON.parse(readFileSync(fixture.observer.managerState, 'utf8')) as {
          restart: boolean;
        };
        manager.restart = true;
        fixture.observer.put(fixture.observer.managerState, manager);
      }),
      'route-mutation-uncertain',
    );
    const directories = readdirSync(fixture.observer.state).filter((name) =>
      name.startsWith('route-'),
    );
    expect(directories).toHaveLength(2);
    expect(
      directories.every((name) => existsSync(join(fixture.observer.state, name, 'uncertain.json'))),
    ).toBe(true);
    expect(existsSync(join(fixture.observer.state, 'route.lock/owner.json'))).toBe(true);
  } finally {
    fixture.close();
  }
}, 15000);

for (const fault of [
  'request',
  'producer',
  'production',
  'evidence',
  'selection',
  'unready',
  'owner',
  'volume',
] as const) {
  test(`Task79 composed operation refuses ${fault} before unit write`, async () => {
    const fixture = await composedFixture();
    try {
      const before = readFileSync(fixture.observer.unit);
      let wire: unknown = fixture.operation;
      if (fault === 'request')
        wire = { ...fixture.operation, unconsumedCredential: 'SYNTHETIC-PRIVATE-MARKER' };
      if (fault === 'producer')
        wire = { ...fixture.operation, adapterBundleSHA256: '0'.repeat(64) };
      if (fault === 'production') {
        const selected = structuredClone(fixture.request);
        selected.candidate[0].instance = 'prod';
        wire = {
          ...fixture.operation,
          preflight: fixture.observer.put(join(fixture.observer.home, 'production.json'), selected),
        };
      }
      if (fault === 'evidence') writeFileSync(fixture.operation.acceptance.receipt.path, 'changed');
      if (fault === 'selection') {
        const cohort = JSON.parse(
          readFileSync(fixture.operation.acceptance.receipt.path, 'utf8'),
        ) as { staged: { binding: { artifactSHA256: string } } };
        cohort.staged.binding.artifactSHA256 = '0'.repeat(64);
        wire = {
          ...fixture.operation,
          acceptance: {
            ...fixture.operation.acceptance,
            staged: { ...fixture.operation.acceptance.staged, artifactSHA256: '0'.repeat(64) },
            receipt: fixture.observer.put(
              join(fixture.observer.home, 'wrong-selected-artifact.json'),
              cohort,
            ),
          },
        };
      }
      if (fault === 'unready') fixture.snapshot.pods[0].ready = false;
      if (fault === 'owner') fixture.snapshot.docker.containers[0].project = 'foreign';
      if (fault === 'volume') fixture.snapshot.docker.volumes[0].createdAt = '2026-10-02T00:00:00Z';
      const refusal = await fixture.invoke('switch', wire).then(
        () => undefined,
        (failure: unknown) => failure,
      );
      expect(refusal).toBeInstanceOf(Error);
      expect(readFileSync(fixture.observer.unit)).toEqual(before);
    } finally {
      fixture.close();
    }
  });
}

test('Task79 post-start binding drift cannot replace the independently accepted route commitment', async () => {
  const fixture = await composedFixture();
  try {
    const manager = JSON.parse(readFileSync(fixture.observer.managerState, 'utf8')) as Record<
      string,
      unknown
    >;
    manager['bindingDrift'] = true;
    fixture.observer.put(fixture.observer.managerState, manager);
    await expectRefusal(fixture.invoke('switch'), 'route-mutation-uncertain');
  } finally {
    fixture.close();
  }
});

test('Task79 failed post-switch acceptance compensates with a distinct retained-route receipt', async () => {
  const fixture = await composedFixture();
  try {
    const oldUnit = readFileSync(fixture.observer.unit);
    await expectRefusal(
      fixture.invoke('switch', fixture.operation, async (milliseconds) => {
        await fixture.observer.tick(milliseconds);
        fixture.observer.faults.candidateStored = true;
      }),
      'route-operation-compensated',
    );
    expect(readFileSync(fixture.observer.unit)).toEqual(oldUnit);
    const operations = readdirSync(fixture.observer.state).filter((name) =>
      name.startsWith('route-'),
    );
    expect(operations).toHaveLength(2);
    const receipts = operations.map((name) => readdirSync(join(fixture.observer.state, name)));
    expect(receipts.some((names) => names.includes('completed.json'))).toBe(true);
    expect(receipts.some((names) => names.includes('compensated.json'))).toBe(true);
  } finally {
    fixture.close();
  }
}, 15000);

test('Task79 explicit recovery refuses active owner and tampered unit pins', async () => {
  const fixture = await composedFixture();
  try {
    const manager = JSON.parse(readFileSync(fixture.observer.managerState, 'utf8')) as {
      reload: boolean;
    };
    manager.reload = true;
    fixture.observer.put(fixture.observer.managerState, manager);
    await expectRefusal(fixture.invoke('switch'), 'route-mutation-uncertain');
    const operation = readdirSync(fixture.observer.state).find((name) => name.startsWith('route-'));
    if (operation === undefined) throw new Error('Missing fixture operation');
    const preparedPath = join(fixture.observer.state, operation, 'prepared.json');
    const prepared = JSON.parse(readFileSync(preparedPath, 'utf8')) as {
      beforeUnit: string;
      afterUnit: string;
    };
    const sha = (text: string | Buffer) => createHash('sha256').update(text).digest('hex');
    const args = [
      'recover',
      preparedPath,
      sha(readFileSync(preparedPath)),
      sha(prepared.afterUnit),
      sha(prepared.beforeUnit),
      String(process.pid),
      '--reconciled',
    ];
    const assertRecoveryRefuses = async (category: string) => {
      const unit = readFileSync(fixture.observer.unit),
        owner = readFileSync(join(fixture.observer.state, 'route.lock/owner.json'));
      const directories = readdirSync(fixture.observer.state).filter((name) =>
        name.startsWith('route-'),
      );
      const refusal = await runObservabilityRoute(args, {
        context: fixture.observer.context,
        producer: fixture.producer,
        run: fixture.run,
        wait: fixture.observer.tick,
      }).then(
        () => undefined,
        (failure: unknown) => failure,
      );
      expect(readFileSync(fixture.observer.unit)).toEqual(unit);
      expect(readFileSync(join(fixture.observer.state, 'route.lock/owner.json'))).toEqual(owner);
      expect(
        readdirSync(fixture.observer.state).filter((name) => name.startsWith('route-')),
      ).toEqual(directories);
      expect(refusal).toBeInstanceOf(Error);
      if (!(refusal instanceof Error)) throw new Error('Expected recovery refusal');
      expect(refusal.message).toContain(category);
    };
    await assertRecoveryRefuses('route-owner-active');
    const probe = spyOn(process, 'kill').mockImplementation(() => {
      throw Object.assign(new Error('injected-owner-denial'), { code: 'EPERM' });
    });
    try {
      await assertRecoveryRefuses('route-owner-unknown');
    } finally {
      probe.mockRestore();
    }
    args[4] = '0'.repeat(64);
    await assertRecoveryRefuses('route-recovery-pins');
    args[4] = sha(prepared.beforeUnit);
    writeFileSync(fixture.observer.unit, 'foreign-unit');
    args[3] = sha('foreign-unit');
    await assertRecoveryRefuses('route-recovery-pins');
  } finally {
    fixture.close();
  }
});

for (const variant of ['lost-reload', 'failed-start'] as const) {
  test(`Task79 explicit recovery completes after inactive owner with ${variant}`, async () => {
    const fixture = await composedFixture();
    try {
      const manager = JSON.parse(readFileSync(fixture.observer.managerState, 'utf8')) as {
        reload: boolean;
        inactive: boolean;
        pid: number;
        loadedCommand: string;
      };
      manager.reload = true;
      fixture.observer.put(fixture.observer.managerState, manager);
      await expectRefusal(fixture.invoke('switch'), 'route-mutation-uncertain');
      const operation = readdirSync(fixture.observer.state).find((name) =>
        name.startsWith('route-'),
      );
      if (operation === undefined) throw new Error('Missing fixture operation');
      const directory = join(fixture.observer.state, operation),
        preparedPath = join(directory, 'prepared.json');
      const uncertain = readFileSync(join(directory, 'uncertain.json'));
      // Component crash fixture: a real child durably owns the modeled capture, then exits.
      // These synthetic ownership bytes are not actual-host evidence or runtime certification.
      const child = Bun.spawnSync(
        [
          process.execPath,
          '--eval',
          `const fs=await import('node:fs');const path=process.env.PUNI_ROUTE_TEST_PREPARED;const owner=process.env.PUNI_ROUTE_TEST_OWNER;const prepared=JSON.parse(fs.readFileSync(path));prepared.ownerPID=process.pid;fs.writeFileSync(path,JSON.stringify(prepared));fs.writeFileSync(owner,JSON.stringify({operationId:prepared.operationId,pid:process.pid}));console.log(process.pid);`,
        ],
        {
          env: {
            ...process.env,
            PUNI_ROUTE_TEST_PREPARED: preparedPath,
            PUNI_ROUTE_TEST_OWNER: join(fixture.observer.state, 'route.lock/owner.json'),
          },
        },
      );
      expect(child.exitCode).toBe(0);
      const ownerPID = Number(child.stdout.toString().trim());
      const prepared = JSON.parse(readFileSync(preparedPath, 'utf8')) as {
        beforeUnit: string;
        afterUnit: string;
      };
      manager.reload = false;
      if (variant === 'failed-start') {
        manager.inactive = true;
        manager.pid = 0;
        manager.loadedCommand = prepared.afterUnit
          .split('\n')
          .find((line) => line.startsWith('ExecStart='))!
          .slice(10);
      }
      fixture.observer.put(fixture.observer.managerState, manager);
      const sha = (text: string | Buffer) => createHash('sha256').update(text).digest('hex');
      const args = [
        'recover',
        preparedPath,
        sha(readFileSync(preparedPath)),
        sha(prepared.afterUnit),
        sha(prepared.beforeUnit),
        String(ownerPID),
        '--reconciled',
      ];
      if (variant === 'lost-reload') {
        const before = readFileSync(fixture.observer.unit),
          owner = readFileSync(join(fixture.observer.state, 'route.lock/owner.json'));
        const invalid = [...args];
        invalid[4] = '0'.repeat(64);
        const refusal = await runObservabilityRoute(invalid, {
          context: fixture.observer.context,
          producer: fixture.producer,
          run: fixture.run,
          wait: fixture.observer.tick,
        }).then(
          () => undefined,
          (failure: unknown) => failure,
        );
        expect(readFileSync(fixture.observer.unit)).toEqual(before);
        expect(readFileSync(join(fixture.observer.state, 'route.lock/owner.json'))).toEqual(owner);
        expect(refusal).toBeInstanceOf(Error);
      }
      const recovered = await runObservabilityRoute(args, {
        context: fixture.observer.context,
        producer: fixture.producer,
        run: async (command) =>
          runDiscoveryCommand({ ...command, executable: join(fixture.preflight.bin, 'ssh') }),
        wait: fixture.observer.tick,
      });
      expect(readFileSync(fixture.observer.unit, 'utf8')).toBe(prepared.beforeUnit);
      expect(readFileSync(join(directory, 'uncertain.json'))).toEqual(uncertain);
      expect(JSON.parse(readFileSync(recovered.receipt, 'utf8'))).toMatchObject({
        kind: 'rollback',
        phase: 'completed',
      });
    } finally {
      fixture.close();
    }
  });
}

test('Task79 composed switch rollback during Kubernetes failure and restore retain every prior receipt', async () => {
  const fixture = await composedFixture();
  try {
    const switched = await fixture.invoke('switch');
    const switchedBytes = readFileSync(switched.receipt),
      originalHistory = readFileSync(fixture.observer.history.path);
    fixture.snapshot.resources[1].ready = false;
    const rollbackRequest = {
      ...fixture.operation,
      before: fixture.observer.after,
      after: fixture.observer.before,
      beforeSHA256: fixture.observer.afterSHA256,
      afterSHA256: fixture.observer.beforeSHA256,
      parent: {
        path: switched.receipt,
        sha256: createHash('sha256').update(switchedBytes).digest('hex'),
      },
    };
    const rolledBack = await fixture.invoke('rollback', rollbackRequest);
    expect(readFileSync(switched.receipt)).toEqual(switchedBytes);
    fixture.snapshot.resources[1].ready = true;
    const freshRollback = fixture.observer.put(
      join(fixture.observer.home, 'new-preflight-rollback.json'),
      {
        operationId: 'rollback-fresh',
        candidateRevision: fixture.request.candidateRevision,
        capturedAt: new Date().toISOString(),
        claimUIDs: fixture.request.claims.map((claim) => claim.uid),
        dockerVolumes: fixture.request.docker.retainedVolumes,
      },
    );
    const freshPreflight = fixture.observer.put(
      join(fixture.observer.home, 'fresh-preflight.json'),
      {
        ...fixture.request,
        rollbackOperationId: 'rollback-fresh',
        rollbackPath: freshRollback.path,
        rollbackSHA256: freshRollback.sha256,
      },
    );
    const restored = await fixture.invoke('restore', {
      ...fixture.operation,
      acceptance: fixture.acceptance(),
      preflight: freshPreflight,
      parent: {
        path: rolledBack.receipt,
        sha256: createHash('sha256').update(readFileSync(rolledBack.receipt)).digest('hex'),
      },
    });
    expect(new Set([switched.operationId, rolledBack.operationId, restored.operationId]).size).toBe(
      3,
    );
    expect(readFileSync(switched.receipt)).toEqual(switchedBytes);
    expect(readFileSync(fixture.observer.history.path)).toEqual(originalHistory);
  } finally {
    fixture.close();
  }
});
