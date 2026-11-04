import { expect, test } from 'bun:test';

async function observe(scenario: string) {
  const child = Bun.spawn(
    [process.execPath, `${import.meta.dir}/registry-backup-provider.fixture.ts`, scenario],
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
    message?: string;
    requests: { method: string; path: string; version: string | null }[];
    lockCalls: number;
    outcome: { before: unknown[]; after: unknown[]; caller?: boolean };
  };
}
test('production root entry reads complete paginated current/history locks and marker using signed SDK wire', async () => {
  const observed = await observe('census');
  expect(observed.ok).toBe(true);
  expect(observed.outcome.before).toEqual([
    {
      key: 'locks/305531dcc50ebca31cf1d5b31e9fc76ed51f66b3b6dd5a030c6539ae6532f979',
      kind: 'object',
      versionId: 'current',
      visible: true,
      sha256: '305531dcc50ebca31cf1d5b31e9fc76ed51f66b3b6dd5a030c6539ae6532f979',
      bytes: 10,
    },
    {
      key: 'locks/305531dcc50ebca31cf1d5b31e9fc76ed51f66b3b6dd5a030c6539ae6532f979',
      kind: 'object',
      versionId: 'history',
      visible: false,
      sha256: '305531dcc50ebca31cf1d5b31e9fc76ed51f66b3b6dd5a030c6539ae6532f979',
      bytes: 10,
    },
    { key: `locks/${'a'.repeat(64)}`, kind: 'delete-marker', versionId: 'marker', visible: true },
  ]);
  expect(
    observed.requests
      .filter((request) => request.version !== null)
      .map((request) => request.version),
  ).toEqual(['current', 'history']);
  expect(observed.lockCalls).toBeGreaterThanOrEqual(3);
});
for (const scenario of [
  'uid',
  'lock',
  'ownership',
  'abort',
  'unsupported',
  'query',
  'userinfo',
  'encoded',
  'normalized',
  'credentials',
  'region',
  'journal-absent',
  'journal-relative',
  'descriptor',
  'signal-invalid',
])
  test(`production provider refuses ${scenario} before network`, async () => {
    const observed = await observe(scenario);
    expect(observed.ok).toBe(false);
    expect(observed.requests).toEqual([]);
    if (
      [
        'uid',
        'ownership',
        'abort',
        'journal-absent',
        'journal-relative',
        'descriptor',
        'signal-invalid',
      ].includes(scenario)
    )
      expect(observed.message).toBe('Missing current root backup version authority');
    if (
      ['unsupported', 'query', 'encoded', 'normalized', 'credentials', 'region'].includes(scenario)
    )
      expect(observed.message).toBe('backup-budget-unavailable');
  });
for (const scenario of [
  'name',
  'hash',
  'size',
  'missing-body',
  'changed',
  'lost-lock',
  'ownership-io',
  'maintenance-io',
  'abort-io',
  'lock-upload',
  'ciphertext-bound',
])
  test(`production provider refuses ${scenario} without deletion`, async () => {
    const observed = await observe(scenario);
    expect(observed.ok).toBe(false);
    expect(observed.requests.some((request) => request.method === 'DELETE')).toBe(false);
  });
test('production provider removes only fresh visible exact version and confirms history promotion', async () => {
  const observed = await observe('remove');
  expect(observed.ok).toBe(true);
  expect(observed.requests.filter((request) => request.method === 'DELETE')).toEqual([
    {
      method: 'DELETE',
      path: '/registry-backup/backups/registry/locks/305531dcc50ebca31cf1d5b31e9fc76ed51f66b3b6dd5a030c6539ae6532f979',
      version: 'current',
    },
  ]);
  expect(observed.outcome.after).toHaveLength(2);
  expect(observed.outcome.after).toContainEqual(
    expect.objectContaining({ versionId: 'history', visible: true }),
  );
});
for (const scenario of [
  'remove-history',
  'remove-marker',
  'remove-forged',
  'delete-retained',
  'remove-changed',
  'remove-abort',
  'remove-lock-before-delete',
  'remove-owner-before-delete',
])
  test(`production exact removal refuses ${scenario}`, async () => {
    const observed = await observe(scenario);
    expect(observed.ok).toBe(false);
    expect(observed.requests.filter((request) => request.method === 'DELETE')).toHaveLength(
      scenario === 'delete-retained' ? 1 : 0,
    );
  });
test('actual backup action forwards installed journal path and caller signal into root provider', async () => {
  const observed = await observe('caller');
  expect(observed.ok).toBe(true);
  expect(observed.outcome.caller).toBe(true);
  expect(observed.requests).toEqual([]);
});

test('production census revalidates lock before the next pagination request', async () => {
  const observed = await observe('lock-between-pages');
  expect(observed.ok).toBe(false);
  expect(observed.requests).toHaveLength(2);
});
test('production census shares one deadline across metadata and ciphertext methods (modeled timer)', async () => {
  const observed = await observe('cycle-deadline');
  expect(observed.ok).toBe(false);
  expect(observed.message).toBe('Registry S3 operation refused: cancelled');
});
for (const scenario of ['sdk-count', 'sdk-metadata'])
  test(`production wrapper refuses ${scenario} (broken SDK producer model)`, async () => {
    const observed = await observe(scenario);
    expect(observed.ok).toBe(false);
    expect(observed.message).toBe('Raw backup lock census exceeds bound');
    expect(observed.requests).toEqual([]);
  });
test('production root entry permits an authenticated empty repository lock census', async () => {
  const observed = await observe('empty');
  expect(observed.ok).toBe(true);
  expect(observed.outcome.before).toEqual([]);
});

test('snapshot observer retains exact current/history/marker rows from complete signed SDK census without object reads', async () => {
  const observed = await observe('snapshot-census');
  expect(observed.ok).toBe(true);
  expect(observed.outcome.before).toEqual([
    { snapshotId: 'b'.repeat(64), versionId: 'current', kind: 'object', visible: true, bytes: 7 },
    { snapshotId: 'b'.repeat(64), versionId: 'history', kind: 'object', visible: false, bytes: 7 },
    { snapshotId: 'c'.repeat(64), versionId: 'marker', kind: 'delete-marker', visible: true },
  ]);
  expect(
    observed.requests.every((request) => request.method === 'GET' && request.version === null),
  ).toBe(true);
});
test('snapshot observer permits authenticated empty snapshot census', async () => {
  const observed = await observe('snapshot-empty');
  expect(observed.ok).toBe(true);
  expect(observed.outcome.before).toEqual([]);
});
for (const fault of [
  'signal-absent',
  'signal-invalid',
  'abort',
  'name',
  'history-name',
  'marker-name',
  'upload',
  'root-abort-io',
  'retention-abort-io',
  'owner-io',
  'lock-between-pages',
  'cycle-deadline',
  'sdk-count',
  'sdk-metadata',
  'sdk-bytes',
]) {
  test(`snapshot observer refuses ${fault} through production consumer`, async () => {
    const observed = await observe(`snapshot-${fault}`);
    expect(observed.ok).toBe(false);
    expect(
      observed.requests.some((request) => request.method !== 'GET' || request.version !== null),
    ).toBe(false);
    if (
      [
        'signal-absent',
        'signal-invalid',
        'abort',
        'sdk-count',
        'sdk-metadata',
        'sdk-bytes',
      ].includes(fault)
    )
      expect(observed.requests).toEqual([]);
    if (
      [
        'root-abort-io',
        'retention-abort-io',
        'owner-io',
        'lock-between-pages',
        'cycle-deadline',
      ].includes(fault)
    )
      expect(observed.requests).toHaveLength(2);
  });
}

for (const scenario of ['durable-delete', 'durable-response-loss', 'durable-missing'] as const) {
  test(`actual SDK DELETE consumes durable authority: ${scenario}`, async () => {
    const observed = await observe(scenario);
    expect(observed.ok).toBe(scenario === 'durable-delete');
    expect(observed.requests.filter((request) => request.method === 'DELETE')).toHaveLength(
      scenario === 'durable-missing' ? 0 : 1,
    );
    if (scenario === 'durable-response-loss') expect(observed.message).toContain('replay');
  });
}
