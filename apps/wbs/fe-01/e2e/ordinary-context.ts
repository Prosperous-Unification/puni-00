import { lstatSync, readFileSync } from 'node:fs';

import {
  type APIResponse,
  type Browser,
  type BrowserContext,
  type BrowserContextOptions,
  expect,
  type Locator,
  type Page,
} from '@playwright/test';
import {
  loginPassword,
  readActiveOrganization,
  readPasswordSession,
  type SchemaShape,
  selectActiveOrganization,
  validateSchema,
} from '@wbs/contracts';
import { type } from 'arktype';

import { ordinaryContextPaths } from '../ordinary-context-paths';
import { parseOrdinaryPortShift } from '../playwright.ordinary-servers';

const readinessSchema = type({
  version: '1',
  runId: 'string > 0',
  databasePath: 'string > 0',
  stateDirectory: 'string > 0',
  origin: 'string > 0',
  appOrigin: 'string > 0',
  gwUrl: 'string > 0',
  accountId: 'string > 0',
  organizationId: 'string > 0',
}).onDeepUndeclaredKey('reject');
const fixtureSchema = type({
  version: '1',
  runId: 'string > 0',
  databasePath: 'string > 0',
  stateDirectory: 'string > 0',
  beOrigin: 'string > 0',
  appOrigin: 'string > 0',
  gwOrigin: 'string > 0',
  accountId: 'string > 0',
  organizationId: 'string > 0',
  projectId: 'string > 0',
  storageStatePath: 'string > 0',
}).onDeepUndeclaredKey('reject');
const cookieSchema = type({
  name: "'__Host-wbs_access' | '__Host-wbs_organization'",
  value: 'string > 0',
  domain: "'localhost'",
  path: "'/'",
  expires: 'number >= -1',
  httpOnly: 'true',
  secure: 'true',
  sameSite: "'Lax'",
});
const storageSchema = type({
  cookies: cookieSchema.array(),
  origins: 'unknown[]',
}).onDeepUndeclaredKey('reject');

export type OrdinaryReadiness = typeof readinessSchema.infer;
export type OrdinaryFixture = typeof fixtureSchema.infer;
type ContextOptions = Omit<
  BrowserContextOptions,
  'baseURL' | 'storageState' | 'locale' | 'timezoneId'
>;

/** Reads only a regular private fixture file owned by this runner's user. */
function readPrivateJson(path: string): unknown {
  const uid = process.getuid?.();
  if (uid === undefined) throw new Error('Ordinary browser fixtures require a Unix file owner');
  const node = lstatSync(path);
  if (!node.isFile() || node.nlink !== 1 || node.uid !== uid || (node.mode & 0o777) !== 0o600)
    throw new Error('Ordinary browser state must be a private owned regular file');
  const bytes = readFileSync(path, 'utf8');
  try {
    return JSON.parse(bytes);
  } catch (cause) {
    // Malformed cookie JSON can place credential text in the parser message; keep that modeled refusal opaque.
    // eslint-disable-next-line preserve-caught-error -- The trusted cookie JSON boundary deliberately withholds SyntaxError text and cause because they can contain credentials.
    if (cause instanceof SyntaxError) throw new Error('Ordinary browser state JSON is malformed');
    throw cause;
  }
}

/** The bootstrap marker must name this exact run path and three configured loopback endpoints. */
export function readOrdinaryReadiness(): OrdinaryReadiness {
  const paths = ordinaryContextPaths(process.env['E2E_TEST_DATABASE']);
  const shift = parseOrdinaryPortShift(process.env['E2E_PORT_SHIFT']);
  const directory = lstatSync(paths.stateDirectory);
  if (
    !directory.isDirectory() ||
    directory.uid !== process.getuid?.() ||
    (directory.mode & 0o777) !== 0o700
  )
    throw new Error('Ordinary state directory is not privately owned');
  const ready = readinessSchema(readPrivateJson(paths.readinessPath));
  if (ready instanceof type.errors) throw new Error('Ordinary readiness is malformed');
  if (
    ready.databasePath !== paths.databasePath ||
    ready.stateDirectory !== paths.stateDirectory ||
    ready.origin !== 'http://localhost:' + String(3100 + shift) ||
    ready.gwUrl !== 'http://localhost:' + String(3200 + shift) ||
    ready.appOrigin !== 'http://localhost:' + String(4200 + shift)
  )
    throw new Error('Ordinary readiness belongs to a different run or origin');
  return ready;
}

/** Workers fail before writes when setup is absent, stale, foreign or malformed; they never log in implicitly. */
export function readOrdinaryFixture(): OrdinaryFixture {
  const runId = process.env['E2E_CURRENT_RUN_ID'];
  if (runId === undefined || runId === '')
    throw new Error('Ordinary browser setup did not publish this worker run identity');
  const paths = ordinaryContextPaths(process.env['E2E_TEST_DATABASE']);
  const ready = readOrdinaryReadiness();
  const fixture = fixtureSchema(readPrivateJson(paths.contextPath));
  if (fixture instanceof type.errors) throw new Error('Ordinary browser context is malformed');
  if (
    fixture.runId !== runId ||
    fixture.runId !== ready.runId ||
    fixture.databasePath !== paths.databasePath ||
    fixture.stateDirectory !== paths.stateDirectory ||
    fixture.beOrigin !== ready.origin ||
    fixture.appOrigin !== ready.appOrigin ||
    fixture.gwOrigin !== ready.gwUrl ||
    fixture.accountId !== ready.accountId ||
    fixture.organizationId !== ready.organizationId ||
    fixture.storageStatePath !== paths.storageStatePath
  )
    throw new Error('Ordinary browser context belongs to a different run or authority');
  assertOrdinaryStorage(readPrivateJson(paths.storageStatePath));
  return fixture;
}

/** The default setup jar contains only its two hardened native cookies and no remembered browser selections. */
export function assertOrdinaryStorage(state: unknown): void {
  const storage = storageSchema(state);
  if (storage instanceof type.errors) throw new Error('Ordinary browser cookies are malformed');
  if (
    storage.origins.length !== 0 ||
    storage.cookies.length !== 2 ||
    new Set(storage.cookies.map((cookie) => cookie.name)).size !== 2
  )
    throw new Error(
      'Ordinary setup storage must retain exactly its native access and selected-organization cookies',
    );
}

/** Validates the actual mounted HTTP response using its public shared declaration. */
export async function ordinaryReply<T>(
  response: APIResponse,
  schema: SchemaShape<T>,
  status: number,
  operation: string,
): Promise<T> {
  if (response.status() !== status)
    throw new Error(operation + ' answered HTTP ' + String(response.status()));
  const checked = await validateSchema(schema, await response.json());
  if (checked.issues !== undefined) throw new Error(operation + ' returned a malformed response');
  return checked.value;
}

/**
 * Explicit fixture bridge: only the actual native-login body token enters the hardened localhost cookie.
 * The caller supplies an empty jar; this does not claim native GUI cookie issuance parity.
 */
export async function authenticateOrdinaryContext(
  context: BrowserContext,
  ready: OrdinaryReadiness,
): Promise<void> {
  const existing = await context.cookies();
  if (existing.length !== 0)
    throw new Error('Independent ordinary login requires an empty cookie jar');
  const login = await ordinaryReply(
    await context.request.post(ready.origin + '/api/auth/login', {
      headers: { origin: ready.appOrigin },
      data: { username: 'local-dev', password: 'ordinary-browser-password' },
    }),
    loginPassword.responses[0].schema,
    200,
    'Ordinary native login',
  );
  if (
    login.user.id !== ready.accountId ||
    login.user.username !== 'local-dev' ||
    login.token === ''
  )
    throw new Error('Ordinary native login returned a different account or no credential');
  await context.addCookies([
    {
      name: '__Host-wbs_access',
      value: login.token,
      domain: 'localhost',
      path: '/',
      secure: true,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
  const selected = await ordinaryReply(
    await context.request.post(ready.origin + '/api/organization/active', {
      headers: { origin: ready.appOrigin },
      data: { organizationId: ready.organizationId },
    }),
    selectActiveOrganization.responses[0].schema,
    200,
    'Ordinary organization selection',
  );
  if (selected.organizationId !== ready.organizationId)
    throw new Error('Ordinary selection changed the requested organization');
  const active = await ordinaryReply(
    await context.request.get(ready.origin + '/api/organization/active'),
    readActiveOrganization.responses[0].schema,
    200,
    'Ordinary active organization',
  );
  if (active.organizationId !== ready.organizationId)
    throw new Error('Ordinary discovery changed the selected organization');
  const session = await ordinaryReply(
    await context.request.get(ready.origin + '/api/auth/me'),
    readPasswordSession.responses[0].schema,
    200,
    'Ordinary browser credential',
  );
  if (session.user?.id !== ready.accountId || session.features?.organizations !== true)
    throw new Error('Ordinary browser credential or current organization feature is absent');
}

/** Opens the saved default credential with explicit browser options and the run's exact origin. */
export async function openOrdinaryContext(
  browser: Browser,
  options: ContextOptions = {},
): Promise<BrowserContext> {
  const fixture = readOrdinaryFixture();
  return await browser.newContext({
    ...options,
    baseURL: fixture.appOrigin,
    storageState: fixture.storageStatePath,
    locale: 'en-US',
    timezoneId: 'UTC',
  });
}

/** Logout tests use a separately issued native credential and cannot retire the default storage-state token. */
export async function openIndependentOrdinaryContext(
  browser: Browser,
  options: ContextOptions = {},
): Promise<BrowserContext> {
  const fixture = readOrdinaryFixture();
  const ready = readOrdinaryReadiness();
  const context = await browser.newContext({
    ...options,
    baseURL: fixture.appOrigin,
    storageState: { cookies: [], origins: [] },
    locale: 'en-US',
    timezoneId: 'UTC',
  });
  try {
    await authenticateOrdinaryContext(context, ready);
    return context;
  } catch (primary) {
    try {
      await context.close();
    } catch (cleanup) {
      throw new AggregateError(
        [primary, cleanup],
        'Independent ordinary login and context close failed',
        // eslint-disable-next-line preserve-caught-error -- Fixture acquisition retains the primary login failure as cause and this cleanup failure in the ordered [primary, cleanup] errors.
        { cause: primary },
      );
    }
    throw primary;
  }
}

/** Opens the required visible native package-actions branch, preserving an already open branch. */
export async function openWorkPackageActions(page: Page): Promise<Locator> {
  const trigger = page.getByRole('banner').locator('summary[aria-label="Work package actions"]');
  await expect(trigger).toBeVisible();
  const disclosure = trigger.locator('..');
  if ((await disclosure.getAttribute('open')) === null) await trigger.click();
  await expect(disclosure).toHaveAttribute('open', '');
  return trigger;
}

/** Every fresh plan navigation selects the captured API-created destination explicitly. */
export async function selectOrdinaryProject(page: Page): Promise<void> {
  const fixture = readOrdinaryFixture();
  if (new URL(page.url()).origin !== fixture.appOrigin)
    throw new Error('Ordinary project selection is on a foreign origin');
  const trigger = await openWorkPackageActions(page);
  const picker = page.getByRole('combobox', { name: 'Destination project' });
  await expect(picker).toBeVisible();
  await picker.selectOption(fixture.projectId);
  await expect(picker).toHaveValue(fixture.projectId);
  await picker.press('Escape');
  await expect(picker).toBeHidden();
  await expect(trigger).toBeFocused();
}

/** Opens the compact native account/organization branch at an explicitly compact viewport. */
export async function openCompactAccount(page: Page): Promise<Locator> {
  const viewport = page.viewportSize();
  if (viewport === null || viewport.width >= 768)
    throw new Error('Compact account controls require a configured viewport below 768px');
  const trigger = page
    .getByRole('banner')
    .locator('summary[aria-label="Account and organization"]');
  await expect(trigger).toBeVisible();
  const disclosure = trigger.locator('..');
  if ((await disclosure.getAttribute('open')) === null) await trigger.click();
  await expect(disclosure).toHaveAttribute('open', '');
  return trigger;
}

/** Observes the real ordinary account in the declared responsive branch, then leaves chrome dismissed. */
export async function assertOrdinaryAccount(page: Page): Promise<void> {
  const viewport = page.viewportSize();
  if (viewport === null)
    throw new Error('Ordinary account readiness requires a configured viewport');
  if (viewport.width < 768) {
    const trigger = await openCompactAccount(page);
    await expect(page.getByRole('button', { name: 'local-dev', exact: true })).toBeVisible();
    await trigger.press('Escape');
    await expect(trigger.locator('..')).not.toHaveAttribute('open', '');
    await expect(trigger).toBeFocused();
    return;
  }
  await expect(page.getByRole('button', { name: 'local-dev', exact: true })).toBeVisible();
}
