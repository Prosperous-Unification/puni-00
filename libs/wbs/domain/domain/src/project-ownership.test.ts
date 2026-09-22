import { describe, expect, it } from 'bun:test';

import { canEditProject } from './project-ownership';

describe('canEditProject', () => {
  it('lets any account write an unrestricted project', () => {
    expect(canEditProject({ ownerId: 'ada', restricted: false }, 'grace')).toBe(true);
  });

  it('lets only the owner write a restricted project', () => {
    expect(canEditProject({ ownerId: 'ada', restricted: true }, 'ada')).toBe(true);
    expect(canEditProject({ ownerId: 'ada', restricted: true }, 'grace')).toBe(false);
  });
});
