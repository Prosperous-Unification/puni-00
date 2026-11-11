import { afterEach, describe, expect, it, vi } from 'vitest';

import { cleanup, fireEvent, render, screen, waitFor } from '@/testing/organization-render';
import { answerEmpty, answerJson as answer, stubServer } from '@/testing/stub-server';

import { MembersPanel } from './members-panel';
import { type AccessLoss } from './organization-access';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const member = (userId: string, username: string, role: string, email: string | null = null) => ({
  userId,
  username,
  email,
  effectiveRole:
    role === 'none'
      ? null
      : {
          permissions: ['organization.read'],
          via: [
            {
              scopeKind: 'organization',
              scopeId: 'org',
              subjectKind: 'user',
              subjectId: userId,
              roleId: role === 'super_admin' ? 'org-super-admin' : 'org-viewer',
            },
          ],
        },
  grantCount: role === 'none' ? 0 : 2,
  createdAt: 1,
});

function renderPanel(onAccessLost: (loss: AccessLoss) => void = () => undefined) {
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

  it('shows effective organization access and grant counts without a membership role editor', async () => {
    stubServer({
      'GET /api/organization/members': [
        () =>
          answer(200, {
            members: [member('u1', 'sam', 'super_admin'), member('u2', 'vic', 'none')],
          }),
      ],
    });
    renderPanel();
    expect(await screen.findByText('org-super-admin')).toBeDefined();
    expect(screen.getByText('2 access grants')).toBeDefined();
    expect(screen.getByText('No organization role')).toBeDefined();
    expect(screen.getByText('0 access grants')).toBeDefined();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByRole('button', { name: /Change.*role/ })).toBeNull();
  });

  it('renders a named missing member permission', async () => {
    stubServer({
      'GET /api/organization/members': [
        () => answer(403, { error: 'forbidden', permission: 'organization.read' }),
      ],
    });
    renderPanel();
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Missing permission: organization.read.',
    );
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
      'DELETE /api/organization/members/u1': [() => answer(status, { error })],
    });
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Remove sam' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm removing sam' }));
    expect(await screen.findByRole('status')).toHaveProperty('textContent', copy);
  });

  it('hands a lost membership to the page', async () => {
    const losses: AccessLoss[] = [];
    stubServer({ 'GET /api/organization/members': [() => answer(403, { error: 'not_a_member' })] });
    renderPanel((loss) => losses.push(loss));
    await waitFor(() => {
      expect(losses).toEqual(['removed']);
    });
  });
});
