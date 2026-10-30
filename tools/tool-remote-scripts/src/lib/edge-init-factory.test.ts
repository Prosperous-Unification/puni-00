import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { afterAll, beforeAll, expect, test } from 'bun:test';

import { allocateFactoryRoot } from '../fixtures/edge-init-factory-root';

interface FactoryObservation {
  summary?: {
    stage: string;
    receiptSha256: string | null;
    recovery?: {
      scope: string;
      window: string;
      targets: { target: string; class: string; health: string; probeApplicability: string }[];
    };
  };
  clock?: {
    firstAdmission: { monotonic: number; wall: number; expires: number };
    shifts: {
      event: string;
      beforeMonotonic: number;
      afterMonotonic: number;
      beforeWall: number;
      afterWall: number;
    }[];
    effects: { route: string; monotonic: number; wall: number; applied: boolean }[];
    stopApplied: boolean;
    issuedAt: number;
    sourceSha256: Record<string, string>;
  };
  refusal?: string;
  transcript: string[];
  reads: string[];
  receiptStages: string[];
  receiptDirectoryPresent?: boolean;
}
const hashCandidate = (index: number) =>
  createHash('sha256')
    .update('candidate ' + String(index))
    .digest('hex');
let certificates: string;
const workspace = resolve(import.meta.dir, '../../../..');
const worker = resolve(import.meta.dir, '../fixtures/edge-init-factory.ts');
beforeAll(async () => {
  certificates = await mkdtemp(resolve(tmpdir(), 'edge-init-factory-tls-'));
  const child = Bun.spawn(
    [
      '/usr/bin/openssl',
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      certificates + '/key.pem',
      '-out',
      certificates + '/cert.pem',
      '-days',
      '2',
      '-subj',
      '/CN=fixture.invalid',
      '-addext',
      'subjectAltName=DNS:fixture.invalid',
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()]);
  expect(await child.exited).toBe(0);
});
afterAll(async () => {
  await rm(certificates, { recursive: true });
});
async function observe(action: string, classification = '', target = '', fault = '') {
  const scratch = await allocateFactoryRoot();
  const child = Bun.spawn([process.execPath, worker, action, classification, target, fault], {
    cwd: workspace,
    env: {
      ...process.env,
      INIT_FACTORY_TLS: certificates,
      INIT_FACTORY_ROOT: scratch,
      NODE_EXTRA_CA_CERTS: certificates + '/cert.pem',
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const timer = setTimeout(() => {
    child.kill('SIGTERM');
  }, 110000);
  try {
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(stderr).toBe('');
    expect(stdout).not.toContain('PRIVATE_FACTORY_SECRET');
    const observation = JSON.parse(stdout) as FactoryObservation;
    if (action !== 'execute') expect(observation.transcript).toEqual([]);
    return { observation, code };
  } finally {
    clearTimeout(timer);
    await rm(scratch, { recursive: true });
  }
}

/** Keeps unexpected positive failures useful without retaining worker output or arbitrary causes. */
function failureContext(observation: FactoryObservation): string {
  const bounded = (entries: readonly string[]) =>
    entries
      .slice(-8)
      .map((entry) =>
        entry.length <= 160 && !entry.includes('PRIVATE_FACTORY_SECRET') ? entry : '[omitted]',
      );
  return JSON.stringify({
    refusal:
      observation.refusal === undefined
        ? 'absent'
        : /^edge Init adoption refused: (preparation-failed|operation-refused)$/.test(
              observation.refusal,
            )
          ? observation.refusal
          : 'unrecognized',
    reads: bounded(observation.reads),
    receiptStages: bounded(observation.receiptStages),
  });
}

test('unexpected positive exit retains bounded parsed refusal and last observations', () => {
  const observation = {
    refusal: 'edge Init adoption refused: preparation-failed',
    reads: ['discarded-earlier-read', ...Array.from({ length: 7 }, () => 'collector'), 'GET /info'],
    receiptStages: ['create-intended'],
    transcript: [],
    stdout: 'PRIVATE_FACTORY_SECRET',
  };
  // Proof: removing the positive assertion context made this synthetic failing-exit assertion lose its refusal and boundary evidence.
  let failure: unknown;
  try {
    expect(2, failureContext(observation)).toBe(0);
  } catch (cause) {
    failure = cause;
  }
  expect(failure).toBeInstanceOf(Error);
  if (!(failure instanceof Error)) throw new Error('unexpected positive exit did not fail');
  expect(failure.message).toContain('preparation-failed');
  expect(failure.message).toContain('GET /info');
  expect(failure.message).toContain('create-intended');
  expect(failure.message).not.toContain('discarded-earlier-read');
  expect(failure.message).not.toContain('PRIVATE_FACTORY_SECRET');
  expect(failureContext({ ...observation, refusal: 'PRIVATE_FACTORY_SECRET' })).toContain(
    'unrecognized',
  );
});

test('actual production prepare traverses native host, collector, fixed Caddy Exec and authenticated TLS reads without effects or receipts', async () => {
  const { observation, code } = await observe('prepare');
  expect(code, failureContext(observation)).toBe(0);
  expect(observation.summary?.stage).toBe('prepared');
  expect(observation.summary?.receiptSha256).toBeNull();
  expect(observation.receiptDirectoryPresent).toBe(false);
  expect(observation.receiptStages).toEqual([]);
  expect(observation.reads.filter((read) => read === 'collector')).toHaveLength(2);
  expect(observation.reads.filter((read) => read === 'probe:/v2/')).toHaveLength(1);
  expect(observation.reads).toContain('probe:/');
  expect(observation.reads).toContain('upgrade:/ws');
  expect(observation.reads.filter((read) => read.startsWith('POST /containers/'))).toHaveLength(6);
}, 120000);

test('isolated host models UID1000 across raw UID1001 named and held observations', async () => {
  const { observation, code } = await observe('prepare', '', '', 'runner-uid-1001-modeled');
  expect(code, failureContext(observation)).toBe(0);
  expect(observation.summary?.stage).toBe('prepared');
  expect(observation.reads).toContain('upgrade:/ws');
  expect(observation.transcript).toEqual([]);
}, 120000);

for (const fault of [
  'credential-owner-1001',
  'operation-owner-1001',
  'operator-uid-mismatch',
  'operator-euid-mismatch',
  'packet-descriptor-owner-mismatch',
] as const) {
  test(
    'actual production prepare rejects modeled owner fault ' + fault + ' before effects',
    async () => {
      const { observation, code } = await observe('prepare', '', '', fault);
      expect(code).toBe(2);
      expect(observation.refusal).toBe('edge Init adoption refused: preparation-failed');
      expect(observation.reads).toEqual([]);
      expect(observation.transcript).toEqual([]);
      expect(observation.receiptStages).toEqual([]);
    },
    120000,
  );
}

test('actual production prepare rejects synthetic receipt-parent owner drift without mutation', async () => {
  const { observation, code } = await observe('prepare', '', '', 'receipt-parent-owner-mismatch');
  expect(code).toBe(2);
  expect(observation.refusal).toBe('edge Init adoption refused: preparation-failed');
  expect(observation.transcript).toEqual([]);
  expect(observation.receiptStages).toEqual([]);
}, 120000);

const preparationFaults = [
  // Proof: omitting both production literal-source comparisons admitted self-consistently pinned false YAML beside a good pinned historical projection; restored actual-entry run refused.
  ['source-false', false, false],
  ['source-false-no-projection', false, false],
  ['source-absent-init', false, false],
  ['source-duplicate-init', false, false],
  ['source-anchor', false, false],
  ['source-false-true', false, false],
  ['source-true-false', false, false],
  ['source-alias', false, false],
  ['source-merge', false, false],
  ['source-tag', false, false],
  ['source-reset', false, false],
  ['source-override', false, false],
  ['source-documents', false, false],
  ['source-duplicate-root', false, false],
  ['source-include', false, false],
  ['source-extends', false, false],
  ['source-profiles', false, false],
  ['source-string', false, false],
  ['source-uppercase', false, false],
  ['source-alternate', false, false],
  ['source-null', false, false],
  ['source-number', false, false],
  ['source-quoted-root', false, false],
  ['source-escaped-key', false, false],
  ['source-interpolated-service', false, false],
  ['source-interpolated-key', false, false],
  ['source-inline-services', false, false],
  ['source-inline-selected', false, false],
  ['source-array-selected', false, false],
  ['source-scalar-selected', false, false],
  ['source-crlf', false, false],
  ['source-flow-multiline', false, false],
  ['source-quoted-fake', false, false],

  ['source-interpolated', false, false],
  ['source-quoted-key', false, false],
  ['source-quoted-service', false, false],
  ['source-block', false, false],
  ['source-complex', false, false],
  ['source-multiline', false, false],
  ['source-secret-parser', false, false],
  ['source-later-absent', false, false],
  ['source-later-false', false, false],
  ['source-later-true', false, false],

  ['source-missing', false, false],
  ['packet-version', false, false],
  ['packet-versionless', false, false],
  ['packet-profile-missing', false, false],
  ['packet-profile-old', false, false],
  ['source-unreadable', false, false],
  ['source-replaced', false, false],
  ['source-byte-race', false, false],
  ['forged-lock', false, false],
  ['owner-marker', false, false],
  ['queued-job', false, false],
  ['populated-cgroup', true, false],
  ['crontab-unreadable', true, false],
  ['boot-drift', false, false],
  // Proof: omitting the production daemon-info equality made this actual-entry negative fail with success exit0; restored run passed.
  ['daemon-drift', true, false],
  ['graph-extra', true, false],
  ['exec-stderr', true, false],
  ['exec-nonterminal', true, false],
  ['manifest-body', true, true],
  ['public-body', true, true],
  ['public-redirect', true, true],
  ['registry-challenge', true, true],
  ['manifest-digest', true, true],
  ['wrong-tls-name', true, true],
  ['wrong-connect', true, true],
  ['native-malformed', false, false],
  ['recycled-pid', true, false],
  ['network-missing', true, false],
  ['new-launcher', true, true],
  ['collector-descendant', true, true],
  ['writer-changed', false, false],
  ['bundle-changed', false, false],
  ['engine-secret-error', true, false],
  ['exec-wrong-container', true, false],
  ['exec-malformed-frame', true, false],
  ['ambiguous-route', true, false],
  ['expired-prepare', false, false],
  ['websocket-rejected', true, true],
  ['websocket-accept', true, true],
  ['live-config', true, false],
  ['missing-route', true, false],
  ['missing-server', true, false],
  ['label-reordered', true, true],
  ['label-duplicated', true, true],
  ['label-unpinned', true, true],
  ['label-swapped', true, true],
] as const;
for (const [fault, reachesNative, reachesCollector] of preparationFaults) {
  test(
    'actual production prepare refuses ' + fault + ' at its observation boundary with no mutation',
    async () => {
      const { observation, code } = await observe(fault);
      expect(code).toBe(2);
      expect(observation.refusal).toBe('edge Init adoption refused: preparation-failed');
      expect(observation.receiptStages).toEqual([]);
      expect(observation.reads.includes('native')).toBe(reachesNative);
      expect(observation.reads.includes('collector')).toBe(reachesCollector);
      const last = observation.reads.at(-1);
      if (
        [
          'source-false',
          'source-absent-init',
          'source-duplicate-init',
          'source-anchor',
          'forged-lock',
          'owner-marker',
          'queued-job',
          'boot-drift',
        ].includes(fault) ||
        (fault.startsWith('source-') &&
          !['source-missing', 'source-unreadable', 'source-replaced', 'source-byte-race'].includes(
            fault,
          ))
      )
        expect(last).toBe('GET /containers/' + 'e'.repeat(64) + '/json');
      else if (
        [
          'source-missing',
          'source-unreadable',
          'source-replaced',
          'source-byte-race',
          'writer-changed',
          'bundle-changed',
          'packet-version',
          'packet-versionless',
          'packet-profile-missing',
          'packet-profile-old',
          'expired-prepare',
        ].includes(fault)
      )
        expect(observation.reads).toEqual([]);
      else if (['populated-cgroup', 'crontab-unreadable', 'recycled-pid'].includes(fault))
        expect(last).toBe('native');
      else if (fault === 'engine-secret-error') expect(last).toBe('GET /version');
      else if (fault === 'ambiguous-route') expect(last).toBe('native');
      else if (fault === 'exec-wrong-container')
        expect(last).toMatch(/^GET \/exec\/[a-f0-9]{64}\/json$/);
      else if (fault === 'exec-malformed-frame')
        expect(last).toMatch(/^POST \/exec\/[a-f0-9]{64}\/start$/);
      else if (fault === 'daemon-drift') expect(last).toBe('GET /info');
      else if (fault === 'graph-extra')
        expect(last).toBe('GET /containers/' + 'e'.repeat(64) + '/json');
      else if (fault === 'exec-stderr') expect(last).toMatch(/^POST \/exec\/[a-f0-9]{64}\/start$/);
      else if (fault === 'exec-nonterminal')
        expect(last).toMatch(/^GET \/exec\/[a-f0-9]{64}\/json$/);
      else if (fault === 'public-body' || fault === 'public-redirect') expect(last).toBe('probe:/');
      else if (['manifest-body', 'manifest-digest'].includes(fault))
        expect(last).toMatch(/^probe:\/v2\/fixture\/service\/manifests\/sha256:[a-f0-9]{64}$/);
      else if (['wrong-tls-name', 'wrong-connect'].includes(fault)) expect(last).toBe('native');
      else if (fault === 'new-launcher' || fault === 'collector-descendant')
        expect(last).toBe('collector');
      else if (fault === 'websocket-rejected' || fault === 'websocket-accept')
        expect(last).toBe('upgrade:/ws');
      else if (fault === 'missing-route' || fault === 'missing-server')
        expect(last).toMatch(/^GET \/exec\/[a-f0-9]{64}\/json$/);
      else if (fault.startsWith('label-')) expect(last).toBe('native');
      else if (fault === 'live-config') expect(last).toMatch(/^GET \/exec\/[a-f0-9]{64}\/json$/);
      else if (fault === 'registry-challenge') expect(last).toBe('probe:/v2/');
      else if (fault === 'network-missing') expect(last).toBe('GET /networks/' + '1'.repeat(64));
      else if (fault === 'native-malformed')
        expect(last).toBe('GET /containers/' + 'e'.repeat(64) + '/json');
      else throw new Error('missing explicit refusal boundary ' + fault);
    },
    120000,
  );
}

const classifications = [
  'before-create',
  'create-unacknowledged-no-candidate-observed',
  'candidate-inert',
  'original-stopped',
  'original-renamed',
  'candidate-renamed',
  'candidate-running-original-retained',
  'candidate-stopped-after-start',
  'candidate-running-original-absent',
];
for (const target of ['registry', 'caddy']) {
  for (const classification of classifications) {
    test(
      'actual read-only recovery classifies ' + target + ' ' + classification,
      async () => {
        const { observation, code } = await observe('recovery', classification, target);
        expect(code, failureContext(observation)).toBe(0);
        expect(observation.summary?.stage).toBe('recovery-observed');
        expect(observation.summary?.recovery?.scope).toBe('read-only-recovery-observation');
        const targets = observation.summary?.recovery?.targets;
        expect(targets?.map((entry) => entry.target)).toEqual(['registry', 'caddy']);
        expect(targets?.find((entry) => entry.target === target)?.class).toBe(classification);
        expect(observation.reads).toContain('collector');
        if (
          target === 'caddy' &&
          [
            'original-stopped',
            'original-renamed',
            'candidate-renamed',
            'candidate-stopped-after-start',
          ].includes(classification)
        ) {
          expect(targets?.[0]?.health).toBe('not-applicable-edge-stopped');
          expect(targets?.[1]?.health).toBe('not-applicable-stopped');
        }
      },
      120000,
    );
  }
}
for (const classification of ['retained', 'registry-removed', 'complete']) {
  test(
    'actual read-only recovery observes global prefix ' + classification,
    async () => {
      const { observation, code } = await observe('recovery', classification, 'caddy');
      expect(code, failureContext(observation)).toBe(0);
      expect(observation.summary?.stage).toBe('recovery-observed');
      expect(observation.summary?.recovery?.targets.map((entry) => entry.class)).toEqual([
        classification === 'retained'
          ? 'candidate-running-original-retained'
          : 'candidate-running-original-absent',
        classification === 'complete'
          ? 'candidate-running-original-absent'
          : 'candidate-running-original-retained',
      ]);
    },
    120000,
  );
}
test('actual recovery accepts expired historical operation under a distinct currently held edge descriptor', async () => {
  const { observation, code } = await observe('recovery', 'complete', 'caddy', 'expired-window');
  expect(code, failureContext(observation)).toBe(0);
  expect(observation.summary?.recovery?.window).toBe('expired');
}, 120000);

test('actual read-only recovery refuses a v1 packet before any observation', async () => {
  const { observation, code } = await observe('recovery', 'complete', 'registry', 'packet-version');
  expect(code).toBe(2);
  expect(observation.refusal).toBe('edge Init adoption refused: preparation-failed');
  expect(observation.reads).toEqual([]);
  expect(observation.transcript).toEqual([]);
}, 120000);
for (const fault of [
  // Proof: omitting the production historical packet equality made this actual-entry recovery negative fail with success exit0; restored run passed.
  'receipt-packet',
  // Proof: omitting only sourceRosterSha256 equality made this actual-entry negative fail with success exit0; restored run passed.
  'receipt-source',
  // Proof: omitting only literalInitSha256 equality made this actual-entry negative fail with success exit0; restored run passed.
  'receipt-literal',
  'receipt-profile-missing',
  'receipt-profile-changed',
  'receipt-profile-old',
  'receipt-version',
  'receipt-v2',
  'receipt-v2-expired',
  'receipt-directory-owner-mismatch',
  'receipt-versionless',
  'receipt-original-process',
  'receipt-process-drift',
  'old-cgroup-populated',
  'receipt-invariants',
  'receipt-order',
  'candidate-env',
  'candidate-init',
  'candidate-image',
  // Proof: omitting the production candidate invariant comparison admitted this changed mount; actual-entry test failed with success exit0, then passed after restoration.
  'candidate-mount',
  'candidate-endpoint',
  'candidate-namespace',
  'candidate-executable',
  'candidate-absent',
  'candidate-name',
  'both-running',
  'forged-current-lock',
  'daemon-drift',
  'boot-drift',
  'source-missing',
  'source-unreadable',
  'graph-extra',
  'wrong-tls-name',
  'wrong-connect',
  'exec-stderr',
  'exec-nonterminal',
  'live-config',
  'service-unknown',
  'collector-descendant',
  'network-missing',
]) {
  test(
    'actual recovery refuses ' + fault + ' with complete originals already absent',
    async () => {
      const { observation, code } = await observe('recovery', 'complete', 'registry', fault);
      expect(code).toBe(2);
      expect(observation.refusal).toBe('edge Init adoption refused: preparation-failed');
      expect(observation.summary).toBeUndefined();
      const last = observation.reads.at(-1);
      if (
        [
          'receipt-packet',
          'receipt-source',
          'receipt-literal',
          'receipt-profile-missing',
          'receipt-profile-changed',
          'receipt-profile-old',
          'receipt-version',
          'receipt-v2',
          'receipt-v2-expired',
          'receipt-directory-owner-mismatch',
          'receipt-versionless',
          'receipt-invariants',
          'receipt-order',
          'forged-current-lock',
          'source-missing',
          'source-unreadable',
        ].includes(fault)
      )
        expect(observation.reads).toEqual([]);
      else if (
        [
          'candidate-env',
          'candidate-init',
          'candidate-image',
          'candidate-mount',
          'candidate-endpoint',
          'candidate-name',
        ].includes(fault)
      ) {
        expect(observation.reads).toHaveLength(4);
        expect(observation.reads[0]).toBe('GET /containers/json?all=1');
        expect(last).toMatch(/^GET \/containers\/[a-f0-9]{64}\/json$/);
        expect(observation.reads).not.toContain('collector');
      } else if (fault === 'candidate-absent') {
        expect(observation.reads).toHaveLength(3);
        expect(observation.reads).not.toContain('collector');
      } else if (fault === 'both-running') {
        expect(observation.reads).toHaveLength(5);
        expect(last).toBe('GET /containers/' + 'd'.repeat(64) + '/json');
      } else if (
        [
          'receipt-original-process',
          'receipt-process-drift',
          'old-cgroup-populated',
          'candidate-namespace',
          'candidate-executable',
        ].includes(fault)
      ) {
        expect(last).toBe('native');
        expect(observation.reads).toContain('collector');
      } else if (['wrong-tls-name', 'wrong-connect', 'service-unknown'].includes(fault)) {
        expect(last).toBe('GET /containers/' + hashCandidate(0) + '/json');
        expect(observation.reads).toContain('collector');
      } else if (fault === 'network-missing') {
        expect(last).toBe('GET /networks/' + '1'.repeat(64));
        expect(observation.reads).toContain('collector');
      } else if (fault === 'collector-descendant') expect(last).toBe('collector');
      else if (fault === 'exec-stderr') expect(last).toMatch(/^POST \/exec\/[a-f0-9]{64}\/start$/);
      else if (fault === 'exec-nonterminal')
        expect(last).toMatch(/^GET \/exec\/[a-f0-9]{64}\/json$/);
      else if (fault === 'live-config') {
        expect(last).toBe('GET /containers/' + hashCandidate(1) + '/json');
        expect(observation.reads.at(-2)).toBe('GET /containers/json?all=1');
        expect(observation.reads.at(-3)).toMatch(/^GET \/exec\/[a-f0-9]{64}\/json$/);
      } else if (fault === 'daemon-drift' || fault === 'graph-extra')
        expect(last).toBe('GET /info');
      else if (fault === 'boot-drift') {
        expect(observation.reads).toHaveLength(4);
        expect(observation.reads).not.toContain('native');
      } else throw new Error('missing specific recovery refusal boundary ' + fault);
    },
    120000,
  );
}

test('actual production execute completes the closed twelve-effect transcript and durable receipt grammar', async () => {
  const { observation, code } = await observe('execute');
  expect(code, failureContext(observation)).toBe(0);
  expect(observation.summary?.stage).toBe('complete');
  const original = ['d'.repeat(64), 'e'.repeat(64)];
  expect(observation.transcript).toEqual([
    ...['registry', 'caddy'].flatMap((kind, index) => [
      'POST /containers/create?name=wbs-init-fixture-' + kind,
      'POST /containers/' + original[index] + '/stop?t=-1',
      'POST /containers/' + original[index] + '/rename?name=wbs-init-fixture-' + kind + '-original',
      'POST /containers/' + hashCandidate(index) + '/rename?name=wbs-' + kind + '-1',
      'POST /containers/' + hashCandidate(index) + '/start',
    ]),
    ...original.map((id) => 'DELETE /containers/' + id + '?v=false&force=false'),
  ]);
  const service = [
    'create-intended',
    'created',
    'candidate-verified',
    'stop-intended',
    'original-stopped',
    'rename-original-intended',
    'rename-candidate-intended',
    'start-intended',
    'healthy',
  ];
  expect(observation.receiptStages).toEqual([
    ...service,
    ...service,
    'retention-point',
    'remove-intended',
    'original-absent',
    'remove-intended',
    'original-absent',
    'complete',
  ]);
}, 120000);

test('actual execute accepts changed allocation counters on the independent name read', async () => {
  const { observation, code } = await observe('execute', '', '', 'network-status-drift');
  expect(code, failureContext(observation)).toBe(0);
  expect(observation.summary?.stage).toBe('complete');
  expect(observation.transcript).toHaveLength(12);
  expect(observation.reads).toContain('GET /networks/edge');
}, 120000);

for (const [classification, fault] of [
  ['candidate-running-original-retained', 'original-absent-early'],
  ['create-unacknowledged-no-candidate-observed', 'lost-create-wrong-name'],
]) {
  test(
    'actual recovery refuses ' + fault + ' at a partial prefix',
    async () => {
      const { observation, code } = await observe('recovery', classification, 'registry', fault);
      expect(code).toBe(2);
      expect(observation.refusal).toBe('edge Init adoption refused: preparation-failed');
    },
    120000,
  );
}
for (const fault of ['service-unhealthy', 'manifest-body']) {
  test(
    'actual recovery reports complete service-negative ' + fault + ' as unhealthy',
    async () => {
      const { observation, code } = await observe('recovery', 'complete', 'registry', fault);
      expect(code, failureContext(observation)).toBe(0);
      expect(observation.summary?.recovery?.targets[0]?.health).toBe('unhealthy');
      expect(observation.summary?.recovery?.targets[1]?.health).toBe('healthy');
    },
    120000,
  );
}

// Proof: omitting the network configuration fingerprint admitted the drifting exact-name response and completed execute; this actual-entry negative failed with exit0.
// Proof: omitting candidate membership admission also completed execute with an inert candidate listed on the full-ID read; its negative failed with exit0.
// Proof: omitting raw readback stability admitted a one-shot changed candidate hostname and completed execute; its negative failed with exit0.
const createdNetworkFaults = [
  'network-name-substitution',
  'network-id-owner',
  'network-config-drift',
  'network-ipam-drift',
  'network-status-missing',
  'network-status-extra',
  'network-status-unsafe',
  'network-name-missing',
  'network-name-unreadable',
  'network-malformed',
  'network-membership-id',
  'network-membership-name',
  'network-membership-malformed',
  'network-stable-read',
  'created-wrong-id',
  'created-extra-name',
  'created-alias-drift',
  'created-gateway',
  'created-ipv6-gateway',
  'created-mac',
  'created-prefix',
  'created-ipv6-prefix',
  'created-dns',
  'created-sandbox',
  'created-process',
  'created-ports',
];
for (const fault of createdNetworkFaults) {
  test(
    'actual factory refuses created network fault ' + fault + ' before original stop',
    async () => {
      const { observation, code } = await observe('execute', '', '', fault);
      expect(code).toBe(2);
      expect(observation.refusal).toBe('edge Init adoption refused: operation-refused');
      expect(observation.transcript).toEqual([
        'POST /containers/create?name=wbs-init-fixture-registry',
      ]);
      expect(observation.receiptStages).toEqual(['create-intended', 'created', 'candidate-inert']);
      const afterCreate = observation.reads.slice(
        observation.reads.lastIndexOf('POST /containers/create?name=wbs-init-fixture-registry') + 1,
      );
      if (fault.startsWith('created-') || fault === 'network-stable-read')
        expect(afterCreate.at(-1)).toBe('GET /containers/' + hashCandidate(0) + '/json');
      else expect(afterCreate.at(-1)).toBe('GET /networks/edge');
      if (!fault.startsWith('created-')) {
        expect(afterCreate).toContain('GET /networks/' + '1'.repeat(64));
        expect(afterCreate).toContain('GET /networks/edge');
      }
    },
    120000,
  );
}
for (const fault of [
  'network-name-substitution',
  'network-id-owner',
  'network-config-drift',
  'network-ipam-drift',
  'network-status-missing',
  'network-status-unsafe',
  'network-name-missing',
  'network-name-unreadable',
  'network-malformed',
  'network-membership-malformed',
  'running-blank',
  'inventory-unknown',
  'raw-inventory-drift',
]) {
  test(
    'actual recovery refuses refreshed network fault ' + fault,
    async () => {
      const { observation, code } = await observe('recovery', 'complete', 'registry', fault);
      expect(code).toBe(2);
      expect(observation.refusal).toBe('edge Init adoption refused: preparation-failed');
      expect(observation.summary).toBeUndefined();
      const last = observation.reads.at(-1);
      if (fault === 'running-blank') expect(observation.reads).toHaveLength(4);
      else if (fault === 'inventory-unknown')
        expect(last).toBe(
          'GET /containers/' +
            createHash('sha256').update('unknown-inventory').digest('hex') +
            '/json',
        );
      else if (fault === 'raw-inventory-drift')
        expect(last).toBe(
          'GET /containers/' +
            createHash('sha256').update('unrelated-created').digest('hex') +
            '/json',
        );
      else expect(last).toBe('GET /networks/edge');
    },
    120000,
  );
}
for (const fault of ['network-membership-id', 'network-membership-name']) {
  test(
    'actual inert recovery refuses network membership ' + fault,
    async () => {
      const { observation, code } = await observe('recovery', 'candidate-inert', 'registry', fault);
      expect(code).toBe(2);
      expect(observation.refusal).toBe('edge Init adoption refused: preparation-failed');
      expect(observation.reads.at(-1)).toBe('GET /networks/edge');
    },
    120000,
  );
}
test('actual stopped-original recovery refuses a blank original endpoint', async () => {
  const { observation, code } = await observe(
    'recovery',
    'original-stopped',
    'registry',
    'stopped-original-blank',
  );
  expect(code).toBe(2);
  expect(observation.refusal).toBe('edge Init adoption refused: preparation-failed');
  expect(observation.reads).not.toContain('collector');
}, 120000);
test('actual recovery snapshots an unrelated created blank endpoint without granting effects', async () => {
  const { observation, code } = await observe(
    'recovery',
    'complete',
    'registry',
    'unrelated-created',
  );
  expect(code, failureContext(observation)).toBe(0);
  expect(observation.summary?.stage).toBe('recovery-observed');
  expect(observation.summary?.recovery?.targets.map((entry) => entry.class)).toEqual([
    'candidate-running-original-absent',
    'candidate-running-original-absent',
  ]);
  expect(observation.reads).toContain(
    'GET /containers/' + createHash('sha256').update('unrelated-created').digest('hex') + '/json',
  );
}, 120000);

// Proof: omitting the frozen expiry or recapturing it from current clocks each applied a late Caddy stop and failed the actual-entry rollback assertion; restored regression passed.
for (const fault of ['clock-rollback', 'clock-forward-control']) {
  test(
    'actual factory preserves first effect expiry under ' + fault,
    async () => {
      const { observation, code } = await observe('execute', '', '', fault);
      expect(code).toBe(2);
      expect(observation.refusal).toBe('edge Init adoption refused: operation-refused');
      const clock = observation.clock;
      if (clock === undefined) throw new Error('actual clock evidence missing');
      expect(clock.firstAdmission.expires).toBeGreaterThan(clock.firstAdmission.monotonic + 350000);
      expect(clock.firstAdmission.expires).toBeLessThan(clock.firstAdmission.monotonic + 361000);
      expect(clock.shifts[0]?.event).toBe('registry-create-150s');
      if (fault === 'clock-rollback') {
        const rollback = clock.shifts.find(
          (shift) => shift.event === 'wall-rollback-before-caddy-reset',
        );
        expect(rollback).toBeDefined();
        if (rollback === undefined) throw new Error('clock rollback not exercised');
        expect(rollback.beforeWall - rollback.afterWall).toBe(150000);
        expect(rollback.afterWall).toBeGreaterThan(clock.issuedAt);
      } else expect(clock.shifts).toHaveLength(1);
      expect(clock.stopApplied).toBe(false);
      expect(
        clock.effects.filter(
          (effect) => effect.applied && effect.monotonic > clock.firstAdmission.expires,
        ),
      ).toEqual([]);
      expect(observation.transcript).toEqual([
        'POST /containers/create?name=wbs-init-fixture-registry',
        'POST /containers/' + 'd'.repeat(64) + '/stop?t=-1',
        'POST /containers/' + 'd'.repeat(64) + '/rename?name=wbs-init-fixture-registry-original',
        'POST /containers/' + hashCandidate(0) + '/rename?name=wbs-registry-1',
        'POST /containers/' + hashCandidate(0) + '/start',
      ]);
      expect(observation.receiptStages.at(-1)).toBe('before-create');
      expect(Object.keys(clock.sourceSha256)).toEqual([
        'edge-init.ts',
        'edge-init-operation.ts',
        'edge-init-observer.ts',
      ]);
    },
    120000,
  );
}
