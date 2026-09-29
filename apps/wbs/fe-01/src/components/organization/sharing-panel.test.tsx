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
    stubServer({ 'GET /api/organization': [() => answer(200, { sharedPeople: false })] });
    renderPanel();
    expect(screen.getByText('Loading how people are shared…')).toBeDefined();
    expect(await screen.findByText(/as if it had them alone/)).toBeDefined();
    expect(screen.getByRole('button', { name: 'Share people across projects' })).toBeDefined();
  });

  it('shares people after a confirmation and re-reads the mode', async () => {
    const sent = stubServer({
      'GET /api/organization': [
        () => answer(200, { sharedPeople: false }),
        () => answer(200, { sharedPeople: true }),
      ],
      'PATCH /api/organization': [() => answer(200, { sharedPeople: true })],
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

  it('cancels without switching', async () => {
    const sent = stubServer({
      'GET /api/organization': [() => answer(200, { sharedPeople: true })],
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
  ])('renders the %s switch refusal', async (error, status, copy) => {
    stubServer({
      'GET /api/organization': [() => answer(200, { sharedPeople: false })],
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
