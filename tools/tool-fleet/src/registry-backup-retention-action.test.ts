import { expect, test } from 'bun:test';

async function observe(scenario: string) {
  const child = Bun.spawn(
    [process.execPath, `${import.meta.dir}/registry-backup-retention-action.fixture.ts`, scenario],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(code).toBe(0);
  expect(stderr).toBe('');
  return JSON.parse(stdout) as {
    ok: boolean;
    calls: string[];
    receipt?: string;
    unchanged: boolean;
    stage: string | null;
    exactFailure: boolean;
    missingFailure: boolean;
  };
}
for (const scenario of ['preflight', 'preflight-null', 'snapshot']) {
  test(`actual root ${scenario} admits before retention then proceeds with incomplete coverage and exact canonical inputs (modeled store)`, async () => {
    const observed = await observe(scenario);
    expect(observed.ok).toBe(true);
    expect(observed.calls).toEqual([
      'admit',
      'open',
      'raw-census',
      'repository',
      'raw-census',
      'retention',
      scenario === 'snapshot' ? 'snapshot' : 'prepare',
      'raw-census',
      'repository',
      'raw-census',
    ]);
    expect(observed.unchanged).toBe(true);
  });
}
for (const scenario of [
  'preflight-retention-fail',
  'snapshot-retention-fail',
  'preflight-absent',
]) {
  test(`actual root ${scenario} refuses before preparation or new snapshot and preserves previous receipt`, async () => {
    const observed = await observe(scenario);
    expect(observed.ok).toBe(false);
    expect(observed.calls).toEqual([
      'admit',
      'open',
      'raw-census',
      'repository',
      'raw-census',
      'retention',
    ]);
    expect(observed.unchanged).toBe(true);
    expect(observed.stage).toBe('repository-verification');
    if (scenario.endsWith('retention-fail')) expect(observed.exactFailure).toBe(true);
    if (scenario === 'preflight-absent') expect(observed.missingFailure).toBe(true);
  });
}
for (const scenario of [
  'preflight-admission-fail',
  'preflight-raw-fail',
  'preflight-repository-fail',
]) {
  test(`actual root ${scenario} stops before retention (modeled ports)`, async () => {
    const observed = await observe(scenario);
    expect(observed.ok).toBe(false);
    expect(observed.calls).toEqual(
      scenario.endsWith('admission-fail')
        ? ['admit']
        : scenario.endsWith('raw-fail')
          ? ['admit', 'open', 'raw-census']
          : ['admit', 'open', 'raw-census', 'repository'],
    );
    expect(observed.unchanged).toBe(true);
  });
}
test('actual root verify keeps existing flow without retention or snapshot effects', async () => {
  const observed = await observe('verify');
  expect(observed.ok).toBe(true);
  expect(observed.calls).toEqual([
    'admit',
    'open',
    'raw-census',
    'repository',
    'raw-census',
    'verify',
    'raw-census',
    'repository',
    'raw-census',
  ]);
  expect(observed.unchanged).toBe(true);
});

test('snapshot refuses a canonical phase other than stopped and preserves prior receipt (modeled ports)', async () => {
  const observed = await observe('snapshot-wrong-phase');
  expect(observed.ok).toBe(false);
  expect(observed.calls).not.toContain('snapshot');
  expect(observed.unchanged).toBe(true);
});
