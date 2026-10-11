import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { answerJson as answer, stubServer } from '@/testing/stub-server';

import { SharingPanel } from './sharing-panel';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderPanel(onAccessLost: (loss: string) => void = () => undefined) {
  render(<SharingPanel onAccessLost={onAccessLost} />);
}

describe('shared people', () => {
  it('renders loading, then the isolated mode', async () => {
    stubServer({
      'GET /api/organization': [
        () => answer(200, { sharedPeople: false, sharingAvailable: true, canSwitch: true }),
      ],
    });
    renderPanel();
    expect(screen.getByText('Loading how people are shared…')).toBeDefined();
    expect(await screen.findByText(/as if it had them alone/)).toBeDefined();
    expect(screen.getByRole('button', { name: 'Share people across projects' })).toBeDefined();
  });

  it('shares people after a confirmation and re-reads the mode', async () => {
    const sent = stubServer({
      'GET /api/organization': [
        () => answer(200, { sharedPeople: false, sharingAvailable: true, canSwitch: true }),
        () => answer(200, { sharedPeople: true, sharingAvailable: true, canSwitch: true }),
      ],
      'PATCH /api/organization': [
        () => answer(200, { sharedPeople: true, sharingAvailable: true, canSwitch: true }),
      ],
    });
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Share people across projects' }));
    expect(sent.some((call) => call.route.startsWith('PATCH'))).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm: share people' }));
    expect(await screen.findByText('People are now shared across projects.')).toBeDefined();
    expect(await screen.findByText(/People are shared across projects:/)).toBeDefined();
    expect(sent.find((call) => call.route.startsWith('PATCH'))?.body).toEqual({
      sharedPeople: true,
    });
  });

  it('offers no switch a release without shared people would refuse', async () => {
    stubServer({
      'GET /api/organization': [
        () => answer(200, { sharedPeople: false, sharingAvailable: false, canSwitch: true }),
      ],
    });
    renderPanel();
    expect(await screen.findByText(/as if it had them alone/)).toBeDefined();
    expect(
      screen.getByText('Sharing people across projects is not available in this release yet.'),
    ).toBeDefined();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('still lets a shared organization stop sharing in such a release', async () => {
    stubServer({
      'GET /api/organization': [
        () => answer(200, { sharedPeople: true, sharingAvailable: false, canSwitch: true }),
      ],
    });
    renderPanel();
    expect(await screen.findByRole('button', { name: 'Stop sharing people' })).toBeDefined();
  });

  it('explains, without a switch, that only a super-admin may change it', async () => {
    stubServer({
      'GET /api/organization': [
        () => answer(200, { sharedPeople: false, sharingAvailable: true, canSwitch: false }),
      ],
    });
    renderPanel();
    expect(await screen.findByText(/as if it had them alone/)).toBeDefined();
    expect(
      screen.getByText('Only a super-admin can change whether people are shared.'),
    ).toBeDefined();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('says the switch is reversible before it is confirmed', async () => {
    stubServer({
      'GET /api/organization': [
        () => answer(200, { sharedPeople: false, sharingAvailable: true, canSwitch: true }),
      ],
    });
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Share people across projects' }));
    expect(
      screen.getByText(
        'This moves the dates of every project in the organization. Switching back restores them.',
      ),
    ).toBeDefined();
  });

  it('cancels without switching', async () => {
    const sent = stubServer({
      'GET /api/organization': [
        () => answer(200, { sharedPeople: true, sharingAvailable: true, canSwitch: true }),
      ],
    });
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Stop sharing people' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Stop sharing people' })).toBeDefined();
    expect(sent.some((call) => call.route.startsWith('PATCH'))).toBe(false);
  });

  it.each([
    ['forbidden', 403, 'Only a super-admin can change whether people are shared.'],
    [
      'insufficient_scope',
      403,
      'This sign-in is read-only here. Sign in to WBS again to make changes.',
    ],
    [
      'capacity_mode_unsupported',
      409,
      'Sharing people across projects is not available in this release yet.',
    ],
  ])('renders the %s switch refusal', async (error, status, copy) => {
    stubServer({
      'GET /api/organization': [
        () => answer(200, { sharedPeople: false, sharingAvailable: true, canSwitch: true }),
      ],
      'PATCH /api/organization': [() => answer(status, { error })],
    });
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Share people across projects' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm: share people' }));
    expect(await screen.findByRole('status')).toHaveProperty('textContent', copy);
  });

  it('hands an organization-less session to the page', async () => {
    const losses: string[] = [];
    stubServer({
      'GET /api/organization': [() => answer(409, { error: 'organization_required' })],
    });
    renderPanel((loss) => losses.push(loss));
    await waitFor(() => {
      expect(losses).toEqual(['no_organization']);
    });
  });
});
