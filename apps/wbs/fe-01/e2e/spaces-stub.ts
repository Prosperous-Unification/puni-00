import { type Page } from '@playwright/test';

/**
 * The spaces API answered at the browser's boundary, for the spaces pages'
 * drawing checks and their captures.
 *
 * Answered rather than seeded for `organization.spec.ts`'s reason: spaces need
 * an organization, and the ordinary e2e be-01 refuses organization selection
 * (`REFUSE_ORGANIZATION_SELECTION`). The bodies are the contract shapes the
 * pages' own tests answer with.
 */

/** One reply: a status and its JSON body, or no body for a 204. */
export interface StubReply {
  status: number;
  body?: unknown;
}

/** Replies keyed `METHOD /path` (no query), replacing the writable default fixture's. */
export type StubReplies = Readonly<Record<string, StubReply>>;

/**
 * A long space and work package name with no break opportunity (underscores, no
 * hyphen or space): what a phone has to wrap rather than widen for.
 */
export const LONG_NAME = 'quarterly_infrastructure_migration_and_decommissioning_programme';

const space = (id: string, name: string, workPackageCount: number) => ({
  id,
  name,
  virtual: false,
  workPackageCount,
  revision: 1,
  createdById: 'u1',
  createdAt: 1,
});

const workPackage = (id: string, name: string, restricted = false) => ({
  id,
  abbreviation: id.toUpperCase(),
  name,
  projectId: 'fixture-project',
  restricted,
  estimateMethod: 'pert',
  depReach: 'whole-item',
  pertWeights: { optimistic: 1, realistic: 4, pessimistic: 1 },
  estimateRounding: 'exact',
  startDate: null,
  solutionRef: null,
  revision: 0,
  createdAt: 1,
  optimizationEnabled: false,
  scheduleEngine: 'fast',
  scheduleObjective: 'pri',
  createdByName: 'ada',
  lastOpenedAt: null,
});

const rolledUp = (
  startsOn: string,
  endsOn: string,
  finalTotal: number,
  done: number,
  leaves: number,
) => ({
  kind: 'rolled_up',
  dates: { startsOn, endsOn },
  finalTotal,
  status: done === leaves ? 'done' : 'in_progress',
  counts: {
    byStatus: {
      unknown: 0,
      draft: 0,
      ready: 0,
      in_progress: leaves - done,
      blocked_by_proxy: 0,
      on_hold: 0,
      blocked: 0,
      done,
    },
    leaves,
    estimated: leaves,
  },
  scheduleError: null,
  waitingForPerson: 0,
  waitingForCapacity: 0,
  displayed: 'fast',
  workPackageRevision: 0,
  seq: 1,
});

const leaf = (
  workPackageId: string,
  workPackageName: string,
  workItemId: string,
  number: string,
  name: string,
  lateBy: number | null,
) => ({
  workPackageId,
  workPackageName,
  position: 10,
  workItemId,
  number,
  name,
  dates: { startsOn: '2026-10-01', endsOn: '2026-10-09' },
  lateBy,
  assignees: [
    { id: 'kat', name: 'Kat' },
    { id: 'lin', name: 'Lin' },
  ],
  step: { id: 'dev', name: 'Dev' },
});

/** The space `s`'s work packages, in order. */
export const SPACE_WORK_PACKAGES = [
  workPackage('p1', 'Website relaunch'),
  workPackage('p2', LONG_NAME),
  workPackage('p3', 'Billing', true),
  workPackage('p4', 'Mobile app'),
];

/** The writable default: every control each page offers is drawn. */
export const WRITABLE_REPLIES: StubReplies = {
  'GET /api/auth/me': {
    status: 200,
    body: { user: { id: 'u1', username: 'sam', scopes: ['read', 'write'] } },
  },
  'GET /api/onboarding': { status: 403, body: { error: 'onboarding_inactive' } },
  'GET /api/spaces': {
    status: 200,
    body: {
      spaces: [space('s', 'Launch', 4), space('s2', LONG_NAME, 1), space('s3', 'Q3', 0)],
      writable: true,
    },
  },
  'POST /api/spaces': { status: 201, body: { space: space('s4', 'Q4', 0) } },
  'PATCH /api/spaces/s': { status: 200, body: { space: space('s', 'Launch', 4) } },
  'DELETE /api/spaces/s3': { status: 204 },
  'GET /api/spaces/s': {
    status: 200,
    body: {
      space: space('s', 'Launch', SPACE_WORK_PACKAGES.length),
      writable: true,
      rows: SPACE_WORK_PACKAGES.map((entry, index) => ({
        workPackage: entry,
        position: (index + 1) * 10,
      })),
    },
  },
  'GET /api/spaces/s/roll-ups': {
    status: 200,
    body: {
      rollUps: {
        p1: rolledUp('2026-10-01', '2026-11-20', 34, 5, 12),
        p2: rolledUp('2026-10-15', '2027-01-30', 120, 2, 40),
        p3: { kind: 'unavailable' },
        p4: rolledUp('2026-09-01', '2026-10-10', 18, 9, 9),
      },
    },
  },
  'GET /api/spaces/s/in-progress': {
    status: 200,
    body: {
      items: [
        leaf('p1', 'Website relaunch', 'w1', '1.2', 'Wire the pricing page', null),
        leaf('p2', LONG_NAME, 'w2', '3.4.1', 'Drain the old cluster', 3),
        leaf('p1', 'Website relaunch', 'w3', '2', 'Copy review', 1),
      ],
      truncated: true,
      unavailable: ['p3'],
    },
  },
  'GET /api/work-packages': {
    status: 200,
    body: {
      workPackages: [
        ...SPACE_WORK_PACKAGES,
        workPackage('p5', 'Hiring plan'),
        workPackage('p6', 'Office move'),
      ],
    },
  },
  'POST /api/spaces/s/work-packages': { status: 201, body: { position: 50 } },
  'POST /api/spaces/s/work-packages/p2/move': { status: 200, body: { position: 15 } },
  'DELETE /api/spaces/s/work-packages/p4': { status: 204 },
};

/**
 * Answers every `/api/**` request from {@link WRITABLE_REPLIES} with
 * `overrides` laid over it; anything unlisted is a 404 `not_found`.
 */
export async function stubSpacesApi(page: Page, overrides: StubReplies = {}): Promise<void> {
  const replies = new Map(Object.entries({ ...WRITABLE_REPLIES, ...overrides }));
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const reply = replies.get(`${route.request().method()} ${url.pathname}`);
    if (reply === undefined) {
      await route.fulfill({ status: 404, json: { error: 'not_found' } });
      return;
    }
    await (reply.body === undefined
      ? route.fulfill({ status: reply.status })
      : route.fulfill({ status: reply.status, json: reply.body }));
  });
}
