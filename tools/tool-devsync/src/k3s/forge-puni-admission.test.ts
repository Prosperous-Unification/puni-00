import { expect, it } from 'bun:test';

import { planForgeAdmission, rootsOf, SOLVER_NODE_PATH } from './forge-admission';

const IMAGE = 'puni-f9-registry:5000/dev-environment@sha256:' + 'b'.repeat(64);
const WORKTREE = '/srv/puni/worktrees';
const INSTALLATIONS = '/srv/puni/puni-installations';

it('Forge claims an exact installation separately from its worktree mount permission', () => {
  const base = { forgeImage: IMAGE, baseRoots: [WORKTREE + '/puni-00'], owners: {}, installationOwners: {} };
  const claim: {
    kind: 'claim'; slug: string; root: string; image: string; installationRoot: string;
  } = {
    kind: 'claim', slug: 'alpha', root: WORKTREE + '/alpha', image: IMAGE,
    installationRoot: INSTALLATIONS + '/reviewed-alpha',
  };
  const claimed = planForgeAdmission(base, claim);
  expect(claimed.forgeImage).toBe(IMAGE);
  expect(claimed.owners).toEqual({ alpha: WORKTREE + '/alpha' });
  expect(rootsOf(claimed)).toEqual([WORKTREE + '/puni-00', WORKTREE + '/alpha', SOLVER_NODE_PATH]);
  expect(claimed).toMatchObject({
    installationOwners: { alpha: INSTALLATIONS + '/reviewed-alpha' },
  });
});

it('Forge releases only the departing installation claim while another environment retains its mount', () => {
  const held = {
    forgeImage: IMAGE, baseRoots: [WORKTREE + '/puni-00'],
    owners: { alpha: WORKTREE + '/alpha', beta: WORKTREE + '/beta' },
    installationOwners: { alpha: INSTALLATIONS + '/reviewed-alpha', beta: INSTALLATIONS + '/reviewed-beta' },
  };
  const released = planForgeAdmission(held, { kind: 'release', slug: 'alpha' });
  expect(released.owners).toEqual({ beta: WORKTREE + '/beta' });
  expect(rootsOf(released)).toEqual([WORKTREE + '/puni-00', WORKTREE + '/beta', SOLVER_NODE_PATH]);
  const expected = {
    ...held, owners: { beta: WORKTREE + '/beta' },
    installationOwners: { beta: INSTALLATIONS + '/reviewed-beta' },
  };
  expect(released).toEqual(expected);
});

it('Forge restores the original installation claim without reverting another environment', () => {
  const previous = {
    forgeImage: IMAGE, baseRoots: [WORKTREE + '/puni-00'],
    owners: { alpha: WORKTREE + '/alpha' },
    installationOwners: { alpha: INSTALLATIONS + '/reviewed-alpha' },
  };
  const changed = {
    ...previous,
    owners: { alpha: WORKTREE + '/alpha', beta: WORKTREE + '/beta' },
    installationOwners: { alpha: INSTALLATIONS + '/replacement-alpha', beta: INSTALLATIONS + '/reviewed-beta' },
  };
  const restored = planForgeAdmission(changed, { kind: 'restore', slug: 'alpha', previous });
  expect(restored.owners).toEqual(changed.owners);
  expect(rootsOf(restored)).toEqual([WORKTREE + '/puni-00', WORKTREE + '/beta', WORKTREE + '/alpha', SOLVER_NODE_PATH]);
  const expected = {
    ...changed,
    installationOwners: { alpha: INSTALLATIONS + '/reviewed-alpha', beta: INSTALLATIONS + '/reviewed-beta' },
  };
  expect(restored).toEqual(expected);
});
