import { describe, expect, it } from 'bun:test';

import { needsRestart, RESTART_PATHS } from './sync';

describe('needsRestart', () => {
  it('does not restart when nothing in the manifest changed', () => {
    expect(needsRestart({ 'bun.lock': 'a' }, { 'bun.lock': 'a' })).toBe(false);
  });

  it('restarts when the lockfile moved, because bun install must run', () => {
    expect(needsRestart({ 'bun.lock': 'a' }, { 'bun.lock': 'b' })).toBe(true);
  });

  // A migration is not imported by any watched module, so bun --watch never
  // sees it. Without this, dev serves new code against the old schema and
  // reports success -- be-01 sets migrationsApplied=true regardless.
  it('restarts when a migration appeared', () => {
    expect(needsRestart({ 'apps/be-01/drizzle': 'a' }, { 'apps/be-01/drizzle': 'b' })).toBe(true);
  });

  // The Nx supervisor reads these once at startup. A changed port, command or
  // serve target leaves the old topology running while HEAD moves on.
  it('restarts when a serve target changed', () => {
    expect(
      needsRestart({ 'apps/be-01/project.json': 'a' }, { 'apps/be-01/project.json': 'b' }),
    ).toBe(true);
  });

  it('restarts when the root dev script changed', () => {
    expect(needsRestart({ 'package.json': 'a' }, { 'package.json': 'b' })).toBe(true);
  });

  // Missing evidence is not evidence of absence. Guessing "nothing to do" is
  // how dev keeps serving against a stale schema or stale dependencies.
  it('restarts when a hash was unreadable before', () => {
    expect(needsRestart({ 'bun.lock': '' }, { 'bun.lock': 'b' })).toBe(true);
  });

  it('restarts when a hash was unreadable after', () => {
    expect(needsRestart({ 'bun.lock': 'a' }, { 'bun.lock': '' })).toBe(true);
  });

  it('restarts when a manifest entry appeared that was not there before', () => {
    expect(needsRestart({}, { 'bun.lock': 'b' })).toBe(true);
  });

  it('restarts when a manifest entry disappeared', () => {
    expect(needsRestart({ 'bun.lock': 'a' }, {})).toBe(true);
  });

  it('watches the paths that cannot reach a running process any other way', () => {
    expect(RESTART_PATHS).toContain('bun.lock');
    expect(RESTART_PATHS).toContain('apps/be-01/drizzle');
    expect(RESTART_PATHS).toContain('package.json');
    expect(RESTART_PATHS).toContain('apps/fe-01/vite.config.ts');
  });
});
