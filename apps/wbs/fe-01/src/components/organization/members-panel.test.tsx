import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { answerEmpty, answerJson as answer, stubServer } from '@/testing/stub-server';

import { MembersPanel } from './members-panel';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const member = (userId: string, username: string, role: string, email: string | null = null) => ({
  userId,
  username,
  email,
  role,
  createdAt: 1,
});

function renderPanel(onAccessLost: (loss: string) => void = () => undefined) {
  render(<MembersPanel onAccessLost={onAccessLost} />);
}

describe('members', () => {
  it('renders loading, then each member with or without an address', async () => {
    stubServer({
      'GET /api/organization/members': [
        () =>
          answer(200, {
            members: [
              member('u1', 'sam', 'super_admin', 'sam@acme.test'),
              member('u2', 'vic', 'viewer'),
            ],
          }),
      ],
    });
    renderPanel();
    expect(screen.getByText('Loading members…')).toBeDefined();
    const rows = await screen.findAllByRole('listitem');
    expect(rows[0]?.textContent).toMatch(/^samsam@acme.test/);
    expect(rows[1]?.textContent).toMatch(/^vicNo email address/);
  });

  it('renders an empty list', async () => {
    stubServer({ 'GET /api/organization/members': [() => answer(200, { members: [] })] });
    renderPanel();
    expect(await screen.findByText('No members.')).toBeDefined();
  });

  it('renders a forbidden list in place, not as a crash', async () => {
    stubServer({ 'GET /api/organization/members': [() => answer(403, { error: 'forbidden' })] });
    renderPanel();
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Your role cannot view members.',
    );
  });

  it('changes a role to the chosen one and re-reads the list', async () => {
    const sent = stubServer({
      'GET /api/organization/members': [
        () => answer(200, { members: [member('u2', 'vic', 'viewer')] }),
        () => answer(200, { members: [member('u2', 'vic', 'member')] }),
      ],
      'PATCH /api/organization/members/u2': [
        () => answer(200, { membership: { userId: 'u2', role: 'member' } }),
      ],
    });
    renderPanel();
    const change = await screen.findByRole('button', { name: 'Change the role of vic' });
    expect(change).toHaveProperty('disabled', true);
    fireEvent.change(screen.getByLabelText('Role for vic'), { target: { value: 'member' } });
    fireEvent.click(change);
    expect(await screen.findByText('vic is now Member.')).toBeDefined();
    expect(sent.find((call) => call.route.startsWith('PATCH'))?.body).toEqual({ role: 'member' });
  });

  it('removes only after confirmation', async () => {
    const sent = stubServer({
      'GET /api/organization/members': [
        () => answer(200, { members: [member('u2', 'vic', 'viewer')] }),
        () => answer(200, { members: [] }),
      ],
      'DELETE /api/organization/members/u2': [() => answerEmpty(204)],
    });
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Remove vic' }));
    expect(sent.some((call) => call.route.startsWith('DELETE'))).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm removing vic' }));
    expect(await screen.findByText('vic was removed.')).toBeDefined();
    expect(await screen.findByText('No members.')).toBeDefined();
  });

  it.each([
    ['last_super_admin', 409, 'The organization needs at least one super-admin.'],
    ['forbidden', 403, 'Your role cannot make this change.'],
    ['not_found', 404, 'That person is no longer a member.'],
  ])('renders the %s change refusal', async (error, status, copy) => {
    stubServer({
      'GET /api/organization/members': [
        () => answer(200, { members: [member('u1', 'sam', 'super_admin')] }),
      ],
      'PATCH /api/organization/members/u1': [() => answer(status, { error })],
    });
    renderPanel();
    fireEvent.change(await screen.findByLabelText('Role for sam'), { target: { value: 'admin' } });
    fireEvent.click(screen.getByRole('button', { name: 'Change the role of sam' }));
    expect(await screen.findByRole('status')).toHaveProperty('textContent', copy);
  });

  it('hands a lost membership to the page', async () => {
    const losses: string[] = [];
    stubServer({ 'GET /api/organization/members': [() => answer(403, { error: 'not_a_member' })] });
    renderPanel((loss) => losses.push(loss));
    await waitFor(() => {
      expect(losses).toEqual(['removed']);
    });
  });
});
