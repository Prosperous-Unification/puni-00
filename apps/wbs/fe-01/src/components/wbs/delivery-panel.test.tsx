import type { DeliveryObservation, DeliveryReading } from '@shared/delivery';
import * as delivery from '@shared/delivery';
import { Component, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ResourceScope } from '@/lib/organization-context';
import { OrganizationResourcesProvider } from '@/runtime/organization-resources';
import { act, cleanup, fireEvent, render, screen } from '@/testing/organization-render';
import { answerJson } from '@/testing/stub-server';

import { DeliveryPanel } from './delivery-panel';

const observedAt = '2026-10-23T10:00:00.000Z';
const source = (id: string, url = 'https://forge.example/change/alpha') => ({
  provider: 'forge',
  id,
  url,
  nativeState: 'finished',
  observedAt,
});
function observation(): DeliveryObservation {
  return {
    version: 1,
    observedAt,
    change: {
      source: source('change'),
      title: 'Ship the delivery view',
      revision: 'revision:alpha',
      state: 'merged',
      mergedRevision: 'merged:beta',
    },
    checks: [
      {
        source: source('check'),
        name: 'CI checks',
        revision: 'revision:alpha',
        state: 'passed',
        startedAt: null,
        completedAt: null,
      },
    ],
    runs: [
      {
        source: source('run'),
        name: 'Build',
        revision: 'revision:alpha',
        attemptsComplete: true,
        attempts: [
          {
            source: source('attempt'),
            startedAt: '2026-10-23T09:00:00Z',
            completedAt: '2026-10-23T09:00:20Z',
            executionsComplete: true,
            executions: [
              {
                source: source('execution'),
                executionId: 'execution',
                name: 'Compile',
                kind: 'performed',
                resource: 'pool:one',
                state: 'passed',
                startedAt: '2026-10-23T09:00:02Z',
                completedAt: '2026-10-23T09:00:12Z',
              },
              {
                source: source('execution-two'),
                executionId: 'execution-two',
                name: 'Test',
                kind: 'performed',
                resource: null,
                state: 'failed',
                startedAt: '2026-10-23T09:00:05Z',
                completedAt: '2026-10-23T09:00:20Z',
              },
              {
                source: source('carried'),
                executionId: 'original',
                name: 'Earlier success',
                kind: 'carried',
                resource: null,
                state: 'passed',
                startedAt: '2026-10-23T08:00:00Z',
                completedAt: '2026-10-23T08:30:00Z',
              },
            ],
          },
        ],
      },
    ],
    coverage: {
      checks: 'complete',
      runs: 'complete',
      notes: ['Checks exclude merge policy and legacy commit statuses.'],
    },
  };
}
const reference = { id: 'ref-a', url: 'https://github.com/acme/tool/pull/7' };
const scope = (organizationId = 'org-a'): ResourceScope => ({
  organization: { kind: 'active', organizationId },
  isCurrent: () => true,
  refuse: vi.fn(),
});
function panel(referenceValue = reference, workItemId = 'work-a', organization = scope()) {
  return (
    <OrganizationResourcesProvider scope={organization}>
      <DeliveryPanel projectId="project-a" workItemId={workItemId} reference={referenceValue} />
    </OrganizationResourcesProvider>
  );
}
/** The route's 200 body; `servedAt` is the server clock when it answered. */
const served = (reading: DeliveryReading, servedAt = observedAt) => ({ reading, servedAt });
function respond(reading: DeliveryReading, servedAt = observedAt) {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValue(answerJson(200, served(reading, servedAt)));
  vi.stubGlobal('fetch', fetch);
  return fetch;
}
function pendingResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('delivery observations', () => {
  it('renders the scoped reading, provenance, separate execution sum and span, and first-execution waiting', async () => {
    const fetch = respond({ kind: 'observed', observation: observation() });
    render(panel());
    expect(screen.getByText('Loading delivery…')).toBeInTheDocument();
    expect(await screen.findByText('Ship the delivery view')).toBeInTheDocument();
    expect(screen.getByText('revision:alpha')).toBeInTheDocument();
    expect(screen.getByText('merged:beta')).toBeInTheDocument();
    expect(screen.getAllByText('25 s').length).toBeGreaterThan(0);
    expect(screen.getAllByText('18 s').length).toBeGreaterThan(0);
    expect(screen.getByText('2 s')).toBeInTheDocument();
    expect(screen.getByText('Until first execution (from attempt start)')).toBeInTheDocument();
    expect(screen.getByText('Earlier success')).toBeInTheDocument();
    expect(screen.getByText('carried')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'CI checks' })).toHaveAttribute(
      'href',
      'https://forge.example/change/alpha',
    );
    expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).get('X-WBS-Expected-Organization')).toBe(
      'org-a',
    );
    expect(fetch.mock.calls[0]?.[0]).toBe(
      '/api/projects/project-a/work-items/work-a/refs/ref-a/delivery',
    );
  });
  it('shows empty checks without a success verdict and keeps unsafe source URLs unfollowable', async () => {
    const reading = observation();
    reading.checks = [];
    reading.change.source.url = 'javascript:alert(1)';
    respond({ kind: 'observed', observation: reading });
    render(panel());
    expect(await screen.findByText('No checks were observed.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Ship the delivery view' })).toBeNull();
    expect(
      screen.getByText(
        'This observation does not establish merge eligibility, deployment or acceptance.',
      ),
    ).toBeInTheDocument();
  });
  it.each([
    { kind: 'unsupported', reason: 'This link is not a supported change request.' } as const,
    {
      kind: 'unavailable',
      reason: 'rate-limited',
      message: 'Provider rate limit reached.',
      observedAt,
    } as const,
  ])('renders $kind readings explicitly', async (reading) => {
    respond(reading);
    render(panel());
    expect(
      await screen.findByText(reading.kind === 'unsupported' ? reading.reason : reading.message),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        reading.kind === 'unsupported' ? 'Unsupported link' : 'Delivery unavailable (rate-limited)',
      ),
    ).toBeInTheDocument();
  });
  it('labels partial measurements and unknown waiting with their reasons', async () => {
    const reading = observation();
    reading.coverage.runs = 'partial';
    const attempt = reading.runs[0]?.attempts[0];
    attempt.startedAt = null;
    attempt.executionsComplete = false;
    respond({ kind: 'observed', observation: reading });
    render(panel());
    expect(await screen.findByText('Partial coverage')).toBeInTheDocument();
    expect(screen.getAllByText('25 s (partial)').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Execution inventory is incomplete').length).toBeGreaterThan(0);
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });
  it('ages past five minutes locally without another provider read', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(observedAt));
    const fetch = respond({ kind: 'observed', observation: observation() });
    render(panel());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText('Current observation')).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300_001);
    });
    expect(screen.getByText('Stale observation — more than five minutes old')).toBeInTheDocument();
    expect(screen.queryByText('Current observation')).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('ages on the server clock, not a skewed browser clock', async () => {
    vi.useFakeTimers();
    // The browser runs ten minutes behind; the server served the reading one second after observing it.
    vi.setSystemTime(Date.parse(observedAt) - 600_000);
    respond({ kind: 'observed', observation: observation() }, '2026-10-23T10:00:01.000Z');
    render(panel());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText('Current observation')).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(298_000);
    });
    expect(screen.getByText('Current observation')).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(screen.getByText('Stale observation — more than five minutes old')).toBeInTheDocument();
  });
  it.each([
    {
      status: 429,
      body: { error: 'delivery_rate_limited', retryAfterSeconds: 40 },
      says: 'Your organization has used its delivery reads for now. Try again in 40 s.',
    },
    {
      status: 503,
      body: { error: 'delivery_busy' },
      says: 'Delivery reads are busy right now. Try again in a few seconds.',
    },
  ])('renders the $status delivery refusal as its own state', async ({ status, body, says }) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(answerJson(status, body)));
    render(panel());
    expect(await screen.findByRole('alert')).toHaveTextContent(says);
    expect(screen.getByRole('button', { name: 'Refresh delivery' })).toBeEnabled();
  });
  it('clears old successful checks when refresh fails and offers a retry', async () => {
    const fetch = respond({ kind: 'observed', observation: observation() });
    render(panel());
    await screen.findByText('CI checks');
    fetch.mockResolvedValueOnce(answerJson(503, {}));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh delivery' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Delivery could not be read. Try refreshing.',
    );
    expect(screen.queryByText('CI checks')).toBeNull();
    expect(screen.queryByText('Current observation')).toBeNull();
  });
  it.each(['link', 'url', 'work', 'organization'] as const)(
    'discards late responses after a %s change',
    async (change) => {
      const old = pendingResponse();
      const current = pendingResponse();
      vi.stubGlobal(
        'fetch',
        vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise),
      );
      const organization = scope();
      const view = render(panel(reference, 'work-a', organization));
      view.rerender(
        panel(
          change === 'link'
            ? { ...reference, id: 'ref-b' }
            : change === 'url'
              ? { ...reference, url: 'https://github.com/acme/tool/pull/8' }
              : reference,
          change === 'work' ? 'work-b' : 'work-a',
          change === 'organization' ? scope('org-b') : organization,
        ),
      );
      const newest = observation();
      newest.change.title = 'New context';
      await act(async () => {
        current.resolve(answerJson(200, served({ kind: 'observed', observation: newest })));
        await current.promise;
      });
      expect(await screen.findByText('New context')).toBeInTheDocument();
      await act(async () => {
        old.resolve(answerJson(200, served({ kind: 'observed', observation: observation() })));
        await old.promise;
      });
      expect(screen.getByText('New context')).toBeInTheDocument();
      expect(screen.queryByText('Ship the delivery view')).toBeNull();
    },
  );
});

describe('links editor delivery entry', () => {
  it('reads only after an explicit saved-link action and leaves editing available', async () => {
    const { ExternalRefsModal } = await import('./external-refs-modal');
    const fetch = respond({ kind: 'observed', observation: observation() });
    const onReplace = vi.fn();
    render(
      <ExternalRefsModal
        open
        onOpenChange={vi.fn()}
        number="010"
        projectId="project-a"
        workItemId="work-a"
        refs={[{ ...reference, systemId: 'github', name: 'Change request' }]}
        systems={[{ id: 'github', name: 'github-pr' }]}
        onReplace={onReplace}
      />,
    );
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Delivery for link 1' }));
    expect(await screen.findByText('Ship the delivery view')).toBeInTheDocument();
    const name = screen.getByLabelText('Name of link 1');
    fireEvent.change(name, { target: { value: 'New link name' } });
    fireEvent.blur(name);
    expect(onReplace).toHaveBeenCalledWith([
      { systemId: 'github', name: 'New link name', url: reference.url },
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Close delivery' }));
    expect(screen.queryByRole('region', { name: 'Delivery observation' })).toBeNull();
  });
});

class DeliveryFaultBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  override render() {
    return this.state.error === null ? (
      this.props.children
    ) : (
      <p role="alert">{this.state.error.message}</p>
    );
  }
}

describe('delivery boundary faults', () => {
  it('routes a missing trusted attempt summary to the Error Boundary', async () => {
    const reading = observation();
    const timing = delivery.summarizeDeliveryTiming(reading);
    vi.spyOn(delivery, 'summarizeDeliveryTiming').mockReturnValue({ ...timing, attempts: [] });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    respond({ kind: 'observed', observation: reading });
    render(<DeliveryFaultBoundary>{panel()}</DeliveryFaultBoundary>);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Delivery attempt has no timing summary',
    );
  });
  it.each([
    { status: 404, body: { error: 'not_found' } },
    { status: 200, body: { reading: { kind: 'observed', observation: {} }, servedAt: observedAt } },
    { status: 200, body: { kind: 'unsupported', reason: 'unwrapped reading' } },
  ])('renders a failed read for an HTTP $status boundary refusal', async ({ status, body }) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(answerJson(status, body)));
    render(panel());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Delivery could not be read. Try refreshing.',
    );
  });
});
