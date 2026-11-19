import { MCP_INTERNAL_SECRET_HEADER } from '@wbs/contracts';
import { expect, it } from 'bun:test';
import type { generateKeyPair } from 'jose';

import {
  addAgentPerson,
  grantCredential,
  issueApiKey,
} from '../testing/machine-credential-fixture';
import { callForwarded, forwardingMachineGrants } from '../testing/mcp-forwarded-call';
import type { Answer } from '../testing/organization-harness';
import { OrganizationHarness } from '../testing/organization-harness';

/** Owns one returned composed fixture and attempts its captured close once, retaining all failures. */
async function runVisibilityCase(
  usesMachineGrants: boolean,
  exercise: (scope: OrganizationHarness) => Promise<void>,
): Promise<void> {
  const machineGrants = usesMachineGrants ? await forwardingMachineGrants() : undefined;
  const scope = OrganizationHarness.openComposedWith({
    now: () => 100,
    ...(machineGrants === undefined ? {} : { machineGrants }),
  });
  const closeScope = scope.closeComposed.bind(scope);
  let primary: { readonly cause: unknown } | null = null;
  const cleanupFailures: unknown[] = [];
  try {
    await scope.register('VisibilityCreator');
    await scope.register('VisibilityReader');
    scope.organization('visibility-org');
    scope.member('visibility-org', 'VisibilityCreator', 'admin', ['org-super-admin']);
    scope.member('visibility-org', 'VisibilityReader', 'member', []);
    scope.bind('VisibilityCreator', 'visibility-org');
    scope.bind('VisibilityReader', 'visibility-org');
    scope.activate();
    await exercise(scope);
  } catch (cause) {
    primary = { cause };
  }
  try {
    await closeScope();
  } catch (cause) {
    cleanupFailures.push(cause);
  }
  if (primary !== null) {
    if (cleanupFailures.length !== 0)
      throw new AggregateError(
        [primary.cause, ...cleanupFailures],
        'Visibility case and composed cleanup failed',
        { cause: primary.cause },
      );
    throw primary.cause;
  }
  if (cleanupFailures.length !== 0)
    throw new AggregateError(cleanupFailures, 'Composed visibility cleanup failed', {
      cause: cleanupFailures[0],
    });
}

/** Reads actual correlated identities from the current combined HTTP birth, without an implicit parent. */
async function createVisibilityPackage(
  scope: OrganizationHarness,
  projectName: string,
  packageName: string,
): Promise<{ readonly projectId: string; readonly workPackageId: string }> {
  const created = await scope.call('VisibilityCreator', 'POST', '/api/projects', {
    name: projectName,
    workPackage: { name: packageName },
  });
  expect(created.status).toBe(201);
  const body = created.body;
  if (
    typeof body !== 'object' ||
    body === null ||
    !('project' in body) ||
    typeof body.project !== 'object' ||
    body.project === null ||
    !('id' in body.project) ||
    typeof body.project.id !== 'string' ||
    body.project.id === '' ||
    !('workPackage' in body) ||
    typeof body.workPackage !== 'object' ||
    body.workPackage === null ||
    !('id' in body.workPackage) ||
    typeof body.workPackage.id !== 'string' ||
    body.workPackage.id === '' ||
    !('projectId' in body.workPackage) ||
    body.workPackage.projectId !== body.project.id
  )
    throw new Error('Actual combined visibility birth lacks its correlated parent and package');
  expect(
    scope.sqlite.query('SELECT project_id FROM work_package WHERE id=?').get(body.workPackage.id),
  ).toEqual({ project_id: body.project.id });
  return { projectId: body.project.id, workPackageId: body.workPackage.id };
}

it('conceals an unreadable restricted package as absent and returns an empty list after real grant removal', async () =>
  runVisibilityCase(false, async (scope) => {
    const open = await createVisibilityPackage(scope, 'Visibility open parent', 'Visibility open');
    const restricted = await createVisibilityPackage(
      scope,
      'Visibility restricted parent',
      'Visibility restricted',
    );
    expect(
      await scope.call(
        'VisibilityCreator',
        'PATCH',
        '/api/work-packages/' + restricted.workPackageId,
        {
          restricted: true,
        },
      ),
    ).toMatchObject({ status: 200 });
    scope.grant('visibility-org', 'VisibilityReader', 'org-viewer');
    expect(
      await scope.call('VisibilityReader', 'GET', '/api/work-packages/' + open.workPackageId),
    ).toMatchObject({ status: 200, body: { workPackage: { id: open.workPackageId } } });
    const absent = await scope.call(
      'VisibilityReader',
      'GET',
      '/api/work-packages/absent-visibility-package',
    );
    expect(absent).toEqual({ status: 404, body: { error: 'not_found' } });
    expect(
      await scope.call('VisibilityReader', 'GET', '/api/work-packages/' + restricted.workPackageId),
    ).toEqual(absent);
    scope.grant(
      'visibility-org',
      'VisibilityReader',
      'project-viewer',
      'project',
      restricted.projectId,
    );
    expect(
      await scope.call('VisibilityReader', 'GET', '/api/work-packages/' + restricted.workPackageId),
    ).toMatchObject({ status: 200, body: { workPackage: { id: restricted.workPackageId } } });
    scope.sqlite.run(
      "DELETE FROM access_grant WHERE organization_id='visibility-org' AND subject_kind='user' AND subject_id=?",
      [scope.userId('VisibilityReader')],
    );
    expect(await scope.call('VisibilityReader', 'GET', '/api/work-packages')).toEqual({
      status: 200,
      body: { workPackages: [], nextCursor: null },
    });
    expect(
      await scope.call('VisibilityReader', 'GET', '/api/work-packages/' + open.workPackageId),
    ).toEqual(absent);
  }));

it('uses only the actual credential package grant for GET and LIST despite its account grants', async () =>
  runVisibilityCase(true, async (scope) => {
    const granted = await createVisibilityPackage(
      scope,
      'Credential granted parent',
      'Credential granted',
    );
    const other = await createVisibilityPackage(
      scope,
      'Credential other parent',
      'Credential other',
    );
    expect(
      await scope.call(
        'VisibilityCreator',
        'PATCH',
        '/api/work-packages/' + granted.workPackageId,
        {
          restricted: true,
        },
      ),
    ).toMatchObject({ status: 200 });
    expect(
      await scope.call('VisibilityCreator', 'GET', '/api/work-packages/' + other.workPackageId),
    ).toMatchObject({ status: 200, body: { workPackage: { id: other.workPackageId } } });
    addAgentPerson(
      scope.sqlite,
      'visibility-agent',
      'visibility-org',
      scope.userId('VisibilityCreator'),
      'Visibility agent',
    );
    const credential = await issueApiKey(scope.sqlite, {
      organizationId: 'visibility-org',
      personId: 'visibility-agent',
      issuedBy: scope.userId('VisibilityCreator'),
      name: 'Visibility credential',
    });
    grantCredential(
      scope.sqlite,
      'visibility-org',
      credential.id,
      'package-viewer',
      'work_package',
      granted.workPackageId,
    );
    expect(
      scope.sqlite
        .query(
          "SELECT scope_kind,scope_id,role_id FROM access_grant WHERE subject_kind='machine_credential' AND subject_id=? ORDER BY id",
        )
        .all(credential.id),
    ).toEqual([
      { scope_kind: 'work_package', scope_id: granted.workPackageId, role_id: 'package-viewer' },
    ]);
    expect(
      await callForwarded(
        scope,
        credential.key,
        'GET',
        '/api/work-packages/' + granted.workPackageId,
        undefined,
        { now: 100 },
      ),
    ).toMatchObject({ status: 200, body: { workPackage: { id: granted.workPackageId } } });
    const absent = await callForwarded(
      scope,
      credential.key,
      'GET',
      '/api/work-packages/absent-credential-package',
      undefined,
      { now: 100 },
    );
    expect(absent).toEqual({ status: 404, body: { error: 'not_found' } });
    expect(
      await callForwarded(
        scope,
        credential.key,
        'GET',
        '/api/work-packages/' + other.workPackageId,
        undefined,
        { now: 100 },
      ),
    ).toEqual(absent);
    const listed = await callForwarded(
      scope,
      credential.key,
      'GET',
      '/api/work-packages',
      undefined,
      { now: 100 },
    );
    expect(listed.status).toBe(200);
    const body = listed.body;
    if (
      typeof body !== 'object' ||
      body === null ||
      !('workPackages' in body) ||
      !Array.isArray(body.workPackages)
    )
      throw new Error('Actual credential work-package list lacks its row array');
    const identities = body.workPackages.map((workPackage: unknown) => {
      if (
        typeof workPackage !== 'object' ||
        workPackage === null ||
        !('id' in workPackage) ||
        typeof workPackage.id !== 'string' ||
        workPackage.id === ''
      )
        throw new Error('Actual listed work-package identity is malformed');
      return workPackage.id;
    });
    expect(identities).toEqual([granted.workPackageId]);
  }));

it('conceals an unreadable restricted solution slug as absent after an actual readable solution positive', async () =>
  runVisibilityCase(false, async (scope) => {
    const open = await createVisibilityPackage(scope, 'Solution open parent', 'Solution open');
    const restricted = await createVisibilityPackage(
      scope,
      'Solution restricted parent',
      'Solution restricted',
    );
    for (const [entry, slug, isRestricted] of [
      [open, 'solution-human-open', false],
      [restricted, 'solution-human-restricted', true],
    ] as const) {
      const url = 'https://solutions.example/' + slug;
      expect(
        await scope.call(
          'VisibilityCreator',
          'PATCH',
          '/api/work-packages/' + entry.workPackageId,
          {
            solutionRef: { slug, url },
            restricted: isRestricted,
          },
        ),
      ).toMatchObject({ status: 200 });
      expect(
        scope.sqlite
          .query(
            'SELECT work_package_id,organization_id,slug,url FROM work_package_solution WHERE work_package_id=?',
          )
          .get(entry.workPackageId),
      ).toEqual({
        work_package_id: entry.workPackageId,
        organization_id: 'visibility-org',
        slug,
        url,
      });
      expect(
        scope.sqlite
          .query('SELECT id,restricted,project_id FROM work_package WHERE id=?')
          .get(entry.workPackageId),
      ).toEqual({
        id: entry.workPackageId,
        restricted: isRestricted ? 1 : 0,
        project_id: entry.projectId,
      });
    }
    scope.grant('visibility-org', 'VisibilityReader', 'org-viewer');
    expect(
      await scope.call('VisibilityReader', 'GET', '/plans/by-solution/solution-human-open'),
    ).toMatchObject({ status: 200, body: { workPackage: { id: open.workPackageId } } });
    const absent = await scope.call(
      'VisibilityReader',
      'GET',
      '/plans/by-solution/solution-human-missing',
    );
    expect(absent).toEqual({ status: 404, body: { error: 'not_found' } });
    expect(
      await scope.call('VisibilityReader', 'GET', '/plans/by-solution/solution-human-restricted'),
    ).toEqual(absent);
    scope.grant(
      'visibility-org',
      'VisibilityReader',
      'project-viewer',
      'project',
      restricted.projectId,
    );
    expect(
      await scope.call('VisibilityReader', 'GET', '/plans/by-solution/solution-human-restricted'),
    ).toMatchObject({ status: 200, body: { workPackage: { id: restricted.workPackageId } } });
  }));

it('uses only the actual credential grant for solution slugs despite its account reading the other solution', async () =>
  runVisibilityCase(true, async (scope) => {
    const granted = await createVisibilityPackage(
      scope,
      'Credential solution granted parent',
      'Credential solution granted',
    );
    const other = await createVisibilityPackage(
      scope,
      'Credential solution other parent',
      'Credential solution other',
    );
    for (const [entry, slug, isRestricted] of [
      [granted, 'solution-key-granted', true],
      [other, 'solution-key-other', false],
    ] as const) {
      const url = 'https://solutions.example/' + slug;
      expect(
        await scope.call(
          'VisibilityCreator',
          'PATCH',
          '/api/work-packages/' + entry.workPackageId,
          {
            solutionRef: { slug, url },
            restricted: isRestricted,
          },
        ),
      ).toMatchObject({ status: 200 });
      expect(
        scope.sqlite
          .query(
            'SELECT work_package_id,organization_id,slug,url FROM work_package_solution WHERE work_package_id=?',
          )
          .get(entry.workPackageId),
      ).toEqual({
        work_package_id: entry.workPackageId,
        organization_id: 'visibility-org',
        slug,
        url,
      });
      expect(
        scope.sqlite
          .query('SELECT id,restricted,project_id FROM work_package WHERE id=?')
          .get(entry.workPackageId),
      ).toEqual({
        id: entry.workPackageId,
        restricted: isRestricted ? 1 : 0,
        project_id: entry.projectId,
      });
    }
    expect(
      await scope.call('VisibilityCreator', 'GET', '/plans/by-solution/solution-key-other'),
    ).toMatchObject({ status: 200, body: { workPackage: { id: other.workPackageId } } });
    addAgentPerson(
      scope.sqlite,
      'solution-agent',
      'visibility-org',
      scope.userId('VisibilityCreator'),
      'Solution agent',
    );
    const credential = await issueApiKey(scope.sqlite, {
      organizationId: 'visibility-org',
      personId: 'solution-agent',
      issuedBy: scope.userId('VisibilityCreator'),
      name: 'Solution credential',
    });
    grantCredential(
      scope.sqlite,
      'visibility-org',
      credential.id,
      'package-viewer',
      'work_package',
      granted.workPackageId,
    );
    expect(
      scope.sqlite
        .query(
          "SELECT scope_kind,scope_id,role_id FROM access_grant WHERE subject_kind='machine_credential' AND subject_id=? ORDER BY id",
        )
        .all(credential.id),
    ).toEqual([
      { scope_kind: 'work_package', scope_id: granted.workPackageId, role_id: 'package-viewer' },
    ]);
    expect(
      await callForwarded(
        scope,
        credential.key,
        'GET',
        '/plans/by-solution/solution-key-granted',
        undefined,
        { now: 100 },
      ),
    ).toMatchObject({ status: 200, body: { workPackage: { id: granted.workPackageId } } });
    const absent = await callForwarded(
      scope,
      credential.key,
      'GET',
      '/plans/by-solution/solution-key-missing',
      undefined,
      { now: 100 },
    );
    expect(absent).toEqual({ status: 404, body: { error: 'not_found' } });
    expect(
      await callForwarded(
        scope,
        credential.key,
        'GET',
        '/plans/by-solution/solution-key-other',
        undefined,
        { now: 100 },
      ),
    ).toEqual(absent);
  }));

/** Every physical application table after authentication, independent of repository projections. */
function captureOpeningTables(scope: OrganizationHarness) {
  return scope.sqlite
    .query<{ name: string }, []>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all()
    .map(({ name }) => ({
      name,
      rows: scope.sqlite
        .query<Record<string, unknown>, []>('SELECT * FROM "' + name.replaceAll('"', '""') + '"')
        .all()
        .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
    }));
}

it('records a readable viewer opening but conceals a restricted unreadable opening exactly as absent', async () => {
  const [{ mkdtempSync, writeFileSync }, { tmpdir }, { join }] = await Promise.all([
    import('node:fs'),
    import('node:os'),
    import('node:path'),
  ]);
  const evidence = mkdtempSync(join(tmpdir(), 'work-package-open-mounted-'));
  console.info('Mounted work-package OPEN fixture:', evidence);
  let phase = 'harness-acquisition';
  let acquisitionAttempted = false;
  let acquired = false;
  let databasePath: string | undefined;
  let closeScope: (() => Promise<void>) | undefined;
  let closeCalls = 0;
  let closeState: 'not-acquired' | 'not-attempted' | 'settled' | 'failed' = 'not-acquired';
  let primary: { readonly cause: unknown } | undefined;
  const cleanupFailures: unknown[] = [];
  let observer: (() => void) | undefined;
  const snapshotFiles: string[] = [];
  const replies: { label: string; status: number; body: unknown; resolutionWitnesses: number }[] =
    [];
  const clock = { at: 100 };
  try {
    acquisitionAttempted = true;
    const scope = OrganizationHarness.openComposedWith({
      now: () => clock.at,
      afterResolve: () => {
        const selected = observer;
        observer = undefined;
        selected?.();
      },
    });
    acquired = true;
    closeScope = scope.closeComposed.bind(scope);
    closeState = 'not-attempted';
    databasePath = scope.databasePath();
    phase = 'native-identity-and-current-organization';
    await scope.register('VisibilityCreator');
    await scope.register('VisibilityReader');
    scope.organization('visibility-org');
    scope.member('visibility-org', 'VisibilityCreator', 'admin', ['org-super-admin']);
    scope.member('visibility-org', 'VisibilityReader', 'member', []);
    scope.bind('VisibilityCreator', 'visibility-org');
    scope.bind('VisibilityReader', 'visibility-org');
    scope.activate();
    const readable = await createVisibilityPackage(
      scope,
      'Opening readable parent',
      'Opening readable',
    );
    const restricted = await createVisibilityPackage(
      scope,
      'Opening restricted parent',
      'Opening restricted',
    );
    expect(
      await scope.call(
        'VisibilityCreator',
        'PATCH',
        '/api/work-packages/' + restricted.workPackageId,
        {
          restricted: true,
        },
      ),
    ).toMatchObject({ status: 200 });
    expect(
      scope.sqlite
        .query('SELECT id,project_id,restricted FROM work_package WHERE id=?')
        .get(restricted.workPackageId),
    ).toEqual({
      id: restricted.workPackageId,
      project_id: restricted.projectId,
      restricted: 1,
    });
    scope.grant(
      'visibility-org',
      'VisibilityReader',
      'package-viewer',
      'work_package',
      readable.workPackageId,
    );
    const readerId = scope.userId('VisibilityReader');
    phase = 'actual-viewer-without-edit-authority';
    expect(
      scope.sqlite
        .query(
          "SELECT organization_id,scope_kind,scope_id,role_id FROM access_grant WHERE subject_kind='user' AND subject_id=? ORDER BY id",
        )
        .all(readerId),
    ).toEqual([
      {
        organization_id: 'visibility-org',
        scope_kind: 'work_package',
        scope_id: readable.workPackageId,
        role_id: 'package-viewer',
      },
    ]);
    expect(
      scope.sqlite
        .query(
          "SELECT permission FROM access_role_permission WHERE role_id='package-viewer' ORDER BY permission",
        )
        .all(),
    ).toEqual([{ permission: 'organization.navigate' }, { permission: 'package.read' }]);
    expect(
      await scope.call('VisibilityReader', 'GET', '/api/work-packages/' + readable.workPackageId),
    ).toMatchObject({
      status: 200,
      body: { workPackage: { id: readable.workPackageId, projectId: readable.projectId } },
    });
    expect(
      await scope.call('VisibilityReader', 'GET', '/api/work-packages/' + restricted.workPackageId),
    ).toEqual({ status: 404, body: { error: 'not_found' } });
    const beforePackage = scope.sqlite
      .query<Record<string, unknown>, [string]>('SELECT * FROM work_package WHERE id=?')
      .get(readable.workPackageId);
    if (beforePackage === null) throw new Error('Actual readable package row is absent');

    function writeSnapshot(label: string, snapshot: ReturnType<typeof captureOpeningTables>) {
      const path = join(evidence, label + '.json');
      writeFileSync(path, JSON.stringify(snapshot) + '\n', { flag: 'wx', mode: 0o600 });
      snapshotFiles.push(path);
    }
    /** Arms one synchronous callback only after setup; its full baseline includes authentication effects. */
    async function observeOpening(label: 'readable' | 'absent' | 'restricted', id: string) {
      if (observer !== undefined) throw new Error('Previous OPEN observation is still armed');
      let before: ReturnType<typeof captureOpeningTables> | undefined;
      let resolutionWitnesses = 0;
      observer = () => {
        resolutionWitnesses++;
        before = captureOpeningTables(scope);
        writeSnapshot(label + '-post-auth-before', before);
      };
      try {
        const response = await scope.call(
          'VisibilityReader',
          'POST',
          '/api/work-packages/' + id + '/opened',
        );
        const after = captureOpeningTables(scope);
        writeSnapshot(label + '-after', after);
        replies.push({ label, status: response.status, body: response.body, resolutionWitnesses });
        if (before === undefined || resolutionWitnesses !== 1)
          throw new Error(
            'Actual post-authentication OPEN observation was not captured exactly once',
          );
        return { response, before, after };
      } finally {
        observer = undefined;
      }
    }

    phase = 'readable-opening-prerequisite';
    const readableOpen = await observeOpening('readable', readable.workPackageId);
    expect(readableOpen.response).toEqual({ status: 204, body: null });
    const accessBefore = readableOpen.before.find((table) => table.name === 'work_package_access');
    if (accessBefore === undefined) throw new Error('Physical opening-access table is absent');
    expect(accessBefore.rows).toEqual([]);
    expect(
      scope.sqlite
        .query('SELECT * FROM work_package_access ORDER BY user_id,work_package_id')
        .all(),
    ).toEqual([
      {
        user_id: readerId,
        work_package_id: readable.workPackageId,
        last_opened_at: clock.at,
        created_at: clock.at,
        updated_at: clock.at,
        created_by: readerId,
      },
    ]);
    expect(readableOpen.after.filter((table) => table.name !== 'work_package_access')).toEqual(
      readableOpen.before.filter((table) => table.name !== 'work_package_access'),
    );
    expect(
      scope.sqlite
        .query<Record<string, unknown>, [string]>('SELECT * FROM work_package WHERE id=?')
        .get(readable.workPackageId),
    ).toEqual(beforePackage);

    phase = 'absent-opening-prerequisite';
    const absentOpen = await observeOpening('absent', 'absent-opening-package');
    expect(absentOpen.response).toEqual({ status: 404, body: { error: 'not_found' } });
    expect(absentOpen.after).toEqual(absentOpen.before);

    phase = 'restricted-opening-owning-oracle';
    const hiddenOpen = await observeOpening('restricted', restricted.workPackageId);
    expect(hiddenOpen.response).toEqual(absentOpen.response);
    expect(hiddenOpen.after).toEqual(hiddenOpen.before);
    phase = 'assertions-complete';
  } catch (cause: unknown) {
    primary = { cause };
  }
  observer = undefined;
  if (closeScope !== undefined) {
    closeCalls++;
    try {
      await closeScope();
      closeState = 'settled';
    } catch (cause: unknown) {
      closeState = 'failed';
      cleanupFailures.push(cause);
    }
  }
  function describeFailure(cause: unknown) {
    return cause instanceof Error
      ? { kind: 'Error', name: cause.name, message: cause.message, stack: cause.stack }
      : { kind: typeof cause, display: String(cause) };
  }
  let receiptFailure: { readonly cause: unknown } | undefined;
  try {
    writeFileSync(
      join(evidence, 'custody.json'),
      JSON.stringify(
        {
          phase,
          acquisitionAttempted,
          acquired,
          databasePath,
          closeCalls,
          closeState,
          unknownAcquisition: acquisitionAttempted && !acquired,
          unknownSettlement: acquired && closeState !== 'settled',
          primary: primary === undefined ? null : describeFailure(primary.cause),
          cleanup: cleanupFailures.map(describeFailure),
          snapshotFiles,
          replies,
          qualification:
            'Returned fixture closeComposed attempted once; retained private snapshots, no global cleanup or retained database claim.',
        },
        null,
        2,
      ) + '\n',
      { flag: 'wx', mode: 0o600 },
    );
  } catch (cause: unknown) {
    receiptFailure = { cause };
  }
  if (receiptFailure !== undefined) cleanupFailures.push(receiptFailure.cause);
  if (primary !== undefined) {
    if (cleanupFailures.length !== 0)
      throw new AggregateError(
        [primary.cause, ...cleanupFailures],
        'Mounted OPEN case and cleanup failed',
        {
          cause: primary.cause,
        },
      );
    throw primary.cause;
  }
  if (cleanupFailures.length !== 0)
    throw new AggregateError(cleanupFailures, 'Mounted OPEN cleanup failed', {
      cause: cleanupFailures[0],
    });
});

type OpeningSnapshot = ReturnType<typeof captureOpeningTables>;
type OpeningAnswer = Answer;
type OpeningObserved<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly cause: unknown };
interface OpeningWorld {
  readonly scope: OrganizationHarness;
  readonly target: { readonly projectId: string; readonly workPackageId: string };
  readonly nextParent: string;
  readonly clock: { at: number };
  readonly callHuman: (
    username: string,
    method: string,
    path: string,
    body?: unknown,
  ) => Promise<OpeningAnswer>;
  readonly signing: Awaited<ReturnType<typeof generateKeyPair>> | undefined;
  arm(witness: () => void): void;
  disarm(): void;
  save(label: string, snapshot: OpeningSnapshot): void;
}
function observeOpeningOperation<T>(operation: Promise<T>): Promise<OpeningObserved<T>> {
  return operation.then(
    (value) => ({ ok: true, value }),
    (cause: unknown) => ({ ok: false, cause }),
  );
}
function throwOpeningFailures(
  primary: { cause: unknown } | undefined,
  failures: readonly unknown[],
): void {
  if (primary !== undefined) {
    if (failures.length !== 0)
      throw new AggregateError(
        [primary.cause, ...failures],
        'Opening operation and settlement failed',
        { cause: primary.cause },
      );
    throw primary.cause;
  }
  if (failures.length !== 0)
    throw new AggregateError(failures, 'Opening settlement failed', { cause: failures[0] });
}

/** Each new authority case owns its acquired composed close; all physical snapshots include auth effects. */
async function runOpeningAuthorityCase(
  kind: 'human' | 'machine' | 'consent',
  exercise: (world: OpeningWorld) => Promise<void>,
): Promise<void> {
  const [{ mkdtempSync, writeFileSync }, { tmpdir }, { join }] = await Promise.all([
    import('node:fs'),
    import('node:os'),
    import('node:path'),
  ]);
  const evidence = mkdtempSync(join(tmpdir(), 'work-package-opening-authority-'));
  console.info('Current opening authority fixture:', evidence);
  let acquisitionAttempted = false;
  let acquired = false;
  let close: (() => Promise<void>) | undefined;
  let closeCalls = 0;
  let closeState: 'not-acquired' | 'not-attempted' | 'settled' | 'failed' = 'not-acquired';
  let primary: { cause: unknown } | undefined;
  const cleanup: unknown[] = [];
  let observer: (() => void) | undefined;
  let databasePath: string | undefined;
  const snapshots: string[] = [];
  try {
    const clock = { at: Date.now() };
    const signing =
      kind === 'consent' ? await (await import('jose')).generateKeyPair('RS256') : undefined;
    const machineGrants = kind === 'machine' ? await forwardingMachineGrants() : undefined;
    acquisitionAttempted = true;
    const scope = OrganizationHarness.openComposedWith({
      now: () => clock.at,
      sessionBinding: true,
      afterResolve: () => {
        const selected = observer;
        observer = undefined;
        selected?.();
      },
      ...(signing === undefined ? {} : { delegationKey: signing.publicKey }),
      ...(machineGrants === undefined ? {} : { machineGrants }),
    });
    acquired = true;
    close = scope.closeComposed.bind(scope);
    closeState = 'not-attempted';
    databasePath = scope.databasePath();
    await scope.register('VisibilityCreator');
    await scope.register('VisibilityReader');
    scope.organization('visibility-org');
    scope.member('visibility-org', 'VisibilityCreator', 'admin', ['org-super-admin']);
    scope.member('visibility-org', 'VisibilityReader', 'member', []);
    scope.activate();
    const cookies = new Map<string, string>();
    for (const username of ['VisibilityCreator', 'VisibilityReader']) {
      const selected = await scope.request('/api/organization/active', {
        method: 'POST',
        headers: {
          origin: 'http://localhost',
          authorization: 'Bearer ' + scope.token(username),
          'content-type': 'application/json',
        },
        body: JSON.stringify({ organizationId: 'visibility-org' }),
      });
      expect(selected.status).toBe(200);
      const cookie = selected.headers.get('set-cookie')?.split(';').at(0);
      if (cookie === undefined || cookie === '')
        throw Error('Actual opening selection cookie absent');
      cookies.set(username, cookie);
    }
    const callHuman = (username: string, method: string, path: string, body?: unknown) => {
      const cookie = cookies.get(username);
      if (cookie === undefined) throw Error('Opening selected cookie absent for ' + username);
      return scope.callWith(scope.token(username), method, path, body, {
        cookie,
        'X-WBS-Expected-Organization': 'visibility-org',
      });
    };
    async function createPackage(name: string) {
      const created = await callHuman('VisibilityCreator', 'POST', '/api/projects', {
        name: name + ' parent',
        workPackage: { name },
      });
      expect(created.status).toBe(201);
      const body = created.body;
      if (
        typeof body !== 'object' ||
        body === null ||
        !('project' in body) ||
        typeof body.project !== 'object' ||
        body.project === null ||
        !('id' in body.project) ||
        typeof body.project.id !== 'string' ||
        !('workPackage' in body) ||
        typeof body.workPackage !== 'object' ||
        body.workPackage === null ||
        !('id' in body.workPackage) ||
        typeof body.workPackage.id !== 'string'
      )
        throw Error('Actual opening birth identities absent');
      return { projectId: body.project.id, workPackageId: body.workPackage.id };
    }
    const target = await createPackage('Current opening');
    const other = await createPackage('Current opening next');
    expect(
      await callHuman('VisibilityCreator', 'PATCH', '/api/work-packages/' + target.workPackageId, {
        restricted: true,
      }),
    ).toMatchObject({ status: 200 });
    scope.grant(
      'visibility-org',
      'VisibilityReader',
      'project-viewer',
      'project',
      target.projectId,
    );
    expect(
      await callHuman('VisibilityReader', 'GET', '/api/work-packages/' + target.workPackageId),
    ).toMatchObject({ status: 200, body: { workPackage: { id: target.workPackageId } } });
    await exercise({
      scope,
      target,
      nextParent: other.projectId,
      clock,
      signing,
      callHuman,
      arm(witness) {
        if (observer !== undefined) throw Error('Opening observation already armed');
        observer = witness;
      },
      disarm() {
        observer = undefined;
      },
      save(label, snapshot) {
        const path = join(
          evidence,
          String(snapshots.length).padStart(2, '0') + '-' + label + '.json',
        );
        writeFileSync(path, JSON.stringify(snapshot) + '\n', { flag: 'wx', mode: 0o600 });
        snapshots.push(path);
      },
    });
  } catch (cause) {
    primary = { cause };
  }
  observer = undefined;
  if (close !== undefined) {
    closeCalls++;
    try {
      await close();
      closeState = 'settled';
    } catch (cause) {
      closeState = 'failed';
      cleanup.push(cause);
    }
  }
  const describe = (cause: unknown) =>
    cause instanceof Error
      ? { name: cause.name, message: cause.message, stack: cause.stack }
      : { kind: typeof cause, display: String(cause) };
  let receiptFailure: { cause: unknown } | undefined;
  try {
    writeFileSync(
      join(evidence, 'custody.json'),
      JSON.stringify({
        acquisitionAttempted,
        acquired,
        databasePath,
        closeCalls,
        closeState,
        unknownAcquisition: acquisitionAttempted && !acquired,
        unknownSettlement: acquired && closeState !== 'settled',
        primary: primary === undefined ? null : describe(primary.cause),
        cleanup: cleanup.map(describe),
        snapshots,
      }) + '\n',
      { flag: 'wx', mode: 0o600 },
    );
  } catch (cause) {
    receiptFailure = { cause };
  }
  if (receiptFailure !== undefined) cleanup.push(receiptFailure.cause);
  throwOpeningFailures(primary, cleanup);
}

/** Loses to premature request/holder settlement; this observes the earlier holder, not an OPEN enqueue. */
async function awaitOpeningWitness(
  witness: Promise<undefined>,
  pending: Promise<OpeningObserved<OpeningAnswer>>,
  holder?: Promise<OpeningObserved<void>>,
) {
  const selected = await Promise.race([
    witness.then(() => ({ kind: 'witness' as const })),
    pending.then((settled) => ({ kind: 'request' as const, settled })),
    ...(holder === undefined
      ? []
      : [holder.then((settled) => ({ kind: 'holder' as const, settled }))]),
  ]);
  if (selected.kind !== 'witness')
    throw Error('Opening witness lost to premature ' + selected.kind + ' settlement', {
      cause: selected.settled.ok ? selected.settled.value : selected.settled.cause,
    });
}

/** Arms only after setup; retained before/after snapshots include all credential durable use. */
async function observeCurrentOpening(
  world: OpeningWorld,
  invoke: () => Promise<OpeningAnswer>,
  mutate?: () => void,
) {
  const resolved = Promise.withResolvers<undefined>();
  const entered = Promise.withResolvers<undefined>();
  const release = Promise.withResolvers<undefined>();
  let before: OpeningSnapshot | undefined;
  let holder: Promise<OpeningObserved<void>> | undefined;
  let captures = 0;
  world.arm(() => {
    captures++;
    before = captureOpeningTables(world.scope);
    if (mutate !== undefined)
      holder = observeOpeningOperation(
        world.scope.holdWriteTurn(release.promise, () => {
          entered.resolve(undefined);
        }),
      );
    resolved.resolve(undefined);
  });
  const pending = observeOpeningOperation(invoke());
  let primary: { cause: unknown } | undefined;
  try {
    await awaitOpeningWitness(resolved.promise, pending);
    if (before === undefined || captures !== 1)
      throw Error('Opening post-auth baseline was not captured once');
    world.save('post-auth-before', before);
    if (mutate !== undefined) {
      if (holder === undefined) throw Error('Opening writer holder was not acquired');
      await awaitOpeningWitness(entered.promise, pending, holder);
      mutate();
      before = captureOpeningTables(world.scope);
      world.save('after-change-before-owner', before);
    }
  } catch (cause) {
    primary = { cause };
  }
  world.disarm();
  release.resolve(undefined);
  const failures: unknown[] = [];
  if (holder !== undefined) {
    const settled = await holder;
    if (!settled.ok) failures.push(settled.cause);
  }
  const observed = await pending;
  if (!observed.ok) {
    if (primary === undefined) primary = { cause: observed.cause };
    else failures.push(observed.cause);
  }
  throwOpeningFailures(primary, failures);
  if (before === undefined || !observed.ok)
    throw Error('Opening settled observation is incomplete');
  const after = captureOpeningTables(world.scope);
  world.save('after-owner', after);
  return { reply: observed.value, before, after };
}
const openingPath = (world: OpeningWorld) =>
  '/api/work-packages/' + world.target.workPackageId + '/opened';

for (const change of ['grant', 'membership', 'restriction', 'parent', 'binding'] as const) {
  it(
    'rechecks actual current ' + change + ' after an earlier writer holder before recording OPEN',
    async () =>
      runOpeningAuthorityCase('human', async (world) => {
        const { scope, target } = world;
        const callHuman = (...args: Parameters<OpeningWorld['callHuman']>) =>
          world.callHuman(...args);
        if (change === 'restriction') {
          scope.sqlite.run("DELETE FROM access_grant WHERE subject_kind='user' AND subject_id=?", [
            scope.userId('VisibilityReader'),
          ]);
          scope.grant('visibility-org', 'VisibilityReader', 'org-viewer');
          expect(
            await callHuman(
              'VisibilityCreator',
              'PATCH',
              '/api/work-packages/' + target.workPackageId,
              { restricted: false },
            ),
          ).toMatchObject({ status: 200 });
          expect(
            await callHuman(
              'VisibilityReader',
              'GET',
              '/api/work-packages/' + target.workPackageId,
            ),
          ).toMatchObject({ status: 200 });
        }
        const token = scope.token('VisibilityReader');
        const { decodeJwt } = await import('jose');
        const { createHash } = await import('node:crypto');
        const claims = decodeJwt(token);
        if (typeof claims.exp !== 'number')
          throw Error('Actual opening native token expiry absent');
        const expiresAt = claims.exp * 1000;
        const observed = await observeCurrentOpening(
          world,
          () => callHuman('VisibilityReader', 'POST', openingPath(world)),
          () => {
            if (change === 'grant')
              scope.sqlite.run(
                "DELETE FROM access_grant WHERE subject_kind='user' AND subject_id=?",
                [scope.userId('VisibilityReader')],
              );
            if (change === 'membership')
              scope.sqlite.run(
                "DELETE FROM organization_membership WHERE organization_id='visibility-org' AND user_id=?",
                [scope.userId('VisibilityReader')],
              );
            if (change === 'restriction')
              scope.sqlite.run('UPDATE work_package SET restricted=1 WHERE id=?', [
                target.workPackageId,
              ]);
            if (change === 'parent')
              scope.sqlite.run('UPDATE work_package SET project_id=? WHERE id=?', [
                world.nextParent,
                target.workPackageId,
              ]);
            if (change === 'binding')
              scope.sqlite.run(
                'INSERT INTO browser_credential_revocations(kind,user_id,credential_digest,expires_at,revoked_at) VALUES(?,?,?,?,?)',
                [
                  'native',
                  scope.userId('VisibilityReader'),
                  createHash('sha256').update(token).digest('hex'),
                  expiresAt,
                  world.clock.at,
                ],
              );
          },
        );
        expect(observed.reply).toEqual(
          change === 'membership'
            ? { status: 403, body: { error: 'not_a_member' } }
            : change === 'binding'
              ? { status: 403, body: { error: 'no_active_organization' } }
              : { status: 404, body: { error: 'not_found' } },
        );
        expect(observed.after).toEqual(observed.before);
      }),
  );
}

/** Actual signed/verified machine or consent subject; account grants never stand in for its grants. */
async function prepareOpeningCredential(world: OpeningWorld, kind: 'machine' | 'consent') {
  const { scope } = world;
  const accountId = scope.userId('VisibilityCreator');
  addAgentPerson(scope.sqlite, 'opening-agent', 'visibility-org', accountId);
  const credential = await issueApiKey(scope.sqlite, {
    organizationId: 'visibility-org',
    personId: 'opening-agent',
    issuedBy: accountId,
  });
  if (kind === 'machine') {
    const { requestGrant } = await import('../testing/mcp-forwarded-call');
    const { TEST_MACHINE_GRANT_ENV } = await import('../testing/machine-grant-fixture');
    const issued = await requestGrant(
      scope,
      { kind: 'api_key', key: credential.key },
      { now: world.clock.at },
    );
    expect(issued.status).toBe(200);
    const reply: unknown = await issued.json();
    if (
      typeof reply !== 'object' ||
      reply === null ||
      !('grant' in reply) ||
      typeof reply.grant !== 'string'
    )
      throw Error('Opening actual machine grant absent');
    const token = reply.grant;
    const headers = {
      [MCP_INTERNAL_SECRET_HEADER]: TEST_MACHINE_GRANT_ENV['MCP_BE_INTERNAL_SECRET'],
    };
    return {
      id: credential.id,
      invoke: () => scope.callWith(token, 'POST', openingPath(world), undefined, headers),
    };
  }
  const { mapUpstream, delegationFor } = await import('../testing/scim-fixture');
  scope.sqlite.run(
    "UPDATE machine_credential SET source='mcp_consent',mcp_family_id='family-1' WHERE id=?",
    [credential.id],
  );
  mapUpstream(scope, 'VisibilityCreator', 'opening-upstream');
  if (world.signing === undefined) throw Error('Opening consent signing key absent');
  const signing = world.signing;
  return {
    id: credential.id,
    invoke: async () => {
      const token = await delegationFor(
        scope,
        signing.privateKey,
        'VisibilityCreator',
        'visibility-org',
        'opening-upstream',
        { credentialId: credential.id, personId: 'opening-agent' },
      );
      world.clock.at = Date.now();
      return await scope.callWith(token, 'POST', openingPath(world));
    },
  };
}

for (const kind of ['machine', 'consent'] as const) {
  it(
    'requires the actual ' + kind + ' package grant for OPEN despite the bound account reading it',
    async () =>
      runOpeningAuthorityCase(kind, async (world) => {
        const credential = await prepareOpeningCredential(world, kind);
        expect(
          await world.callHuman(
            'VisibilityCreator',
            'GET',
            '/api/work-packages/' + world.target.workPackageId,
          ),
        ).toMatchObject({ status: 200 });
        const hidden = await observeCurrentOpening(world, credential.invoke);
        expect(hidden.reply).toEqual({ status: 404, body: { error: 'not_found' } });
        expect(hidden.after).toEqual(hidden.before);
        grantCredential(
          world.scope.sqlite,
          'visibility-org',
          credential.id,
          'package-viewer',
          'work_package',
          world.target.workPackageId,
        );
        const readable = await observeCurrentOpening(world, credential.invoke);
        expect(readable.reply).toEqual({ status: 204, body: null });
        expect(readable.after.filter((table) => table.name !== 'work_package_access')).toEqual(
          readable.before.filter((table) => table.name !== 'work_package_access'),
        );
        expect(
          world.scope.sqlite
            .query('SELECT user_id,work_package_id,last_opened_at FROM work_package_access')
            .all(),
        ).toEqual([
          {
            user_id: world.scope.userId('VisibilityCreator'),
            work_package_id: world.target.workPackageId,
            last_opened_at: world.clock.at,
          },
        ]);
      }),
  );
  it(
    'refuses a ' + kind + ' credential revoked after authentication before the OPEN writer',
    async () =>
      runOpeningAuthorityCase(kind, async (world) => {
        const credential = await prepareOpeningCredential(world, kind);
        grantCredential(
          world.scope.sqlite,
          'visibility-org',
          credential.id,
          'package-viewer',
          'work_package',
          world.target.workPackageId,
        );
        const observed = await observeCurrentOpening(world, credential.invoke, () =>
          world.scope.sqlite.run('UPDATE machine_credential SET revoked_at=? WHERE id=?', [
            world.clock.at,
            credential.id,
          ]),
        );
        expect(observed.reply).toEqual({
          status: 409,
          body: { error: 'organization_context_changed' },
        });
        expect(observed.after).toEqual(observed.before);
      }),
  );
}

it('rolls back an actual current OPEN access insertion failure without leaking any durable write', async () =>
  runOpeningAuthorityCase('human', async (world) => {
    world.scope.sqlite.run(
      "CREATE TRIGGER mounted_opening_abort BEFORE INSERT ON work_package_access BEGIN SELECT RAISE(ABORT,'mounted-opening-sentinel'); END",
    );
    const observed = await observeCurrentOpening(world, () =>
      world.callHuman('VisibilityReader', 'POST', openingPath(world)),
    );
    expect(observed.reply.status).toBe(500);
    expect(observed.after).toEqual(observed.before);
  }));

interface PersistedHistoryEvent {
  readonly id: string;
  readonly workPackageId: string;
  readonly userId: string;
  readonly kind: string;
  readonly label: string;
  readonly workItemId: string | null;
  readonly stepId: string | null;
  readonly beforeJson: string;
  readonly afterJson: string;
  readonly createdAt: number;
}

/** Uses the selected Creator's real command writer and reads its actual persisted event identity. */
async function recordHistoryEvent(world: OpeningWorld, workPackageId: string, name: string) {
  expect(
    await world.callHuman(
      'VisibilityCreator',
      'POST',
      '/api/work-packages/' + workPackageId + '/commands',
      {
        commands: [{ kind: 'createWorkItem', parentId: null, name }],
      },
    ),
  ).toMatchObject({ status: 200 });
  expect(
    world.scope.sqlite
      .query<{ name: string }, [string]>(
        'SELECT name FROM work_item WHERE work_package_id=? ORDER BY id',
      )
      .all(workPackageId),
  ).toEqual([{ name }]);
  const rows = world.scope.sqlite
    .query<PersistedHistoryEvent, [string]>(
      'SELECT id,work_package_id AS workPackageId,user_id AS userId,kind,label,work_item_id AS workItemId,step_id AS stepId,"before" AS beforeJson,"after" AS afterJson,created_at AS createdAt FROM plan_event WHERE work_package_id=? ORDER BY created_at DESC,id DESC',
    )
    .all(workPackageId);
  expect(rows).toHaveLength(1);
  const stored = rows.at(0);
  if (stored === undefined)
    throw Error('Successful Creator command has no persisted history event');
  expect(stored).toMatchObject({
    workPackageId,
    userId: world.scope.userId('VisibilityCreator'),
    kind: 'create',
    createdAt: world.clock.at,
  });
  expect(stored.id).not.toBe('');
  expect(stored.label).toContain(name);
  expect(stored.afterJson).toContain(name);
  const before: unknown = JSON.parse(stored.beforeJson);
  const after: unknown = JSON.parse(stored.afterJson);
  return {
    id: stored.id,
    workPackageId: stored.workPackageId,
    userId: stored.userId,
    kind: stored.kind,
    label: stored.label,
    workItemId: stored.workItemId,
    stepId: stored.stepId,
    before,
    after,
    createdAt: stored.createdAt,
  };
}

it('conceals real restricted history as absent after its selected reader loses the actual parent grant', async () =>
  runOpeningAuthorityCase('human', async (world) => {
    const { scope, target } = world;
    expect(
      scope.sqlite
        .query('SELECT project_id,restricted FROM work_package WHERE id=?')
        .get(target.workPackageId),
    ).toEqual({ project_id: target.projectId, restricted: 1 });
    const event = await recordHistoryEvent(
      world,
      target.workPackageId,
      'Private history human marker',
    );
    const path = '/api/work-packages/' + target.workPackageId + '/history';
    expect(await world.callHuman('VisibilityReader', 'GET', path)).toEqual({
      status: 200,
      body: { events: [event] },
    });
    scope.sqlite.run(
      "DELETE FROM access_grant WHERE organization_id='visibility-org' AND subject_kind='user' AND subject_id=? AND scope_kind='project' AND scope_id=?",
      [scope.userId('VisibilityReader'), target.projectId],
    );
    expect(
      scope.sqlite
        .query(
          "SELECT id FROM access_grant WHERE organization_id='visibility-org' AND subject_kind='user' AND subject_id=?",
        )
        .all(scope.userId('VisibilityReader')),
    ).toEqual([]);
    const absent = await world.callHuman(
      'VisibilityReader',
      'GET',
      '/api/work-packages/absent-current-history/history',
    );
    expect(absent).toEqual({ status: 404, body: { error: 'not_found' } });
    expect(
      await world.callHuman(
        'VisibilityReader',
        'GET',
        '/api/work-packages/' + target.workPackageId,
      ),
    ).toEqual(absent);
    expect(await world.callHuman('VisibilityReader', 'GET', path)).toEqual(absent);
  }));

it('uses only the actual credential package grant for history despite its account-visible other package', async () =>
  runOpeningAuthorityCase('machine', async (world) => {
    const { scope, target } = world;
    const grantedEvent = await recordHistoryEvent(
      world,
      target.workPackageId,
      'Credential granted history marker',
    );
    const created = await world.callHuman('VisibilityCreator', 'POST', '/api/projects', {
      name: 'Credential other history parent',
      workPackage: { name: 'Credential other history' },
    });
    expect(created.status).toBe(201);
    const body = created.body;
    if (
      typeof body !== 'object' ||
      body === null ||
      !('project' in body) ||
      typeof body.project !== 'object' ||
      body.project === null ||
      !('id' in body.project) ||
      typeof body.project.id !== 'string' ||
      body.project.id === '' ||
      !('workPackage' in body) ||
      typeof body.workPackage !== 'object' ||
      body.workPackage === null ||
      !('id' in body.workPackage) ||
      typeof body.workPackage.id !== 'string' ||
      body.workPackage.id === '' ||
      !('projectId' in body.workPackage) ||
      body.workPackage.projectId !== body.project.id
    )
      throw Error('Actual other history birth lacks correlated parent and package');
    const otherId = body.workPackage.id;
    expect(
      scope.sqlite.query('SELECT project_id FROM work_package WHERE id=?').get(otherId),
    ).toEqual({ project_id: body.project.id });
    const otherEvent = await recordHistoryEvent(
      world,
      otherId,
      'Private credential other history marker',
    );
    const otherPath = '/api/work-packages/' + otherId + '/history';
    expect(
      await world.callHuman('VisibilityCreator', 'GET', '/api/work-packages/' + otherId),
    ).toMatchObject({
      status: 200,
      body: { workPackage: { id: otherId } },
    });
    expect(await world.callHuman('VisibilityCreator', 'GET', otherPath)).toEqual({
      status: 200,
      body: { events: [otherEvent] },
    });
    addAgentPerson(
      scope.sqlite,
      'history-agent',
      'visibility-org',
      scope.userId('VisibilityCreator'),
      'History agent',
    );
    const credential = await issueApiKey(scope.sqlite, {
      organizationId: 'visibility-org',
      personId: 'history-agent',
      issuedBy: scope.userId('VisibilityCreator'),
      name: 'History credential',
    });
    grantCredential(
      scope.sqlite,
      'visibility-org',
      credential.id,
      'package-viewer',
      'work_package',
      target.workPackageId,
    );
    expect(
      scope.sqlite
        .query(
          "SELECT scope_kind,scope_id,role_id FROM access_grant WHERE subject_kind='machine_credential' AND subject_id=? ORDER BY id",
        )
        .all(credential.id),
    ).toEqual([
      { scope_kind: 'work_package', scope_id: target.workPackageId, role_id: 'package-viewer' },
    ]);
    expect(
      await callForwarded(
        scope,
        credential.key,
        'GET',
        '/api/work-packages/' + target.workPackageId + '/history',
        undefined,
        { now: world.clock.at },
      ),
    ).toEqual({ status: 200, body: { events: [grantedEvent] } });
    const absent = await callForwarded(
      scope,
      credential.key,
      'GET',
      '/api/work-packages/absent-credential-history/history',
      undefined,
      { now: world.clock.at },
    );
    expect(absent).toEqual({ status: 404, body: { error: 'not_found' } });
    expect(
      await callForwarded(
        scope,
        credential.key,
        'GET',
        '/api/work-packages/' + otherId,
        undefined,
        { now: world.clock.at },
      ),
    ).toEqual(absent);
    expect(
      await callForwarded(scope, credential.key, 'GET', otherPath, undefined, {
        now: world.clock.at,
      }),
    ).toEqual(absent);
  }));

/** An actual newly selected native cookie pair, never the harness's map-bound stand-in. */
async function selectGatewayReader(
  world: OpeningWorld,
): Promise<{ cookie: string; organizationCookie: string }> {
  const selected = await world.scope.request('/api/organization/active', {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + world.scope.token('VisibilityReader'),
      origin: 'http://localhost',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ organizationId: 'visibility-org' }),
  });
  expect(selected.status).toBe(200);
  const organizationCookie = selected.headers.get('set-cookie')?.split(';').at(0);
  if (organizationCookie === undefined || organizationCookie === '')
    throw Error('Actual gateway organization selection cookie absent');
  return {
    cookie:
      '__Host-wbs_access=' + world.scope.token('VisibilityReader') + '; ' + organizationCookie,
    organizationCookie,
  };
}

/** Exercises the actual forwarded-cookie/internal-secret mount, with no Authorization Bearer header. */
async function callGatewayBrowser(
  world: OpeningWorld,
  cookie: string,
  secret: string,
  path: string,
  body?: unknown,
): Promise<Answer> {
  const response = await world.scope.request(path, {
    method: 'POST',
    headers: {
      'x-internal-auth': secret,
      cookie,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  const reply: unknown = text === '' ? null : JSON.parse(text);
  return { status: response.status, body: reply };
}

it('conceals a restricted package from a real selected gateway browser after its parent read grant is removed', async () =>
  runOpeningAuthorityCase('human', async (world) => {
    const { scope, target } = world;
    const selection = await selectGatewayReader(world);
    const cookie = selection.cookie;
    const secret = 'x'.repeat(32);
    const gateway = (path: string) => callGatewayBrowser(world, cookie, secret, path);
    const path = '/internal/gateway/work-packages/' + target.workPackageId + '/browser-access';
    expect(
      scope.sqlite
        .query('SELECT project_id,restricted FROM work_package WHERE id=?')
        .get(target.workPackageId),
    ).toEqual({ project_id: target.projectId, restricted: 1 });
    expect(
      await scope.callWith(
        scope.token('VisibilityReader'),
        'GET',
        '/api/work-packages/' + target.workPackageId,
        undefined,
        { cookie: selection.organizationCookie, 'X-WBS-Expected-Organization': 'visibility-org' },
      ),
    ).toMatchObject({ status: 200, body: { workPackage: { id: target.workPackageId } } });
    expect(await callGatewayBrowser(world, cookie, 'y'.repeat(32), path)).toEqual({
      status: 401,
      body: { error: 'unauthorized' },
    });
    const readable = await observeCurrentOpening(world, () => gateway(path));
    expect(readable.reply).toEqual({ status: 204, body: null });
    expect(readable.after).toEqual(readable.before);
    scope.sqlite.run(
      "DELETE FROM access_grant WHERE organization_id='visibility-org' AND subject_kind='user' AND subject_id=? AND scope_kind='project' AND scope_id=?",
      [scope.userId('VisibilityReader'), target.projectId],
    );
    expect(
      scope.sqlite
        .query("SELECT id FROM access_grant WHERE subject_kind='user' AND subject_id=?")
        .all(scope.userId('VisibilityReader')),
    ).toEqual([]);
    expect(
      scope.sqlite
        .query(
          "SELECT role FROM organization_membership WHERE organization_id='visibility-org' AND user_id=?",
        )
        .get(scope.userId('VisibilityReader')),
    ).toEqual({ role: 'member' });
    expect(
      await scope.callWith(
        scope.token('VisibilityReader'),
        'GET',
        '/api/work-packages/' + target.workPackageId,
        undefined,
        { cookie: selection.organizationCookie, 'X-WBS-Expected-Organization': 'visibility-org' },
      ),
    ).toEqual({ status: 404, body: { error: 'not_found' } });
    const absent = await observeCurrentOpening(world, () =>
      gateway('/internal/gateway/work-packages/absent-current-gateway/browser-access'),
    );
    expect(absent.reply).toEqual({ status: 404, body: { error: 'not_found' } });
    expect(absent.after).toEqual(absent.before);
    const hidden = await observeCurrentOpening(world, () => gateway(path));
    expect(hidden.reply).toEqual(absent.reply);
    expect(hidden.after).toEqual(hidden.before);
  }));

it('denies hidden gateway resume subscriptions without replaying their real recorded events', async () =>
  runOpeningAuthorityCase('human', async (world) => {
    const { scope, target } = world;
    const marker = 'Private gateway replay marker';
    await recordHistoryEvent(world, target.workPackageId, marker);
    const subscription = 'work-package:' + target.workPackageId;
    const rows = scope.sqlite
      .query<{ seq: number; message: string }, [string]>(
        'SELECT seq,message FROM event_log WHERE subscription=? ORDER BY seq',
      )
      .all(subscription);
    const recorded = rows.filter((row) => row.message.includes(marker)).at(-1);
    if (recorded === undefined)
      throw Error('Actual Creator command has no identifiable durable gateway event');
    expect(Number.isSafeInteger(recorded.seq)).toBe(true);
    expect(recorded.seq).toBeGreaterThanOrEqual(0);
    const message: unknown = JSON.parse(recorded.message);
    const selection = await selectGatewayReader(world);
    const cookie = selection.cookie;
    const secret = 'x'.repeat(32);
    const resume = (points: Record<string, number>) =>
      callGatewayBrowser(world, cookie, secret, '/internal/resume', {
        resume_points: points,
        trace_id: 'current-gateway-visibility',
      });
    const readable = await observeCurrentOpening(world, () =>
      resume({ [subscription]: recorded.seq - 1 }),
    );
    const expectedEvents: unknown = expect.arrayContaining([{ seq: recorded.seq, message }]);
    expect(readable.reply).toMatchObject({
      status: 200,
      body: {
        [subscription]: {
          status: 'replaying',
          events: expectedEvents,
        },
      },
    });
    expect(readable.after).toEqual(readable.before);
    scope.sqlite.run(
      "DELETE FROM access_grant WHERE organization_id='visibility-org' AND subject_kind='user' AND subject_id=? AND scope_kind='project' AND scope_id=?",
      [scope.userId('VisibilityReader'), target.projectId],
    );
    expect(
      scope.sqlite
        .query("SELECT id FROM access_grant WHERE subject_kind='user' AND subject_id=?")
        .all(scope.userId('VisibilityReader')),
    ).toEqual([]);
    expect(
      await scope.callWith(
        scope.token('VisibilityReader'),
        'GET',
        '/api/work-packages/' + target.workPackageId,
        undefined,
        { cookie: selection.organizationCookie, 'X-WBS-Expected-Organization': 'visibility-org' },
      ),
    ).toEqual({ status: 404, body: { error: 'not_found' } });
    const absentSubscription = 'work-package:absent-current-gateway-resume';
    const denied = { status: 'denied', reason: 'forbidden' };
    const absent = await observeCurrentOpening(world, () => resume({ [absentSubscription]: -1 }));
    expect(absent.reply).toEqual({ status: 200, body: { [absentSubscription]: denied } });
    expect(absent.after).toEqual(absent.before);
    const hidden = await observeCurrentOpening(world, () =>
      resume({ [subscription]: recorded.seq - 1 }),
    );
    expect(hidden.reply).toEqual({ status: 200, body: { [subscription]: denied } });
    expect(hidden.after).toEqual(hidden.before);
  }));

it('uses current parent read authority for freshly signed gateway delegations and refuses token replay', async () =>
  runOpeningAuthorityCase('consent', async (world) => {
    const { scope, target } = world;
    const { SignJWT } = await import('jose');
    const { DELEGATION_TOKEN_TYPE } = await import('../runtime/delegation');
    const { mapUpstream } = await import('../testing/scim-fixture');
    mapUpstream(scope, 'VisibilityReader', 'current-gateway-reader');
    const signing = world.signing;
    if (signing === undefined) throw Error('Gateway fixture signing key absent');
    const issue = () => {
      const issuedAt = Math.floor(world.clock.at / 1000);
      return new SignJWT({
        username: 'VisibilityReader',
        org: 'visibility-org',
        client: 'gateway-current-read',
        grant: 'gateway-current-read-family',
        scope: 'read',
        upstream_iss: 'https://idp.test',
        upstream_sub: 'current-gateway-reader',
      })
        .setProtectedHeader({ alg: 'RS256', typ: DELEGATION_TOKEN_TYPE })
        .setIssuer('wbs')
        .setSubject(scope.userId('VisibilityReader'))
        .setAudience('wbs-be-01/via-gw-01')
        .setJti(crypto.randomUUID())
        .setIssuedAt(issuedAt)
        .setExpirationTime(issuedAt + 120)
        .sign(signing.privateKey);
    };
    const headers = { 'x-internal-auth': 'x'.repeat(32) };
    const path = '/internal/gateway/work-packages/' + target.workPackageId + '/access';
    const firstToken = await issue();
    const readable = await observeCurrentOpening(world, () =>
      scope.callWith(firstToken, 'POST', path, undefined, headers),
    );
    expect(readable.reply).toEqual({ status: 204, body: null });
    expect(readable.after).toEqual(readable.before);
    expect(await scope.callWith(firstToken, 'POST', path, undefined, headers)).toEqual({
      status: 401,
      body: { error: 'unauthenticated' },
    });
    scope.organization('gateway-foreign-org');
    scope.member('gateway-foreign-org', 'VisibilityCreator', 'admin', ['org-super-admin']);
    const foreignSelection = await scope.request('/api/organization/active', {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + scope.token('VisibilityCreator'),
        origin: 'http://localhost',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ organizationId: 'gateway-foreign-org' }),
    });
    expect(foreignSelection.status).toBe(200);
    const foreignCookie = foreignSelection.headers.get('set-cookie')?.split(';').at(0);
    if (foreignCookie === undefined || foreignCookie === '')
      throw Error('Gateway foreign selection cookie absent');
    const foreignBirth = await scope.callWith(
      scope.token('VisibilityCreator'),
      'POST',
      '/api/projects',
      { name: 'Gateway foreign parent', workPackage: { name: 'Gateway foreign package' } },
      { cookie: foreignCookie, 'X-WBS-Expected-Organization': 'gateway-foreign-org' },
    );
    expect(foreignBirth.status).toBe(201);
    const foreignBody = foreignBirth.body;
    if (
      typeof foreignBody !== 'object' ||
      foreignBody === null ||
      !('workPackage' in foreignBody) ||
      typeof foreignBody.workPackage !== 'object' ||
      foreignBody.workPackage === null ||
      !('id' in foreignBody.workPackage) ||
      typeof foreignBody.workPackage.id !== 'string'
    )
      throw Error('Actual foreign gateway package identity absent');
    const foreignId = foreignBody.workPackage.id;
    const absent = await observeCurrentOpening(world, async () =>
      scope.callWith(
        await issue(),
        'POST',
        '/internal/gateway/work-packages/absent-current-delegation/access',
        undefined,
        headers,
      ),
    );
    expect(absent.reply).toEqual({ status: 404, body: { error: 'not_found' } });
    expect(absent.after).toEqual(absent.before);
    const foreign = await observeCurrentOpening(world, async () =>
      scope.callWith(
        await issue(),
        'POST',
        '/internal/gateway/work-packages/' + foreignId + '/access',
        undefined,
        headers,
      ),
    );
    expect(foreign.reply).toEqual(absent.reply);
    expect(foreign.after).toEqual(foreign.before);
    scope.sqlite.run(
      "DELETE FROM access_grant WHERE organization_id='visibility-org' AND subject_kind='user' AND subject_id=? AND scope_kind='project' AND scope_id=?",
      [scope.userId('VisibilityReader'), target.projectId],
    );
    expect(
      scope.sqlite
        .query("SELECT id FROM access_grant WHERE subject_kind='user' AND subject_id=?")
        .all(scope.userId('VisibilityReader')),
    ).toEqual([]);
    expect(
      await world.callHuman(
        'VisibilityReader',
        'GET',
        '/api/work-packages/' + target.workPackageId,
      ),
    ).toEqual({ status: 404, body: { error: 'not_found' } });
    const hidden = await observeCurrentOpening(world, async () =>
      scope.callWith(await issue(), 'POST', path, undefined, headers),
    );
    expect(hidden.reply).toEqual(absent.reply);
    expect(hidden.after).toEqual(hidden.before);
  }));

it('replays a still-readable sibling while denying hidden and malformed gateway subscriptions', async () =>
  runOpeningAuthorityCase('human', async (world) => {
    const { scope, target } = world;
    const siblings = scope.sqlite
      .query<{ id: string }, [string]>('SELECT id FROM work_package WHERE project_id=?')
      .all(world.nextParent);
    expect(siblings).toHaveLength(1);
    const sibling = siblings.at(0);
    if (sibling === undefined) throw Error('Actual next-parent gateway sibling absent');
    scope.grant(
      'visibility-org',
      'VisibilityReader',
      'project-viewer',
      'project',
      world.nextParent,
    );
    expect(
      await world.callHuman('VisibilityReader', 'GET', '/api/work-packages/' + sibling.id),
    ).toMatchObject({ status: 200, body: { workPackage: { id: sibling.id } } });
    await recordHistoryEvent(world, target.workPackageId, 'Hidden mixed gateway marker');
    await recordHistoryEvent(world, sibling.id, 'Readable mixed gateway marker');
    const hiddenSubscription = 'work-package:' + target.workPackageId;
    const readableSubscription = 'work-package:' + sibling.id;
    function recordedEvent(subscription: string, marker: string) {
      const recorded = scope.sqlite
        .query<{ seq: number; message: string }, [string]>(
          'SELECT seq,message FROM event_log WHERE subscription=? ORDER BY seq',
        )
        .all(subscription)
        .filter((row) => row.message.includes(marker))
        .at(-1);
      if (recorded === undefined) throw Error('Actual mixed gateway command event absent');
      expect(Number.isSafeInteger(recorded.seq)).toBe(true);
      expect(recorded.seq).toBeGreaterThanOrEqual(0);
      const message: unknown = JSON.parse(recorded.message);
      return { seq: recorded.seq, message };
    }
    const hiddenEvent = recordedEvent(hiddenSubscription, 'Hidden mixed gateway marker');
    const readableEvent = recordedEvent(readableSubscription, 'Readable mixed gateway marker');
    const selection = await selectGatewayReader(world);
    const resume = (points: Record<string, number>) =>
      callGatewayBrowser(world, selection.cookie, 'x'.repeat(32), '/internal/resume', {
        resume_points: points,
        trace_id: 'mixed-current-gateway-visibility',
      });
    const readable = await observeCurrentOpening(world, () =>
      resume({
        [hiddenSubscription]: hiddenEvent.seq - 1,
        [readableSubscription]: readableEvent.seq - 1,
      }),
    );
    const hiddenEvents: unknown = expect.arrayContaining([hiddenEvent]);
    const readableEvents: unknown = expect.arrayContaining([readableEvent]);
    expect(readable.reply).toMatchObject({
      status: 200,
      body: {
        [hiddenSubscription]: {
          status: 'replaying',
          events: hiddenEvents,
        },
        [readableSubscription]: {
          status: 'replaying',
          events: readableEvents,
        },
      },
    });
    expect(readable.after).toEqual(readable.before);
    scope.sqlite.run(
      "DELETE FROM access_grant WHERE organization_id='visibility-org' AND subject_kind='user' AND subject_id=? AND scope_kind='project' AND scope_id=?",
      [scope.userId('VisibilityReader'), target.projectId],
    );
    expect(
      scope.sqlite
        .query(
          "SELECT scope_kind,scope_id,role_id FROM access_grant WHERE subject_kind='user' AND subject_id=?",
        )
        .all(scope.userId('VisibilityReader')),
    ).toEqual([{ scope_kind: 'project', scope_id: world.nextParent, role_id: 'project-viewer' }]);
    expect(
      await world.callHuman(
        'VisibilityReader',
        'GET',
        '/api/work-packages/' + target.workPackageId,
      ),
    ).toEqual({ status: 404, body: { error: 'not_found' } });
    expect(
      await world.callHuman('VisibilityReader', 'GET', '/api/work-packages/' + sibling.id),
    ).toMatchObject({ status: 200, body: { workPackage: { id: sibling.id } } });
    const denied = { status: 'denied', reason: 'forbidden' };
    const mixed = await observeCurrentOpening(world, () =>
      resume({
        [hiddenSubscription]: hiddenEvent.seq - 1,
        [readableSubscription]: readableEvent.seq - 1,
        'project:retired-gateway-subscription': -1,
        'workPackage:invalid-gateway-subscription': -1,
      }),
    );
    const readableEntry: unknown = expect.objectContaining({
      status: 'replaying',
      events: readableEvents,
    });
    expect(mixed.reply).toEqual({
      status: 200,
      body: {
        [hiddenSubscription]: denied,
        [readableSubscription]: readableEntry,
        'project:retired-gateway-subscription': denied,
        'workPackage:invalid-gateway-subscription': denied,
      },
    });
    expect(mixed.after).toEqual(mixed.before);
  }));

it('conceals a real saved shelf as absent after its selected reader loses the actual parent grant', async () =>
  runOpeningAuthorityCase('human', async (world) => {
    const { scope, target, callHuman } = world;
    const { createHash } = await import('node:crypto');
    const name = 'Current saved shelf record';
    const path = '/api/work-packages/' + target.workPackageId + '/saved-plans';
    expect(
      scope.sqlite
        .query('SELECT project_id,restricted FROM work_package WHERE id=?')
        .get(target.workPackageId),
    ).toEqual({ project_id: target.projectId, restricted: 1 });
    expect(
      scope.sqlite
        .query(
          "SELECT scope_kind,scope_id,role_id FROM access_grant WHERE organization_id='visibility-org' AND subject_kind='user' AND subject_id=?",
        )
        .all(scope.userId('VisibilityReader')),
    ).toEqual([{ scope_kind: 'project', scope_id: target.projectId, role_id: 'project-viewer' }]);

    const created = await callHuman('VisibilityCreator', 'POST', path, { name });
    expect(created.status).toBe(201);
    const payload = created.body;
    if (
      typeof payload !== 'object' ||
      payload === null ||
      !('savedPlan' in payload) ||
      typeof payload.savedPlan !== 'object' ||
      payload.savedPlan === null ||
      !('id' in payload.savedPlan) ||
      typeof payload.savedPlan.id !== 'string'
    )
      throw Error('Actual saved201 identity absent');
    const savedId = payload.savedPlan.id;
    const header = scope.sqlite
      .query<
        {
          id: string;
          work_package_id: string;
          name: string;
          created_by: string;
          created_by_id: string | null;
          created_at: number;
          input_schema_version: number;
          input_bytes: number;
          input_sha256: string;
          schedule_schema_version: number | null;
          schedule_bytes: number | null;
          schedule_sha256: string | null;
          schedule_input_sha256: string | null;
          scheduler_algorithm_id: string | null;
          schedule_absent_reason: string | null;
        },
        [string]
      >(
        'SELECT id,work_package_id,name,created_by,created_by_id,created_at,input_schema_version,input_bytes,input_sha256,schedule_schema_version,schedule_bytes,schedule_sha256,schedule_input_sha256,scheduler_algorithm_id,schedule_absent_reason FROM saved_plan WHERE id=?',
      )
      .get(savedId);
    if (header === null) throw Error('Actual saved header was not persisted');
    expect({
      id: header.id,
      workPackageId: header.work_package_id,
      name: header.name,
      createdById: header.created_by_id,
    }).toEqual({
      id: savedId,
      workPackageId: target.workPackageId,
      name,
      createdById: scope.userId('VisibilityCreator'),
    });
    const bodies = scope.sqlite
      .query<{ kind: string; bytes: string }, [string]>(
        'SELECT kind,bytes FROM saved_plan_body WHERE saved_plan_id=? ORDER BY kind',
      )
      .all(savedId);
    const input = bodies.find((body) => body.kind === 'input');
    if (input === undefined) throw Error('Actual saved input body absent');
    expect(bodies.map((body) => body.kind)).toEqual(
      header.schedule_sha256 === null ? ['input'] : ['input', 'schedule'],
    );
    expect(header.input_sha256).toBe(createHash('sha256').update(input.bytes).digest('hex'));
    expect(header.input_bytes).toBe(new TextEncoder().encode(input.bytes).byteLength);
    expect(created.body).toMatchObject({
      savedPlan: {
        id: savedId,
        workPackageId: target.workPackageId,
        name,
        createdBy: header.created_by,
        createdById: header.created_by_id,
        createdAt: header.created_at,
        input: {
          schemaVersion: header.input_schema_version,
          bytes: input.bytes,
          sha256: header.input_sha256,
        },
      },
    });
    if (header.schedule_sha256 === null) {
      expect(created.body).toMatchObject({
        savedPlan: { schedule: { present: false, absentReason: header.schedule_absent_reason } },
      });
    } else {
      const schedule = bodies.find((body) => body.kind === 'schedule');
      if (schedule === undefined) throw Error('Actual saved schedule body absent');
      expect(header.schedule_sha256).toBe(
        createHash('sha256').update(schedule.bytes).digest('hex'),
      );
      expect(header.schedule_bytes).toBe(new TextEncoder().encode(schedule.bytes).byteLength);
      expect(header.schedule_input_sha256).toBe(header.input_sha256);
      expect(created.body).toMatchObject({
        savedPlan: {
          schedule: {
            present: true,
            body: {
              schemaVersion: header.schedule_schema_version,
              bytes: schedule.bytes,
              sha256: header.schedule_sha256,
            },
            inputSha256: header.schedule_input_sha256,
            algorithmId: header.scheduler_algorithm_id,
          },
        },
      });
    }

    expect(
      await callHuman('VisibilityReader', 'GET', '/api/work-packages/' + target.workPackageId),
    ).toMatchObject({ status: 200, body: { workPackage: { id: target.workPackageId } } });
    expect(await callHuman('VisibilityReader', 'GET', path)).toEqual({
      status: 200,
      body: {
        savedPlans: [
          {
            id: savedId,
            name,
            createdBy: header.created_by,
            createdAt: header.created_at,
            inputBytes: header.input_bytes,
            scheduleBytes: header.schedule_bytes,
            scheduleAbsentReason: header.schedule_absent_reason,
          },
        ],
      },
    });

    scope.sqlite.run(
      "DELETE FROM access_grant WHERE organization_id='visibility-org' AND subject_kind='user' AND subject_id=? AND scope_kind='project' AND scope_id=?",
      [scope.userId('VisibilityReader'), target.projectId],
    );
    expect(
      scope.sqlite
        .query("SELECT id FROM access_grant WHERE subject_kind='user' AND subject_id=?")
        .all(scope.userId('VisibilityReader')),
    ).toEqual([]);
    expect(
      scope.sqlite
        .query(
          "SELECT role FROM organization_membership WHERE organization_id='visibility-org' AND user_id=?",
        )
        .get(scope.userId('VisibilityReader')),
    ).toEqual({ role: 'member' });
    expect(
      await callHuman('VisibilityReader', 'GET', '/api/work-packages/' + target.workPackageId),
    ).toEqual({ status: 404, body: { error: 'not_found' } });
    const absent = await callHuman(
      'VisibilityReader',
      'GET',
      '/api/work-packages/absent-current-saved-shelf/saved-plans',
    );
    expect(absent).toEqual({ status: 404, body: { error: 'not_found' } });
    const hidden = await callHuman('VisibilityReader', 'GET', path);
    expect(hidden).toEqual(absent);
  }));

async function saveStoredReadFixture(world: OpeningWorld, name: string) {
  const { scope, target, callHuman } = world;
  const { createHash } = await import('node:crypto');
  const created = await callHuman(
    'VisibilityCreator',
    'POST',
    '/api/work-packages/' + target.workPackageId + '/saved-plans',
    { name },
  );
  expect(created.status).toBe(201);
  const payload = created.body;
  if (
    typeof payload !== 'object' ||
    payload === null ||
    !('savedPlan' in payload) ||
    typeof payload.savedPlan !== 'object' ||
    payload.savedPlan === null ||
    !('id' in payload.savedPlan) ||
    typeof payload.savedPlan.id !== 'string'
  )
    throw Error('Actual next-read saved201 identity absent');
  const id = payload.savedPlan.id;
  const header = scope.sqlite
    .query<
      {
        id: string;
        work_package_id: string;
        name: string;
        created_by: string;
        created_by_id: string | null;
        created_at: number;
        input_schema_version: number;
        input_bytes: number;
        input_sha256: string;
        schedule_schema_version: number | null;
        schedule_bytes: number | null;
        schedule_sha256: string | null;
        schedule_input_sha256: string | null;
        scheduler_algorithm_id: string | null;
        schedule_absent_reason: string | null;
      },
      [string]
    >(
      'SELECT id,work_package_id,name,created_by,created_by_id,created_at,input_schema_version,input_bytes,input_sha256,schedule_schema_version,schedule_bytes,schedule_sha256,schedule_input_sha256,scheduler_algorithm_id,schedule_absent_reason FROM saved_plan WHERE id=?',
    )
    .get(id);
  if (header === null) throw Error('Actual next-read saved header absent');
  expect({
    id: header.id,
    workPackageId: header.work_package_id,
    name: header.name,
    createdById: header.created_by_id,
  }).toEqual({
    id,
    workPackageId: target.workPackageId,
    name,
    createdById: scope.userId('VisibilityCreator'),
  });
  const bodies = scope.sqlite
    .query<{ kind: string; bytes: string }, [string]>(
      'SELECT kind,bytes FROM saved_plan_body WHERE saved_plan_id=? ORDER BY kind',
    )
    .all(id);
  const input = bodies.find((body) => body.kind === 'input');
  if (input === undefined) throw Error('Actual next-read input bytes absent');
  expect(bodies.map((body) => body.kind)).toEqual(
    header.schedule_sha256 === null ? ['input'] : ['input', 'schedule'],
  );
  expect(createHash('sha256').update(input.bytes).digest('hex')).toBe(header.input_sha256);
  expect(new TextEncoder().encode(input.bytes).byteLength).toBe(header.input_bytes);
  let schedule:
    | { present: false; absentReason: string }
    | {
        present: true;
        body: { schemaVersion: number; bytes: string; sha256: string };
        inputSha256: string;
        algorithmId: string;
      };
  if (header.schedule_sha256 === null) {
    if (header.schedule_absent_reason === null)
      throw Error('Actual schedule absence reason absent');
    schedule = { present: false, absentReason: header.schedule_absent_reason };
  } else {
    const storedSchedule = bodies.find((body) => body.kind === 'schedule');
    if (
      storedSchedule === undefined ||
      header.schedule_schema_version === null ||
      header.schedule_bytes === null ||
      header.schedule_input_sha256 === null ||
      header.scheduler_algorithm_id === null
    )
      throw Error('Actual complete next-read schedule absent');
    expect(createHash('sha256').update(storedSchedule.bytes).digest('hex')).toBe(
      header.schedule_sha256,
    );
    expect(new TextEncoder().encode(storedSchedule.bytes).byteLength).toBe(header.schedule_bytes);
    expect(header.schedule_input_sha256).toBe(header.input_sha256);
    schedule = {
      present: true,
      body: {
        schemaVersion: header.schedule_schema_version,
        bytes: storedSchedule.bytes,
        sha256: header.schedule_sha256,
      },
      inputSha256: header.schedule_input_sha256,
      algorithmId: header.scheduler_algorithm_id,
    };
  }
  const record = {
    id,
    workPackageId: target.workPackageId,
    name,
    createdBy: header.created_by,
    createdAt: header.created_at,
    input: {
      schemaVersion: header.input_schema_version,
      bytes: input.bytes,
      sha256: header.input_sha256,
    },
    schedule,
  };
  expect(created.body).toEqual({ savedPlan: { ...record, createdById: header.created_by_id } });
  return { id, record, header, bodies };
}

function assertSavedReadPremises(world: OpeningWorld) {
  const { scope, target } = world;
  expect(
    scope.sqlite
      .query('SELECT project_id,restricted FROM work_package WHERE id=?')
      .get(target.workPackageId),
  ).toEqual({
    project_id: target.projectId,
    restricted: 1,
  });
  expect(
    scope.sqlite
      .query(
        "SELECT scope_kind,scope_id,role_id FROM access_grant WHERE organization_id='visibility-org' AND subject_kind='user' AND subject_id=?",
      )
      .all(scope.userId('VisibilityReader')),
  ).toEqual([{ scope_kind: 'project', scope_id: target.projectId, role_id: 'project-viewer' }]);
}

async function revokeSavedReadGrant(world: OpeningWorld) {
  const { scope, target, callHuman } = world;
  scope.sqlite.run(
    "DELETE FROM access_grant WHERE organization_id='visibility-org' AND subject_kind='user' AND subject_id=? AND scope_kind='project' AND scope_id=?",
    [scope.userId('VisibilityReader'), target.projectId],
  );
  expect(
    scope.sqlite
      .query("SELECT id FROM access_grant WHERE subject_kind='user' AND subject_id=?")
      .all(scope.userId('VisibilityReader')),
  ).toEqual([]);
  expect(
    scope.sqlite
      .query(
        "SELECT role FROM organization_membership WHERE organization_id='visibility-org' AND user_id=?",
      )
      .get(scope.userId('VisibilityReader')),
  ).toEqual({ role: 'member' });
  expect(
    await callHuman('VisibilityReader', 'GET', '/api/work-packages/' + target.workPackageId),
  ).toEqual({
    status: 404,
    body: { error: 'not_found' },
  });
}

function assertStoredReadUnchanged(
  world: OpeningWorld,
  saved: Awaited<ReturnType<typeof saveStoredReadFixture>>,
) {
  expect(
    world.scope.sqlite
      .query(
        'SELECT id,work_package_id,name,created_by,created_by_id,created_at,input_schema_version,input_bytes,input_sha256,schedule_schema_version,schedule_bytes,schedule_sha256,schedule_input_sha256,scheduler_algorithm_id,schedule_absent_reason FROM saved_plan WHERE id=?',
      )
      .get(saved.id),
  ).toEqual(saved.header);
  expect(
    world.scope.sqlite
      .query('SELECT kind,bytes FROM saved_plan_body WHERE saved_plan_id=? ORDER BY kind')
      .all(saved.id),
  ).toEqual(saved.bodies);
}

it('conceals a real saved plan detail as absent after its selected reader loses the actual parent grant', async () =>
  runOpeningAuthorityCase('human', async (world) => {
    assertSavedReadPremises(world);
    const saved = await saveStoredReadFixture(world, 'Current saved detail record');
    expect(
      await world.callHuman(
        'VisibilityReader',
        'GET',
        '/api/work-packages/' + world.target.workPackageId,
      ),
    ).toMatchObject({
      status: 200,
      body: { workPackage: { id: world.target.workPackageId } },
    });
    const path = '/api/saved-plans/' + encodeURIComponent(saved.id);
    expect(await world.callHuman('VisibilityReader', 'GET', path)).toEqual({
      status: 200,
      body: { savedPlan: saved.record },
    });
    const missingPath = '/api/saved-plans/absent-current-saved-detail';
    expect(await world.callHuman('VisibilityReader', 'GET', missingPath)).toEqual({
      status: 404,
      body: { error: 'not_found' },
    });
    await revokeSavedReadGrant(world);
    assertStoredReadUnchanged(world, saved);
    const absent = await world.callHuman('VisibilityReader', 'GET', missingPath);
    expect(absent).toEqual({ status: 404, body: { error: 'not_found' } });
    const hidden = await world.callHuman('VisibilityReader', 'GET', path);
    expect(hidden).toEqual(absent);
  }));

it('conceals a real saved/saved comparison as absent after its selected reader loses the actual parent grant', async () =>
  runOpeningAuthorityCase('human', async (world) => {
    assertSavedReadPremises(world);
    const left = await saveStoredReadFixture(world, 'Current saved comparison left');
    const right = await saveStoredReadFixture(world, 'Current saved comparison right');
    expect(left.id).not.toBe(right.id);
    expect(
      await world.callHuman(
        'VisibilityReader',
        'GET',
        '/api/work-packages/' + world.target.workPackageId,
      ),
    ).toMatchObject({
      status: 200,
      body: { workPackage: { id: world.target.workPackageId } },
    });
    const query = '?left=' + encodeURIComponent(left.id) + '&right=' + encodeURIComponent(right.id);
    const path =
      '/api/work-packages/' + world.target.workPackageId + '/saved-plans/compare' + query;
    expect(await world.callHuman('VisibilityReader', 'GET', path)).toMatchObject({
      status: 200,
      body: {
        left: {
          source: { kind: 'saved', savedPlanId: left.id },
          parent: { kind: 'recorded', projectId: world.target.projectId },
          schedule: left.record.schedule.present
            ? { present: true, algorithmId: left.record.schedule.algorithmId }
            : { present: false, absentReason: left.record.schedule.absentReason },
        },
        right: {
          source: { kind: 'saved', savedPlanId: right.id },
          parent: { kind: 'recorded', projectId: world.target.projectId },
          schedule: right.record.schedule.present
            ? { present: true, algorithmId: right.record.schedule.algorithmId }
            : { present: false, absentReason: right.record.schedule.absentReason },
        },
        diff: { input: [], schedule: [] },
      },
    });
    const wrongId = 'absent-current-saved-comparison-side';
    expect(
      await world.callHuman(
        'VisibilityReader',
        'GET',
        '/api/work-packages/' +
          world.target.workPackageId +
          '/saved-plans/compare?left=' +
          wrongId +
          '&right=' +
          encodeURIComponent(right.id),
      ),
    ).toEqual({ status: 404, body: { error: 'not_found', savedPlanId: wrongId } });
    const missingPath =
      '/api/work-packages/absent-current-saved-comparison/saved-plans/compare' + query;
    expect(await world.callHuman('VisibilityReader', 'GET', missingPath)).toEqual({
      status: 404,
      body: { error: 'not_found' },
    });
    await revokeSavedReadGrant(world);
    assertStoredReadUnchanged(world, left);
    assertStoredReadUnchanged(world, right);
    const absent = await world.callHuman('VisibilityReader', 'GET', missingPath);
    expect(absent).toEqual({ status: 404, body: { error: 'not_found' } });
    const hidden = await world.callHuman('VisibilityReader', 'GET', path);
    expect(hidden).toEqual(absent);
  }));

it('conceals a real current/current comparison as absent after its selected reader loses the actual parent grant', async () =>
  runOpeningAuthorityCase('human', async (world) => {
    assertSavedReadPremises(world);
    expect(
      await world.callHuman(
        'VisibilityReader',
        'GET',
        '/api/work-packages/' + world.target.workPackageId,
      ),
    ).toMatchObject({ status: 200, body: { workPackage: { id: world.target.workPackageId } } });
    const query = '?left=current&right=current';
    const path =
      '/api/work-packages/' + world.target.workPackageId + '/saved-plans/compare' + query;
    expect(await world.callHuman('VisibilityReader', 'GET', path)).toMatchObject({
      status: 200,
      body: {
        left: {
          source: { kind: 'current' },
          parent: { kind: 'recorded', projectId: world.target.projectId },
        },
        right: {
          source: { kind: 'current' },
          parent: { kind: 'recorded', projectId: world.target.projectId },
        },
        diff: { input: [], schedule: [] },
      },
    });
    const missingPath =
      '/api/work-packages/absent-current-current-admission/saved-plans/compare' + query;
    expect(await world.callHuman('VisibilityReader', 'GET', missingPath)).toEqual({
      status: 404,
      body: { error: 'not_found' },
    });
    await revokeSavedReadGrant(world);
    const absent = await world.callHuman('VisibilityReader', 'GET', missingPath);
    expect(absent).toEqual({ status: 404, body: { error: 'not_found' } });
    const hidden = await world.callHuman('VisibilityReader', 'GET', path);
    expect(hidden).toEqual(absent);
  }));

for (const order of ['saved/current', 'current/saved'] as const) {
  it(
    'conceals a real ' +
      order +
      ' comparison after current parent-grant loss without changing saved history',
    async () =>
      runOpeningAuthorityCase('human', async (world) => {
        assertSavedReadPremises(world);
        const saved = await saveStoredReadFixture(world, 'Current mixed ' + order);
        const savedRef = encodeURIComponent(saved.id);
        const query =
          order === 'saved/current'
            ? '?left=' + savedRef + '&right=current'
            : '?left=current&right=' + savedRef;
        const path =
          '/api/work-packages/' + world.target.workPackageId + '/saved-plans/compare' + query;
        expect(await world.callHuman('VisibilityReader', 'GET', path)).toMatchObject({
          status: 200,
          body: {
            left: {
              source:
                order === 'saved/current'
                  ? { kind: 'saved', savedPlanId: saved.id }
                  : { kind: 'current' },
              parent: { kind: 'recorded', projectId: world.target.projectId },
            },
            right: {
              source:
                order === 'saved/current'
                  ? { kind: 'current' }
                  : { kind: 'saved', savedPlanId: saved.id },
              parent: { kind: 'recorded', projectId: world.target.projectId },
            },
            diff: { input: [], schedule: [] },
          },
        });
        const absentPath = '/api/work-packages/absent-mixed-current/saved-plans/compare' + query;
        expect(await world.callHuman('VisibilityReader', 'GET', absentPath)).toEqual({
          status: 404,
          body: { error: 'not_found' },
        });
        await revokeSavedReadGrant(world);
        assertStoredReadUnchanged(world, saved);
        const absent = await world.callHuman('VisibilityReader', 'GET', absentPath);
        expect(absent).toEqual({ status: 404, body: { error: 'not_found' } });
        expect(await world.callHuman('VisibilityReader', 'GET', path)).toEqual(absent);
      }),
  );
}

it('writes inherited budget factors only through the admitted project settings boundary', async () => {
  await runVisibilityCase(false, async (scope) => {
    const first = await createVisibilityPackage(
      scope,
      'Settings project boundary',
      'Settings first child',
    );
    const created = await scope.call('VisibilityCreator', 'POST', '/api/work-packages', {
      name: 'Settings second child',
      projectId: first.projectId,
    });
    expect(created.status).toBe(200);
    const child = created.body;
    if (
      typeof child !== 'object' ||
      child === null ||
      !('workPackage' in child) ||
      typeof child.workPackage !== 'object' ||
      child.workPackage === null ||
      !('id' in child.workPackage) ||
      typeof child.workPackage.id !== 'string' ||
      child.workPackage.id === ''
    )
      throw Error('Second settings child identity is absent');
    const secondId = child.workPackage.id;
    expect(child).toMatchObject({ workPackage: { projectId: first.projectId, budgetFactor: 1 } });
    const baseline = await scope.call(
      'VisibilityCreator',
      'GET',
      '/api/work-packages/' + first.workPackageId,
    );
    expect(baseline.status).toBe(200);
    expect(baseline.body).toMatchObject({ workPackage: { budgetFactor: 1 } });
    const changed = await scope.call(
      'VisibilityCreator',
      'PATCH',
      '/api/projects/' + first.projectId + '/settings',
      { budgetFactor: 2 },
    );
    expect(changed.status).toBe(200);
    expect(changed.body).toMatchObject({
      settings: {
        budgetFactor: { value: 2, provenance: { level: 'project', id: first.projectId } },
      },
    });
    for (const id of [first.workPackageId, secondId]) {
      const read = await scope.call('VisibilityCreator', 'GET', '/api/work-packages/' + id);
      expect(read.status).toBe(200);
      expect(read.body).toMatchObject({ workPackage: { budgetFactor: 2 } });
    }
    const refused = await scope.call(
      'VisibilityCreator',
      'PATCH',
      '/api/work-packages/' + first.workPackageId,
      { budgetFactor: 3 },
    );
    expect(refused.status).toBe(409);
    expect(refused.body).toEqual({
      error: 'not_overridable_here',
      key: 'budgetFactor',
      level: 'work_package',
    });
    for (const id of [first.workPackageId, secondId]) {
      const read = await scope.call('VisibilityCreator', 'GET', '/api/work-packages/' + id);
      expect(read.status).toBe(200);
      expect(read.body).toMatchObject({ workPackage: { budgetFactor: 2 } });
    }
  });
});
