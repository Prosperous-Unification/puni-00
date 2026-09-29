import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { answerEmpty, answerJson as answer, stubServer } from '@/testing/stub-server';

import { SpacesPage } from './spaces-page';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function routed(ui: ReactNode) {
  const root = createRootRoute({ component: () => ui });
  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: ['/spaces'] }),
  });
  render(<RouterProvider router={router} />);
}

const space = (id: string, name: string, projectCount = 0) => ({
  id,
  name,
  virtual: false,
  projectCount,
  revision: 0,
  createdById: 'u',
  createdAt: 1,
});

describe('the spaces page', () => {
  it('lists All projects first, then the spaces, and creates one', async () => {
    const sent = stubServer({
      'GET /api/spaces': [
        () => answer(200, { spaces: [space('s1', 'Launch', 2)], writable: true }),
        () =>
          answer(200, { spaces: [space('s1', 'Launch', 2), space('s2', 'Q3')], writable: true }),
      ],
      'POST /api/spaces': [() => answer(201, { space: space('s2', 'Q3') })],
    });
    routed(<SpacesPage nav={null} account={null} />);
    const list = await screen.findByRole('list', { name: 'Spaces' });
    await within(list).findByRole('link', { name: 'Launch' });
    expect(
      within(list)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['All projects', 'Launch']);
    expect(list.textContent).toContain('2 projects');
    fireEvent.change(screen.getByLabelText('New space'), { target: { value: ' Q3 ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(await screen.findByText('Created Q3.')).toBeDefined();
    expect(sent.find(({ route }) => route === 'POST /api/spaces')?.body).toEqual({ name: ' Q3 ' });
    await within(list).findByRole('link', { name: 'Q3' });
  });

  it('offers a viewer no create, rename or delete', async () => {
    // Proof, observed 2026-09-29: with the create form drawn whatever
    // `writable` said, the viewer's page held the `New space` field.
    stubServer({
      'GET /api/spaces': [() => answer(200, { spaces: [space('s1', 'Launch')], writable: false })],
    });
    routed(<SpacesPage nav={null} account={null} />);
    await screen.findByRole('link', { name: 'Launch' });
    expect(screen.queryByLabelText('New space')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Rename Launch' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete Launch' })).toBeNull();
  });

  it('renames and deletes, saying a refusal in place', async () => {
    stubServer({
      'GET /api/spaces': [
        () => answer(200, { spaces: [space('s1', 'Launch'), space('s2', 'Q3')], writable: true }),
      ],
      'PATCH /api/spaces/s1': [() => answer(409, { error: 'name_taken' })],
      'DELETE /api/spaces/s2': [() => answerEmpty(204)],
    });
    routed(<SpacesPage nav={null} account={null} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Rename Launch' }));
    fireEvent.change(screen.getByLabelText('New name for Launch'), { target: { value: 'Q3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Another space already has that name.')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Delete Q3' }));
    expect(await screen.findByText('Deleted Q3. Its projects are unchanged.')).toBeDefined();
  });

  it('renders the loading, empty and organization_required states', async () => {
    stubServer({ 'GET /api/spaces': [() => answer(200, { spaces: [], writable: true })] });
    routed(<SpacesPage nav={null} account={null} />);
    expect(await screen.findByText('Loading spaces…')).toBeDefined();
    expect(await screen.findByText('No spaces yet.')).toBeDefined();
    cleanup();
    stubServer({ 'GET /api/spaces': [() => answer(409, { error: 'organization_required' })] });
    routed(<SpacesPage nav={null} account={null} />);
    expect((await screen.findByRole('alert')).textContent).toContain('Spaces need an organization');
    expect(screen.getByRole('link', { name: 'All projects' })).toBeDefined();
  });
});
