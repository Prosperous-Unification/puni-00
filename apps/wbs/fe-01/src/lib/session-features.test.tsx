import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { cleanup, screen } from '@testing-library/react';
import type { SessionFeatures } from '@wbs/contracts';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { OnboardingScreen } from '@/components/onboarding/onboarding-screen';
import { OrganizationPage } from '@/components/organization/organization-page';
import { SpacesPage } from '@/components/spaces/spaces-page';
import { render } from '@/testing/organization-render';
import { answerJson as answer, stubServer } from '@/testing/stub-server';

import { SessionFeaturesProvider } from './session-features';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const OFF: SessionFeatures = { onboarding: false, organizations: false };

function routed(features: SessionFeatures | null, ui: ReactNode) {
  const root = createRootRoute({
    component: () => <SessionFeaturesProvider value={features}>{ui}</SessionFeaturesProvider>,
  });
  const router = createRouter({ routeTree: root, history: createMemoryHistory() });
  render(<RouterProvider router={router} />);
}

/** Lets every effect and reply the render started settle before requests are counted. */
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 20));
}

describe('surfaces of a feature the session read reported off', () => {
  // Proof (2026-10-14): letting OnboardingScreen's read effect run whatever the
  // feature said failed this case: `expected [ { …(2) } ] to deeply equal []`.
  it('keeps the app without asking onboarding when onboarding is off', async () => {
    const sent = stubServer({});
    routed(
      OFF,
      <OnboardingScreen onSignOut={() => undefined}>
        <p>Existing app</p>
      </OnboardingScreen>,
    );
    expect(await screen.findByText('Existing app')).toBeDefined();
    await settle();
    expect(sent).toEqual([]);
  });

  // Proof (2026-10-14): starting OrganizationPage with no loss whatever the
  // feature said mounted the panels, whose unstubbed reads failed, and this case
  // never found the inactive state.
  it('renders the organization page inactive without asking any panel', async () => {
    const sent = stubServer({});
    routed(OFF, <OrganizationPage nav={<nav />} account={<span />} />);
    expect(
      (await screen.findByText(/Organization administration is not active yet/)).textContent,
    ).toBeDefined();
    await settle();
    expect(sent).toEqual([]);
  });

  // Proof (2026-10-14): letting the list read and its polling run whatever the
  // feature said failed this case: `expected [ …(2) ] to deeply equal []`.
  it('renders spaces as needing an organization without asking for them', async () => {
    const sent = stubServer({});
    routed(OFF, <SpacesPage nav={null} account={null} />);
    expect((await screen.findByRole('alert')).textContent).toContain('Spaces need an organization');
    expect(screen.getByRole('link', { name: 'Open All projects' })).toBeDefined();
    window.dispatchEvent(new Event('focus'));
    await settle();
    expect(sent).toEqual([]);
  });
});

describe('surfaces of a backend that reports no features', () => {
  it('still asks onboarding and spaces, and renders their refusals', async () => {
    const sent = stubServer({
      'GET /api/onboarding': [() => answer(403, { error: 'onboarding_inactive' })],
      'GET /api/spaces': [() => answer(409, { error: 'organization_required' })],
    });
    routed(
      null,
      <OnboardingScreen onSignOut={() => undefined}>
        <SpacesPage nav={null} account={null} />
      </OnboardingScreen>,
    );
    expect((await screen.findByRole('alert')).textContent).toContain('Spaces need an organization');
    expect(sent.map(({ route }) => route)).toEqual(['GET /api/onboarding', 'GET /api/spaces']);
  });

  it('asks organizations when only onboarding is reported off', async () => {
    const sent = stubServer({
      'GET /api/spaces': [() => answer(200, { spaces: [], writable: false })],
    });
    routed({ onboarding: false, organizations: true }, <SpacesPage nav={null} account={null} />);
    expect(await screen.findByText('No spaces yet.')).toBeDefined();
    expect(sent.map(({ route }) => route)).toEqual(['GET /api/spaces']);
  });
});
