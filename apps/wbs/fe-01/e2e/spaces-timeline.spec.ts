import { expect, test } from '@playwright/test';

const names = [
  'A very long project name with enough words to wrap across several lines',
  'W'.repeat(80),
];

/**
 * Exercises the authenticated route with deterministic unavailable schedules in the built app.
 * Proof: absolute label positioning failed at text bottom 711 > lane 378; removing
 * break-words failed at text right 308.72 > track 289; removing min-w-0 failed at
 * track right 1165.22 > viewport 320 (production mutations, 2026-10-10).
 */
test('blank timeline lanes contain wrapped labels at a narrow viewport', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'local-dev' })).toBeVisible();
  await page.route('**/api/spaces/s', (route) =>
    route.fulfill({
      json: {
        space: {
          id: 's',
          name: 'Q3',
          virtual: false,
          projectCount: 2,
          revision: 1,
          createdById: 'u',
          createdAt: 1,
        },
        writable: false,
        rows: names.map((name, index) => ({
          position: index,
          project: {
            id: `p${String(index)}`,
            name,
            ownerId: 'u',
            restricted: false,
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
            ownerName: 'ada',
            lastOpenedAt: null,
          },
        })),
      },
    }),
  );
  await page.route('**/api/spaces/s/roll-ups?*', (route) =>
    route.fulfill({
      json: { rollUps: { p0: { kind: 'unavailable' }, p1: { kind: 'unavailable' } } },
    }),
  );
  await page.route('**/api/spaces/s/in-progress', (route) =>
    route.fulfill({ json: { items: [], truncated: false, unavailable: [] } }),
  );
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto('/spaces/s');
  const timeline = page.getByRole('list', { name: 'Project timeline' });
  await expect(
    timeline.getByText(`${names[1]}: schedule unavailable`, { exact: true }),
  ).toBeVisible();
  const lanes = await timeline.locator('li').evaluateAll((nodes) =>
    nodes.map((node) => {
      const track = node.lastElementChild;
      const label = track?.firstElementChild;
      if (track === null || label === null || label === undefined)
        throw new Error('timeline lane is missing its track or label');
      const laneBox = node.getBoundingClientRect();
      const trackBox = track.getBoundingClientRect();
      const text = document.createRange();
      text.selectNodeContents(label);
      const labelBox = text.getBoundingClientRect();
      return {
        top: laneBox.top,
        bottom: laneBox.bottom,
        right: laneBox.right,
        labelBottom: labelBox.bottom,
        labelRight: labelBox.right,
        trackRight: trackBox.right,
        labelScroll: label.scrollWidth,
        labelWidth: label.clientWidth,
      };
    }),
  );
  expect(lanes).toHaveLength(2);
  for (const lane of lanes) {
    expect(lane.labelBottom).toBeLessThanOrEqual(lane.bottom + 1);
    expect(lane.labelRight).toBeLessThanOrEqual(lane.trackRight + 1);
    expect(lane.labelScroll).toBeLessThanOrEqual(lane.labelWidth + 1);
    expect(lane.right).toBeLessThanOrEqual(320);
    expect(lane.trackRight).toBeLessThanOrEqual(320);
  }
  const first = lanes[0];
  const second = lanes[1];
  expect(first.bottom).toBeLessThanOrEqual(second.top);
});
