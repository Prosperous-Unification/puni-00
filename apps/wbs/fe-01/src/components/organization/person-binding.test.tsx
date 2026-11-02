import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ResourceScope } from '@/lib/organization-context';
import type { PersonView } from '@/lib/wbs-api';
import { OrganizationResourcesProvider } from '@/runtime/organization-resources';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@/testing/organization-render';
import { answerJson as answer, stubServer } from '@/testing/stub-server';

import { usePersonBindings } from './person-binding';

const active: ResourceScope = {
  organization: { kind: 'active', organizationId: 'org-a' },
  isCurrent: () => true,
  refuse: () => undefined,
};
const person = (id: string, accountId: string | null | undefined): PersonView => ({
  id,
  name: id,
  kind: 'person',
  teamIds: [],
  ...(accountId === undefined ? {} : { accountId }),
});
const dany = person('dany', 'u1');
const eve = person('eve', 'u2');
const finn = person('finn', null);
const MEMBERS = [
  { userId: 'u1', username: 'dany-account', email: null, role: 'admin', createdAt: 1 },
  { userId: 'u2', username: 'eve-account', email: null, role: 'member', createdAt: 2 },
];

/** The Directory's person rows as the route draws them: one binding slot under each. */
function Rows({
  people,
  bind,
  busy = false,
}: {
  people: readonly PersonView[];
  bind: (personId: string, accountId: string | null) => void;
  busy?: boolean;
}) {
  const bindingOf = usePersonBindings('u1');
  if (bindingOf === null) return <p>No organization</p>;
  return (
    <ul>
      {people.map((each) => (
        <li key={each.id} aria-label={each.name}>
          {bindingOf(
            each,
            (accountId) => {
              bind(each.id, accountId);
            },
            busy,
          )}
        </li>
      ))}
    </ul>
  );
}

function mount(
  people: readonly PersonView[],
  scope: ResourceScope | null = active,
  bind: (personId: string, accountId: string | null) => void = vi.fn(),
) {
  const rows = <Rows people={people} bind={bind} />;
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

const membersRoute = {
  'GET /api/organization/members': [() => answer(200, { members: MEMBERS })],
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('binding a person to an account (wbs-claim-display 11.5)', () => {
  it('names the bound member for an admin, and offers the members', async () => {
    stubRole('admin', membersRoute);
    mount([dany, eve, finn]);

    const row = within(await screen.findByRole('listitem', { name: 'eve' }));
    expect(await row.findByText('Bound to eve-account')).toBeDefined();
    expect(
      within(screen.getByRole('listitem', { name: 'dany' })).getByText(
        'Bound to dany-account (you)',
      ),
    ).toBeDefined();
    expect(
      within(screen.getByRole('listitem', { name: 'finn' })).getByText('Not bound to an account'),
    ).toBeDefined();
    const picker = row.getByLabelText<HTMLSelectElement>('Account for eve');
    expect([...picker.options].map((option) => option.textContent)).toEqual([
      'Not bound',
      'dany-account (you)',
      'eve-account',
    ]);
  });

  it('offers Bind only once another account is chosen, and binds it', async () => {
    const bind = vi.fn();
    stubRole('admin', membersRoute);
    mount([finn], active, bind);

    const button = await screen.findByRole('button', { name: 'Bind finn' });
    expect(button).toHaveProperty('disabled', true);
    fireEvent.change(screen.getByLabelText('Account for finn'), { target: { value: 'u2' } });
    expect(button).toHaveProperty('disabled', false);
    fireEvent.click(button);

    expect(bind).toHaveBeenCalledWith('finn', 'u2');
  });

  it('unbinds with null', async () => {
    const bind = vi.fn();
    stubRole('admin', membersRoute);
    mount([eve], active, bind);

    await screen.findByText('Bound to eve-account');
    fireEvent.change(screen.getByLabelText('Account for eve'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Unbind eve' }));

    expect(bind).toHaveBeenCalledWith('eve', null);
  });

  it('says when the bound account is no longer a member', async () => {
    stubRole('admin', membersRoute);
    mount([person('gil', 'u-gone')]);
    expect(await screen.findByText('Bound to an account that is no longer a member')).toBeDefined();
  });

  it('shows a member the binding read-only', async () => {
    // Proof: drawing the control for every role failed on `Unable to find an
    // element with the text: Bound to your account`; watched 2026-10-27.
    const sent = stubRole('member');
    mount([dany, eve, finn]);

    expect(await screen.findByText('Bound to your account')).toBeDefined();
    expect(screen.getByText('Bound to another account')).toBeDefined();
    expect(screen.getByText('Not bound to an account')).toBeDefined();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    // Only an admin may read the members, so a member's page never asks.
    expect(sent.map((request) => request.route)).toEqual(['GET /api/organization/active']);
  });

  it('renders a refused members read with a retry', async () => {
    stubRole('admin', {
      'GET /api/organization/members': [
        () => answer(403, { error: 'forbidden' }),
        () => answer(200, { members: MEMBERS }),
      ],
    });
    mount([eve]);

    expect(
      await screen.findByText(
        'Account binding: Your role cannot read the members, so no account can be chosen.',
      ),
    ).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Retry members' }));
    expect(await screen.findByText('Bound to eve-account')).toBeDefined();
  });

  it('says so when the people read does not carry the binding', async () => {
    stubRole('admin', membersRoute);
    mount([person('old', undefined)]);
    expect(
      await screen.findByText('This server does not say which account old is bound to.'),
    ).toBeDefined();
  });

  it('draws nothing and reads nothing without an organization', () => {
    const sent = stubServer({});
    mount([dany], null);
    expect(screen.getByText('No organization')).toBeDefined();
    expect(sent).toEqual([]);
  });

  it('keeps the control still while a directory write is out', async () => {
    stubRole('admin', membersRoute);
    render(
      <OrganizationResourcesProvider scope={active}>
        <Rows people={[finn]} bind={vi.fn()} busy />
      </OrganizationResourcesProvider>,
    );
    await waitFor(() => {
      expect(screen.getByLabelText('Account for finn')).toHaveProperty('disabled', true);
    });
  });
});
