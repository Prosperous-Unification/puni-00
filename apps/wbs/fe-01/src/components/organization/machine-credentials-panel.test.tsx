import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppFaultBoundary } from '@/components/chrome/app-fault';
import type { ResourceScope } from '@/lib/organization-context';
import { OrganizationResourcesProvider } from '@/runtime/organization-resources';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@/testing/organization-render';
import { answerEmpty, answerJson as answer, stubServer } from '@/testing/stub-server';

import { credentialRefusal } from './machine-credential-refusal';
import { MachineCredentialsPanel } from './machine-credentials-panel';
import type { CredentialViewer } from './organization-role';

const LIST = 'GET /api/organization/machine-credentials';
const CREATE = 'POST /api/organization/machine-credentials';
const ISSUERS = 'GET /api/organization/trusted-issuers';
const PEOPLE = 'GET /api/people';
const KEY = 'wbs_mk_6f1c2a8e-0000-4000-8000-000000000001.c2VjcmV0LXNob3duLW9uY2U';

const key = {
  id: 'cred-a',
  source: 'api_key',
  name: 'claire laptop',
  personId: 'p-claire',
  issuedBy: 'u1',
  issuer: null,
  subject: null,
  createdAt: Date.UTC(2026, 9, 22, 9, 0),
  lastUsedAt: Date.UTC(2026, 9, 22, 10, 5),
  revokedAt: null,
  rotationEndsAt: null,
  secrets: [{ id: 's1', createdAt: 1, expiresAt: null }],
};
const oidc = {
  ...key,
  id: 'cred-b',
  source: 'oidc',
  name: 'deploy workflow',
  issuer: 'https://token.actions.githubusercontent.com',
  subject: 'repo:puni/wbs:ref:refs/heads/main',
  lastUsedAt: null,
  secrets: [],
};
const consent = { ...key, id: 'cred-c', source: 'mcp_consent', name: 'Claude Code', secrets: [] };
const people = [
  { id: 'p-claire', name: 'claire', kind: 'agent', teamIds: [], accountId: 'u1' },
  { id: 'p-rex', name: 'rex', kind: 'agent', teamIds: [], accountId: 'u2' },
  { id: 'p-loose', name: 'loose', kind: 'agent', teamIds: [], accountId: null },
  { id: 'p-dany', name: 'Dany', kind: 'person', teamIds: [], accountId: 'u1' },
];
const issuer = {
  id: 'ti-1',
  issuer: 'https://token.actions.githubusercontent.com',
  jwksUri: 'https://token.actions.githubusercontent.com/.well-known/jwks',
  audience: 'wbs',
  ssoConnectionId: null,
  createdAt: 1,
  createdBy: 'u1',
  machineCredentials: 1,
};

const admin: CredentialViewer = { userId: 'u1', reach: 'all' };
const member: CredentialViewer = { userId: 'u1', reach: 'own' };

/** Stubs the panel's reads; the trusted issuers section reads its own list and connections. */
function stubPanel(routes: Parameters<typeof stubServer>[0] = {}) {
  return stubServer({
    [LIST]: [() => answer(200, { credentials: [] })],
    [PEOPLE]: [() => answer(200, { people })],
    'GET /api/organization/members': [
      () =>
        answer(200, {
          members: [
            { userId: 'u1', username: 'dany', email: null, role: 'admin', createdAt: 1 },
            { userId: 'u2', username: 'ada', email: null, role: 'member', createdAt: 1 },
          ],
        }),
    ],
    [ISSUERS]: [
      () =>
        answer(200, { trustedIssuers: [issuer], audienceRoot: 'https://wbs.example/mcp/oauth' }),
    ],
    'GET /api/organization/sso-connections': [() => answer(200, { connections: [] })],
    ...routes,
  });
}

const scope: ResourceScope = {
  organization: { kind: 'active', organizationId: 'org-a' },
  isCurrent: () => true,
  refuse: () => undefined,
};

function mount(
  viewer: CredentialViewer = admin,
  person?: { id: string; name: string },
  onAccessLost = vi.fn(),
) {
  return render(
    <OrganizationResourcesProvider scope={scope}>
      <MachineCredentialsPanel viewer={viewer} person={person} onAccessLost={onAccessLost} />
    </OrganizationResourcesProvider>,
  );
}

function panel() {
  return screen.getByRole('region', { name: 'Machine credentials' });
}

async function openCreate() {
  fireEvent.click(await within(panel()).findByRole('button', { name: 'Create credential' }));
  return screen.findByRole('dialog', { name: 'Create a machine credential' });
}

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(navigator, 'clipboard');
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('machine credentials panel states', () => {
  it('renders loading, then the admin empty state', async () => {
    stubPanel();
    mount();
    expect(screen.getByText('Loading machine credentials…')).toBeDefined();
    expect(
      await screen.findByText('No live machine credentials in this organization.'),
    ).toBeDefined();
  });

  it('explains a member’s empty list by their reach', async () => {
    stubPanel();
    mount(member);
    expect(
      await screen.findByText(
        'No live credentials for agents bound to your account. Credentials of other members’ agents are not listed for you.',
      ),
    ).toBeDefined();
  });

  it('renders rows with their columns', async () => {
    stubPanel({ [LIST]: [() => answer(200, { credentials: [key, oidc] })] });
    mount();
    const row = (await screen.findByText('claire laptop')).closest('li')!;
    expect(within(row).getByText('API key')).toBeDefined();
    expect(within(row).getByText('You')).toBeDefined();
    expect(within(row).getByText('2026-10-22 09:00 UTC')).toBeDefined();
    expect(within(row).getByText('2026-10-22 10:05 UTC')).toBeDefined();
    expect(within(row).getByText('Live')).toBeDefined();
    const workflow = screen.getByText('deploy workflow').closest('li')!;
    expect(within(workflow).getByText('repo:puni/wbs:ref:refs/heads/main')).toBeDefined();
    expect(within(workflow).getByText('Never')).toBeDefined();
  });

  it('renders a query failure with retry', async () => {
    stubPanel({
      [LIST]: [() => answer(503, {}), () => answer(200, { credentials: [key] })],
    });
    mount();
    expect((await screen.findByRole('alert')).textContent).toBe(
      'The server returned an unexpected response. Try again.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByText('claire laptop');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it.each([
    ['forbidden', 'Your role cannot view machine credentials.'],
    ['insufficient_scope', 'This sign-in is read-only here. Sign in to WBS again to make changes.'],
  ])('renders a %s read without create controls', async (error, message) => {
    stubPanel({ [LIST]: [() => answer(403, { error })] });
    mount();
    expect((await screen.findByRole('alert')).textContent).toBe(message);
    expect(within(panel()).queryByRole('button', { name: 'Create credential' })).toBeNull();
  });

  it('gives the page up on a membership refusal', async () => {
    stubPanel({ [LIST]: [() => answer(403, { error: 'not_a_member' })] });
    const lost = vi.fn();
    mount(admin, undefined, lost);
    await waitFor(() => {
      expect(lost).toHaveBeenCalledWith('removed');
    });
  });

  it('lists revoked credentials only behind the toggle', async () => {
    const sent = stubPanel({
      [LIST]: [
        () => answer(200, { credentials: [] }),
        () => answer(200, { credentials: [{ ...key, revokedAt: Date.UTC(2026, 9, 22, 11) }] }),
      ],
    });
    mount();
    await screen.findByText('No live machine credentials in this organization.');
    fireEvent.click(screen.getByLabelText('Include revoked'));
    expect(await screen.findByText('Revoked 2026-10-22 11:00 UTC')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Revoke claire laptop' })).toBeNull();
    expect(
      sent.filter((request) => request.route === LIST).map((request) => request.search),
    ).toEqual([undefined, '?include=revoked']);
  });

  it('an oidc row without its subject reaches the error boundary', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    stubPanel({ [LIST]: [() => answer(200, { credentials: [{ ...oidc, subject: null }] })] });
    render(
      <AppFaultBoundary>
        <OrganizationResourcesProvider scope={scope}>
          <MachineCredentialsPanel viewer={admin} onAccessLost={vi.fn()} />
        </OrganizationResourcesProvider>
      </AppFaultBoundary>,
    );
    await waitFor(() => {
      expect(document.querySelector('[data-app-fault]')).not.toBeNull();
    });
    expect(screen.queryByText('deploy workflow')).toBeNull();
  });
});

describe('creating a credential', () => {
  it('offers an admin every bound agent person', async () => {
    stubPanel();
    mount();
    const dialog = await openCreate();
    const options = within(within(dialog).getByLabelText('Agent person')).getAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual([
      'Choose an agent person',
      'claire',
      'rex',
    ]);
  });

  it('offers a member only their own agents', async () => {
    const sent = stubPanel();
    mount(member);
    const dialog = await openCreate();
    const options = within(within(dialog).getByLabelText('Agent person')).getAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual([
      'Choose an agent person',
      'claire',
    ]);
    expect(
      within(dialog).getByRole('option', { name: 'OIDC token of a trusted issuer' }),
    ).toHaveProperty('disabled', true);
    expect(sent.some((request) => request.route === ISSUERS)).toBe(false);
  });

  it('create shows the key once, then refresh discards it, without browser storage', async () => {
    const stored = vi.spyOn(Storage.prototype, 'setItem');
    const sent = stubPanel({
      [LIST]: [() => answer(200, { credentials: [] }), () => answer(200, { credentials: [key] })],
      [CREATE]: [
        () =>
          answer(201, {
            id: 'cred-a',
            source: 'api_key',
            name: 'claire laptop',
            personId: 'p-claire',
            issuedBy: 'u1',
            createdAt: 1,
            key: KEY,
          }),
      ],
    });
    mount();
    const dialog = await openCreate();
    fireEvent.change(within(dialog).getByLabelText('Agent person'), {
      target: { value: 'p-claire' },
    });
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'claire laptop' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create credential' }));
    const field = await screen.findByDisplayValue(KEY);
    expect(
      screen.getByText('Copy the key for claire laptop now. It will not be shown again.'),
    ).toBeDefined();
    expect(field).toHaveProperty('readOnly', true);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(sent.find((request) => request.route === CREATE)?.body).toEqual({
      source: 'api_key',
      name: 'claire laptop',
      personId: 'p-claire',
    });
    await screen.findByText('claire laptop');
    fireEvent.click(screen.getByRole('button', { name: 'Refresh credentials' }));
    await screen.findByText('claire laptop');
    expect(screen.queryByDisplayValue(KEY)).toBeNull();
    expect(document.body.innerHTML).not.toContain(KEY);
    expect(stored).not.toHaveBeenCalled();
  });

  it('dismissing the key removes it for good', async () => {
    stubPanel({
      [CREATE]: [
        () =>
          answer(201, {
            id: 'cred-a',
            source: 'api_key',
            name: 'n',
            personId: 'p-claire',
            issuedBy: 'u1',
            createdAt: 1,
            key: KEY,
          }),
      ],
    });
    mount(admin, { id: 'p-claire', name: 'claire' });
    fireEvent.click(await screen.findByRole('button', { name: 'Create credential' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'n' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create credential' }));
    await screen.findByDisplayValue(KEY);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss key' }));
    expect(screen.queryByDisplayValue(KEY)).toBeNull();
    expect(document.body.innerHTML).not.toContain(KEY);
  });

  it('keeps a created key when the list cannot be reread', async () => {
    stubPanel({
      [LIST]: [() => answer(200, { credentials: [] }), () => answer(503, {})],
      [CREATE]: [
        () =>
          answer(201, {
            id: 'cred-a',
            source: 'api_key',
            name: 'n',
            personId: 'p-claire',
            issuedBy: 'u1',
            createdAt: 1,
            key: KEY,
          }),
      ],
    });
    mount(admin, { id: 'p-claire', name: 'claire' });
    fireEvent.click(await screen.findByRole('button', { name: 'Create credential' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'n' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create credential' }));
    await screen.findByRole('button', { name: 'Retry' });
    expect(screen.getByDisplayValue(KEY)).toBeDefined();
  });

  it('discards a created key when the reread is refused', async () => {
    stubPanel({
      [LIST]: [
        () => answer(200, { credentials: [] }),
        () => answer(403, { error: 'insufficient_scope' }),
      ],
      [CREATE]: [
        () =>
          answer(201, {
            id: 'cred-a',
            source: 'api_key',
            name: 'n',
            personId: 'p-claire',
            issuedBy: 'u1',
            createdAt: 1,
            key: KEY,
          }),
      ],
    });
    mount(admin, { id: 'p-claire', name: 'claire' });
    fireEvent.click(await screen.findByRole('button', { name: 'Create credential' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'n' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create credential' }));
    await screen.findByText(
      'This sign-in is read-only here. Sign in to WBS again to make changes.',
    );
    expect(screen.queryByDisplayValue(KEY)).toBeNull();
  });

  it('retry after a failed reread keeps the key', async () => {
    stubPanel({
      [LIST]: [
        () => answer(200, { credentials: [] }),
        () => answer(503, {}),
        () => answer(200, { credentials: [key] }),
      ],
      [CREATE]: [
        () =>
          answer(201, {
            id: 'cred-a',
            source: 'api_key',
            name: 'n',
            personId: 'p-claire',
            issuedBy: 'u1',
            createdAt: 1,
            key: KEY,
          }),
      ],
    });
    mount(admin, { id: 'p-claire', name: 'claire' });
    fireEvent.click(await screen.findByRole('button', { name: 'Create credential' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'n' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create credential' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));
    await screen.findByText('claire laptop');
    expect(screen.getByDisplayValue(KEY)).toBeDefined();
  });

  it('a thrown write reaches the error boundary', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    stubPanel({ [LIST]: [() => answer(200, { credentials: [key] })] });
    let isBroken = false;
    const breaking: ResourceScope = {
      ...scope,
      isCurrent: () => {
        if (isBroken) throw new Error('fixture runtime fault');
        return true;
      },
    };
    render(
      <AppFaultBoundary>
        <OrganizationResourcesProvider scope={breaking}>
          <MachineCredentialsPanel viewer={admin} onAccessLost={vi.fn()} />
        </OrganizationResourcesProvider>
      </AppFaultBoundary>,
    );
    const rotate = await screen.findByRole('button', { name: 'Rotate claire laptop' });
    isBroken = true;
    fireEvent.click(rotate);
    await waitFor(() => {
      expect(document.querySelector('[data-app-fault]')).not.toBeNull();
    });
  });

  it('copies the key when the clipboard is available', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    stubPanel({
      [CREATE]: [
        () =>
          answer(201, {
            id: 'cred-a',
            source: 'api_key',
            name: 'n',
            personId: 'p-claire',
            issuedBy: 'u1',
            createdAt: 1,
            key: KEY,
          }),
      ],
    });
    mount(admin, { id: 'p-claire', name: 'claire' });
    fireEvent.click(await screen.findByRole('button', { name: 'Create credential' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'n' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create credential' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Copy key' }));
    expect(await screen.findByText('Copied.')).toBeDefined();
    expect(writeText).toHaveBeenCalledWith(KEY);
  });

  it('says when the clipboard is unavailable', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    stubPanel({
      [CREATE]: [
        () =>
          answer(201, {
            id: 'cred-a',
            source: 'api_key',
            name: 'n',
            personId: 'p-claire',
            issuedBy: 'u1',
            createdAt: 1,
            key: KEY,
          }),
      ],
    });
    mount(admin, { id: 'p-claire', name: 'claire' });
    fireEvent.click(await screen.findByRole('button', { name: 'Create credential' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'n' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create credential' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Copy key' }));
    expect(
      await screen.findByText('Copying is not available here. Select the key and copy it.'),
    ).toBeDefined();
  });

  it('creates an oidc credential for an admin from a trusted issuer', async () => {
    const sent = stubPanel({
      [CREATE]: [
        () =>
          answer(201, {
            id: 'cred-b',
            source: 'oidc',
            name: 'deploy',
            personId: 'p-rex',
            issuedBy: 'u1',
            createdAt: 1,
            trustedIssuerId: 'ti-1',
            issuer: issuer.issuer,
            subject: 'repo:puni/wbs:ref:refs/heads/main',
            audience: null,
          }),
      ],
    });
    mount();
    const dialog = await openCreate();
    fireEvent.change(within(dialog).getByLabelText('Agent person'), { target: { value: 'p-rex' } });
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'deploy' } });
    fireEvent.change(within(dialog).getByLabelText('Source'), { target: { value: 'oidc' } });
    fireEvent.change(within(dialog).getByLabelText('Trusted issuer'), {
      target: { value: 'ti-1' },
    });
    fireEvent.change(within(dialog).getByLabelText(/^Subject/), {
      target: { value: 'repo:puni/wbs:ref:refs/heads/main' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create credential' }));
    expect(
      await screen.findByText('Created deploy for subject repo:puni/wbs:ref:refs/heads/main.'),
    ).toBeDefined();
    expect(sent.find((request) => request.route === CREATE)?.body).toEqual({
      source: 'oidc',
      name: 'deploy',
      personId: 'p-rex',
      trustedIssuerId: 'ti-1',
      subject: 'repo:puni/wbs:ref:refs/heads/main',
    });
    expect(screen.queryByLabelText('Machine credential key')).toBeNull();
  });

  it('throws loudly on an impossible source selection, draft unchanged', async () => {
    stubPanel();
    mount();
    const dialog = await openCreate();
    const faults: unknown[] = [];
    const collectFault = (event: ErrorEvent) => {
      faults.push(event.error);
      event.preventDefault();
    };
    window.addEventListener('error', collectFault);
    try {
      fireEvent.change(within(dialog).getByLabelText('Source'), {
        target: { value: 'mcp_consent' },
      });
      expect(faults).toHaveLength(1);
      // jsdom answers an option the select lacks as the empty value.
      expect(faults[0]).toHaveProperty('message', 'Unexpected credential source option: ');
      expect(within(dialog).queryByLabelText('Trusted issuer')).toBeNull();
      expect(within(dialog).getByLabelText('Name')).toBeDefined();
    } finally {
      window.removeEventListener('error', collectFault);
    }
  });

  it.each([
    ['name_taken', 409, {}, 'A live credential already has this name. Choose another name.'],
    [
      'person_not_bound',
      409,
      { personId: 'p-claire' },
      'That agent person is not bound to an account. Bind it on the Directory page first.',
    ],
    [
      'account_not_member',
      409,
      {},
      'The account bound to that agent person is no longer a member here.',
    ],
    [
      'invalid_body',
      400,
      {},
      'Choose a plain name of at most 80 characters that does not look like a key or token.',
    ],
    ['forbidden', 403, {}, 'You can manage credentials only for agents bound to your own account.'],
    [
      'insufficient_scope',
      403,
      {},
      'This sign-in is read-only here. Sign in to WBS again to make changes.',
    ],
    [
      'subject_taken',
      409,
      {},
      'Another credential of this trusted issuer already admits this subject.',
    ],
    [
      'unknown_person',
      404,
      {},
      'That agent person is no longer in this organization. Refresh the list.',
    ],
  ])('renders %s in the dialog', async (error, status, extra, text) => {
    stubPanel({ [CREATE]: [() => answer(status, { error, ...extra })] });
    mount(admin, { id: 'p-claire', name: 'claire' });
    fireEvent.click(await screen.findByRole('button', { name: 'Create credential' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'wbs_mk_x' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create credential' }));
    expect((await within(dialog).findByRole('alert')).textContent).toBe(text);
    expect(screen.getByRole('dialog')).toBeDefined();
  });
});

describe('refusal wording and labels', () => {
  it('renders invalid_body on an oidc create as name, subject or audience', async () => {
    stubPanel({ [CREATE]: [() => answer(400, { error: 'invalid_body' })] });
    mount();
    const dialog = await openCreate();
    fireEvent.change(within(dialog).getByLabelText('Agent person'), { target: { value: 'p-rex' } });
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'deploy' } });
    fireEvent.change(within(dialog).getByLabelText('Source'), { target: { value: 'oidc' } });
    fireEvent.change(within(dialog).getByLabelText('Trusted issuer'), {
      target: { value: 'ti-1' },
    });
    fireEvent.change(within(dialog).getByLabelText(/^Subject/), { target: { value: 'eyJ.x.y' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create credential' }));
    expect((await within(dialog).findByRole('alert')).textContent).toBe(
      'Check the name, subject and audience: each must be plain text that does not look like a key or token.',
    );
  });

  it('renders audience_not_wbs on an oidc create', async () => {
    stubPanel({ [CREATE]: [() => answer(400, { error: 'audience_not_wbs' })] });
    mount();
    const dialog = await openCreate();
    fireEvent.change(within(dialog).getByLabelText('Agent person'), { target: { value: 'p-rex' } });
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'deploy' } });
    fireEvent.change(within(dialog).getByLabelText('Source'), { target: { value: 'oidc' } });
    fireEvent.change(within(dialog).getByLabelText('Trusted issuer'), {
      target: { value: 'ti-1' },
    });
    fireEvent.change(within(dialog).getByLabelText(/^Subject/), { target: { value: 'repo:a/b' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create credential' }));
    expect((await within(dialog).findByRole('alert')).textContent).toBe(
      'The audience must be https://wbs.example/mcp/oauth or a path under it.',
    );
  });

  it('asks for the audience root where the page could not read it', () => {
    expect(credentialRefusal({ error: 'audience_not_wbs' }, 'create-oidc', null)).toEqual({
      kind: 'message',
      text: 'The audience must be WBS’s authorization server or a path under it (ask an admin for the value).',
    });
  });

  it('names the issuing account for an admin and falls back to its id for a member', async () => {
    const other = { ...key, id: 'cred-z', name: 'rex key', personId: 'p-rex', issuedBy: 'u2' };
    stubPanel({ [LIST]: [() => answer(200, { credentials: [other] })] });
    mount();
    const row = (await screen.findByText('rex key')).closest('li')!;
    expect(within(row).getByText('ada')).toBeDefined();
    cleanup();
    const sent = stubPanel({ [LIST]: [() => answer(200, { credentials: [other] })] });
    mount(member);
    const memberRow = (await screen.findByText('rex key')).closest('li')!;
    expect(within(memberRow).getByText('Account u2')).toBeDefined();
    expect(sent.some((request) => request.route === 'GET /api/organization/members')).toBe(false);
  });
});

describe('rotating and revoking', () => {
  it('offers rotate on API keys only', async () => {
    stubPanel({ [LIST]: [() => answer(200, { credentials: [key, oidc, consent] })] });
    mount();
    await screen.findByText('claire laptop');
    expect(screen.getByRole('button', { name: 'Rotate claire laptop' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Rotate deploy workflow' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Rotate Claude Code' })).toBeNull();
    expect(screen.getByText('Rotates at its issuer')).toBeDefined();
    expect(screen.getByText('Rotates by refresh')).toBeDefined();
  });

  it('disables rotate with its reason while a window is open', async () => {
    const ends = Date.UTC(2026, 9, 23, 9);
    stubPanel({
      [LIST]: [() => answer(200, { credentials: [{ ...key, rotationEndsAt: ends }] })],
    });
    mount();
    const rotate = await screen.findByRole('button', { name: 'Rotate claire laptop' });
    expect(rotate).toBeDisabled();
    expect(screen.getByText('Rotating: the previous key ends 2026-10-23 09:00 UTC')).toBeDefined();
  });

  it('rotates, shows the new key once with the overlap, then discards it on a later refusal', async () => {
    const previousExpiresAt = Date.UTC(2026, 9, 23, 9);
    stubPanel({
      [LIST]: [() => answer(200, { credentials: [key] })],
      'POST /api/organization/machine-credentials/cred-a/rotate': [
        () => answer(201, { id: 'cred-a', secretId: 's2', key: KEY, previousExpiresAt }),
        () => answer(409, { error: 'rotation_in_progress' }),
      ],
    });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Rotate claire laptop' }));
    await screen.findByDisplayValue(KEY);
    expect(
      screen.getByText('The previous key keeps working until 2026-10-23 09:00 UTC.'),
    ).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Rotate claire laptop' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'This key is already rotating. Rotate again after its window ends.',
    );
    expect(screen.queryByDisplayValue(KEY)).toBeNull();
  });

  it('discards a shown secret on a later refusal', async () => {
    stubPanel({
      [LIST]: [() => answer(200, { credentials: [key, oidc] })],
      'POST /api/organization/machine-credentials/cred-a/rotate': [
        () => answer(201, { id: 'cred-a', secretId: 's2', key: KEY, previousExpiresAt: 1 }),
      ],
      'DELETE /api/organization/machine-credentials/cred-b': [
        () => answer(404, { error: 'not_found' }),
      ],
    });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Rotate claire laptop' }));
    await screen.findByDisplayValue(KEY);
    fireEvent.click(screen.getByRole('button', { name: 'Revoke deploy workflow' }));
    fireEvent.change(screen.getByLabelText('Type cred-b to revoke deploy workflow'), {
      target: { value: 'cred-b' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm revoking deploy workflow' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'This credential is not available for this action. Refresh the list.',
    );
    expect(screen.queryByDisplayValue(KEY)).toBeNull();
  });

  it('withdraws a shown key as soon as another write starts', async () => {
    stubPanel({
      [LIST]: [() => answer(200, { credentials: [key, oidc] })],
      'POST /api/organization/machine-credentials/cred-a/rotate': [
        () => answer(201, { id: 'cred-a', secretId: 's2', key: KEY, previousExpiresAt: 1 }),
      ],
    });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Rotate claire laptop' }));
    await screen.findByDisplayValue(KEY);
    vi.mocked(fetch).mockImplementation(() => new Promise<Response>(() => undefined));
    fireEvent.click(screen.getByRole('button', { name: 'Revoke deploy workflow' }));
    fireEvent.change(screen.getByLabelText('Type cred-b to revoke deploy workflow'), {
      target: { value: 'cred-b' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm revoking deploy workflow' }));
    expect(screen.queryByDisplayValue(KEY)).toBeNull();
  });

  it('renders rotation_at_issuer', async () => {
    stubPanel({
      [LIST]: [() => answer(200, { credentials: [key] })],
      'POST /api/organization/machine-credentials/cred-a/rotate': [
        () => answer(409, { error: 'rotation_at_issuer' }),
      ],
    });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Rotate claire laptop' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'This credential rotates at its issuer, not in WBS.',
    );
  });

  it('requires the exact id before revoking, then rereads', async () => {
    const sent = stubPanel({
      [LIST]: [() => answer(200, { credentials: [key] }), () => answer(200, { credentials: [] })],
      'DELETE /api/organization/machine-credentials/cred-a': [() => answerEmpty(204)],
    });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke claire laptop' }));
    const confirmation = screen.getByLabelText('Type cred-a to revoke claire laptop');
    fireEvent.change(confirmation, { target: { value: 'cred-a ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm revoking claire laptop' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Enter the exact credential ID to revoke it.',
    );
    expect(sent.filter((request) => request.route.startsWith('DELETE'))).toHaveLength(0);
    fireEvent.change(confirmation, { target: { value: 'cred-a' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm revoking claire laptop' }));
    await screen.findByText('No live machine credentials in this organization.');
    expect(sent.filter((request) => request.route.startsWith('DELETE'))).toHaveLength(1);
  });

  it('serializes forced revoke submissions', async () => {
    stubPanel({ [LIST]: [() => answer(200, { credentials: [key] })] });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke claire laptop' }));
    const confirmation = screen.getByLabelText('Type cred-a to revoke claire laptop');
    fireEvent.change(confirmation, { target: { value: 'cred-a' } });
    let writes = 0;
    vi.mocked(fetch).mockImplementation(() => {
      writes++;
      return new Promise<Response>(() => undefined);
    });
    fireEvent.submit(confirmation.closest('form')!);
    fireEvent.submit(confirmation.closest('form')!);
    expect(writes).toBe(1);
  });
});

describe('the people page sub-panel', () => {
  it('narrows the list to the person and reads no people or issuers, only the admin’s member names', async () => {
    const sent = stubPanel({ [LIST]: [() => answer(200, { credentials: [consent] })] });
    mount(admin, { id: 'p-claire', name: 'claire' });
    const region = await screen.findByRole('region', { name: 'Credentials of claire' });
    await within(region).findByText('Claude Code');
    expect(sent.map((request) => `${request.route}${request.search ?? ''}`)).toEqual([
      `${LIST}?personId=p-claire`,
      'GET /api/organization/members',
    ]);
    expect(within(region).queryByLabelText('Machine credential key')).toBeNull();
  });
});
