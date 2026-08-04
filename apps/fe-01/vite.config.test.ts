import { describe, expect, it } from 'vitest';

import config from './vite.config';

// These assert deployment facts, not preferences. The dev server runs inside a
// container behind Caddy, so a localhost bind or a rejected Host header makes
// the dev site fail in a way that looks like a proxy misconfiguration.
describe('vite dev server config', () => {
  it('binds all interfaces so a reverse proxy outside the container can reach it', () => {
    expect(config.server?.host).toBe('0.0.0.0');
  });

  it('accepts the public dev hostname', () => {
    expect(config.server?.allowedHosts).toContain('dev.wbs.bulletpoints.club');
  });

  it('keeps port 4200 so the compose mapping and the Caddy upstream stay correct', () => {
    expect(config.server?.port).toBe(4200);
  });
});
