import { rejects } from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmod, lstat, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { Database } from 'bun:sqlite';
import { expect, mock, spyOn, test } from 'bun:test';

import { productBytes, sourceBytes } from '../fixtures/participant-process-bytes';
import {
  captureRestorationDeadline,
  readRestorationProfile,
} from '../fixtures/participant-restoration-profile';
import {
  SOURCE_RESTORATION_CASES,
  type SourceRestorationCase,
} from '../fixtures/participant-source-restoration-cases';
import { readFields } from './managed-cohort';

await mock.module('./product-host-proc', () => ({
  readProductHostProc: (path: string) => {
    if (/^\/proc\/(4000[12]|5000[12])\//.test(path))
      return productBytes.read(path, { fault: 'none', wrapper: false });
    if (/^\/proc\/6000[1-6]\//.test(path))
      return sourceBytes.read(path, { name: 'none', closing: false });
    throw new Error('source restoration fixture host family unsupported');
  },
}));
const { withParticipantSourceRestoration } =
  await import('../fixtures/participant-source-restoration');
const restoration = await import('./dependency-participant-restoration');
const { restoreSolverForPreparedParticipants } =
  await import('./dependency-participant-solver-restoration');

function readStores(path: string) {
  const database = new Database(path, { readonly: true, create: false });
  try {
    return {
      ledger: database.query('SELECT name,hash FROM __drizzle_migrations ORDER BY name').all(),
      activation: database
        .query('SELECT * FROM cross_project_dependency_activation ORDER BY id')
        .all(),
      receipts: database
        .query('SELECT * FROM cross_project_dependency_activation_receipt ORDER BY id')
        .all(),
    };
  } finally {
    database.close();
  }
}

async function readSourceStartIntents(root: string) {
  const records = await Promise.all(
    (await readdir(root))
      .filter((name) => name.endsWith('-activation-participant-start-intent.json'))
      .map(async (name) =>
        readFields(readFields(JSON.parse(await readFile(join(root, name), 'utf8')))['record']),
      ),
  );
  return records.filter((record) => record['role'] === 'source');
}

type PolicyContext = Parameters<Parameters<typeof withParticipantSourceRestoration>[0]>[0];
type PolicyFixture = Parameters<Parameters<typeof withParticipantSourceRestoration>[0]>[1];
type PolicyAudit = Parameters<Parameters<typeof withParticipantSourceRestoration>[0]>[3];

async function runPolicyRefusal(
  scenario: SourceRestorationCase,
  context: PolicyContext,
  fixture: PolicyFixture,
  audit: PolicyAudit,
): Promise<void> {
  if (scenario === 'policy-released') {
    audit.release();
    await rejects(
      restoration.restoreParticipantPoliciesAfterSource(context),
      /participant policy restoration refused/,
      'released original source-ready context must refuse before policy effects',
    );
    expect(audit.policyUpdates).toEqual([]);
    console.error('PARTICIPANT_POLICY_REFUSED: policy-released before any policy attempt');
    return;
  }
  const backendBefore = structuredClone(fixture.backend);
  const ownership = await import('./edge-ownership');
  const retain = ownership.retainActivationRecord;
  let published = false;
  let publishedOriginal: { path: string; contents: string; inode: string } | undefined;
  const publication = spyOn(ownership, 'retainActivationRecord').mockImplementation(
    async (...args) => {
      const snapshot = await retain(...args);
      if (args[2] === 'participants-restored') {
        published = true;
        if (scenario === 'policy-published-record') {
          publishedOriginal = structuredClone(snapshot);
          await writeFile(snapshot.path, snapshot.contents + ' ');
          audit.faults.push(scenario);
          console.error(
            'PARTICIPANT_POLICY_POST_PUBLICATION_DELIVERY: actual restored publication followed by same-inode physical record drift',
          );
        }
      }
      return snapshot;
    },
  );
  try {
    await rejects(
      restoration.restoreParticipantPoliciesAfterSource(context),
      /participant policy restoration refused/,
      `policy ${scenario} must refuse at its actual production consumer`,
    );
    expect(audit.faults).toContain(scenario);
    const early = ['policy-name', 'policy-count', 'policy-pid', 'policy-readback-fence'].includes(
      scenario,
    );
    const expectedEffects = early ? 1 : 3;
    expect(audit.policyUpdates).toHaveLength(expectedEffects);
    expect(audit.policyNativeReadbacks).toHaveLength(expectedEffects);
    const intents = (await readdir(fixture.root)).filter((name) =>
      name.endsWith('-activation-participant-policy-intent.json'),
    );
    expect(intents).toHaveLength(expectedEffects);
    const restored = (await readdir(fixture.root)).filter((name) =>
      name.endsWith('-activation-participants-restored.json'),
    );
    expect(restored).toHaveLength(scenario === 'policy-published-record' ? 1 : 0);
    expect(published).toBe(scenario === 'policy-published-record');
    if (scenario === 'policy-published-record') {
      const envelope = readFields(
        JSON.parse(await readFile(join(fixture.root, restored[0]), 'utf8')),
      );
      expect(readFields(envelope['record'])['format']).toBe('dependency-participants-restored');
      if (publishedOriginal === undefined) throw new Error('actual published original absent');
      expect(await readFile(publishedOriginal.path, 'utf8')).toBe(publishedOriginal.contents + ' ');
    }
    if (scenario === 'policy-listener') {
      expect(audit.faults).toContain('policy-listener-raw');
      expect(
        audit.raw.some(
          (receipt) => receipt.role === 'source' && !receipt.cleanup && receipt.policyCount === 3,
        ),
      ).toBe(true);
    }
    if (['policy-name', 'policy-count', 'policy-pid'].includes(scenario)) {
      Object.assign(fixture.backend.State, backendBefore.State);
      Object.assign(
        fixture.backend.HostConfig.RestartPolicy,
        backendBefore.HostConfig.RestartPolicy,
      );
    }
    if (scenario === 'policy-readback-fence') {
      await writeFile(context.fencedComplete.path, context.fencedComplete.contents);
      expect(String((await lstat(context.fencedComplete.path, { bigint: true })).ino)).toBe(
        context.fencedComplete.inode,
      );
    }
    if (scenario === 'policy-published-record') {
      if (publishedOriginal === undefined) throw new Error('actual published original absent');
      await writeFile(publishedOriginal.path, publishedOriginal.contents);
      expect(String((await lstat(publishedOriginal.path, { bigint: true })).ino)).toBe(
        publishedOriginal.inode,
      );
      expect(await readFile(publishedOriginal.path, 'utf8')).toBe(publishedOriginal.contents);
    }
    audit.listenerReplaced = false;
    audit.fault = 'ready';
    await rejects(
      restoration.restoreParticipantPoliciesAfterSource(context),
      /participant policy restoration refused/,
      `policy ${scenario} must remain terminal after exact fixture repair`,
    );
    expect(audit.policyUpdates).toHaveLength(expectedEffects);
    expect(
      (await readdir(fixture.root)).filter((name) =>
        name.endsWith('-activation-participant-policy-intent.json'),
      ),
    ).toHaveLength(expectedEffects);
    expect(audit.events).toEqual(['backend-start', 'gateway-start', 'source-start']);
    console.error(
      `PARTICIPANT_POLICY_REFUSED: ${scenario} actual independent delivery and same-context terminal retry`,
    );
  } finally {
    publication.mockRestore();
  }
}

async function runSourceRestorationCase(scenario: SourceRestorationCase): Promise<void> {
  const deadline = captureRestorationDeadline(scenario);
  const restoresPolicies = readRestorationProfile(scenario).group === 'policy';
  await withParticipantSourceRestoration(
    async (context, fixture, runtime, audit) => {
      let readyPublished = false;
      let injected = false;
      const sourceObserver = await import('./source-role-process');
      const observeSource = sourceObserver.observeSelectedSourceRoles;
      const sourceReturn = spyOn(sourceObserver, 'observeSelectedSourceRoles').mockImplementation(
        async (...args) => {
          const observed = await observeSource(...args);
          audit.sourceObserved = true;
          if (scenario === 'late-fence' && readyPublished && !injected) {
            await writeFile(context.fencedComplete.path, context.fencedComplete.contents + ' ');
            injected = true;
          }
          return observed;
        },
      );
      try {
        const before = { prod: readStores(fixture.prodPath), dev: readStores(fixture.devPath) };
        if (scenario === 'admission') {
          await rejects(
            restoration.restoreSourceAfterGateway(context),
            /source participant restoration refused/,
          );
          expect(audit.events).toEqual([]);
        }
        if (scenario === 'policy-ready') {
          await rejects(
            restoration.restoreParticipantPoliciesAfterSource(context),
            /participant policy restoration refused/,
          );
          expect(audit.policyUpdates).toEqual([]);
        }
        const solver = await restoreSolverForPreparedParticipants(context);
        expect(solver.state).toBe('solver-ready-participants-fenced');
        const backend = await restoration.restoreBackendAfterSolver(context);
        expect(backend.state).toBe('backend-ready-participants-fenced');
        const gateway = await restoration.restoreGatewayAfterBackend(context);
        expect(gateway.state).toBe('gateway-ready-participants-fenced');
        expect(gateway.readiness.observation.process.pid).toBe(50002);
        expect(runtime.readSolverStarts()).toBe(1);
        expect(fixture.source.State.Running).toBe(false);
        expect(audit.events).toEqual(['backend-start', 'gateway-start']);
        expect(
          audit.openerDeliveries.every((openers) =>
            openers.every((opener) => opener.environment === 'prod' && opener.pid === 40002),
          ),
        ).toBe(true);
        expect(audit.requests).toEqual([
          '127.0.0.1:3100 /health',
          '127.0.0.1:3100 /api/runtime/dependency-capability',
          '127.0.0.1:3200 /health',
        ]);
        console.error(
          'SOURCE_RESTORATION_REACHED: original prepare/consume/solver/backend/gateway complete; source cold and dev openers excluded',
        );
        const originalGatewayReady = structuredClone(gateway.ready);
        if (scenario === 'admission') {
          await rejects(
            restoration.restoreSourceAfterGateway({ ...context }),
            /source participant restoration refused/,
          );
          expect(audit.events).toEqual(['backend-start', 'gateway-start']);
          const originalFence = context.fencedComplete;
          await writeFile(originalFence.path, originalFence.contents + ' ');
          try {
            await rejects(
              restoration.restoreSourceAfterGateway(context),
              /source participant restoration refused/,
            );
            expect(audit.events).toEqual(['backend-start', 'gateway-start']);
            expect(await readSourceStartIntents(fixture.root)).toEqual([]);
          } finally {
            await writeFile(originalFence.path, originalFence.contents);
          }
          expect(await readFile(originalFence.path, 'utf8')).toBe(originalFence.contents);
          expect(String((await lstat(originalFence.path, { bigint: true })).ino)).toBe(
            originalFence.inode,
          );
          console.error(
            'SOURCE_RESTORATION_ADMISSION_REPAIRED: original physical fence restored before genuine continuation',
          );
        }
        if (scenario === 'selected') {
          const originalId = context.participants.selected.source.id;
          Object.assign(context.participants.selected.source, { id: context.originals.backend.id });
          try {
            await rejects(
              restoration.restoreSourceAfterGateway(context),
              /source participant restoration refused/,
            );
            expect(audit.events).toEqual(['backend-start', 'gateway-start']);
            expect(await readSourceStartIntents(fixture.root)).toEqual([]);
          } finally {
            Object.assign(context.participants.selected.source, { id: originalId });
          }
          await rejects(
            restoration.restoreSourceAfterGateway(context),
            /source participant restoration refused/,
          );
          expect(audit.events).toEqual(['backend-start', 'gateway-start']);
          expect(await readSourceStartIntents(fixture.root)).toEqual([]);
          console.error(
            'SOURCE_RESTORATION_SELECTED_REFUSED: wrong selected ID before intent/start and terminal after exact repair',
          );
          return;
        }
        if (scenario === 'released') {
          audit.release();
          await rejects(
            restoration.restoreSourceAfterGateway(context),
            /source participant restoration refused/,
          );
          expect(audit.events).toEqual(['backend-start', 'gateway-start']);
          return;
        }
        if (scenario.startsWith('record-')) {
          const path = originalGatewayReady.path;
          const held = join(fixture.root, 'held-original-gateway-ready');
          let renamed = false;
          let replacement = false;
          try {
            if (scenario === 'record-missing' || scenario === 'record-replacement') {
              await rename(path, held);
              renamed = true;
            }
            if (scenario === 'record-replacement') {
              await writeFile(path, originalGatewayReady.contents, { mode: 0o600 });
              replacement = true;
              expect(String((await lstat(path, { bigint: true })).ino)).not.toBe(
                originalGatewayReady.inode,
              );
            }
            if (scenario === 'record-unreadable') await chmod(path, 0);
            if (scenario === 'record-rebased') {
              await writeFile(path, originalGatewayReady.contents + ' ');
              Object.assign(gateway.ready, { contents: originalGatewayReady.contents + ' ' });
            }
            await rejects(
              restoration.restoreSourceAfterGateway(context),
              /source participant restoration refused/,
            );
            expect(audit.events).toEqual(['backend-start', 'gateway-start']);
          } finally {
            if (replacement) await unlink(path);
            if (renamed) await rename(held, path);
            if (scenario === 'record-unreadable') await chmod(path, 0o600);
            if (scenario === 'record-rebased') await writeFile(path, originalGatewayReady.contents);
          }
          expect(await readFile(path, 'utf8')).toBe(originalGatewayReady.contents);
          await rejects(
            restoration.restoreSourceAfterGateway(context),
            /source participant restoration refused/,
          );
          expect(audit.events).toEqual(['backend-start', 'gateway-start']);
          console.error(
            `SOURCE_RESTORATION_REFUSED: ${scenario} before start and after exact repair`,
          );
          return;
        }
        audit.fault = scenario;
        if (scenario !== 'ready' && scenario !== 'admission' && !restoresPolicies) {
          const ownership = await import('./edge-ownership');
          const retain = ownership.retainActivationRecord;
          const publication = spyOn(ownership, 'retainActivationRecord').mockImplementation(
            async (...args) => {
              const snapshot = await retain(...args);
              if (args[2] === 'participant-ready' && readFields(args[3])['role'] === 'source') {
                readyPublished = true;
                if (scenario === 'listener-after-ready') {
                  audit.listenerReplaced = true;
                  injected = true;
                  console.error(
                    'SOURCE_RESTORATION_LISTENER_PUBLISHED: actual original ready publication returned before replacement activation',
                  );
                }
                if (scenario === 'ready-missing') {
                  await unlink(snapshot.path);
                  injected = true;
                }
              }
              return snapshot;
            },
          );
          try {
            await rejects(
              restoration.restoreSourceAfterGateway(context),
              /source participant restoration refused/,
            );
            expect(audit.events).toEqual(['backend-start', 'gateway-start', 'source-start']);
            expect(audit.authoritySourceBindings.length).toBeGreaterThan(0);
            expect(audit.authoritySourceBindings.every(Boolean)).toBe(true);
            if (
              scenario === 'ready-missing' ||
              scenario === 'late-fence' ||
              scenario === 'listener-after-ready'
            ) {
              expect(readyPublished).toBe(true);
              expect(injected).toBe(true);
              if (scenario === 'listener-after-ready') {
                expect(audit.listenerReplaced).toBe(true);
                expect(audit.faults).toContain('listener-after-ready');
              }
            } else {
              expect(readyPublished).toBe(false);
              expect(audit.faults).toContain(scenario);
              if (['backend-drift', 'gateway-drift', 'solver-drift'].includes(scenario))
                expect(audit.requests.slice(3)).toHaveLength(6);
            }
            expect({
              prod: readStores(fixture.prodPath),
              dev: readStores(fixture.devPath),
            }).toEqual(before);
            console.error(
              `SOURCE_RESTORATION_REFUSED: ${scenario} reached actual new source-phase consumer`,
            );
          } finally {
            publication.mockRestore();
          }
          return;
        }
        const entry: unknown = Reflect.get(restoration, 'restoreSourceAfterGateway');
        expect(
          typeof entry,
          'missing context-only source restoration entry AFTER actual gateway completion',
        ).toBe('function');
        if (typeof entry !== 'function') throw new Error('source restoration entry absent');
        const source = await restoration.restoreSourceAfterGateway(context);
        expect(source.state).toBe('source-ready-participants-fenced');
        expect(source.controllers).toBe('fenced');
        expect(source.exposure).toBe('closed');
        expect(
          source.readiness.responses.map(({ port, path }) => `${String(port)} ${path}`),
        ).toEqual([
          '3100 /health',
          '3100 /api/runtime/dependency-capability',
          '3200 /health',
          '3300 /health/readiness',
          '4200 /',
          '4200 /src/main.tsx',
        ]);
        expect(source.readiness.observation.roles.backend.process).toMatchObject({
          pid: 60003,
          startTime: '160003',
          uid: 1000,
          cgroup: '/docker/source',
        });
        expect(source.readiness.observation.localAddresses).toContain('127.0.0.2');
        expect(audit.events).toEqual(['backend-start', 'gateway-start', 'source-start']);
        expect(audit.authoritySourceBindings.length).toBeGreaterThan(0);
        expect(audit.authoritySourceBindings.every(Boolean)).toBe(true);
        expect(audit.requests.slice(3)).toEqual([
          '127.0.0.2:3100 /health',
          '127.0.0.2:3100 /api/runtime/dependency-capability',
          '127.0.0.2:3200 /health',
          '127.0.0.2:3300 /health/readiness',
          '127.0.0.2:4200 /',
          '127.0.0.2:4200 /src/main.tsx',
        ]);
        expect(
          audit.openerDeliveries.some((openers) =>
            openers.some((opener) => opener.environment === 'dev' && opener.pid === 60003),
          ),
        ).toBe(true);
        expect(audit.raw.some((receipt) => receipt.role === 'source' && !receipt.cleanup)).toBe(
          true,
        );
        const record = readFields(readFields(JSON.parse(source.ready.contents))['record']);
        const gatewayRecord = readFields(
          readFields(JSON.parse(originalGatewayReady.contents))['record'],
        );
        expect(await readSourceStartIntents(fixture.root)).toEqual([
          {
            format: 'dependency-participant-start-intent',
            version: 1,
            restoration: gatewayRecord['restoration'],
            role: 'source',
            id: context.originals.source.id,
          },
        ]);
        expect(record).toEqual({
          format: 'dependency-participant-ready',
          version: 1,
          restoration: gatewayRecord['restoration'],
          role: 'source',
          id: context.originals.source.id,
          readinessSha256: source.readiness.sha256,
        });
        expect(await readFile(source.ready.path, 'utf8')).toBe(source.ready.contents);
        expect(await readFile(context.pending.path, 'utf8')).toBe(context.pending.contents);
        expect(await readFile(context.fencedComplete.path, 'utf8')).toBe(
          context.fencedComplete.contents,
        );
        expect({ prod: readStores(fixture.prodPath), dev: readStores(fixture.devPath) }).toEqual(
          before,
        );
        expect(fixture.source.HostConfig.RestartPolicy.Name).toBe('no');
        expect(fixture.backend.HostConfig.RestartPolicy.Name).toBe('no');
        expect(fixture.gateway.HostConfig.RestartPolicy.Name).toBe('no');
        console.error(
          'SOURCE_RESTORATION_READY: one original source start, nonempty dev backend opener, six actual HTTP responses, original stores and fenced ready publication',
        );
        if (restoresPolicies) {
          expect(context.originals.backend.policy).toEqual({
            name: 'on-failure',
            maximumRetryCount: 3,
          });
          console.error(
            'PARTICIPANT_POLICY_REACHED: genuine original source-ready closure before policy entry',
          );
          const policyEntry: unknown = Reflect.get(
            restoration,
            'restoreParticipantPoliciesAfterSource',
          );
          expect(
            typeof policyEntry,
            'missing policy continuation AFTER actual original source-ready',
          ).toBe('function');
          if (typeof policyEntry !== 'function') throw new Error('participant policy entry absent');
          if (scenario === 'policy-ready') {
            await rejects(
              restoration.restoreParticipantPoliciesAfterSource({ ...context }),
              /participant policy restoration refused/,
            );
            expect(audit.policyUpdates).toEqual([]);
          }
          if (scenario !== 'policy-ready') {
            await runPolicyRefusal(scenario, context, fixture, audit);
            expect({
              prod: readStores(fixture.prodPath),
              dev: readStores(fixture.devPath),
            }).toEqual(before);
            return;
          }
          const rawBeforePolicy = audit.raw.length;
          const policies = readFields(
            await restoration.restoreParticipantPoliciesAfterSource(context),
          );
          expect(policies['state']).toBe('participants-restored-fenced');
          expect(policies['controllers']).toBe('fenced');
          expect(policies['exposure']).toBe('closed');
          const restoredSnapshot = readFields(policies['restored']);
          const restoredPath = restoredSnapshot['path'];
          const restoredContents = restoredSnapshot['contents'];
          if (typeof restoredPath !== 'string' || typeof restoredContents !== 'string')
            throw new Error('actual restored publication absent');
          expect(await readFile(restoredPath, 'utf8')).toBe(restoredContents);
          const restoredRecord = readFields(readFields(JSON.parse(restoredContents))['record']);
          const reference = (snapshot: { path: string; contents: string }) => ({
            name: basename(snapshot.path),
            sha256: createHash('sha256').update(snapshot.contents).digest('hex'),
          });
          expect(restoredRecord['format']).toBe('dependency-participants-restored');
          expect(restoredRecord['restoration']).toEqual(record['restoration']);
          expect(restoredRecord['activated']).toEqual(context.storage.receipts);
          expect(restoredRecord['ready']).toEqual(
            [backend.ready, gateway.ready, source.ready].map(reference),
          );
          const policyRecords = await Promise.all(
            (await readdir(fixture.root))
              .filter((name) => name.endsWith('-activation-participant-policy-intent.json'))
              .sort()
              .map(async (name) => ({
                path: join(fixture.root, name),
                contents: await readFile(join(fixture.root, name), 'utf8'),
              })),
          );
          expect(restoredRecord['policies']).toEqual(policyRecords.map(reference));
          expect(restoredRecord['exposure']).toBe('closed');
          expect(restoredRecord['controllers']).toBe('fenced');

          expect(audit.policyUpdates.map(({ args }) => args)).toEqual([
            ['update', '--restart=on-failure:3', fixture.backend.Id],
            ['update', '--restart=always', fixture.gateway.Id],
            ['update', '--restart=unless-stopped', fixture.source.Id],
          ]);
          const expectedPolicies = [
            { name: 'on-failure', maximumRetryCount: 3 },
            { name: 'always', maximumRetryCount: 0 },
            { name: 'unless-stopped', maximumRetryCount: 0 },
          ];
          for (const [index, role] of ['backend', 'gateway', 'source'].entries()) {
            const readySnapshot = [backend.ready, gateway.ready, source.ready][index];
            const id = [fixture.backend.Id, fixture.gateway.Id, fixture.source.Id][index];
            expect(audit.policyUpdates[index].intents).toHaveLength(index + 1);
            expect(
              audit.policyUpdates[index].intents.filter(
                (intent) => readFields(intent)['role'] === role,
              ),
            ).toEqual([
              {
                format: 'dependency-participant-policy-intent',
                version: 1,
                ready: reference(readySnapshot),
                role,
                id,
                policySha256: createHash('sha256')
                  .update(JSON.stringify(expectedPolicies[index]))
                  .digest('hex'),
              },
            ]);
            expect(audit.policyReadbacks.some((readback) => readback.role === role)).toBe(true);
            expect(
              audit.raw
                .slice(rawBeforePolicy)
                .some(
                  (receipt) =>
                    receipt.role === role && !receipt.cleanup && receipt.policyCount === 3,
                ),
            ).toBe(true);
          }
          expect(fixture.backend.HostConfig.RestartPolicy).toEqual({
            Name: 'on-failure',
            MaximumRetryCount: 3,
          });
          expect(fixture.gateway.HostConfig.RestartPolicy).toEqual({
            Name: 'always',
            MaximumRetryCount: 0,
          });
          expect(fixture.source.HostConfig.RestartPolicy).toEqual({
            Name: 'unless-stopped',
            MaximumRetryCount: 0,
          });
          expect(audit.events).toEqual(['backend-start', 'gateway-start', 'source-start']);
          expect(runtime.readSolverStarts()).toBe(1);
          expect(audit.requests).toHaveLength(9);
          expect({ prod: readStores(fixture.prodPath), dev: readStores(fixture.devPath) }).toEqual(
            before,
          );
          expect(await readFile(context.pending.path, 'utf8')).toBe(context.pending.contents);
          expect(await readFile(context.fencedComplete.path, 'utf8')).toBe(
            context.fencedComplete.contents,
          );
          await rejects(
            restoration.restoreParticipantPoliciesAfterSource(context),
            /participant policy restoration refused/,
          );
          expect(audit.policyUpdates).toHaveLength(3);
          console.error(
            'PARTICIPANT_POLICY_READY: exact original policies and unchanged starts with actual post-policy whole observations',
          );
        }
      } finally {
        sourceReturn.mockRestore();
      }
    },
    restoresPolicies,
    deadline,
  );
}

for (const scenario of SOURCE_RESTORATION_CASES)
  test(
    scenario.name,
    () => runSourceRestorationCase(scenario.kind),
    readRestorationProfile(scenario.kind).modelMs,
  );
