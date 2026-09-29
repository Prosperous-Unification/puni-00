import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { answerEmpty, answerJson as answer, stubServer } from '@/testing/stub-server';

import { JoinRequestsPanel } from './join-requests-panel';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const request = (id: string, email: string, status = 'pending') => ({
  id,
  email,
  status,
  createdAt: 1,
});

function renderPanel(onAccessLost: (loss: string) => void = () => undefined) {
  render(<JoinRequestsPanel onAccessLost={onAccessLost} />);
}

describe('join requests', () => {
  it('renders loading, then the empty state', async () => {
    stubServer({ 'GET /api/organization/join-requests': [() => answer(200, { requests: [] })] });
    renderPanel();
    expect(screen.getByText('Loading join requests…')).toBeDefined();
    expect(await screen.findByText('No pending join requests.')).toBeDefined();
  });

  it('approves at the chosen role, then re-reads the list', async () => {
    const sent = stubServer({
      'GET /api/organization/join-requests': [
        () => answer(200, { requests: [request('r', 'ada@acme.test')] }),
        () => answer(200, { requests: [request('r', 'ada@acme.test', 'approved')] }),
      ],
      'POST /api/organization/join-requests/r/approve': [() => answer(200, { invitationId: 'i' })],
    });
    renderPanel();
    fireEvent.change(await screen.findByLabelText('Role for ada@acme.test'), {
      target: { value: 'viewer' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Approve ada@acme.test' }));
    expect(await screen.findByText('Invitation sent to ada@acme.test.')).toBeDefined();
    const resolved = await screen.findByRole('list', { name: 'Resolved join requests' });
    expect(resolved.textContent).toBe('ada@acme.test Approved');
    expect(sent.find((call) => call.route.endsWith('/approve'))?.body).toEqual({ role: 'viewer' });
  });

  it('denies a request', async () => {
    stubServer({
      'GET /api/organization/join-requests': [
        () => answer(200, { requests: [request('r', 'ada@acme.test')] }),
        () => answer(200, { requests: [request('r', 'ada@acme.test', 'denied')] }),
      ],
      'POST /api/organization/join-requests/r/deny': [() => answerEmpty(204)],
    });
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Deny ada@acme.test' }));
    expect(await screen.findByText('Request from ada@acme.test denied.')).toBeDefined();
    await waitFor(() => {
      expect(screen.queryByRole('list', { name: 'Pending join requests' })).toBeNull();
    });
  });

  it.each([
    ['request_resolved', 409, 'That request was already approved or denied.'],
    [
      'domain_changed',
      409,
      "The requester's email or the organization's verified domain changed, so the request can no longer be approved.",
    ],
    [
      'delivery_failed',
      503,
      'The invitation email could not be sent, so the request stays pending.',
    ],
    ['forbidden', 403, 'Your role cannot decide join requests.'],
    ['not_found', 404, 'That request no longer exists.'],
  ])('renders the %s approval refusal', async (error, status, copy) => {
    stubServer({
      'GET /api/organization/join-requests': [
        () => answer(200, { requests: [request('r', 'ada@acme.test')] }),
      ],
      'POST /api/organization/join-requests/r/approve': [() => answer(status, { error })],
    });
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Approve ada@acme.test' }));
    expect(await screen.findByRole('status')).toHaveProperty('textContent', copy);
  });

  it('renders a forbidden list and a query failure in place', async () => {
    stubServer({
      'GET /api/organization/join-requests': [() => answer(403, { error: 'forbidden' })],
    });
    renderPanel();
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Your role cannot view join requests.',
    );
    cleanup();
    stubServer({});
    renderPanel();
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Could not reach the server. Try again.',
    );
  });

  it('hands a lost membership to the page', async () => {
    const losses: string[] = [];
    stubServer({
      'GET /api/organization/join-requests': [
        () => answer(200, { requests: [request('r', 'ada@acme.test')] }),
      ],
      'POST /api/organization/join-requests/r/deny': [() => answer(403, { error: 'not_a_member' })],
    });
    renderPanel((loss) => losses.push(loss));
    const pending = await screen.findByRole('list', { name: 'Pending join requests' });
    fireEvent.click(within(pending).getByRole('button', { name: 'Deny ada@acme.test' }));
    await waitFor(() => {
      expect(losses).toEqual(['removed']);
    });
  });
});
