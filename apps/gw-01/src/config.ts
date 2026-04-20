import { defineConfig } from '@wbs/config';
import { type } from '@wbs/validation';

export const GwConfig = type({
  PORT: 'string.integer.parse',
  LOG_LEVEL: "'trace'|'debug'|'info'|'warn'|'error'|'fatal'",
  BE_URL: 'string',
  INTERNAL_AUTH_SECRET: 'string>=32',
  JWT_SIGNING_KEY_CURRENT: 'string>=32',
  'JWT_SIGNING_KEY_PREVIOUS?': 'string>=32',
});
export type GwConfig = typeof GwConfig.infer;

export const loadConfig = (): GwConfig => defineConfig(GwConfig);
