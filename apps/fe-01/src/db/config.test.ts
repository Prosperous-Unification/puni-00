import { describe, expect, it } from 'vitest';

import { createDbConfig } from './config';

describe('createDbConfig', () => {
  it('returns local-only adapter when mode=local', () => {
    const cfg = createDbConfig({ mode: 'local' });
    expect(cfg.mode).toBe('local');
    expect(cfg.server).toBeUndefined();
  });

  it('returns server adapter with WS url when mode=server', () => {
    const cfg = createDbConfig({
      mode: 'server',
      httpBaseUrl: 'http://be',
      wsUrl: 'ws://gw/ws',
      getJwt: () => Promise.resolve('token'),
    });
    expect(cfg.mode).toBe('server');
    expect(cfg.server?.wsUrl).toBe('ws://gw/ws');
  });

  it('throws if server mode missing required fields', () => {
    expect(() => createDbConfig({ mode: 'server', httpBaseUrl: 'http://be' })).toThrow(/server/);
  });
});
