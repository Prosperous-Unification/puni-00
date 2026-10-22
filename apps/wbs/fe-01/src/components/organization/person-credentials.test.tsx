import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ResourceScope } from '@/lib/organization-context';
import { OrganizationResourcesProvider } from '@/runtime/organization-resources';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@/testing/organization-render';
import { answerEmpty, answerJson as answer, stubServer } from '@/testing/stub-server';

import { type CredentialPerson, usePeopleCredentials } from './person-credentials';

const active: ResourceScope = {
  organization: { kind: 'active', organizationId: 'org-a' },
  isCurrent: () => true,
  refuse: () => undefined,
};
const claire: CredentialPerson = { id: 'p-claire', name: 'claire', kind: 'agent', accountId: 'u1' };
const rex: CredentialPerson = { id: 'p-rex', name: 'rex', kind: 'agent', accountId: 'u2' };
const dany: CredentialPerson = { id: 'p-dany', name: 'Dany', kind: 'person', accountId: 'u1' };
const consent = {
  id: 'cred-c',
  source: 'mcp_consent',
  name: 'Claude Code',
  personId: 'p-claire',
  issuedBy: 'u1',
  issuer: null,
  subject: null,
  createdAt: 1,
  lastUsedAt: null,
  revokedAt: null,
  rotationEndsAt: null,
  secrets: [],
};

/** The people page's rows as the route draws them: one credentials slot under each person. */
function Rows({ people }: { people: readonly CredentialPerson[] }) {
  const credentialsOf = usePeopleCredentials('u1');
  if (credentialsOf === null) return <p>No organization</p>;
  return (
    <ul>
      {people.map((person) => (
        <li key={person.id} aria-label={person.name}>
          {credentialsOf(person)}
        </li>
      ))}
    </ul>
  );
}

function mount(people: readonly CredentialPerson[], scope: ResourceScope | null = active) {
  const rows = <Rows people={people} />;
  return render(
    scope === null ? (
      rows
    ) : (
      <OrganizationResourcesProvider scope={scope}>{rows}</OrganizationResourcesProvider>
    ),
  );
}

function stubRole(role: string, routes: Parameters<typeof stubServer>[0] = {}) {
  return stubServer({
    'GET /api/organization/active': [
      () => answer(200, { organizationId: 'org-a', name: 'Acme', role }),
    ],
    ...routes,
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('credentials on the people page', () => {
  it('offers a member only their own agent', async () => {
    const sent = stubRole('member', {
      'GET /api/organization/machine-credentials': [() => answer(200, { credentials: [] })],
    });
    mount([claire, rex, dany]);
    expect(await screen.findByRole('button', { name: 'Show credentials of claire' })).toBeDefined();
    expect(within(screen.getByRole('listitem', { name: 'rex' })).queryByRole('button')).toBeNull();
    expect(within(screen.getByRole('listitem', { name: 'Dany' })).queryByRole('button')).toBeNull();
    expect(sent.map((request) => request.route)).toEqual(['GET /api/organization/active']);
  });

  it('offers a member no list for another account’s agent', async () => {
    const sent = stubRole('member');
    mount([rex]);
    await waitFor(() => {
      expect(sent).toHaveLength(1);
    });
    expect(screen.queryByRole('button')).toBeNull();
    expect(sent.some((request) => request.route.includes('machine-credentials'))).toBe(false);
  });

  it('offers an admin every agent and no human person', async () => {
    stubRole('admin');
    mount([claire, rex, dany]);
    await screen.findByRole('button', { name: 'Show credentials of rex' });
    expect(screen.getByRole('button', { name: 'Show credentials of claire' })).toBeDefined();
    expect(within(screen.getByRole('listitem', { name: 'Dany' })).queryByRole('button')).toBeNull();
  });

  it('offers a viewer nothing', async () => {
    const sent = stubRole('viewer');
    mount([claire]);
    await waitFor(() => {
      expect(sent).toHaveLength(1);
    });
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('draws nothing and reads nothing without an organization', () => {
    const sent = stubServer({});
    mount([claire], null);
    expect(screen.getByText('No organization')).toBeDefined();
    expect(sent).toEqual([]);
  });

  it('renders a role read failure on agent rows with retry', async () => {
    stubServer({
      'GET /api/organization/active': [
        () => answer(503, {}),
        () => answer(200, { organizationId: 'org-a', name: 'Acme', role: 'member' }),
      ],
    });
    mount([claire, dany]);
    const row = screen.getByRole('listitem', { name: 'claire' });
    fireEvent.click(await within(row).findByRole('button', { name: 'Retry credentials' }));
    expect(
      await within(row).findByRole('button', { name: 'Show credentials of claire' }),
    ).toBeDefined();
    expect(within(screen.getByRole('listitem', { name: 'Dany' })).queryByRole('alert')).toBeNull();
  });

  it('opens an agent’s list, revokes under the exact id and never shows a secret', async () => {
    const sent = stubRole('member', {
      'GET /api/organization/machine-credentials': [
        () => answer(200, { credentials: [consent] }),
        () => answer(200, { credentials: [] }),
      ],
      'DELETE /api/organization/machine-credentials/cred-c': [() => answerEmpty(204)],
    });
    mount([claire]);
    fireEvent.click(await screen.findByRole('button', { name: 'Show credentials of claire' }));
    const region = await screen.findByRole('region', { name: 'Credentials of claire' });
    await within(region).findByText('Claude Code');
    expect(within(region).getByText('MCP consent')).toBeDefined();
    fireEvent.click(within(region).getByRole('button', { name: 'Revoke Claude Code' }));
    fireEvent.change(within(region).getByLabelText('Type cred-c to revoke Claude Code'), {
      target: { value: 'cred-c' },
    });
    fireEvent.click(within(region).getByRole('button', { name: 'Confirm revoking Claude Code' }));
    await within(region).findByText('claire holds no live credentials.');
    expect(sent.filter((request) => request.route.startsWith('DELETE'))).toHaveLength(1);
    expect(
      sent
        .filter((request) => request.route === 'GET /api/organization/machine-credentials')
        .map((request) => request.search),
    ).toEqual(['?personId=p-claire', '?personId=p-claire']);
    expect(within(region).queryByLabelText('Machine credential key')).toBeNull();
  });
});
