import { createFailureRedaction } from '@shared/failures';
import type { Logger } from '@wbs/contracts';
import pino, { type LoggerOptions } from 'pino';

import { createFailureSerializer, keepAbsentFailure } from './serializers';

export { type Logger, noopLogger } from '@wbs/contracts';

export type ServiceName = 'be-01' | 'gw-01' | 'fe-01';

export interface CreateLoggerOptions {
  service: ServiceName;
  version?: string;
  level?: string;
  destination?: { write(chunk: string): void };
  /**
   * The secret values this process owns, scrubbed from every failure record as text. Only what
   * the caller actually holds: a secret nobody named cannot be detected, and a whole config,
   * request or environment object is never passed.
   */
  secrets?: readonly string[];
}

export function createLogger(opts: CreateLoggerOptions): Logger {
  const level = opts.level ?? process.env['LOG_LEVEL'] ?? 'info';
  // One policy per logger, built once: `@shared/failures` caches one report maker per policy,
  // and a policy rebuilt per record would throw that cache away on every failure.
  const redact = createFailureRedaction(opts.secrets ?? []);
  const base: Record<string, unknown> = { service: opts.service };
  if (opts.version) base['version'] = opts.version;

  const options: LoggerOptions = {
    level,
    base,
    timestamp: () => `,"time":${String(Date.now())}`,
    serializers: { err: createFailureSerializer(redact) },
    formatters: {
      level: (label: string) => ({ level: label }),
      log: (fields: Record<string, unknown>) => keepAbsentFailure(fields, redact),
    },
  };

  return opts.destination ? pino(options, opts.destination) : pino(options);
}
