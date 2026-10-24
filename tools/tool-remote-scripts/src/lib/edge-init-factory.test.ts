import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { afterAll, beforeAll, expect, test } from 'bun:test';

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
  const scratch = await mkdtemp(resolve(tmpdir(), 'edge-init-factory-'));
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

test('actual production prepare traverses native host, collector, fixed Caddy Exec and authenticated TLS reads without effects or receipts', async () => {
  const { observation, code } = await observe('prepare');
  expect(code).toBe(0);
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
          'expired-prepare',
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
        expect(code).toBe(0);
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
      expect(code).toBe(0);
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
  expect(code).toBe(0);
  expect(observation.summary?.recovery?.window).toBe('expired');
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
  'receipt-version',
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
          'receipt-version',
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
  expect(code).toBe(0);
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
      expect(code).toBe(0);
      expect(observation.summary?.recovery?.targets[0]?.health).toBe('unhealthy');
      expect(observation.summary?.recovery?.targets[1]?.health).toBe('healthy');
    },
    120000,
  );
}
