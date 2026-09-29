import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { answerEmpty, answerJson as answer, stubServer } from '@/testing/stub-server';

import { DomainsPanel } from './domains-panel';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const claim = (id: string, domain: string, fields: Record<string, unknown> = {}) => ({
  id,
  domain,
  status: 'pending',
  challengeExpiresAt: Date.now() + 24 * 60 * 60 * 1000,
  lastSuccessAt: null,
  lastCheckedAt: null,
  proofWarning: false,
  ...fields,
});
const challenge = {
  id: 'c',
  domain: 'acme.test',
  dnsName: '_wbs-challenge.acme.test',
  dnsValue: 'wbs-domain-verification=abc',
  expiresAt: 86_400_000,
};

function renderPanel(onAccessLost: (loss: string) => void = () => undefined) {
  render(<DomainsPanel onAccessLost={onAccessLost} />);
}

describe('domain settings', () => {
  it('renders loading, then the empty state', async () => {
    stubServer({ 'GET /api/organization/domains': [() => answer(200, { domains: [] })] });
    renderPanel();
    expect(screen.getByText('Loading domains…')).toBeDefined();
    expect(await screen.findByText('No domains claimed yet.')).toBeDefined();
  });

  it('claims a domain and shows the TXT record to publish', async () => {
    const sent = stubServer({
      'GET /api/organization/domains': [
        () => answer(200, { domains: [] }),
        () => answer(200, { domains: [claim('c', 'acme.test')] }),
      ],
      'POST /api/organization/domains/challenges': [() => answer(201, challenge)],
    });
    renderPanel();
    fireEvent.change(await screen.findByLabelText('Domain'), { target: { value: ' acme.test ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Claim domain' }));
    const record = await screen.findByRole('region', { name: 'TXT record to publish' });
    expect(within(record).getByText('_wbs-challenge.acme.test')).toBeDefined();
    expect(within(record).getByText('wbs-domain-verification=abc')).toBeDefined();
    expect(await screen.findByText('Pending verification')).toBeDefined();
    expect(sent.find((call) => call.route.startsWith('POST'))?.body).toEqual({
      domain: 'acme.test',
    });
  });

  it('renders suspension and a failed proof check as distinct states', async () => {
    stubServer({
      'GET /api/organization/domains': [
        () =>
          answer(200, {
            domains: [
              claim('s', 'old.test', { status: 'suspended', lastSuccessAt: 1, lastCheckedAt: 2 }),
              claim('w', 'warn.test', { status: 'verified', proofWarning: true, lastSuccessAt: 1 }),
              claim('v', 'ok.test', { status: 'verified', lastSuccessAt: 1 }),
            ],
          }),
      ],
    });
    renderPanel();
    const rows = await screen.findAllByRole('listitem');
    expect(rows[0]?.textContent).toMatch(/Suspended: the TXT proof has not been found/);
    expect(within(rows[0]).getByRole('button', { name: 'Verify old.test' })).toBeDefined();
    expect(rows[1]?.textContent).toMatch(/The last proof check failed/);
    expect(rows[2]?.textContent).not.toMatch(/proof check failed|Suspended:/);
    expect(within(rows[2]).queryByRole('button', { name: 'Verify ok.test' })).toBeNull();
  });

  it('verifies a pending claim and re-reads the list', async () => {
    stubServer({
      'GET /api/organization/domains': [
        () => answer(200, { domains: [claim('c', 'acme.test')] }),
        () => answer(200, { domains: [claim('c', 'acme.test', { status: 'verified' })] }),
      ],
      'POST /api/organization/domains/c/verify': [
        () => answer(200, { id: 'c', status: 'verified' }),
      ],
    });
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Verify acme.test' }));
    expect(await screen.findByText('acme.test is verified.')).toBeDefined();
    expect(await screen.findByText('Verified')).toBeDefined();
  });

  it('rotates a verified proof and shows the new record', async () => {
    stubServer({
      'GET /api/organization/domains': [
        () => answer(200, { domains: [claim('c', 'acme.test', { status: 'verified' })] }),
      ],
      'POST /api/organization/domains/c/rotate': [
        () => answer(201, { ...challenge, dnsValue: 'wbs-domain-verification=next' }),
      ],
    });
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Rotate the proof for acme.test' }));
    expect(await screen.findByText('wbs-domain-verification=next')).toBeDefined();
    expect(
      screen.getByText('New proof issued. The previous one stays valid for up to 24 hours.'),
    ).toBeDefined();
  });

  it('releases only after confirmation', async () => {
    const sent = stubServer({
      'GET /api/organization/domains': [
        () => answer(200, { domains: [claim('c', 'acme.test', { status: 'verified' })] }),
        () => answer(200, { domains: [] }),
      ],
      'DELETE /api/organization/domains/c': [() => answerEmpty(204)],
    });
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Release acme.test' }));
    expect(sent.some((call) => call.route.startsWith('DELETE'))).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm releasing acme.test' }));
    expect(await screen.findByText('acme.test was released.')).toBeDefined();
    expect(await screen.findByText('No domains claimed yet.')).toBeDefined();
  });

  it.each([
    [
      'proof_mismatch',
      409,
      'The TXT record was not found or does not match. Check the record and retry.',
    ],
    ['dns_unavailable', 503, 'DNS could not be reached. Try again later.'],
    ['domain_taken', 409, 'Another organization already owns that domain.'],
    ['stale', 409, 'That domain changed since the page loaded. Check its state and try again.'],
    ['forbidden', 403, 'Your role cannot manage domains.'],
  ])('renders the %s verify refusal', async (error, status, copy) => {
    stubServer({
      'GET /api/organization/domains': [() => answer(200, { domains: [claim('c', 'acme.test')] })],
      'POST /api/organization/domains/c/verify': [() => answer(status, { error })],
    });
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Verify acme.test' }));
    expect(await screen.findByRole('status')).toHaveProperty('textContent', copy);
  });

  it.each([
    ['invalid_domain', 400, 'Enter a domain name such as example.com.'],
    [
      'unclaimable',
      409,
      'That domain cannot be claimed: it is a public email or shared hosting domain.',
    ],
    ['already_claimed', 409, 'Another organization already owns that domain.'],
  ])('renders the %s claim refusal', async (error, status, copy) => {
    stubServer({
      'GET /api/organization/domains': [() => answer(200, { domains: [] })],
      'POST /api/organization/domains/challenges': [() => answer(status, { error })],
    });
    renderPanel();
    fireEvent.change(await screen.findByLabelText('Domain'), { target: { value: 'gmail.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Claim domain' }));
    expect(await screen.findByRole('status')).toHaveProperty('textContent', copy);
    expect(screen.queryByRole('region', { name: 'TXT record to publish' })).toBeNull();
  });

  it('hands a lost organization to the page', async () => {
    const losses: string[] = [];
    stubServer({
      'GET /api/organization/domains': [() => answer(403, { error: 'no_active_organization' })],
    });
    renderPanel((loss) => losses.push(loss));
    await waitFor(() => {
      expect(losses).toEqual(['no_organization']);
    });
  });

  it('replaces Verify on a pending claim whose challenge expired', async () => {
    stubServer({
      'GET /api/organization/domains': [
        () => answer(200, { domains: [claim('c', 'acme.test', { challengeExpiresAt: 1 })] }),
      ],
    });
    renderPanel();
    expect(await screen.findByText('Challenge expired, issue a new one.')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Verify acme.test' })).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Issue a new challenge for acme.test' }),
    ).toBeDefined();
  });

  it('clears the shown TXT record once its claim leaves pending', async () => {
    stubServer({
      'GET /api/organization/domains': [
        () => answer(200, { domains: [] }),
        () => answer(200, { domains: [claim('c', 'acme.test')] }),
        () => answer(200, { domains: [claim('c', 'acme.test', { status: 'verified' })] }),
      ],
      'POST /api/organization/domains/challenges': [() => answer(201, challenge)],
      'POST /api/organization/domains/c/verify': [
        () => answer(200, { id: 'c', status: 'verified' }),
      ],
    });
    renderPanel();
    fireEvent.change(await screen.findByLabelText('Domain'), { target: { value: 'acme.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Claim domain' }));
    await screen.findByRole('region', { name: 'TXT record to publish' });
    fireEvent.click(await screen.findByRole('button', { name: 'Verify acme.test' }));
    expect(await screen.findByText('acme.test is verified.')).toBeDefined();
    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'TXT record to publish' })).toBeNull();
    });
  });

  it('keeps a rotated proof shown while its claim stays verified', async () => {
    stubServer({
      'GET /api/organization/domains': [
        () => answer(200, { domains: [claim('c', 'acme.test', { status: 'verified' })] }),
      ],
      'POST /api/organization/domains/c/rotate': [() => answer(201, challenge)],
    });
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Rotate the proof for acme.test' }));
    await screen.findByText('New proof issued. The previous one stays valid for up to 24 hours.');
    expect(screen.getByRole('region', { name: 'TXT record to publish' })).toBeDefined();
  });
});
