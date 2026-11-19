import { lstatSync, writeFileSync } from 'node:fs';

import { chromium, type Browser, type BrowserContext, type FullConfig } from '@playwright/test';
import { createProject, readProject } from '@wbs/contracts';

import {
  assertOrdinaryStorage,
  authenticateOrdinaryContext,
  ordinaryReply,
  readOrdinaryReadiness,
  type OrdinaryFixture,
} from './e2e/ordinary-context';
import { ordinaryContextPaths } from './ordinary-context-paths';

/** Existing publication is a refusal, never permission to attach to or overwrite another run. */
function requireAbsent(path: string): void {
  try {
    lstatSync(path);
  } catch (cause) {
    if (typeof cause === 'object' && cause !== null && 'code' in cause && cause.code === 'ENOENT')
      return;
    throw cause;
  }
  throw new Error('Ordinary browser setup refuses existing state: ' + path);
}

/** Publishes private cookies first and run-bound authority-free metadata last after real native setup. */
export default async function setupOrdinaryBrowser(configuration: FullConfig): Promise<void> {
  const paths = ordinaryContextPaths(process.env['E2E_TEST_DATABASE']);
  const ready = readOrdinaryReadiness();
  const project = configuration.projects.at(0);
  if (project === undefined || project.use.baseURL !== ready.appOrigin)
    throw new Error('Ordinary browser config and fixture origins differ');
  requireAbsent(paths.contextPath);
  requireAbsent(paths.storageStatePath);
  let browser: Browser | undefined;
  let context: BrowserContext | undefined;
  let publication:
    | { fixture: OrdinaryFixture; storage: Awaited<ReturnType<BrowserContext['storageState']>> }
    | undefined;
  const failures: unknown[] = [];
  try {
    browser = await chromium.launch(project.use.launchOptions);
    context = await browser.newContext({
      baseURL: ready.appOrigin,
      storageState: { cookies: [], origins: [] },
      locale: 'en-US',
      timezoneId: 'UTC',
    });
    await authenticateOrdinaryContext(context, ready);
    const created = await ordinaryReply(
      await context.request.post(ready.origin + '/api/projects', {
        headers: { origin: ready.appOrigin, 'X-WBS-Expected-Organization': ready.organizationId },
        data: { name: 'Ordinary browser parent' },
      }),
      createProject.responses[0].schema,
      201,
      'Ordinary project creation',
    );
    if (
      'workPackage' in created ||
      created.project.organizationId !== ready.organizationId ||
      created.project.name !== 'Ordinary browser parent'
    )
      throw new Error('Ordinary project creation returned another parent or an unexpected child');
    const readback = await ordinaryReply(
      await context.request.get(
        ready.origin + '/api/projects/' + encodeURIComponent(created.project.id),
        { headers: { 'X-WBS-Expected-Organization': ready.organizationId } },
      ),
      readProject.responses[0].schema,
      200,
      'Ordinary project readback',
    );
    if (
      readback.project.id !== created.project.id ||
      readback.project.organizationId !== ready.organizationId ||
      readback.project.workPackages.length !== 0
    )
      throw new Error('Ordinary project readback differs from the created empty parent');
    const storage = await context.storageState();
    assertOrdinaryStorage(storage);
    publication = {
      fixture: {
        version: 1,
        runId: ready.runId,
        databasePath: paths.databasePath,
        stateDirectory: paths.stateDirectory,
        beOrigin: ready.origin,
        appOrigin: ready.appOrigin,
        gwOrigin: ready.gwUrl,
        accountId: ready.accountId,
        organizationId: ready.organizationId,
        projectId: created.project.id,
        storageStatePath: paths.storageStatePath,
      },
      storage,
    };
  } catch (cause) {
    failures.push(cause);
  }
  if (context !== undefined) {
    try {
      await context.close();
    } catch (cause) {
      failures.push(cause);
    }
  }
  if (browser !== undefined) {
    try {
      await browser.close();
    } catch (cause) {
      failures.push(cause);
    }
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1)
    throw new AggregateError(failures, 'Ordinary setup and browser cleanup failed', {
      cause: failures[0],
    });
  if (publication === undefined)
    throw new Error('Ordinary setup did not retain its successful publication');
  writeFileSync(paths.storageStatePath, JSON.stringify(publication.storage) + '\n', {
    flag: 'wx',
    mode: 0o600,
  });
  writeFileSync(paths.contextPath, JSON.stringify(publication.fixture) + '\n', {
    flag: 'wx',
    mode: 0o600,
  });
  process.env['E2E_CURRENT_RUN_ID'] = ready.runId;
}
