import { expect, test } from 'bun:test';

import { type PodObservation, type RecoveryDriver, rehearseRecovery } from './forge-recovery-check';
import { observePod, requireMemoryEvidence } from './forge-recovery-lab';

const initial: PodObservation = {
  uid: 'owned-pod',
  container: 'containerd://first',
  restarts: 0,
  ready: true,
  oom: false,
};

function fixture() {
  const observations: PodObservation[] = [
    initial,
    { ...initial, container: 'containerd://second', restarts: 1 },
    { ...initial, container: 'containerd://third', restarts: 2 },
  ];
  let position = 0;
  let restored = false;
  const checks: string[] = [];
  const driver: RecoveryDriver = {
    observe: () => Promise.resolve(observations[position++] ?? null),
    kill: () => Promise.resolve(),
    check: async (phase) => {
      await Promise.resolve();
      checks.push(phase);
      return phase === 'ingress-denied'
        ? {
            exitCode: 1,
            output:
              'CHECK FAILED: MCP answers 401 with resource metadata on the environment origin',
          }
        : { exitCode: 0, output: 'passed' };
    },
    readPolicy: () =>
      Promise.resolve(
        restored
          ? { ingress: [{ from: ['controller'] }] }
          : { ingress: [{ from: ['controller'] }] },
      ),
    writePolicy: async (policy) => {
      await Promise.resolve();
      restored = policy.ingress.length > 0;
    },
    cleanup: () => Promise.resolve(),
    pause: () => Promise.resolve(),
  };
  return { driver, observations, checks };
}

test('accepts MCP ingress refusal and executes restored full positive', async () => {
  const { driver, checks } = fixture();
  const report = await rehearseRecovery(driver, 50);
  expect(report.acceptancePassed).toBe(true);
  expect(checks).toEqual(['first', 'ingress-positive', 'ingress-denied', 'restored']);
});

test('preserves first OOM even when a later automatic container becomes ready', async () => {
  const { driver, observations } = fixture();
  observations.unshift({ ...initial, ready: false, oom: true });
  const report = await rehearseRecovery(driver, 50);
  expect(report.cold).toBe('fail');
  expect(report.acceptancePassed).toBe(false);
});

test('rejects cold restart without an observed OOM', async () => {
  const { driver, observations } = fixture();
  observations[0] = { ...initial, restarts: 1 };
  expect((await rehearseRecovery(driver, 50)).cold).toBe('fail');
});

for (const [name, changed] of [
  ['foreign Pod UID', { uid: 'foreign', container: 'containerd://second', restarts: 1 }],
  ['unchanged container', { uid: 'owned-pod', container: 'containerd://first', restarts: 1 }],
  ['unchanged restart count', { uid: 'owned-pod', container: 'containerd://second', restarts: 0 }],
] as const) {
  test(`rejects ${name} after PID1 termination`, async () => {
    const { driver, observations } = fixture();
    observations[1] = { ...initial, ...changed };
    observations.splice(2);
    const report = await rehearseRecovery(driver, 5);
    expect(report.recovery[0]).toBe('fail');
    expect(report.acceptancePassed).toBe(false);
    expect(report.cleanup).toBe('pass');
  });
}

test('rejects omitted ingress negative even when both positive checkers pass', async () => {
  const { driver } = fixture();
  driver.check = () => Promise.resolve({ exitCode: 0, output: 'passed' });
  const report = await rehearseRecovery(driver, 50);
  expect(report.ingressNegative).toBe('fail');
  expect(report.acceptancePassed).toBe(false);
});

test('rejects unrelated checker failure as ingress proof', async () => {
  const { driver } = fixture();
  driver.check = () => Promise.resolve({ exitCode: 1, output: 'Error: executable not found' });
  expect((await rehearseRecovery(driver, 50)).ingressNegative).toBe('fail');
});

test('rejects policy restoration mismatch and still cleans up', async () => {
  const { driver } = fixture();
  let reads = 0;
  driver.readPolicy = () =>
    Promise.resolve(++reads === 1 ? { ingress: [{ from: ['controller'] }] } : { ingress: [] });
  const report = await rehearseRecovery(driver, 50);
  expect(report.policyRestored).toBe('fail');
  expect(report.acceptancePassed).toBe(false);
  expect(report.cleanup).toBe('pass');
});

test('records cleanup refusal independently and denies overall acceptance', async () => {
  const { driver } = fixture();
  driver.cleanup = async () => {
    await Promise.resolve();
    throw new Error('owned Lease remains');
  };
  const report = await rehearseRecovery(driver, 50);
  expect(report.cleanup).toBe('fail');
  expect(report.acceptancePassed).toBe(false);
});

test('parses first-container OOM before a replacement status exists', () => {
  const observed = observePod({
    metadata: { uid: 'owned' },
    status: {
      containerStatuses: [
        {
          name: 'source',
          containerID: 'containerd://first',
          ready: false,
          restartCount: 0,
          state: { terminated: { reason: 'OOMKilled', exitCode: 137 } },
          lastState: {},
        },
      ],
    },
  });
  expect(observed?.oom).toBe(true);
});

test('rejects malformed status rather than inventing a ready identity', () => {
  expect(() =>
    observePod({
      metadata: { uid: 'owned' },
      status: {
        containerStatuses: [
          {
            name: 'source',
            containerID: 'containerd://first',
            ready: true,
            restartCount: '0',
            state: {},
            lastState: {},
          },
        ],
      },
    }),
  ).toThrow('expected nonnegative integer');
});

test('models not-yet-created container status as pending startup', () => {
  expect(observePod({ metadata: { uid: 'owned' }, status: {} })).toBeNull();
});

test('does not credit ingress negative when preceding positive checker failed', async () => {
  const { driver } = fixture();
  driver.check = (phase) =>
    Promise.resolve(
      phase === 'ingress-positive'
        ? {
            exitCode: 1,
            output:
              'CHECK FAILED: MCP answers 401 with resource metadata on the environment origin',
          }
        : phase === 'ingress-denied'
          ? {
              exitCode: 1,
              output:
                'CHECK FAILED: MCP answers 401 with resource metadata on the environment origin',
            }
          : { exitCode: 0, output: 'passed' },
    );
  const report = await rehearseRecovery(driver, 50);
  expect(report.ingressNegative).toBe('fail');
});

test('does not label a deliberate SIGKILL exit 137 as an OOM', () => {
  expect(
    observePod({
      metadata: { uid: 'owned' },
      status: {
        containerStatuses: [
          {
            name: 'source',
            containerID: 'containerd://replacement',
            ready: true,
            restartCount: 2,
            state: { running: {} },
            lastState: { terminated: { reason: 'Error', exitCode: 137 } },
          },
        ],
      },
    })?.oom,
  ).toBe(false);
});

test('accepts captured API edge-proxy denial after an immediately preceding full positive', async () => {
  const { driver, checks } = fixture();
  const runCheck = driver.check.bind(driver);
  driver.check = (phase) =>
    phase === 'ingress-denied'
      ? Promise.resolve({
          exitCode: 1,
          output:
            'ok: web serves index.html\nerror: CHECK FAILED: API through the edge proxy writes as the local-auth identity',
        })
      : runCheck(phase);
  const report = await rehearseRecovery(driver, 50);
  expect(report.ingressNegative).toBe('pass');
  expect(report.policyRestored).toBe('pass');
  expect(checks).toContain('restored');
});

test('refuses platform-only memory samples as first forge-container evidence', () => {
  expect(() => {
    requireMemoryEvidence(
      '/sys/fs/cgroup/kubepods/platform\nmemory.current\n1\nmemory.peak\n2\nmemory.events\noom 0\nVmRSS: 1 kB',
      initial,
    );
  }).toThrow('first source container memory/RSS evidence absent');
});

test('requires memory current, peak, events and RSS in the first source cgroup', () => {
  const sample =
    '/sys/fs/cgroup/kubepods/podowned-pod/first\nmemory.current\n1\nmemory.peak\n2\nmemory.events\noom 0\nVmRSS: 1 kB';
  expect(() => {
    requireMemoryEvidence(sample, initial);
  }).not.toThrow();
  expect(() => {
    requireMemoryEvidence(sample.replace('memory.peak', 'omitted'), initial);
  }).toThrow();
});

test('refuses inline escaped-newline and Unicode-separator ingress markers', async () => {
  for (const output of [
    'metadata: CHECK FAILED: web serves index.html',
    'metadata: error: CHECK FAILED: web serves index.html',
    'metadata: ' + JSON.stringify('\nerror: CHECK FAILED: web serves index.html'),
    'metadata: \u2028error: CHECK FAILED: web serves index.html',
    'metadata: \u2029CHECK FAILED: web serves index.html',
  ]) {
    const { driver } = fixture();
    const runCheck = driver.check.bind(driver);
    driver.check = (phase) =>
      phase === 'ingress-denied' ? Promise.resolve({ exitCode: 1, output }) : runCheck(phase);
    const report = await rehearseRecovery(driver, 50);
    expect(report.ingressNegative).toBe('fail');
    expect(report.acceptancePassed).toBe(false);
  }
});
