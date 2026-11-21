import { afterEach, expect, it, vi } from 'vitest';

import { cleanup, fireEvent, render, screen } from '@/testing/organization-render';
import { answerJson as answer, stubServer } from '@/testing/stub-server';

import { InvitationsPanel } from './invitations-panel';
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it.each([null, 'org-admin', 'org-viewer', 'project-contributor', 'project-viewer'] as const)(
  'sends the selected initial access %s and renders its offer',
  async (initialRoleId) => {
    const invitation = {
      id: 'i',
      email: 'ada@acme.test',
      initialRoleId,
      expiresAt: Date.now() + 10000,
      revokedAt: null,
      consumedAt: null,
    };
    const sent = stubServer({
      'GET /api/organization/invitations': [
        () => answer(200, { invitations: [] }),
        () => answer(200, { invitations: [invitation] }),
      ],
      'POST /api/organization/invitations': [() => answer(201, { invitation })],
    });
    render(<InvitationsPanel onAccessLost={() => undefined} />);
    fireEvent.change(await screen.findByLabelText('Email address'), {
      target: { value: 'ada@acme.test' },
    });
    fireEvent.change(screen.getByLabelText('Initial access'), {
      target: { value: initialRoleId ?? '' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send invitation' }));
    await screen.findByText('Invitation sent to ada@acme.test.');
    expect(sent.find((call) => call.route.startsWith('POST'))?.body).toEqual({
      email: 'ada@acme.test',
      initialRoleId,
    });
    expect(
      await screen.findByText(
        initialRoleId === null
          ? 'No initial access'
          : initialRoleId === 'org-admin'
            ? 'Organization admin'
            : initialRoleId === 'org-viewer'
              ? 'Organization viewer'
              : initialRoleId === 'project-contributor'
                ? 'Project contributor'
                : 'Project viewer',
        { selector: 'span' },
      ),
    ).toBeDefined();
  },
);
it('renders the named missing invitation permission', async () => {
  stubServer({
    'GET /api/organization/invitations': [
      () => answer(403, { error: 'forbidden', permission: 'organization.manage_members' }),
    ],
  });
  render(<InvitationsPanel onAccessLost={() => undefined} />);
  expect(await screen.findByRole('alert')).toHaveProperty(
    'textContent',
    'Missing permission: organization.manage_members.',
  );
});
