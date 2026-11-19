import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { httpWorkPackageApi } from './wbs-api';

beforeEach(() => { vi.stubGlobal('location', { origin: 'http://wbs.test' }); });

afterEach(() => { vi.unstubAllGlobals(); });

function stepReply(estimateUnit: 'workdays' | 'minutes'): Response {
  return Response.json({ step: {
    id: 'shared-step', workPackageId: 'package-a', code: 'review', name: 'Review',
    position: 10, estimateUnit, allowancePercent: 12.34,
  } });
}

it('package step values sends exact integer basis points through the real typed client', async () => {
  const fetched = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
    () => Promise.resolve(stepReply('workdays')),
  );
  vi.stubGlobal('fetch', fetched);
  expect(await httpWorkPackageApi('selected-token').setStepAllowance('package-a', 'shared-step', 12.34))
    .toMatchObject({ id: 'shared-step', allowancePercent: 12.34 });
  expect(fetched).toHaveBeenCalledTimes(1);
  expect(fetched.mock.calls[0]?.[0]).toContain('/api/work-packages/package-a/steps/shared-step');
  expect(fetched.mock.calls[0]?.[1]?.method).toBe('PATCH');
  expect(fetched.mock.calls[0]?.[1]?.body).toBe(JSON.stringify({ allowanceBps: 1234 }));
});

it('package step values keeps the unit request closed to its addressed value', async () => {
  const fetched = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
    () => Promise.resolve(stepReply('minutes')),
  );
  vi.stubGlobal('fetch', fetched);
  expect(await httpWorkPackageApi('selected-token').setStepUnit('package-a', 'shared-step', 'minutes'))
    .toMatchObject({ id: 'shared-step', estimateUnit: 'minutes' });
  expect(fetched).toHaveBeenCalledTimes(1);
  expect(fetched.mock.calls[0]?.[0]).toContain('/api/work-packages/package-a/steps/shared-step');
  expect(fetched.mock.calls[0]?.[1]?.body).toBe(JSON.stringify({ estimateUnit: 'minutes' }));
});

for (const purpose of ['allowance', 'unit'] as const) {
  it('package step values preserves named settings refusal under the current operation: ' + purpose, async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(Response.json(
      { error: 'forbidden', permission: 'package.manage_settings' }, { status: 403 },
    ))));
    const api = httpWorkPackageApi('selected-token');
    const pending = purpose === 'allowance'
      ? api.setStepAllowance('package-a', 'shared-step', 12.34)
      : api.setStepUnit('package-a', 'shared-step', 'minutes');
    await expect(pending).rejects.toMatchObject({
      message: 'forbidden',
      problem: {
        kind: 'refusal', operation: 'patchWorkPackageStepValues',
        refusal: { error: 'forbidden', permission: 'package.manage_settings' },
      },
    });
  });
}

it('package step values preserves a valid hundredth that has an inexact binary product', async () => {
  const fetched = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
    () => Promise.resolve(stepReply('workdays')),
  );
  vi.stubGlobal('fetch', fetched);
  await httpWorkPackageApi('selected-token').setStepAllowance('package-a', 'shared-step', 0.29);
  expect(fetched).toHaveBeenCalledTimes(1);
  expect(fetched.mock.calls[0]?.[1]?.body).toBe(JSON.stringify({ allowanceBps: 29 }));
});

it('package step values refuses invalid percentages before transmitting a rounded allowance', async () => {
  const fetched = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
    () => Promise.resolve(stepReply('workdays')),
  );
  vi.stubGlobal('fetch', fetched);
  const api = httpWorkPackageApi('selected-token');
  expect(await api.setStepAllowance('package-a', 'shared-step', 12.34))
    .toMatchObject({ id: 'shared-step' });
  expect(fetched).toHaveBeenCalledTimes(1);
  fetched.mockClear();
  for (const percent of [12.345, Number.NaN, Number.POSITIVE_INFINITY, -1, 1000.01]) {
    await expect(api.setStepAllowance('package-a', 'shared-step', percent))
      .rejects.toThrow('invalid_allowance');
    expect(fetched).not.toHaveBeenCalled();
  }
});
