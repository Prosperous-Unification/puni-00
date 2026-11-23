import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import * as domain from '@wbs/domain';
import { openMemorySourceFixture } from '@wbs/store-memory/source';
import { expect, test } from 'bun:test';

import type { ConnectedOptimizedCapturedAdapter } from '../../ports/scheduler';
import type { ConnectedPlanCapture } from '../../service/connected-plan-values';
import {
  connectedCapture,
  connectedRead,
  connectedReads,
} from '../../testing/connected-plan-fixture';
import { seedLegacyPackageParent } from '../../testing/legacy-package-source-fixture';
import { fastScheduler } from '../../testing/scheduler-fixture';
import { installSavedPlans } from './check';
import { captureConnectedHistory } from './connected-history';
import { compareSavedPlanMeaning } from './plan-comparison-meaning';
import { schedulePlanInput } from './saved-plan-schedule';

type Kind = 'local' | 'connected' | 'ready' | 'certificate';
interface Artifact {
  path: string;
  sha256: string;
  bytes: number;
  version: number;
}
interface Capture {
  kind: Kind;
  target: string;
  input: Artifact;
  schedule: Artifact & { algorithmId: string };
}
interface Side {
  target: string;
  inputVersion: number;
  inputBytes: string;
  scheduleVersion: number;
  scheduleBytes: string;
  algorithmId: string;
}
const manifest = JSON.parse(
  readFileSync(
    new URL(
      '../../../../../../../openspec/changes/wbs-work-packages/fixtures/legacy-comparison-captures.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as { records: Capture[] };
const sha = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
function load(artifact: Artifact) {
  const bytes = readFileSync(
    new URL('../../../../../../../' + artifact.path, import.meta.url),
    'utf8',
  );
  expect(sha(bytes)).toBe(artifact.sha256);
  expect(Buffer.byteLength(bytes)).toBe(artifact.bytes);
  return bytes;
}
function legacy(kind: Kind): Side {
  const capture = manifest.records.find((capture) => capture.kind === kind);
  if (capture === undefined) throw new Error('paired legacy capture absent:' + kind);
  return {
    target: capture.target,
    inputVersion: capture.input.version,
    inputBytes: load(capture.input),
    scheduleVersion: capture.schedule.version,
    scheduleBytes: load(capture.schedule),
    algorithmId: capture.schedule.algorithmId,
  };
}
interface Options {
  budget?: number;
  quantum?: number;
  wire?: number;
  solver?: string;
  objective?: 'time' | 'pri';
  duration?: number;
  empty?: boolean;
  reverseRanks?: boolean;
}
function current(kind: Kind, options: Options = {}): Side {
  if (kind === 'local') {
    const reads = connectedReads('P');
    const input = domain.canonicalisePlanInputV13(domain.planInputRowsOf(reads), reads.leafSteps, {
      kind: 'local',
    });
    const body = domain.buildScheduleBody(
      schedulePlanInput(reads),
      reads.workPackage.startDate,
      domain.SCHEDULE_ALGORITHM_ID,
    );
    return {
      target: 'P',
      inputVersion: 13,
      inputBytes: JSON.stringify(input),
      scheduleVersion: 3,
      scheduleBytes: JSON.stringify(body),
      algorithmId: body.algorithmId,
    };
  }
  const initial = connectedCapture();
  const capture: ConnectedPlanCapture = {
    ...initial,
    relationships: options.empty ? [] : initial.relationships,
    workPackages: initial.workPackages.map((member) => ({
      ...member,
      rank: options.reverseRanks ? 1 - member.rank : member.rank,
      reads: {
        ...member.reads,
        workItems: options.empty ? [] : member.reads.workItems,
        leafSteps: options.empty ? [] : member.reads.leafSteps,
        workPackage: {
          ...member.reads.workPackage,
          optimizationEnabled: kind !== 'connected',
          scheduleEngine: kind === 'ready' ? 'optimized' : 'fast',
          scheduleObjective: kind === 'ready' ? (options.objective ?? 'time') : 'pri',
        },
        estimates: options.empty
          ? []
          : member.reads.estimates.map((estimate) => ({
              ...estimate,
              optimistic: options.duration ?? estimate.optimistic,
              realistic: options.duration ?? estimate.realistic,
              pessimistic: options.duration ?? estimate.pessimistic,
            })),
      },
    })),
  };
  const adapter: ConnectedOptimizedCapturedAdapter = {
    readConnectedCaptured: ({ stage }) => {
      const question = {
        workPackageId: stage.workPackageId,
        inputHash: 'new-' + stage.workPackageId,
        questionHash: 'new-question-' + stage.workPackageId,
        objective: 'time' as const,
        contractVersion: '19+' + (options.solver ?? '0.4.0'),
        budgetMs: options.budget ?? 100,
        quantum: options.quantum ?? 48,
        wireVersion: options.wire ?? 5,
        stageBytes: domain.canonicalConnectedStageInput(stage),
      };
      const key = domain.sliceKey(stage.workPackageId.toLowerCase(), 'build');
      const start = stage.starts.get(key);
      if (start === undefined) throw new Error('actual own-stage baseline absent');
      return {
        inputHash: question.inputHash,
        generation: kind === 'ready' ? 7 : null,
        contractVersion: question.contractVersion,
        budgetMs: question.budgetMs,
        quantum: question.quantum,
        wireVersion: question.wireVersion,
        variants: {
          pri:
            kind === 'ready'
              ? { state: 'idle' }
              : {
                  state: 'plan-infeasible',
                  items: [
                    {
                      ownerWorkItemId: stage.workPackageId.toLowerCase(),
                      boundWorkItemId: stage.workPackageId.toLowerCase(),
                      effectiveDeadlineOffset: 0,
                    },
                  ],
                },
          time:
            kind === 'ready'
              ? { state: 'ready', proof: 'proven' }
              : {
                  state: 'boundary-infeasible',
                  certificate: {
                    kind: 'boundary-infeasible',
                    question,
                    evidence: 'contradictory-bounds',
                  },
                },
        },
        candidates: {
          pri: null,
          time: kind === 'ready' ? { question, starts: new Map([[key, start]]) } : null,
        },
      };
    },
  };
  const live = connectedRead(
    capture,
    { supports: () => kind !== 'connected' },
    domain.scheduleResolved,
    kind === 'connected' ? null : adapter,
  );
  const prepared = captureConnectedHistory(live, 'B');
  if (!prepared.schedule.present) throw new Error('fresh connected capture absent');
  return {
    target: 'B',
    inputVersion: prepared.input.schemaVersion,
    inputBytes: JSON.stringify(prepared.input),
    scheduleVersion: 4,
    scheduleBytes: JSON.stringify(prepared.schedule.body),
    algorithmId: prepared.schedule.body.algorithmId,
  };
}
async function compare(left: Side, right: Side) {
  expect(right.target).toBe(left.target);
  const parentFixture = openMemorySourceFixture();
  const source = parentFixture.source;
  await source.stores.users.create(
    { id: 'owner', username: 'owner', passwordHash: null, createdAt: 0 },
    { by: 'owner', at: 0 },
  );
  seedLegacyPackageParent(parentFixture, {
    organizationId: 'comparison-legacy',
    projectId: 'comparison-parent',
    creator: 'owner',
  });
  await source.stores.workPackages.create(
    {
      id: left.target,
      name: 'Current rows are irrelevant',
      projectId: 'comparison-parent',
      restricted: false,
      estimateMethod: 'pert',
      depReach: 'whole-item',
      pertWeights: { optimistic: 1, realistic: 4, pessimistic: 1 },
      estimateRounding: 'ceil',
      startDate: null,
      solutionRef: null,
      revision: 0,
      createdAt: 0,
    },
    [],
    { by: 'owner', at: 0 },
  );
  for (const [id, side] of [
    ['left', left],
    ['right', right],
  ] as const)
    expect(
      await source.history.savedPlans.write(
        {
          id,
          workPackageId: side.target,
          name: id,
          createdBy: 'owner',
          createdById: 'owner',
          createdAt: 0,
          input: {
            schemaVersion: side.inputVersion,
            bytes: side.inputBytes,
            sha256: sha(side.inputBytes),
          },
          schedule: {
            present: true,
            body: {
              schemaVersion: side.scheduleVersion,
              bytes: side.scheduleBytes,
              sha256: sha(side.scheduleBytes),
            },
            inputSha256: sha(side.inputBytes),
            algorithmId: side.algorithmId,
          },
        },
        () => Promise.resolve(null),
      ),
    ).toEqual({ outcome: 'written' });
  const allowed = new Set([
    left.inputBytes,
    left.scheduleBytes,
    right.inputBytes,
    right.scheduleBytes,
  ]);
  let hashes = 0;
  const { savedPlans } = installSavedPlans({
    plans: source.history.savedPlans,
    capture: {
      readPlanInput: () => {
        throw new Error('comparison must not recapture');
      },
    },
    digest: {
      sha256: (bytes) => {
        expect(allowed.has(bytes)).toBe(true);
        hashes++;
        return Promise.resolve(sha(bytes));
      },
    },
    newId: () => {
      throw new Error('comparison must not invoke current writer');
    },
    now: () => {
      throw new Error('comparison must not read clock');
    },
    scheduler: {
      ...fastScheduler,
      read: () => {
        throw new Error('comparison must not schedule');
      },
    },
  });
  const before = [
    await source.history.savedPlans.readOf('left'),
    await source.history.savedPlans.readOf('right'),
  ];
  const compared = await savedPlans.compare(
    left.target,
    { kind: 'saved', savedPlanId: 'left' },
    { kind: 'saved', savedPlanId: 'right' },
  );
  expect(hashes).toBe(4);
  expect([
    await source.history.savedPlans.readOf('left'),
    await source.history.savedPlans.readOf('right'),
  ]).toEqual(before);
  return compared;
}
for (const kind of ['local', 'connected', 'ready', 'certificate'] as const)
  test(
    'actual ' +
      kind +
      ' old and renamed captured meanings compare equal with distinct original provenance',
    async () => {
      const old = legacy(kind);
      const fresh = current(kind);
      const oldBytes = old.scheduleBytes;
      const freshBytes = fresh.scheduleBytes;
      const compared = await compare(old, fresh);
      expect(compared.outcome).toBe('compared');
      if (compared.outcome !== 'compared') throw new Error('compatible pair refused');
      expect(compared.diff).toEqual({ input: [], schedule: [] });
      expect(compared.left.provenance.kind).toBe(kind === 'local' ? 'legacy-unknown' : 'connected');
      expect(compared.right.provenance.kind).toBe(kind === 'local' ? 'local' : 'connected');
      if (
        compared.left.provenance.kind === 'connected' &&
        compared.right.provenance.kind === 'connected'
      ) {
        const original = JSON.parse(oldBytes) as {
          connection: { stages: { stageBytes: string }[] };
        };
        const next = JSON.parse(freshBytes) as { connection: { stages: { stageBytes: string }[] } };
        expect(compared.left.provenance.stages.map((stage) => stage.boundary.canonical)).toEqual(
          original.connection.stages.map((stage) => stage.stageBytes),
        );
        expect(compared.right.provenance.stages.map((stage) => stage.boundary.canonical)).toEqual(
          next.connection.stages.map((stage) => stage.stageBytes),
        );
      }
      const reversed = await compare(fresh, old);
      expect(reversed.outcome).toBe('compared');
      if (reversed.outcome !== 'compared') throw new Error('reversed compatible pair refused');
      expect(reversed.diff).toEqual({ input: [], schedule: [] });
      expect(old.scheduleBytes).toBe(oldBytes);
      expect(fresh.scheduleBytes).toBe(freshBytes);
    },
  );
for (const [field, value] of [
  ['budget', 101],
  ['quantum', 96],
  ['wire', 6],
  ['solver', '0.5.0'],
  ['objective', 'pri'],
  ['duration', 2],
] as const)
  test('cross-format comparison retains changed ' + field + ' meaning', async () => {
    const compared = await compare(legacy('ready'), current('ready', { [field]: value }));
    expect(compared.outcome).toBe('compared');
    if (compared.outcome !== 'compared') throw new Error('valid changed meaning refused');
    expect(compared.diff.input.length + compared.diff.schedule.length).toBeGreaterThan(0);
  });
test('cross-format comparison retains changed algorithm and unknown added schedule fields', async () => {
  for (const field of ['algorithm', 'unknown'] as const) {
    const side = current('connected');
    const body = JSON.parse(side.scheduleBytes) as Record<string, unknown>;
    if (field === 'algorithm') {
      side.algorithmId = 'different-semantic-engine';
      body['algorithmId'] = side.algorithmId;
    } else body['unrecognizedScheduleFact'] = 'must remain compared';
    side.scheduleBytes = JSON.stringify(body);
    const compared = await compare(legacy('connected'), side);
    expect(compared.outcome).toBe('compared');
    if (compared.outcome !== 'compared') throw new Error('valid changed field refused');
    expect(
      compared.diff.schedule.some((change) =>
        change.path.includes(field === 'algorithm' ? 'algorithmId' : 'unrecognizedScheduleFact'),
      ),
    ).toBe(true);
  }
});
for (const field of ['inputHash', 'questionHash', 'stageBytes'] as const)
  test('same-format comparison retains ' + field + ' identity changes', async () => {
    const left = current('ready');
    const right = { ...left };
    const body = JSON.parse(right.scheduleBytes) as {
      connection: {
        stages: {
          stageBytes: string;
          observation: { inputHash: string };
          variants: {
            time: {
              state: 'ready';
              candidate: {
                question: { inputHash: string; questionHash: string; stageBytes: string };
              };
            };
          };
        }[];
      };
    };
    const stage = body.connection.stages[0];
    const question = stage.variants.time.candidate.question;
    if (field === 'inputHash') {
      stage.observation.inputHash = 'different-input';
      question.inputHash = 'different-input';
    } else if (field === 'questionHash') question.questionHash = 'different-question';
    else {
      stage.stageBytes += ' ';
      question.stageBytes = stage.stageBytes;
    }
    right.scheduleBytes = JSON.stringify(body);
    const compared = await compare(left, right);
    expect(compared.outcome).toBe('compared');
    if (compared.outcome !== 'compared') throw new Error('valid identity change refused');
    expect(compared.diff.schedule.some((change) => change.path.includes(field))).toBe(true);
  });
test('cross-format comparison retains decoded canonical boundary constraints', async () => {
  const side = current('ready');
  const body = JSON.parse(side.scheduleBytes) as {
    connection: {
      stages: {
        stageBytes: string;
        variants: { time: { candidate: { question: { stageBytes: string } } } };
      }[];
    };
  };
  const stage = body.connection.stages[0];
  const packet = JSON.parse(stage.stageBytes) as { deadlines: [string, number][] };
  packet.deadlines = [['a', 100]];
  stage.stageBytes = JSON.stringify(packet);
  stage.variants.time.candidate.question.stageBytes = stage.stageBytes;
  side.scheduleBytes = JSON.stringify(body);
  const compared = await compare(legacy('ready'), side);
  expect(compared.outcome).toBe('compared');
  if (compared.outcome !== 'compared') throw new Error('valid changed packet refused');
  expect(compared.diff.schedule.some((change) => change.path.includes('stageBytes'))).toBe(true);
});

test('production meaning boundary throws for missing and unknown projected schedule state', () => {
  const side = current('local');
  const projected = domain.projectSavedPlanInput(JSON.parse(side.inputBytes), side.inputVersion);
  const schedule: unknown = JSON.parse(side.scheduleBytes);
  const valid: domain.PlanSide = {
    ...projected,
    comparison: { kind: 'captured' },
    schedule: {
      present: true,
      algorithmId: side.algorithmId,
      // current(local) serialized the finite schedule produced by buildScheduleBody above.
      body: schedule as domain.PlanScheduleValue,
    },
  };
  for (const body of [null, 'missing-object', {}] as const)
    expect(() =>
      compareSavedPlanMeaning(
        {
          ...valid,
          schedule: { ...valid.schedule, present: true, algorithmId: side.algorithmId, body },
        },
        valid,
      ),
    ).toThrow(
      body === null || typeof body === 'string' ? 'comparison_shape' : 'comparison_version',
    );
  expect(() =>
    compareSavedPlanMeaning(
      {
        ...valid,
        schedule: { present: true, algorithmId: side.algorithmId, body: { version: 5 } },
      },
      valid,
    ),
  ).toThrow('comparison_version');
});

type Mutable<T> = T extends object ? { -readonly [Key in keyof T]: Mutable<T[Key]> } : T;
function changeContract(side: Side, contract: string): Side {
  const body = JSON.parse(side.scheduleBytes) as Mutable<domain.SavedConnectedScheduleBody>;
  for (const stage of body.connection.stages) {
    if (stage.observation !== null) stage.observation.contractVersion = contract;
    if (stage.variants !== null)
      for (const variant of [stage.variants.pri, stage.variants.time]) {
        if (variant.state === 'ready') variant.candidate.question.contractVersion = contract;
        if (variant.state === 'boundary-infeasible')
          variant.certificate.question.contractVersion = contract;
      }
  }
  return { ...side, scheduleBytes: JSON.stringify(body) };
}
test('same-format eighteen-to-nineteen contracts remain an observable difference', async () => {
  const fresh = current('ready');
  const changed = changeContract(fresh, '18+0.4.0');
  const compared = await compare(changed, fresh);
  expect(compared.outcome).toBe('compared');
  if (compared.outcome !== 'compared') throw new Error('same-format contract control refused');
  expect(compared.diff.schedule.some((change) => change.path.endsWith('contractVersion'))).toBe(
    true,
  );
});
test('cross-format contract prefixes outside eighteen-to-nineteen remain different', async () => {
  const fresh = changeContract(current('ready'), '20+0.4.0');
  const compared = await compare(legacy('ready'), fresh);
  expect(compared.outcome).toBe('compared');
  if (compared.outcome !== 'compared') throw new Error('nonrename contract control refused');
  expect(compared.diff.schedule.some((change) => change.path.endsWith('contractVersion'))).toBe(
    true,
  );
});
test('missing counterpart retains the original unmatched stage identity', async () => {
  const old = legacy('connected');
  const fresh = current('connected', { empty: true });
  const compared = await compare(old, fresh);
  expect(compared.outcome).toBe('compared');
  if (compared.outcome !== 'compared') throw new Error('empty component control refused');
  const missing = compared.diff.schedule.find(
    (change) => change.path === 'schedule.body.connection.stages[0]',
  );
  expect(missing).toBeDefined();
  const original = JSON.parse(old.scheduleBytes) as {
    connection: { stages: Record<string, unknown>[] };
  };
  const { projectId, ...stage } = original.connection.stages[0];
  expect(missing?.left).toEqual({ ...stage, workPackageId: projectId });
  expect(missing?.right).toBeUndefined();
});
test('different counterpart owner keeps original packet spelling in comparison', async () => {
  const old = legacy('connected');
  const fresh = current('connected', { reverseRanks: true });
  const compared = await compare(old, fresh);
  expect(compared.outcome).toBe('compared');
  if (compared.outcome !== 'compared') throw new Error('ranked owner control refused');
  const packet = compared.diff.schedule.find(
    (change) => change.path === 'schedule.body.connection.stages[0].stageBytes',
  );
  expect(packet).toBeDefined();
  const original = JSON.parse(old.scheduleBytes) as {
    connection: { stages: { stageBytes: string }[] };
  };
  expect(packet?.left).toBe(original.connection.stages[0].stageBytes);
  expect(typeof packet?.right).toBe('string');
});

/** Independently run the actual connected pipeline; leaf step order differs from identity-set ordering. */
function currentIdentityOrder(stepId: string): domain.PlanSide {
  const reads = (id: string): ReturnType<typeof connectedReads> => {
    const original = connectedReads(id);
    const step = original.steps.at(0),
      workItem = original.workItems.at(0);
    if (step === undefined || workItem === undefined)
      throw new Error('Existing connected fixture facts are absent');
    return {
      ...original,
      steps: [
        { ...step, id: 'm-retained', code: 'retained', name: 'Retained', position: 0 },
        { ...step, id: stepId, code: 'alias', name: 'Alias', position: 1 },
      ],
      leafSteps: [{ workItemId: workItem.id, stepIds: ['m-retained', stepId] }],
      estimates: ['m-retained', stepId].map((selectedId) => ({
        workItemId: workItem.id,
        stepId: selectedId,
        optimistic: 1,
        realistic: 1,
        pessimistic: 1,
      })),
    };
  };
  const capture = connectedCapture(reads('A'), reads('B'));
  const live = connectedRead(capture, { supports: () => false }, domain.scheduleResolved, null);
  const prepared = captureConnectedHistory(live, 'B');
  if (!prepared.schedule.present)
    throw new Error('Actual connected ordering capture was not scheduled');
  const schedule = domain.readSavedConnectedScheduleBody(prepared.schedule.body);
  return {
    ...domain.projectSavedPlanInput(prepared.input, prepared.input.schemaVersion),
    comparison: { kind: 'captured' },
    schedule: {
      present: true,
      algorithmId: schedule.algorithmId,
      // Boundary: the actual captured schedule and frozen reader established this complete JSON body.
      body: schedule as unknown as domain.PlanScheduleValue,
    },
  };
}

for (const part of ['input', 'schedule'] as const)
  test(
    'step-resolved connected ' +
      part +
      ' canonicalizes identity-keyed sets while preserving workflow and stage order',
    () => {
      const old = currentIdentityOrder('z-old'),
        fresh = currentIdentityOrder('a-new');
      const dependencies = old.inputEvidence.dependencies,
        other = fresh.inputEvidence.dependencies;
      if (
        dependencies.kind !== 'recorded' ||
        dependencies.history.kind !== 'connected' ||
        other.kind !== 'recorded' ||
        other.history.kind !== 'connected'
      )
        throw new Error('Actual connected history was not captured');
      expect(
        dependencies.history.graph.nodes
          .filter((node) => node.kind === 'step' && node.ref.workItemId === 'a')
          .map((node) => (node.kind === 'step' ? node.ref.stepId : null)),
      ).toEqual(['m-retained', 'z-old']);
      expect(
        other.history.graph.nodes
          .filter((node) => node.kind === 'step' && node.ref.workItemId === 'a')
          .map((node) => (node.kind === 'step' ? node.ref.stepId : null)),
      ).toEqual(['a-new', 'm-retained']);
      const before = JSON.stringify([old, fresh]);
      const identity: domain.StepIdentityRead = {
        kind: 'catalogue',
        aliases: [{ oldStepId: 'z-old', stepId: 'a-new' }],
      };
      const left = domain.projectSavedStepIdentity(old, identity),
        right = domain.projectSavedStepIdentity(fresh, identity);
      if (
        left.comparison.kind !== 'step-resolved' ||
        left.comparison.schedule.kind !== 'connected' ||
        right.comparison.kind !== 'step-resolved' ||
        right.comparison.schedule.kind !== 'connected'
      )
        throw new Error('Connected identity meaning was not constructed');
      expect(
        left.comparison.schedule.body.connection.stages.map((stage) => stage.workPackageId),
      ).toEqual(['A', 'B']);
      for (const stage of left.comparison.schedule.body.connection.stages)
        for (const row of stage.stage.slices)
          expect(row.steps.map((step) => step.stepId)).toEqual(['m-retained', 'a-new']);
      const diff = compareSavedPlanMeaning(left, right);
      expect(diff[part]).toEqual([]);
      expect(JSON.stringify([old, fresh])).toBe(before);
    },
  );

function identityPacket(side: Side): domain.PlanSide {
  const body = domain.readSavedConnectedScheduleBody(JSON.parse(side.scheduleBytes));
  return {
    ...domain.projectSavedPlanInput(JSON.parse(side.inputBytes), side.inputVersion),
    comparison: { kind: 'captured' },
    schedule: {
      present: true,
      algorithmId: side.algorithmId,
      // Boundary: the strict frozen reader validated the complete finite JSON body above.
      body: body as unknown as domain.PlanScheduleValue,
    },
  };
}

for (const field of ['inputHash', 'questionHash'] as const)
  test(
    'step-resolved connected same-old-id packets retain ' +
      field +
      '-only differences under a relevant roster',
    () => {
      const original = current('ready');
      // Test boundary: this actual ready capture is modified only in the explicitly selected digest metadata below.
      const body = JSON.parse(original.scheduleBytes) as {
        connection: {
          stages: {
            observation: { inputHash: string } | null;
            variants: {
              time: {
                state: string;
                candidate: { question: { inputHash: string; questionHash: string } };
              };
            } | null;
          }[];
        };
      };
      const stage = body.connection.stages.at(0);
      if (stage === undefined) throw new Error('Actual first ready stage is absent');
      if (stage.observation === null || stage.variants?.time.state !== 'ready')
        throw new Error('Actual first ready stage is absent');
      if (field === 'inputHash') {
        stage.observation.inputHash = 'changed-input-only';
        stage.variants.time.candidate.question.inputHash = 'changed-input-only';
      } else stage.variants.time.candidate.question.questionHash = 'changed-question-only';
      const changed = { ...original, scheduleBytes: JSON.stringify(body) };
      const leftPacket = identityPacket(original),
        rightPacket = identityPacket(changed);
      if (!leftPacket.schedule.present || !rightPacket.schedule.present)
        throw new Error('Captured ready schedules are absent');
      const before = JSON.stringify([leftPacket, rightPacket]);
      const identity: domain.StepIdentityRead = {
        kind: 'catalogue',
        aliases: [{ oldStepId: 'build', stepId: 'resolved-build' }],
      };
      const left = domain.projectSavedStepIdentity(leftPacket, identity),
        right = domain.projectSavedStepIdentity(rightPacket, identity);
      if (
        left.comparison.kind !== 'step-resolved' ||
        left.comparison.schedule.kind !== 'connected' ||
        right.comparison.kind !== 'step-resolved' ||
        right.comparison.schedule.kind !== 'connected'
      )
        throw new Error('Relevant roster was not applied to connected packets');
      expect(left.comparison.schedule.body.connection.stages[0]?.hasResolvedIdentity).toBe(true);
      expect(right.comparison.schedule.body.connection.stages[0]?.hasResolvedIdentity).toBe(true);
      const diff = compareSavedPlanMeaning(left, right);
      expect(diff.input).toEqual([]);
      expect(diff.schedule.some((change) => change.path.endsWith('.' + field))).toBe(true);
      expect(JSON.stringify([leftPacket, rightPacket])).toBe(before);
    },
  );

test('step-resolved connected same-old-id packets retain whitespace-only packet differences under a relevant roster', () => {
  const original = current('ready');
  // Test boundary: keep every digest/configuration/value while changing only the retained packet spelling.
  const body = JSON.parse(original.scheduleBytes) as {
    connection: {
      stages: {
        stageBytes: string;
        observation: { inputHash: string } | null;
        variants: {
          time: {
            state: string;
            candidate: {
              question: { inputHash: string; questionHash: string; stageBytes: string };
            };
          };
        } | null;
      }[];
    };
  };
  const stage = body.connection.stages.at(0);
  if (stage === undefined) throw new Error('Actual first ready stage is absent');
  if (stage.observation === null || stage.variants?.time.state !== 'ready')
    throw new Error('Actual first ready stage is absent');
  const originalPacket = stage.stageBytes,
    originalObservation = stage.observation.inputHash;
  const originalQuestion = { ...stage.variants.time.candidate.question };
  stage.stageBytes += ' ';
  stage.variants.time.candidate.question.stageBytes = stage.stageBytes;
  const changed = { ...original, scheduleBytes: JSON.stringify(body) };
  const leftPacket = identityPacket(original),
    rightPacket = identityPacket(changed);
  if (!leftPacket.schedule.present || !rightPacket.schedule.present)
    throw new Error('Captured ready schedules are absent');
  const before = JSON.stringify([leftPacket, rightPacket]);
  expect(domain.readSavedCanonicalStage('connected-stage-v2', originalPacket)).toEqual(
    domain.readSavedCanonicalStage('connected-stage-v2', stage.stageBytes),
  );
  expect(stage.observation.inputHash).toBe(originalObservation);
  expect(stage.variants.time.candidate.question).toEqual({
    ...originalQuestion,
    stageBytes: originalPacket + ' ',
  });
  const identity: domain.StepIdentityRead = {
    kind: 'catalogue',
    aliases: [{ oldStepId: 'build', stepId: 'resolved-build' }],
  };
  const left = domain.projectSavedStepIdentity(leftPacket, identity),
    right = domain.projectSavedStepIdentity(rightPacket, identity);
  if (
    left.comparison.kind !== 'step-resolved' ||
    left.comparison.schedule.kind !== 'connected' ||
    right.comparison.kind !== 'step-resolved' ||
    right.comparison.schedule.kind !== 'connected'
  )
    throw new Error('Relevant roster was not applied to connected packets');
  expect(left.comparison.schedule.body.connection.stages[0]?.hasResolvedIdentity).toBe(true);
  expect(right.comparison.schedule.body.connection.stages[0]?.hasResolvedIdentity).toBe(true);
  const diff = compareSavedPlanMeaning(left, right);
  expect(diff.input).toEqual([]);
  expect(
    diff.schedule.find((change) => change.path === 'schedule.body.connection.stages[0].stageBytes'),
  ).toEqual({
    category: 'dates',
    path: 'schedule.body.connection.stages[0].stageBytes',
    left: originalPacket,
    right: originalPacket + ' ',
  });
  expect(JSON.stringify([leftPacket, rightPacket])).toBe(before);
});
