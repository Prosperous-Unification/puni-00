import { expect, test } from '@playwright/test';

import { createProject } from './create-project';

const NOW = Date.UTC(2026, 9, 25, 10);

/** The browser keeps real auth, project creation, and settings; only these resource-use reads are mocked. */
test('Resources distinguishes reports, queued cleanup, and verified Dash release', async ({
  page,
}, testInfo) => {
  const reads: string[] = [];
  await page.route('**/api/projects/*/resource-uses', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    const path = new URL(route.request().url()).pathname;
    const match = /^\/api\/projects\/([^/]+)\/resource-uses$/.exec(path);
    if (match === null) throw new Error(`unexpected use list ${path}`);
    const projectId = match[1];
    const use = (id: string, resourceName: string, source: 'reported' | 'runtime') => ({
      id,
      source,
      organizationId: null,
      projectId,
      projectName: 'New project',
      resourceId: `resource-${id}`,
      resourceName,
      unitLabel: 'GB',
      providerId: null,
      providerName: null,
      workItemId: `work-${id}`,
      workItemName: 'Compile',
      stepId: null,
      attemptNumber: null,
      agentRun: 'run-7',
      responsiblePersonId: 'agent-1',
      responsiblePersonName: 'Build agent',
      locator: `/work/${id}`,
      units: 12,
      state: 'active',
      revision: 1,
      createdAt: NOW - 60_000,
      updatedAt: NOW,
      createdBy: 'u1',
      updatedBy: 'u1',
      retention: null,
    });
    reads.push(path);
    await route.fulfill({
      json: {
        uses: [
          { ...use('reported-pending', 'Reported scratch', 'reported'), state: 'cleanup_pending' },
          {
            ...use('reported-released', 'Reported archive', 'reported'),
            state: 'release_reported',
          },
          {
            ...use('dash-queued', 'Dash queued volume', 'runtime'),
            runtimeId: 'dash-host-a',
            runtimeRevision: 3,
            incarnation: 'inc-7',
            // Proof: answering false here made the real browser fail on the missing
            // "Cleanup request queued for Dash" label (watched 2026-10-25).
            pendingCleanupRequest: true,
            reclaimedBytes: null,
          },
          {
            ...use('dash-verified', 'Dash verified volume', 'runtime'),
            state: 'release_verified',
            runtimeId: 'dash-host-a',
            runtimeRevision: 4,
            incarnation: 'inc-8',
            pendingCleanupRequest: false,
            reclaimedBytes: null,
          },
        ],
        nextCursor: null,
      },
    });
  });
  await page.route('**/api/projects/*/resource-uses/*/history', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    const path = new URL(route.request().url()).pathname;
    if (!path.endsWith('/dash-verified/history')) throw new Error(`unexpected history ${path}`);
    reads.push(path);
    await route.fulfill({
      json: {
        events: [
          {
            id: 'event-verified',
            useId: 'dash-verified',
            revision: 2,
            kind: 'release_verified',
            source: 'runtime',
            actorId: 'dash-authority',
            actorPersonId: null,
            actorName: 'Dash authority',
            at: NOW,
            reason: 'Host path absent after cleanup',
            evidence: 'cleanup-ack-7',
            ownerPersonId: null,
            reviewAt: null,
          },
        ],
        nextCursor: null,
      },
    });
  });

  await page.goto('/');
  await expect(page.getByRole('button', { name: 'local-dev' })).toBeVisible();
  await createProject(page);
  await page.getByRole('button', { name: 'Project settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Project settings' });
  await dialog.getByRole('tab', { name: 'Resources' }).click();
  const panel = dialog.getByRole('region', { name: 'Resource uses' });
  const reportedPending = panel.getByRole('listitem', { name: 'Reported scratch for Compile' });
  await expect(reportedPending.getByText('Cleanup pending')).toBeVisible();
  await expect(reportedPending.getByText('Reported use')).toBeVisible();
  await reportedPending.getByRole('button', { name: 'Report release' }).click();
  await expect(reportedPending.getByLabel('Evidence')).toBeVisible();
  await reportedPending.getByRole('button', { name: 'Cancel' }).click();

  const reportedReleased = panel.getByRole('listitem', { name: 'Reported archive for Compile' });
  await expect(reportedReleased.getByText('Release reported')).toBeVisible();
  const queued = panel.getByRole('listitem', { name: 'Dash queued volume for Compile' });
  await expect(queued.getByText('Managed by Dash')).toBeVisible();
  await expect(queued.getByText('Active')).toBeVisible();
  await expect(queued.getByText('Cleanup request queued for Dash')).toBeVisible();
  await expect(queued.getByRole('button', { name: 'Retry cleanup' })).toHaveCount(0);
  await expect(queued.getByRole('button', { name: 'Report release' })).toHaveCount(0);
  await expect(queued.getByRole('button', { name: 'Retain' })).toHaveCount(0);
  await expect(queued.getByText('Release verified')).toHaveCount(0);

  const verified = panel.getByRole('listitem', { name: 'Dash verified volume for Compile' });
  await expect(verified.getByText('Release verified')).toBeVisible();
  await expect(verified.getByRole('button', { name: 'Report release' })).toHaveCount(0);
  await expect(verified.getByRole('button', { name: 'Request cleanup' })).toHaveCount(0);
  await verified.getByRole('button', { name: 'Show history' }).click();
  await expect(verified.getByText('Dash authority')).toBeVisible();
  await expect(verified.getByText('Host path absent after cleanup')).toBeVisible();
  await expect(verified.getByText('cleanup-ack-7')).toBeVisible();
  expect(reads).toHaveLength(2);
  await panel.screenshot({
    path: testInfo.outputPath('resource-uses-reported-queued-verified.png'),
  });
  await queued.screenshot({ path: testInfo.outputPath('resource-use-queued.png') });
  await verified.screenshot({ path: testInfo.outputPath('resource-use-verified-history.png') });
});
