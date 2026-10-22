import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ResourceScope } from '@/lib/organization-context';
import { OrganizationResourcesProvider } from '@/runtime/organization-resources';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@/testing/organization-render';
import { answerEmpty, answerJson as answer, stubServer } from '@/testing/stub-server';

import { TrustedIssuersSection } from './trusted-issuers-section';

const LIST = 'GET /api/organization/trusted-issuers';
const REGISTER = 'POST /api/organization/trusted-issuers';
const GITHUB = 'https://token.actions.githubusercontent.com';
const issuer = {
  id: 'ti-1',
  issuer: GITHUB,
  jwksUri: `${GITHUB}/.well-known/jwks`,
  audience: 'wbs:org:org-a',
  ssoConnectionId: null,
  createdAt: 1,
  createdBy: 'u1',
  machineCredentials: 2,
};
const connection = {
  id: 'conn-1',
  domainClaimId: 'd1',
  domain: 'acme.test',
  auth0Connection: 'acme',
  strategy: 'oidc',
  loginSlug: 'acme',
  enforced: false,
  provenAt: 5,
  provenBy: 'u1',
  lastPrefixMismatchAt: null,
};

const scope: ResourceScope = {
  organization: { kind: 'active', organizationId: 'org-a' },
  isCurrent: () => true,
  refuse: () => undefined,
};

function stubSection(routes: Parameters<typeof stubServer>[0] = {}) {
  return stubServer({
    [LIST]: [() => answer(200, { trustedIssuers: [] })],
    'GET /api/organization/sso-connections': [
      () =>
        answer(200, {
          connections: [connection, { ...connection, id: 'conn-2', strategy: 'samlp' }],
        }),
    ],
    ...routes,
  });
}

function mount(onChanged = vi.fn(), onAccessLost = vi.fn()) {
  render(
    <OrganizationResourcesProvider scope={scope}>
      <TrustedIssuersSection onAccessLost={onAccessLost} onChanged={onChanged} />
    </OrganizationResourcesProvider>,
  );
  return { onChanged, onAccessLost };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('trusted issuers', () => {
  it('renders loading, then empty with the suggested audience filled in', async () => {
    stubSection();
    mount();
    expect(screen.getByText('Loading trusted issuers…')).toBeDefined();
    await screen.findByText('No trusted issuers yet.');
    expect(screen.getByLabelText('Audience')).toHaveProperty('value', 'wbs:org:org-a');
    expect(screen.getByLabelText('Audience')).toHaveProperty('required', true);
    expect(
      screen.getByText(
        'Tokens must carry this audience. Configure the same value at your identity provider; the suggested value is wbs:org:org-a.',
      ),
    ).toBeDefined();
  });

  it('offers only proven oidc connections', async () => {
    stubSection();
    mount();
    const picker = await screen.findByLabelText('Company sign-in connection (optional)');
    expect(
      within(picker)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['None', 'acme.test (acme)']);
  });

  it('says why no connection is offered to an admin', async () => {
    stubSection({
      'GET /api/organization/sso-connections': [() => answer(403, { error: 'forbidden' })],
    });
    mount();
    expect(
      await screen.findByText('Company sign-in connections are listed for super-admins only.'),
    ).toBeDefined();
  });

  it('registers an issuer, rereads and tells the panel', async () => {
    const sent = stubSection({
      [LIST]: [
        () => answer(200, { trustedIssuers: [] }),
        () => answer(200, { trustedIssuers: [issuer] }),
      ],
      [REGISTER]: [() => answer(201, issuer)],
    });
    const { onChanged } = mount();
    fireEvent.change(await screen.findByLabelText('Issuer URL'), { target: { value: GITHUB } });
    fireEvent.change(screen.getByLabelText('Company sign-in connection (optional)'), {
      target: { value: 'conn-1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Register issuer' }));
    await screen.findByText(GITHUB);
    expect(sent.find((request) => request.route === REGISTER)?.body).toEqual({
      issuer: GITHUB,
      audience: 'wbs:org:org-a',
      ssoConnectionId: 'conn-1',
    });
    await waitFor(() => {
      expect(onChanged).toHaveBeenCalledTimes(1);
    });
  });

  it.each([
    ['issuer_unreachable', 409, 'The issuer’s discovery document could not be fetched.'],
    ['issuer_mismatch', 409, 'The discovery document names a different issuer.'],
    [
      'issuer_reserved',
      409,
      'This is WBS’s own sign-in issuer; it cannot be trusted for machines.',
    ],
    ['issuer_not_oidc', 409, 'The discovery document has no HTTPS key set (jwks_uri).'],
    ['sso_connection_unproven', 409, 'Prove the company sign-in connection before choosing it.'],
    ['issuer_taken', 409, 'This issuer is already trusted.'],
    [
      'audience_taken',
      409,
      'Another organization already trusts this issuer with this audience. Choose another audience.',
    ],
    [
      'trusted_issuer_limit',
      409,
      'This organization already trusts eight issuers. Remove one first.',
    ],
    ['unknown_sso_connection', 404, 'That company sign-in connection is not in this organization.'],
    [
      'invalid_body',
      400,
      'Enter a public HTTPS issuer URL (no IP address or private name, no query or fragment) and an audience.',
    ],
    ['forbidden', 403, 'Only an admin can manage trusted issuers.'],
  ])('renders %s on register', async (error, status, text) => {
    stubSection({ [REGISTER]: [() => answer(status, { error })] });
    mount();
    fireEvent.change(await screen.findByLabelText('Issuer URL'), { target: { value: GITHUB } });
    fireEvent.click(screen.getByRole('button', { name: 'Register issuer' }));
    expect((await screen.findByRole('alert')).textContent).toBe(text);
  });

  it('shows in_use with its count', async () => {
    const sent = stubSection({
      [LIST]: [() => answer(200, { trustedIssuers: [issuer] })],
      'DELETE /api/organization/trusted-issuers/ti-1': [
        () => answer(409, { error: 'in_use', machineCredentials: 2 }),
      ],
    });
    mount();
    expect(await screen.findByText('Audience: wbs:org:org-a · Live credentials: 2')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: `Remove ${GITHUB}` }));
    fireEvent.click(screen.getByRole('button', { name: `Confirm removing ${GITHUB}` }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Revoke the 2 live credentials naming this issuer before removing it.',
    );
    expect(sent.filter((request) => request.route.startsWith('DELETE'))).toHaveLength(1);
  });

  it('removes an unused issuer after confirmation', async () => {
    const sent = stubSection({
      [LIST]: [
        () => answer(200, { trustedIssuers: [{ ...issuer, machineCredentials: 0 }] }),
        () => answer(200, { trustedIssuers: [] }),
      ],
      'DELETE /api/organization/trusted-issuers/ti-1': [() => answerEmpty(204)],
    });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: `Remove ${GITHUB}` }));
    expect(sent.filter((request) => request.route.startsWith('DELETE'))).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: `Confirm removing ${GITHUB}` }));
    await screen.findByText('No trusted issuers yet.');
  });

  it('renders a query failure with retry', async () => {
    stubSection({
      [LIST]: [() => answer(503, {}), () => answer(200, { trustedIssuers: [] })],
    });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Retry trusted issuers' }));
    await screen.findByText('No trusted issuers yet.');
  });

  it('gives the page up on a membership refusal', async () => {
    stubSection({ [LIST]: [() => answer(403, { error: 'not_a_member' })] });
    const { onAccessLost } = mount();
    await waitFor(() => {
      expect(onAccessLost).toHaveBeenCalledWith('removed');
    });
  });
});
