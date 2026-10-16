import { readFileSync } from 'node:fs';

import { parseOrThrow } from '@shared/validation';
import { expect, test } from 'bun:test';

import { InvocationReceipt } from '../contracts/records';
import type { ClassifiedCandidate } from '../inventory/classify-entries';
import {
  type ArtifactGraphInput,
  ArtifactGraphRuleV1,
  buildArtifactGraph as produceArtifactGraph,
  identifyArtifactDecoder,
  verifyArtifactGraph as verifyProducedArtifactGraph,
} from './artifact-graph';
import {
  hashBytes,
  hashCanonical,
  serializeCanonical,
  validateArtifacts,
} from './content-manifest';

const decoderFiles = {
  'contracts/records.ts': new Uint8Array([1]),
  'contracts/decode-record.ts': new Uint8Array([2]),
};
const limits = {
  maximumVerificationBytes: 2_000_000,
  maximumRuleBytes: 1_000_000,
  maximumRules: 100,
  maximumSelectors: 200,
  maximumSelectorBytes: 1024,
  maximumEntries: 100,
  maximumReads: 100,
  maximumReadBytes: 1_000_000,
  maximumArtifacts: 100,
  maximumWork: 10_000,
  maximumEdges: 100,
  maximumOutputBytes: 1_000_000,
};
const digest = 'a'.repeat(64);
const invocation = parseOrThrow(
  InvocationReceipt,
  JSON.parse(
    readFileSync(
      new URL('../contracts/fixtures/invocation-receipt.v1.json', import.meta.url),
      'utf8',
    ),
  ),
);
function transcript(invocationId = 'invocation.1', payload = digest) {
  return {
    schemaVersion: 1,
    recordKind: 'opaque-transcript',
    invocationId,
    mediaType: 'text/plain',
    payload,
  };
}
function receipt() {
  return {
    schemaVersion: 1,
    receiptKind: 'review',
    receiptId: 'receipt.1',
    invocationId: 'invocation.1',
    executor: invocation.executor,
    suppliedContextIds: [digest],
    observedReadIds: [digest],
    rawResponseArtifact: hashBytes(digest),
    rawUsage: invocation.rawUsage,
    priceIdentity: invocation.priceIdentity,
    trust: { scope: 'local-cooperative', journalId: 'journal.1' },
  };
}
type GraphTestInput = Omit<ArtifactGraphInput, 'ruleBytes'> & {
  rule: unknown;
  ruleBytes?: Uint8Array;
};
function source(input: GraphTestInput): ArtifactGraphInput {
  return {
    ...input,
    ruleBytes: input.ruleBytes ?? new TextEncoder().encode(serializeCanonical(input.rule)),
  };
}
function buildArtifactGraph(input: GraphTestInput) {
  return produceArtifactGraph(source(input));
}
function verifyArtifactGraph(input: GraphTestInput, supplied: unknown) {
  return verifyProducedArtifactGraph(
    source(input),
    new TextEncoder().encode(serializeCanonical(supplied)),
  );
}

function fixture(
  records: [string, string, unknown][] = [
    ['response.json', 'opaque-transcript', transcript()],
    ['receipt.json', 'review-receipt', receipt()],
  ],
) {
  const blobs = new Map<string, Uint8Array>();
  const candidate: ClassifiedCandidate = {
    selection: { kind: 'committed', revision: 'b'.repeat(40), tree: 'c'.repeat(40) },
    untracked: [],
    policyId: 'policy.1',
    entries: records.map(([path, recordKind, record], index) => {
      const blob = index.toString(16).padStart(40, '0');
      blobs.set(blob, new TextEncoder().encode(` ${JSON.stringify(record)}\n`));
      return {
        path,
        blob,
        mode: '100644',
        classification: {
          kind: 'evidence',
          evidenceRoot: '.',
          recordKind: recordKind as 'opaque-transcript',
        },
      };
    }),
  };
  const input = {
    candidate,
    snapshotIdentity: digest,
    decoderFiles,
    rule: parseOrThrow(ArtifactGraphRuleV1, {
      schemaVersion: 1,
      kind: 'review-artifact-graph-rule',
      algorithm: 'record-dependencies.v1',
      decoderIdentity: identifyArtifactDecoder(decoderFiles),
      additionalEdges: [],
    }),
    limits,
    readBlob: (blob: string) => {
      const bytes = blobs.get(blob);
      if (!bytes) throw new Error('absent blob');
      return bytes;
    },
  } satisfies Omit<ArtifactGraphInput, 'ruleBytes'> & { rule: ArtifactGraphRuleV1 };
  return { input, blobs };
}

test('derives exact container edge, roots, bytes and pinned identity without digest guessing', () => {
  const { input, blobs } = fixture();
  const built = buildArtifactGraph(input);
  const response = built.graph.artifacts.find(({ path }) => path === 'response.json')!;
  const review = built.graph.artifacts.find(({ path }) => path === 'receipt.json')!;
  expect(response.artifactId).toBe(hashBytes(blobs.get(response.blob)!));
  expect(response.references).toEqual([]);
  expect(review.references).toEqual([response.artifactId]);
  expect(review.references).not.toContain(hashBytes(digest));
  expect(built.graph.roots).toEqual([review.artifactId]);
  expect(built.bytes).toBe(serializeCanonical(built.graph));
  expect(built.identity).toBe(hashBytes(built.bytes));
  expect(built.runtimeTrust).toBe('unverified');
  expect(built.artifactGraphRuleIdentity).toBe(hashCanonical(input.rule));
  expect(built.graph.validationId).toBe(
    `artifact-graph.v1.${hashCanonical({ schemaVersion: 1, snapshotIdentity: digest, artifactGraphRuleIdentity: built.artifactGraphRuleIdentity })}`,
  );
  expect(verifyArtifactGraph(input, built)).toEqual(built);
  expect(
    buildArtifactGraph({
      ...input,
      candidate: { ...input.candidate, entries: [...input.candidate.entries].reverse() },
    }),
  ).toEqual(built);
});

test('decodes all five allowlisted kinds and preserves semantic pins as non-edges', () => {
  const inventory = {
    schemaVersion: 1,
    inventoryId: 'inventory.1',
    protocol: { protocolId: 'protocol.1', blob: digest },
    selection: { kind: 'committed', revision: 'b'.repeat(40), tree: 'c'.repeat(40) },
    entries: [],
    untracked: [],
    classificationPolicy: { policyId: 'policy.1', blob: digest },
  };
  const records: [string, string, unknown][] = [
    ['inventory.json', 'candidate-inventory', inventory],
    ['response.json', 'opaque-transcript', transcript()],
  ];
  for (const kind of ['benchmark-corpus', 'experiment-manifest'])
    records.push([
      `${kind}.json`,
      kind,
      JSON.parse(
        readFileSync(new URL(`../contracts/fixtures/${kind}.v1.json`, import.meta.url), 'utf8'),
      ),
    ]);
  records.push(['receipt.json', 'review-receipt', receipt()]);
  const built = buildArtifactGraph(fixture(records).input);
  expect(built.graph.artifacts).toHaveLength(5);
  expect(built.graph.artifacts.flatMap(({ references }) => references)).toHaveLength(1);
});

test.each(['missing', 'foreign', 'payload', 'ambiguous'] as const)(
  'refuses %s response binding',
  (fault) => {
    const records: [string, string, unknown][] = [['receipt.json', 'review-receipt', receipt()]];
    if (fault !== 'missing')
      records.push([
        'response.json',
        'opaque-transcript',
        transcript(
          fault === 'foreign' ? 'invocation.2' : 'invocation.1',
          fault === 'payload' ? 'different' : digest,
        ),
      ]);
    if (fault === 'ambiguous')
      records.push([
        'other.json',
        'opaque-transcript',
        { ...transcript(), mediaType: 'application/json' },
      ]);
    expect(() => buildArtifactGraph(fixture(records).input)).toThrow('exactly one response');
  },
);

test('installed selectors use component prefixes and full sorted Cartesian edges', () => {
  const { input } = fixture([
    ['root/a.json', 'opaque-transcript', transcript('invocation.a')],
    ['root/b.json', 'opaque-transcript', transcript('invocation.b')],
    ['roots/c.json', 'opaque-transcript', transcript('invocation.c')],
    ['target/a.json', 'opaque-transcript', transcript('invocation.d')],
    ['target/b.json', 'opaque-transcript', transcript('invocation.e')],
  ]);
  input.rule.additionalEdges.push({
    ruleId: 'rule.1',
    source: { recordKind: 'opaque-transcript', pathSelector: { kind: 'prefix', value: 'root' } },
    target: { recordKind: 'opaque-transcript', pathSelector: { kind: 'prefix', value: 'target' } },
  });
  const built = buildArtifactGraph(input);
  expect(built.graph.artifacts.filter(({ references }) => references.length === 2)).toHaveLength(2);
  expect(built.graph.artifacts.find(({ path }) => path === 'roots/c.json')?.references).toEqual([]);
  expect(built.graph.roots).toHaveLength(3);
  const targetIds = built.graph.artifacts
    .filter(({ path }) => path.startsWith('target/'))
    .map(({ artifactId }) => artifactId)
    .sort();
  for (const artifact of built.graph.artifacts.filter(({ path }) => path.startsWith('root/')))
    expect(artifact.references).toEqual(targetIds);
  for (const artifact of built.graph.artifacts)
    expect(artifact.references).toEqual([...artifact.references].sort());
  input.rule.additionalEdges[0].source.pathSelector.value = 'absent';
  expect(() => buildArtifactGraph(input)).toThrow('nonempty');
});

test.each(['self', 'cycle'] as const)('refuses installed %s dependencies', (fault) => {
  const { input } = fixture();
  input.rule.additionalEdges.push({
    ruleId: 'rule.1',
    source: { recordKind: 'opaque-transcript', pathSelector: { kind: 'suffix', value: '.json' } },
    target: {
      recordKind: fault === 'self' ? 'opaque-transcript' : 'review-receipt',
      pathSelector: { kind: 'suffix', value: '.json' },
    },
  });
  expect(() => buildArtifactGraph(input)).toThrow(fault === 'self' ? 'itself' : 'cyclic');
});

test.each([
  'coverage',
  'edge',
  'root',
  'descriptor',
  'byte',
  'schema',
  'identity',
  'rule',
  'validation',
] as const)('independent verification refuses %s substitution', (fault) => {
  const { input } = fixture();
  const built = buildArtifactGraph(input);
  if (fault === 'coverage') built.graph.artifacts = [];
  if (fault === 'edge') for (const artifact of built.graph.artifacts) artifact.references = [];
  if (fault === 'root') built.graph.roots = [];
  if (fault === 'descriptor') built.graph.artifacts[0].blob = 'f'.repeat(40);
  if (fault === 'byte') built.bytes += ' ';
  if (fault === 'schema') built.graph.artifacts[0].recordKind = 'candidate-inventory';
  if (fault === 'identity') built.identity = 'f'.repeat(64);
  if (fault === 'rule') built.artifactGraphRuleIdentity = 'f'.repeat(64);
  if (fault === 'validation') built.graph.validationId = 'foreign.1';
  if (!['byte', 'identity'].includes(fault)) {
    built.bytes = serializeCanonical(built.graph);
    built.identity = hashBytes(built.bytes);
  }
  expect(() => verifyArtifactGraph(input, built)).toThrow(
    fault === 'coverage' ? 'coverage differs' : undefined,
  );
});

test('false empty graph refuses while actual empty census succeeds', () => {
  const empty = buildArtifactGraph(fixture([]).input);
  expect(empty.graph.roots).toEqual([]);
  expect(empty.graph.artifacts).toEqual([]);
  expect(() => verifyArtifactGraph(fixture().input, empty)).toThrow();
});

test.each(Object.keys(limits))('enforces %s and safe integer grammar', (name) => {
  for (const ceiling of [NaN, 0, -1, Infinity, 0.5])
    expect(() =>
      buildArtifactGraph({ ...fixture().input, limits: { ...limits, [name]: ceiling } }),
    ).toThrow('positive safe integer');
  const { input } = fixture();
  input.limits = { ...limits, [name]: 1 };
  if (['maximumEdges', 'maximumRules', 'maximumSelectors', 'maximumSelectorBytes'].includes(name)) {
    input.rule.additionalEdges.push({
      ruleId: 'rule.1',
      source: { recordKind: 'review-receipt', pathSelector: { kind: 'suffix', value: '.json' } },
      target: { recordKind: 'opaque-transcript', pathSelector: { kind: 'suffix', value: '.json' } },
    });
  }
  if (name === 'maximumRules')
    input.rule.additionalEdges.push({
      ...input.rule.additionalEdges[0],
      ruleId: 'rule.2',
      source: {
        recordKind: 'review-receipt',
        pathSelector: { kind: 'name', value: 'receipt.json' },
      },
    });
  if (name === 'maximumVerificationBytes') {
    const built = buildArtifactGraph(input);
    expect(() => verifyArtifactGraph(input, built)).toThrow('verification byte ceiling');
    return;
  }
  expect(() => buildArtifactGraph(input)).toThrow('ceiling');
});

test('closed rule, decoder pin, unique sorted rules and strict record schema refuse', () => {
  const { input, blobs } = fixture();
  for (const rule of [
    { ...input.rule, schemaVersion: 2 },
    { ...input.rule, kind: 'candidate-graph' },
    { ...input.rule, algorithm: 'guess-digests.v1' },
    { ...input.rule, injected: true },
    { ...input.rule, decoderIdentity: 'f'.repeat(64) },
  ])
    expect(() => buildArtifactGraph({ ...input, rule })).toThrow();
  const edge = {
    ruleId: 'rule.1',
    source: { recordKind: 'review-receipt', pathSelector: { kind: 'path', value: 'receipt.json' } },
    target: {
      recordKind: 'opaque-transcript',
      pathSelector: { kind: 'path', value: 'response.json' },
    },
  };
  const distinct = {
    ...edge,
    source: { ...edge.source, pathSelector: { kind: 'suffix', value: '.json' } },
  };
  expect(() =>
    buildArtifactGraph({ ...input, rule: { ...input.rule, additionalEdges: [edge, distinct] } }),
  ).toThrow();
  expect(() =>
    buildArtifactGraph({
      ...input,
      rule: { ...input.rule, additionalEdges: [{ ...edge, ruleId: 'rule.z' }, distinct] },
    }),
  ).toThrow();
  for (const bytes of ['{"schemaVersion":99}', '\xff', '{']) {
    blobs.set('0'.repeat(40), new TextEncoder().encode(bytes));
    expect(() => buildArtifactGraph(input)).toThrow();
  }
});

test('invalid UTF-8 cannot become replacement text inside an otherwise valid record', () => {
  const { input, blobs } = fixture([
    ['response.json', 'opaque-transcript', transcript('invocation.1', 'x')],
  ]);
  const bytes = blobs.get('0'.repeat(40))!;
  const invalid = Uint8Array.from(bytes);
  const payloadStart = new TextDecoder().decode(bytes).indexOf('"payload":"x"');
  expect(payloadStart).toBeGreaterThanOrEqual(0);
  invalid[payloadStart + '"payload":"'.length] = 0xff;
  blobs.set('0'.repeat(40), invalid);
  expect(() => buildArtifactGraph(input)).toThrow('encoded');
});

test('runtime trust promotion is rejected at the document boundary', () => {
  const { input } = fixture();
  expect(() =>
    verifyArtifactGraph(input, { ...buildArtifactGraph(input), runtimeTrust: 'verified' }),
  ).toThrow('unverified');
});

test.each(['absent', 'unreadable'])('required retained %s reads propagate failure', (failure) => {
  const { input } = fixture();
  expect(() =>
    buildArtifactGraph({
      ...input,
      readBlob: () => {
        throw new Error(`retained ${failure}`);
      },
    }),
  ).toThrow(`retained ${failure}`);
});

test.each(['segment', 'name'] as const)('installed %s selector derives exact endpoints', (kind) => {
  const { input } = fixture();
  input.rule.additionalEdges.push({
    ruleId: 'rule.1',
    source: { recordKind: 'review-receipt', pathSelector: { kind, value: 'receipt.json' } },
    target: { recordKind: 'opaque-transcript', pathSelector: { kind, value: 'response.json' } },
  });
  const built = buildArtifactGraph(input);
  const response = built.graph.artifacts.find(({ path }) => path === 'response.json')!;
  expect(built.graph.artifacts.find(({ path }) => path === 'receipt.json')?.references).toEqual([
    response.artifactId,
  ]);
  input.rule.additionalEdges[0].target.pathSelector.value = 'absent.json';
  expect(() => buildArtifactGraph(input)).toThrow('nonempty');
});

test('independent edge completeness refuses a structurally valid resealed legacy graph', () => {
  const { input } = fixture();
  const built = buildArtifactGraph(input);
  for (const artifact of built.graph.artifacts) artifact.references = [];
  built.graph.roots = built.graph.artifacts.map(({ artifactId }) => artifactId).sort();
  built.bytes = serializeCanonical(built.graph);
  built.identity = hashBytes(built.bytes);
  expect(validateArtifacts(input.candidate, built.graph, input.readBlob).artifactCount).toBe(2);
  expect(() => verifyArtifactGraph(input, built)).toThrow('dependencies differ');
});

test.each(['artifactId', 'path', 'blob', 'recordKind'] as const)(
  'independent exact %s descriptor comparison',
  (field) => {
    const { input } = fixture();
    const built = buildArtifactGraph(input);
    const descriptor = built.graph.artifacts[0];
    if (field === 'artifactId') descriptor.artifactId = 'f'.repeat(64);
    if (field === 'path') descriptor.path = 'foreign.json';
    if (field === 'blob') descriptor.blob = 'f'.repeat(40);
    if (field === 'recordKind') descriptor.recordKind = 'candidate-inventory';
    built.bytes = serializeCanonical(built.graph);
    built.identity = hashBytes(built.bytes);
    expect(() => verifyArtifactGraph(input, built)).toThrow('descriptor differs');
  },
);

test.each(['identity', 'path'] as const)('duplicate evidence %s refuses census', (fault) => {
  const { input, blobs } = fixture([
    ['a.json', 'opaque-transcript', transcript('invocation.a')],
    ['b.json', 'opaque-transcript', transcript('invocation.b')],
  ]);
  if (fault === 'identity') blobs.set('1'.padStart(40, '0'), blobs.get('0'.repeat(40))!);
  else input.candidate.entries[1].path = input.candidate.entries[0].path;
  expect(() => buildArtifactGraph(input)).toThrow('duplicate evidence');
});

test.each([
  'candidate-inventory',
  'benchmark-corpus',
  'experiment-manifest',
  'opaque-transcript',
  'review-receipt',
])('strict %s decoder refuses malformed standalone census record', (kind) => {
  const { input } = fixture([['bad.json', kind, { schemaVersion: 99 }]]);
  expect(() => buildArtifactGraph(input)).toThrow('Validation failed');
});

test('installed rules cannot repeat the same endpoint recipe under different IDs', () => {
  const { input } = fixture();
  const endpoints = {
    source: { recordKind: 'review-receipt', pathSelector: { kind: 'path', value: 'receipt.json' } },
    target: {
      recordKind: 'opaque-transcript',
      pathSelector: { kind: 'path', value: 'response.json' },
    },
  };
  expect(() =>
    buildArtifactGraph({
      ...input,
      rule: {
        ...input.rule,
        additionalEdges: [
          { ruleId: 'rule.1', ...endpoints },
          { ruleId: 'rule.2', ...endpoints },
        ],
      },
    }),
  ).toThrow('unique additional');
});

test('snapshot identity must be a full digest', () => {
  const { input } = fixture();
  expect(() => buildArtifactGraph({ ...input, snapshotIdentity: 'caller-label' })).toThrow(
    'Validation failed',
  );
});

test('raw recipe byte ceiling refuses before decoding malformed bytes', () => {
  const { input } = fixture();
  expect(() =>
    buildArtifactGraph({
      ...input,
      ruleBytes: new Uint8Array([0xff, 0xff]),
      limits: { ...limits, maximumRuleBytes: 1 },
    }),
  ).toThrow('raw recipe byte ceiling');
});

test.each(['selector', 'cartesian'] as const)(
  'installed %s work is charged before expansion',
  (stage) => {
    const { input } = fixture([
      ['source/a.json', 'opaque-transcript', transcript('invocation.a')],
      ['source/b.json', 'opaque-transcript', transcript('invocation.b')],
      ['target/a.json', 'opaque-transcript', transcript('invocation.c')],
      ['target/b.json', 'opaque-transcript', transcript('invocation.d')],
    ]);
    input.rule.additionalEdges.push({
      ruleId: 'rule.1',
      source: {
        recordKind: 'opaque-transcript',
        pathSelector: { kind: 'prefix', value: 'source' },
      },
      target: {
        recordKind: 'opaque-transcript',
        pathSelector: { kind: 'prefix', value: 'target' },
      },
    });
    // Four census visits, eight selector comparisons, then four Cartesian pairs.
    expect(() =>
      buildArtifactGraph({
        ...input,
        limits: {
          ...limits,
          maximumWork: stage === 'selector' ? 7 : 12,
          maximumEdges: stage === 'selector' ? 1 : 100,
        },
      }),
    ).toThrow('work ceiling');
  },
);

test('raw recipe UTF-8 decoding is strict', () => {
  const { input } = fixture();
  expect(() => buildArtifactGraph({ ...input, ruleBytes: new Uint8Array([0xff]) })).toThrow(
    'encoded',
  );
});

test('verification byte ceiling refuses malformed oversized bytes before schema parsing', () => {
  const { input } = fixture();
  expect(() =>
    verifyProducedArtifactGraph(
      source({ ...input, limits: { ...limits, maximumVerificationBytes: 1 } }),
      new Uint8Array([0xff, 0xff]),
    ),
  ).toThrow('verification byte ceiling');
});

test('verification document UTF-8 decoding is strict', () => {
  const { input } = fixture();
  expect(() => verifyProducedArtifactGraph(source(input), new Uint8Array([0xff]))).toThrow(
    'encoded',
  );
});

test('semantic bindings naming actual artifacts and JSON-looking payload never create edges', () => {
  const context = transcript('invocation.context', '{"references":["' + digest + '"]}');
  const contextId = hashBytes(` ${JSON.stringify(context)}\n`);
  const review = { ...receipt(), suppliedContextIds: [contextId], observedReadIds: [contextId] };
  const { input } = fixture([
    ['response.json', 'opaque-transcript', transcript()],
    ['context.json', 'opaque-transcript', context],
    ['receipt.json', 'review-receipt', review],
  ]);
  const built = buildArtifactGraph(input);
  const response = built.graph.artifacts.find(({ path }) => path === 'response.json')!;
  expect(built.graph.artifacts.find(({ path }) => path === 'receipt.json')?.references).toEqual([
    response.artifactId,
  ]);
  expect(built.graph.artifacts.find(({ path }) => path === 'context.json')?.references).toEqual([]);
  expect(built.graph.roots).toContain(contextId);
});

test.each(['endpoint', 'edge'] as const)(
  'installed %s rejects undeclared authority fields',
  (boundary) => {
    const { input } = fixture();
    const edge = {
      ruleId: 'rule.1',
      source: {
        recordKind: 'review-receipt',
        pathSelector: { kind: 'path', value: 'receipt.json' },
        ...(boundary === 'endpoint' ? { injected: true } : {}),
      },
      target: {
        recordKind: 'opaque-transcript',
        pathSelector: { kind: 'path', value: 'response.json' },
      },
      ...(boundary === 'edge' ? { injected: true } : {}),
    };
    expect(() =>
      buildArtifactGraph({ ...input, rule: { ...input.rule, additionalEdges: [edge] } }),
    ).toThrow('Validation failed');
  },
);

test('verification document rejects undeclared authority fields', () => {
  const { input } = fixture();
  expect(() =>
    verifyArtifactGraph(input, { ...buildArtifactGraph(input), injected: true }),
  ).toThrow('Validation failed');
});
