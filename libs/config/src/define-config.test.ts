import { type } from '@wbs/validation';
import { describe, expect, it } from 'bun:test';

import { defineConfig } from './define-config';
import { LogLevel, Port } from './env-schemas';

describe('defineConfig', () => {
  it('parses env overrides correctly', () => {
    const cfg = defineConfig(type({ PORT: 'string.integer.parse', LOG_LEVEL: "'info'|'debug'" }), {
      PORT: '3100',
      LOG_LEVEL: 'info',
    });
    expect(cfg.PORT).toBe(3100);
    expect(cfg.LOG_LEVEL).toBe('info');
  });

  it('throws with a clear message when env is invalid', () => {
    expect(() =>
      defineConfig(type({ PORT: 'string.integer.parse' }), { PORT: 'not-a-port' }),
    ).toThrow(/PORT/);
  });
});

describe('env-schemas', () => {
  it('Port accepts valid TCP ports', () => {
    const result = Port('3000');
    expect(result).toBe(3000);
  });

  it('Port rejects 0 and out-of-range values', () => {
    const tooHigh = Port('70000');
    expect(typeof tooHigh).toBe('object');
    const zero = Port('0');
    expect(typeof zero).toBe('object');
  });

  it('LogLevel accepts the known levels', () => {
    expect(LogLevel('info')).toBe('info');
  });
});
