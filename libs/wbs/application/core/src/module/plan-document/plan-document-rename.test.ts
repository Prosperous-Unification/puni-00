import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import * as contracts from '@wbs/contracts';
import { expect, test } from 'bun:test';

import { createConnectedBlockageRead } from '../../testing/connected-blockage.fixture';
import { workPackageConnectedDocument } from './connected-document';
import { classifyPlanDocument } from './plan-document.resource';

type CapturedBody = Omit<contracts.PlanDocumentV11, 'document' | 'typedDependencies'> & {
  [key: string]: unknown;
  document: { format: 'wbs-plan'; version: number; exportedAt: string };
  typedDependencies: unknown[];
  externalMappings?: unknown;
  connected: { placement: { stages: { boundary: { version: number } }[] } };
};
interface Capture {
  version: number;
  path: string;
  sha256: string;
  bytes: number;
}
const captures = JSON.parse(
  readFileSync(
    new URL(
      '../../../../../../../openspec/changes/wbs-work-packages/fixtures/legacy-document-captures.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as { records: Capture[] };
const sha = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
function fixture(version: 11 | 12) {
  const capture = captures.records.find((capture) => capture.version === version);
  if (capture === undefined) throw new Error('actual mounted document capture absent');
  const bytes = readFileSync(
    new URL('../../../../../../../' + capture.path, import.meta.url),
    'utf8',
  );
  expect(sha(bytes)).toBe(capture.sha256);
  expect(Buffer.byteLength(bytes)).toBe(capture.bytes);
  return { bytes, body: JSON.parse(bytes) as CapturedBody, capture };
}
function externalPredecessor(body: CapturedBody) {
  const link = body.typedDependencies.at(0) as contracts.LegacyDocumentDependency12 | undefined;
  if (link?.predecessor.kind !== 'external')
    throw new Error('pinned captured external predecessor missing');
  return link.predecessor;
}
function current14() {
  const { body } = fixture(12);
  body.document.version = 14;
  const typedDependencies = body.typedDependencies.map((entry) => {
    const link = entry as contracts.LegacyDocumentDependency12;
    const endpoint = link.predecessor;
    if (endpoint.kind === 'internal') return link;
    return {
      ...link,
      predecessor: {
        kind: 'external' as const,
        scope: endpoint.scope,
        workPackageId: endpoint.projectId,
        workItemId: endpoint.workItemId,
        ...('stepId' in endpoint ? { stepId: endpoint.stepId } : {}),
        display: {
          workPackageName: endpoint.display.projectName,
          abbreviation: endpoint.display.abbreviation,
          workItemName: endpoint.display.workItemName,
          address: endpoint.display.address,
          ...(endpoint.display.stepName === undefined
            ? {}
            : { stepName: endpoint.display.stepName }),
        },
      },
    };
  });
  return { ...body, typedDependencies };
}
test('current export versions reserve fifteen ordinary and sixteen connected', () => {
  expect(contracts.PLAN_DOCUMENT_VERSION).toBe(15);
  expect(contracts.PLAN_DOCUMENT_EXTERNAL_VERSION).toBe(16);
});
test('genuine mounted ordinary eleven imports without changing original bytes', async () => {
  const { body, bytes, capture } = fixture(11);
  const before = JSON.stringify(body);
  const classified = await classifyPlanDocument(body);
  expect(classified.ok).toBe(true);
  if (!classified.ok) throw new Error('published ordinary11 refused');
  expect(classified.value.document.version).toBe(11);
  expect(classified.value.settings.timezone).toBe(body.settings.timezone);
  expect(JSON.stringify(body)).toBe(before);
  expect(sha(bytes)).toBe(capture.sha256);
});
test('genuine mounted connected twelve projects external package identity and labels', async () => {
  const { body, bytes, capture } = fixture(12);
  const before = JSON.stringify(body);
  const endpoint = externalPredecessor(body);
  const classified = await classifyPlanDocument(body);
  expect(classified.ok).toBe(true);
  if (!classified.ok) throw new Error('published connected12 refused:' + classified.path);
  const predecessor = classified.value.typedDependencies[0]?.predecessor;
  expect(predecessor).toMatchObject({
    kind: 'external',
    workPackageId: endpoint.projectId,
    workItemId: endpoint.workItemId,
    display: { workPackageName: endpoint.display.projectName },
  });
  expect(predecessor).not.toHaveProperty('projectId');
  expect(JSON.stringify(body)).toBe(before);
  expect(sha(bytes)).toBe(capture.sha256);
});
test('published twelve import still discards untrusted read-only connected evidence', async () => {
  const { body } = fixture(12);
  for (const value of [null, { invented: 'must be ignored' }]) {
    const changed = { ...body, connected: value };
    expect((await classifyPlanDocument(changed)).ok).toBe(true);
  }
  const { connected: ignored, ...missing } = body;
  expect((await classifyPlanDocument(missing)).ok).toBe(true);
});
test('published twelve mapping validates old identities then projects only owned names', async () => {
  const { body } = fixture(12);
  const endpoint = externalPredecessor(body);
  if (endpoint.scope !== 'whole') throw new Error('pinned whole endpoint capture changed');
  const identity = {
    scope: endpoint.scope,
    projectId: endpoint.projectId,
    workItemId: endpoint.workItemId,
  };
  body.externalMappings = [{ source: identity, destination: { ...identity } }];
  const before = JSON.stringify(body);
  const classified = await classifyPlanDocument(body);
  expect(classified.ok).toBe(true);
  if (!classified.ok) throw new Error('published12 mapping refused:' + classified.path);
  expect(classified.value.externalMappings).toEqual([
    {
      source: {
        scope: identity.scope,
        workPackageId: identity.projectId,
        workItemId: identity.workItemId,
      },
      destination: {
        scope: identity.scope,
        workPackageId: identity.projectId,
        workItemId: identity.workItemId,
      },
    },
  ]);
  expect(JSON.stringify(body)).toBe(before);
});
test('published twelve refuses mixed old and renamed external leaf spellings', async () => {
  for (const field of ['identity', 'display', 'mapping'] as const) {
    const { body } = fixture(12);
    const endpoint = externalPredecessor(body);
    if (field === 'identity') Reflect.set(endpoint, 'workPackageId', endpoint.projectId);
    else if (field === 'display')
      Reflect.set(endpoint.display, 'workPackageName', endpoint.display.projectName);
    else
      body.externalMappings = [
        {
          source: {
            scope: endpoint.scope,
            projectId: endpoint.projectId,
            workPackageId: endpoint.projectId,
            workItemId: endpoint.workItemId,
          },
          destination: {
            scope: endpoint.scope,
            projectId: endpoint.projectId,
            workItemId: endpoint.workItemId,
          },
        },
      ];
    const refused = await classifyPlanDocument(body);
    expect(refused).toMatchObject({ ok: false, code: 'invalid_typed_dependency' });
    if (refused.ok) throw new Error('mixed12 leaf accepted');
    expect(
      refused.path.startsWith(
        field === 'mapping' ? 'externalMappings[0].source' : 'typedDependencies[0].predecessor',
      ),
    ).toBe(true);
  }
});
test('ordinary thirteen imports local content and retains measures-era semantics', async () => {
  const { body } = fixture(11);
  body.document.version = 13;
  body.settings.budgetFactor = 1.5;
  const classified = await classifyPlanDocument(body);
  expect(classified.ok).toBe(true);
  if (!classified.ok) throw new Error('ordinary13 refused');
  expect(classified.value.settings.budgetFactor).toBe(1.5);
  expect(classified.value.document.version).toBe(13);
});
test('ordinary thirteen cannot acquire connected endpoint or mapping behavior', async () => {
  const body = current14();
  body.document.version = 13;
  expect(await classifyPlanDocument(body)).toMatchObject({
    ok: false,
    code: 'invalid_typed_dependency',
  });
  const { body: ordinary } = fixture(11);
  ordinary.document.version = 13;
  ordinary.externalMappings = [
    {
      source: { scope: 'whole', workPackageId: 'remote', workItemId: 'row' },
      destination: { scope: 'whole', workPackageId: 'remote', workItemId: 'row' },
    },
  ];
  expect(await classifyPlanDocument(ordinary)).toMatchObject({
    ok: false,
    code: 'invalid_typed_dependency',
    path: 'externalMappings',
  });
});
test('connected fourteen accepts only current external leaf vocabulary', async () => {
  const body = current14();
  const before = JSON.stringify(body);
  const classified = await classifyPlanDocument(body);
  expect(classified.ok).toBe(true);
  if (!classified.ok) throw new Error('connected14 refused');
  expect(classified.value.typedDependencies[0]?.predecessor).toMatchObject(
    externalPredecessor(body),
  );
  expect(JSON.stringify(body)).toBe(before);
  const mixed = structuredClone(body);
  const predecessor = mixed.typedDependencies[0].predecessor;
  if (!('workPackageId' in predecessor)) throw new Error('current external fixture missing');
  Reflect.set(predecessor, 'projectId', predecessor.workPackageId);
  expect(await classifyPlanDocument(mixed)).toMatchObject({
    ok: false,
    code: 'invalid_typed_dependency',
  });
});
test('unknown document version still precedes field-specific refusal', async () => {
  const { body } = fixture(12);
  body.document.version = 17;
  Reflect.set(body.workItems[0], 'priority', 'high');
  expect(await classifyPlanDocument(body)).toEqual({
    ok: false,
    code: 'unsupported_version',
    path: 'document.version',
  });
});
test('frozen ten strict shape accepts old fields and rejects the later embedded budget factor', async () => {
  const { body } = fixture(11);
  body.document.version = 10;
  Reflect.deleteProperty(body.settings, 'budgetFactor');
  for (const key of ['measureDefinitions', 'measureFacts', 'measureEstimates', 'budgets'])
    Reflect.deleteProperty(body, key);
  const schema = contracts.requestSchema(contracts.createPlanDocumentV10());
  expect((await contracts.validateSchema(schema, body)).issues).toBeUndefined();
  body.project.budgetFactor = 2;
  expect((await contracts.validateSchema(schema, body)).issues).toBeDefined();
});

test('current connected document boundary declares renamed canonical packet version two', () => {
  const captured = createConnectedBlockageRead('clear');
  const exported = workPackageConnectedDocument(captured, 'C');
  expect(exported.connected.placement.kind).toBe('scheduled');
  if (exported.connected.placement.kind !== 'scheduled')
    throw new Error('actual connected capture not scheduled');
  expect(exported.connected.placement.stages.length).toBeGreaterThan(0);
  for (const selection of exported.connected.placement.stages) {
    expect(selection.boundary.version).toBe(2);
    expect(selection.boundary.format).toBe('wbs-connected-stage');
    const packet = JSON.parse(selection.boundary.canonical) as Record<string, unknown>;
    expect(packet['workPackageId']).toBe(selection.workPackageId);
    expect('projectId' in packet).toBe(false);
  }
  const { body } = fixture(12);
  expect(body.connected.placement.stages.length).toBeGreaterThan(0);
  for (const stage of body.connected.placement.stages) expect(stage.boundary.version).toBe(1);
});
test('frozen eleven strict response preserves the original mounted writer shape', async () => {
  const { body } = fixture(11);
  const schema = contracts.requestSchema(contracts.createLegacyPlanDocumentV11());
  expect((await contracts.validateSchema(schema, body)).issues).toBeUndefined();
  const mixed = structuredClone(body);
  Reflect.set(mixed, 'work_package', mixed.project);
  expect((await contracts.validateSchema(schema, mixed)).issues).toBeDefined();
});

for (const version of [1, 2, 3])
  for (const hint of ['projectId', 'workPackageId'])
    test(
      'legacy ' +
        String(version) +
        ' refuses isolated external ' +
        hint +
        ' hint before ignored typed fields',
      async () => {
        const { body } = fixture(11);
        body.document.version = version;
        if (version === 1) for (const step of body.steps) delete step.allowancePercent;
        body.typedDependencies = [
          {
            id: 'old-hint',
            type: 'FS',
            predecessor: { scope: 'whole', workItem: 'a', [hint]: 'foreign' },
            successor: { scope: 'whole', workItem: 'b' },
          },
        ];
        const before = JSON.stringify(body);
        expect(await classifyPlanDocument(body)).toEqual({
          ok: false,
          code: 'invalid_typed_dependency',
          path: 'typedDependencies[0]',
        });
        expect(JSON.stringify(body)).toBe(before);
      },
    );
test('legacy one through three still ignore purely local typed dependency hints', async () => {
  for (const version of [1, 2, 3]) {
    const { body } = fixture(11);
    body.document.version = version;
    if (version === 1) for (const step of body.steps) delete step.allowancePercent;
    body.typedDependencies = [
      {
        id: 'local',
        type: 'FS',
        predecessor: { scope: 'whole', workItem: 'a' },
        successor: { scope: 'whole', workItem: 'b' },
      },
    ];
    const classified = await classifyPlanDocument(body);
    expect(classified.ok).toBe(true);
    if (!classified.ok) throw new Error('intentional legacy-local ignore refused');
    expect(classified.value.typedDependencies).toEqual([]);
  }
});

for (const version of [15, 16] as const) {
  test(
    'current ' + String(version) + ' imports writable facts without choosing its read-only project',
    async () => {
      const body = version === 16 ? current14() : fixture(11).body;
      body.document.version = version;
      Reflect.set(body, 'project', { id: 'foreign-read-only', name: 'Ignored source project' });
      Reflect.set(body, 'workPackage', { projectId: 'foreign-read-only' });
      const before = JSON.stringify(body);
      const classified = await classifyPlanDocument(body);
      expect(classified.ok).toBe(true);
      if (!classified.ok) throw new Error('current document refused: ' + classified.path);
      expect(classified.value.document.version).toBe(version);
      expect(classified.value).not.toHaveProperty('project');
      expect(classified.value).not.toHaveProperty('workPackage');
      expect(JSON.stringify(body)).toBe(before);
      if (version === 16)
        expect(classified.value.typedDependencies[0]?.predecessor).toMatchObject(
          externalPredecessor(body),
        );
    },
  );
}
