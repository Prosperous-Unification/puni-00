import { describe, expect, it } from 'bun:test';

import { admitPublication, planRetirement } from './registry-policy';

const GiB = 1024 ** 3;
const now = '2026-10-25T00:00:00.000Z';
const digest = (index: number) => `sha256:${index.toString(16).padStart(64, '0')}`;
const capacity = () => ({
  maximumBytes: 50 * GiB,
  usableBytes: 60 * GiB,
  usedBytes: 10 * GiB,
  totalInodes: 1000,
  usedInodes: 100,
  rootFreeBytes: 20 * GiB,
});
const admission = () => ({
  capacity: capacity(),
  reservations: [],
  envelope: { bytes: GiB, inodes: 10 },
});
const bundle = (index: number) => ({
  operationId: `release-${String(index)}`,
  product: 'wbs',
  roots: [digest(index)],
  receipt: {
    state: 'promoted' as const,
    at: `2026-10-${index.toString().padStart(2, '0')}T00:00:00.000Z`,
  },
});
const node = (index: number) => ({
  digest: digest(index),
  bytes: GiB,
  inodes: 1,
  dependencies: [] as string[],
});
const inventory = () => ({
  now,
  capacity: capacity(),
  mode: 'nightly' as const,
  graph: { complete: true as const, nodes: [node(1)] },
  bundles: [bundle(1)],
  protections: [],
  registeredEnvironments: ['prod'],
  histories: [{ environment: 'prod', state: 'first-install' as const, at: now }],
});

describe('publication admission', () => {
  it('refuses the exact byte cutoff near the safe-integer capacity limit', () => {
    const input = admission();
    input.capacity.maximumBytes = 9007199254740990;
    input.capacity.usableBytes = 9007199254740990;
    input.capacity.usedBytes = 8106479329266890;
    input.envelope.bytes = 1;
    expect(admitPublication(input)).toMatchObject({
      status: 'refused',
      reasons: ['bytes'],
      requiredBytes: 1,
    });
  });
  it('refuses the exact inode cutoff near the safe-integer capacity limit', () => {
    const input = admission();
    input.capacity.totalInodes = 9007199254740990;
    input.capacity.usedInodes = 8106479329266890;
    input.envelope.inodes = 1;
    expect(admitPublication(input)).toMatchObject({
      status: 'refused',
      reasons: ['inodes'],
      requiredInodes: 1,
    });
  });
  it.each([
    { usedBytes: 6305039478318693, pressure: 'normal' },
    { usedBytes: 7205759403792792, pressure: 'warn' },
  ])(
    'keeps large safe-integer usage below its exact pressure threshold: %s',
    ({ usedBytes, pressure }) => {
      const input = admission();
      input.capacity.maximumBytes = 9007199254740991;
      input.capacity.usableBytes = 9007199254740991;
      input.capacity.usedBytes = usedBytes;
      input.envelope.bytes = 1;
      expect(admitPublication(input)).toMatchObject({ status: 'admitted', pressure });
    },
  );

  it('admits the last byte below ninety percent but refuses the exact cutoff', () => {
    const input = admission();
    input.capacity.usedBytes = 44 * GiB - 1;
    expect(admitPublication(input).status).toBe('admitted');
    input.capacity.usedBytes += 1;
    expect(admitPublication(input)).toMatchObject({ status: 'refused', requiredBytes: 1 });
  });
  it('charges existing reservations to both budgets', () => {
    const input = {
      ...admission(),
      reservations: [{ operationId: 'crashed', bytes: 35 * GiB, inodes: 800 }],
    };
    expect(admitPublication(input)).toMatchObject({
      status: 'refused',
      reasons: ['bytes', 'inodes', 'publisher-busy'],
    });
  });
  it('reports warning and stop pressure from inodes independently', () => {
    const input = admission();
    input.capacity.usedInodes = 700;
    expect(admitPublication(input)).toMatchObject({ pressure: 'warn' });
    input.capacity.usedInodes = 900;
    expect(admitPublication(input)).toMatchObject({ status: 'refused', pressure: 'fenced' });
  });
  it('rejects missing capacity, zero budgets and fractional counts', () => {
    expect(() => admitPublication({ ...admission(), capacity: undefined })).toThrow();
    expect(() =>
      admitPublication({ ...admission(), capacity: { ...capacity(), usableBytes: 0 } }),
    ).toThrow();
    expect(() =>
      admitPublication({ ...admission(), envelope: { bytes: 0.5, inodes: 1 } }),
    ).toThrow();
  });

  it('rejects publication crossing ninety percent', () => {
    const input = admission();
    input.capacity.usedBytes = 39 * GiB;
    input.envelope.bytes = 7 * GiB;
    expect(admitPublication(input)).toMatchObject({
      status: 'refused',
      reasons: ['bytes'],
      requiredBytes: GiB + 1,
    });
  });
  it('admits strictly below both cutoffs and reports pressure', () => {
    expect(admitPublication(admission())).toMatchObject({ status: 'admitted', pressure: 'normal' });
    const input = admission();
    input.capacity.usedBytes = 35 * GiB;
    expect(admitPublication(input)).toMatchObject({ status: 'admitted', pressure: 'warn' });
    input.capacity.usedBytes = 40 * GiB;
    expect(admitPublication(input)).toMatchObject({ status: 'admitted', pressure: 'retire' });
  });
  it('uses actual usable capacity when smaller than the configured budget', () => {
    const input = admission();
    input.capacity.usableBytes = 12 * GiB;
    expect(admitPublication(input)).toMatchObject({ status: 'refused', reasons: ['bytes'] });
  });
  it('rejects inode envelopes reaching ninety percent', () => {
    const input = admission();
    input.envelope.inodes = 800;
    expect(admitPublication(input)).toMatchObject({
      status: 'refused',
      reasons: ['inodes'],
      requiredInodes: 1,
    });
  });
  it('retains crash reservations and refuses a second publisher', () => {
    expect(
      admitPublication({
        ...admission(),
        reservations: [{ operationId: 'crashed', bytes: GiB, inodes: 1 }],
      }),
    ).toMatchObject({ status: 'refused', reasons: ['publisher-busy'] });
  });
  it('fences writes at actual stop pressure or low host reserve', () => {
    const input = admission();
    input.capacity.usedBytes = 45 * GiB;
    expect(admitPublication(input)).toMatchObject({ status: 'refused', pressure: 'fenced' });
    input.capacity.usedBytes = GiB;
    input.capacity.rootFreeBytes = 20 * GiB - 1;
    expect(admitPublication(input)).toMatchObject({
      status: 'refused',
      reasons: ['root-reserve'],
      pressure: 'fenced',
    });
  });
  it.each([undefined, NaN, -1, Infinity])(
    'throws for missing or invalid capacity %s',
    (usedBytes) => {
      expect(() =>
        admitPublication({ ...admission(), capacity: { ...capacity(), usedBytes } }),
      ).toThrow();
    },
  );
  it('throws for missing inode envelope', () => {
    expect(() => admitPublication({ ...admission(), envelope: { bytes: GiB } })).toThrow();
  });
});

describe('retirement planning', () => {
  it('retains unfinished work regardless of age and excludes it from successful history', () => {
    const input = {
      ...inventory(),
      bundles: [{ ...bundle(1), receipt: { state: 'unfinished', at: '2026-01-01T00:00:00.000Z' } }],
    };
    expect(planRetirement(input)).toMatchObject({
      retireOperations: [],
      retained: [{ operationId: 'release-1', reasons: ['unfinished'] }],
    });
  });
  it('counts protection closure across index, platforms, configs and shared layers', () => {
    const input = {
      ...inventory(),
      bundles: [{ ...bundle(1), receipt: { state: 'completed', at: '2026-10-01T00:00:00.000Z' } }],
      protections: [{ owner: 'scaled-zero', reason: 'desired', roots: [digest(1)] }],
      graph: {
        complete: true,
        nodes: [
          { ...node(1), dependencies: [digest(2), digest(3)] },
          { ...node(2), dependencies: [digest(4), digest(5)] },
          { ...node(3), dependencies: [digest(4), digest(5)] },
          node(4),
          node(5),
        ],
      },
    };
    expect(planRetirement(input)).toMatchObject({ retireDigests: [], protectedBytes: 5 * GiB });
  });
  it('rejects cyclic dependencies', () => {
    expect(() =>
      planRetirement({
        ...inventory(),
        graph: { complete: true, nodes: [{ ...node(1), dependencies: [digest(1)] }] },
      }),
    ).toThrow(/Cyclic/);
  });
  it('rejects unknown roots and mutable identities even when both references agree', () => {
    expect(() =>
      planRetirement({ ...inventory(), bundles: [{ ...bundle(1), roots: [digest(2)] }] }),
    ).toThrow(/dependency/);
    expect(() =>
      planRetirement({
        ...inventory(),
        bundles: [{ ...bundle(1), roots: ['latest'] }],
        graph: { complete: true, nodes: [{ ...node(1), digest: 'latest' }] },
      }),
    ).toThrow();
  });
  it('rejects duplicate graph nodes, registered environments and histories', () => {
    expect(() =>
      planRetirement({ ...inventory(), graph: { complete: true, nodes: [node(1), node(1)] } }),
    ).toThrow(/Duplicate/);
    expect(() =>
      planRetirement({ ...inventory(), registeredEnvironments: ['prod', 'prod'] }),
    ).toThrow(/Duplicate/);
    const history = inventory().histories[0];
    expect(() => planRetirement({ ...inventory(), histories: [history, history] })).toThrow(
      /Duplicate/,
    );
  });
  it('rejects future publication receipts and unregistered environment histories', () => {
    expect(() =>
      planRetirement({
        ...inventory(),
        bundles: [{ ...bundle(1), receipt: { state: 'promoted', at: '2027-01-01T00:00:00.000Z' } }],
      }),
    ).toThrow(/Future/);
    expect(() => planRetirement({ ...inventory(), registeredEnvironments: [] })).toThrow(
      /Unregistered/,
    );
    expect(() =>
      planRetirement({
        ...inventory(),
        histories: [
          {
            environment: 'prod',
            state: 'successful',
            complete: true,
            releases: ['release-1', 'release-1'],
          },
        ],
      }),
    ).toThrow(/Duplicate/);
  });

  it('keeps ten complete bundles', () => {
    const input = inventory();
    input.bundles = Array.from({ length: 12 }, (_, index) => bundle(index + 1)).reverse();
    input.graph.nodes = Array.from({ length: 12 }, (_, index) => node(index + 1));
    const plan = planRetirement(input);
    expect(plan.retireOperations).toEqual(['release-1', 'release-2']);
    expect(plan.retireDigests).toEqual([digest(1), digest(2)]);
    expect(plan.retained).toHaveLength(10);
    expect(plan.estimatedReclaimableBytes).toBe(2 * GiB);
  });
  it('preserves older environment rollback', () => {
    const input = {
      ...inventory(),
      bundles: Array.from({ length: 14 }, (_, index) => bundle(index + 1)),
      graph: { complete: true, nodes: Array.from({ length: 14 }, (_, index) => node(index + 1)) },
      histories: [
        {
          environment: 'prod',
          state: 'successful',
          releases: ['release-4', 'release-3', 'release-2'],
          complete: true,
        },
      ],
    };
    const plan = planRetirement(input);
    expect(plan.retireOperations).toEqual(['release-1']);
    expect(plan.retained.find((entry) => entry.operationId === 'release-2')?.reasons).toContain(
      'environment:prod',
    );
  });
  it('waits seven days after abandonment', () => {
    const input = {
      ...inventory(),
      bundles: [{ ...bundle(1), receipt: { state: 'abandoned', at: '2026-10-18T00:00:00.001Z' } }],
    };
    expect(planRetirement(input).retireOperations).toEqual([]);
    input.bundles[0].receipt.at = '2026-10-18T00:00:00.000Z';
    expect(planRetirement(input).retireOperations).toEqual(['release-1']);
    input.bundles[0].receipt.state = 'completed';
    expect(planRetirement(input).retireOperations).toEqual(['release-1']);
  });
  it('does not count shared blobs twice', () => {
    const input = {
      ...inventory(),
      bundles: [1, 2].map((index) => ({
        ...bundle(index),
        receipt: { state: 'completed', at: '2026-10-01T00:00:00.000Z' },
      })),
      graph: {
        complete: true,
        nodes: [
          { ...node(1), dependencies: [digest(3)] },
          { ...node(2), dependencies: [digest(3)] },
          node(3),
        ],
      },
    };
    expect(planRetirement(input).estimatedReclaimableBytes).toBe(3 * GiB);
    input.bundles[1].receipt.state = 'promoted';
    const plan = planRetirement(input);
    expect(plan.retireDigests).toEqual([digest(1)]);
    expect(plan.estimatedReclaimableBytes).toBe(GiB);
  });
  it('preserves protected transitive untagged dependencies', () => {
    const input = {
      ...inventory(),
      bundles: [{ ...bundle(1), receipt: { state: 'completed', at: '2026-10-01T00:00:00.000Z' } }],
      protections: [{ owner: 'recovery', reason: 'recovery', roots: [digest(1)] }],
      graph: { complete: true, nodes: [{ ...node(1), dependencies: [digest(2)] }, node(2)] },
    };
    expect(planRetirement(input)).toMatchObject({
      retireOperations: [],
      retireDigests: [],
      protectedBytes: 2 * GiB,
      protectedOwners: ['recovery'],
    });
  });
  it('reports all-protected exhaustion without weakening retention', () => {
    const input = { ...inventory(), mode: 'pressure' };
    input.capacity.usedBytes = 46 * GiB;
    expect(planRetirement(input)).toMatchObject({
      retireOperations: [],
      estimatedReclaimableBytes: 0,
      unmetBytes: 11 * GiB + 1,
      targetReached: false,
    });
  });
  it('targets below seventy percent and requests pressure cleanup at eighty', () => {
    const input = {
      ...inventory(),
      mode: 'pressure',
      bundles: [{ ...bundle(1), receipt: { state: 'completed', at: '2026-10-01T00:00:00.000Z' } }],
    };
    expect(planRetirement(input).retireOperations).toEqual([]);
    input.capacity.usedInodes = 800;
    expect(planRetirement(input)).toMatchObject({
      retireOperations: ['release-1'],
      unmetInodes: 100,
      targetReached: false,
    });
  });
  it('uses stable operation IDs to order tied promotion receipts', () => {
    const input = {
      ...inventory(),
      bundles: Array.from({ length: 11 }, (_, index) => ({
        ...bundle(index + 1),
        operationId: String(index).padStart(2, '0'),
        receipt: { state: 'promoted', at: now },
      })),
      graph: { complete: true, nodes: Array.from({ length: 11 }, (_, index) => node(index + 1)) },
    };
    expect(planRetirement(input).retireOperations).toEqual(['00']);
  });
  it('throws for malformed timestamp', () => {
    expect(() => planRetirement({ ...inventory(), now: 'yesterday' })).toThrow();
    expect(() =>
      planRetirement({
        ...inventory(),
        bundles: [{ ...bundle(1), receipt: { state: 'promoted', at: '2026-02-30T00:00:00.000Z' } }],
      }),
    ).toThrow();
  });
  it('throws for unknown owner', () => {
    expect(() =>
      planRetirement({ ...inventory(), graph: { complete: true, nodes: [node(1), node(2)] } }),
    ).toThrow(/owner/);
  });
  it('throws for absent or incomplete history instead of assuming first install', () => {
    expect(() => planRetirement({ ...inventory(), histories: [] })).toThrow(/history/);
    expect(() =>
      planRetirement({
        ...inventory(),
        histories: [
          { environment: 'prod', state: 'successful', releases: ['release-1'], complete: false },
        ],
      }),
    ).toThrow();
  });
  it('throws for incomplete graph, unknown references and mutable identities', () => {
    expect(() =>
      planRetirement({ ...inventory(), graph: { complete: false, nodes: [node(1)] } }),
    ).toThrow();
    expect(() =>
      planRetirement({
        ...inventory(),
        graph: { complete: true, nodes: [{ ...node(1), dependencies: [digest(2)] }] },
      }),
    ).toThrow();
    expect(() =>
      planRetirement({ ...inventory(), bundles: [{ ...bundle(1), roots: ['latest'] }] }),
    ).toThrow();
  });
  it('throws for duplicate identities, future receipts and unknown historical releases', () => {
    expect(() => planRetirement({ ...inventory(), bundles: [bundle(1), bundle(1)] })).toThrow();
    expect(() =>
      planRetirement({
        ...inventory(),
        histories: [
          { environment: 'prod', state: 'first-install', at: '2027-01-01T00:00:00.000Z' },
        ],
      }),
    ).toThrow();
    expect(() =>
      planRetirement({
        ...inventory(),
        histories: [
          { environment: 'prod', state: 'successful', complete: true, releases: ['missing'] },
        ],
      }),
    ).toThrow();
  });
});

it('current consumer shared tier preserves its image while oldest four unique tiers retire', () => {
  const bundles = Array.from({ length: 14 }, (_, index) => ({
    ...bundle(index + 1),
    roots: [digest(100), digest(index + 1)],
  }));
  const plan = planRetirement({
    ...inventory(),
    graph: { complete: true, nodes: [node(100), ...bundles.map((_, index) => node(index + 1))] },
    bundles,
    histories: [
      {
        environment: 'prod',
        state: 'successful',
        complete: true,
        releases: [...bundles].reverse().map((bundle) => bundle.operationId),
      },
    ],
    protections: [{ owner: 'compose-prod', reason: 'consumer', roots: [digest(100), digest(14)] }],
  });
  expect(plan.retireOperations).toEqual(['release-1', 'release-2', 'release-3', 'release-4']);
  expect(plan.retireDigests).toEqual([digest(1), digest(2), digest(3), digest(4)]);
  expect(plan.estimatedReclaimableBytes).toBe(4 * GiB);
});
it.each(['deployment', 'recovery', 'consumer'])(
  'exact %s roots remain protected across different owners without retaining unrelated old roots',
  (reason) => {
    const input = {
      ...inventory(),
      bundles: [
        {
          ...bundle(1),
          roots: [digest(1), digest(2)],
          receipt: { state: 'completed', at: '2026-10-01T00:00:00.000Z' },
        },
      ],
      graph: { complete: true, nodes: [node(1), node(2)] },
      protections: [{ owner: 'first', reason, roots: [digest(1)] }],
    };
    expect(planRetirement(input).retireDigests).toEqual([digest(2)]);
    input.protections.push({ owner: 'second', reason, roots: [digest(2)] });
    expect(planRetirement(input).retireOperations).toEqual([]);
    expect(planRetirement(input).retireDigests).toEqual([]);
  },
);

it('refuses partial operations without an abandoned owning bundle', () => {
  expect(() => planRetirement({ ...inventory(), partialOperations: ['missing'] })).toThrow();
  expect(() => planRetirement({ ...inventory(), partialOperations: ['release-1'] })).toThrow();
});

it('refuses unknown unfinished or empty-root retired declarations', () => {
  expect(() => planRetirement({ ...inventory(), retiredOperations: ['missing'] })).toThrow();
  expect(() =>
    planRetirement({
      ...inventory(),
      bundles: [{ ...bundle(1), receipt: { state: 'unfinished', at: now } }],
      retiredOperations: ['release-1'],
    }),
  ).toThrow();
  expect(() =>
    planRetirement({
      ...inventory(),
      graph: { complete: true, nodes: [] },
      bundles: [{ ...bundle(1), roots: [] }],
    }),
  ).toThrow();
});

it('refuses retired releases still required by successful history', () => {
  expect(() => planRetirement({ ...inventory(), retiredOperations: ['release-1'] })).toThrow();
});

it('refuses duplicate physical content owners and unknown or graph-overlapping content', () => {
  const content = { digest: digest(2), bytes: GiB, inodes: 1, operations: ['release-1'] };
  for (const unreferencedContent of [
    [content, content],
    [{ ...content, operations: ['release-1', 'release-1'] }],
    [{ ...content, operations: ['missing'] }],
    [{ ...content, digest: digest(1) }],
  ])
    expect(() => planRetirement({ ...inventory(), unreferencedContent })).toThrow();
});

it('refuses staged content without an owning bundle', () => {
  expect(() =>
    planRetirement({
      ...inventory(),
      staging: [{ operationId: 'missing', bytes: 1, inodes: 1 }],
    }),
  ).toThrow();
});

it('accounts reconciled partial content and staging exactly once after retirement', () => {
  const plan = planRetirement({
    ...inventory(),
    graph: { complete: true, nodes: [] },
    bundles: [
      { ...bundle(1), roots: [], receipt: { state: 'abandoned', at: '2026-10-01T00:00:00.000Z' } },
    ],
    partialOperations: ['release-1'],
    staging: [{ operationId: 'release-1', bytes: 7, inodes: 2 }],
    unreferencedContent: [{ digest: digest(2), bytes: 11, inodes: 3, operations: ['release-1'] }],
  });
  expect(plan.retireOperations).toEqual(['release-1']);
  expect(plan.retireDigests).toEqual([digest(2)]);
  expect(plan.estimatedReclaimableBytes).toBe(18);
  expect(plan.estimatedReclaimableInodes).toBe(5);
});

it('retains shared unreferenced content until every owning operation releases it', () => {
  const plan = planRetirement({
    ...inventory(),
    graph: { complete: true, nodes: [] },
    bundles: [
      { ...bundle(1), roots: [], receipt: { state: 'abandoned', at: '2026-10-01T00:00:00.000Z' } },
      { ...bundle(2), roots: [], receipt: { state: 'abandoned', at: now } },
    ],
    partialOperations: ['release-1', 'release-2'],
    staging: [{ operationId: 'release-2', bytes: 7, inodes: 2 }],
    unreferencedContent: [
      { digest: digest(3), bytes: 11, inodes: 3, operations: ['release-1', 'release-2'] },
    ],
  });
  expect(plan.retireOperations).toEqual(['release-1']);
  expect(plan.retireDigests).toEqual([]);
  expect(plan.estimatedReclaimableBytes).toBe(0);
  expect(plan.protectedBytes).toBe(18);
});

it('does not retire an already retired abandoned operation again', () => {
  const plan = planRetirement({
    ...inventory(),
    graph: { complete: true, nodes: [] },
    bundles: [
      { ...bundle(1), roots: [], receipt: { state: 'abandoned', at: '2026-10-01T00:00:00.000Z' } },
    ],
    retiredOperations: ['release-1'],
    unreferencedContent: [{ digest: digest(2), bytes: 11, inodes: 3, operations: ['release-1'] }],
  });
  expect(plan.retireOperations).toEqual([]);
  expect(plan.retireDigests).toEqual([digest(2)]);
});
