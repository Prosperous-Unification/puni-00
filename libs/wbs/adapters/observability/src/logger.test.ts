import { parseOrThrow } from '@wbs/validation';
import { describe, expect, it } from 'bun:test';

import { LogRecord } from './log-schema';
import { createLogger } from './logger';

interface LoggedLoss {
  readonly occurrence_id: string;
  readonly reported: false;
  readonly reason: string;
}

/**
 * Log two failures no report can be built for and read back both loss records.
 *
 * Asserts nothing about which layer produced the loss, so it holds both on an intact tree, where
 * `@shared/failures` returns it, and under the dependency fault of the guard's proof, where the
 * serializer's own fallback does.
 */
function twoLostReports(): [LoggedLoss, LoggedLoss] {
  const stream: string[] = [];
  const logger = createLogger({
    service: 'be-01',
    destination: {
      write: (chunk: string) => {
        stream.push(chunk);
      },
    },
  });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const revocable = Proxy.revocable({}, {});
    revocable.revoke();
    logger.error({ err: new Error('boom', { cause: revocable.proxy }) }, 'report lost');
  }
  const [first, second] = stream
    .slice(-2)
    .map((line) => parseOrThrow(LogRecord, JSON.parse(line) as Record<string, unknown>))
    .map((record) => record.err as LoggedLoss);
  return [first, second];
}

describe('createLogger', () => {
  it('emits an mcp-01 record conforming to the LogRecord schema', () => {
    const stream: string[] = [];
    const logger = createLogger({
      service: 'mcp-01',
      secrets: ['mcp-owned-secret'],
      destination: {
        write: (chunk: string) => {
          stream.push(chunk);
        },
      },
    });

    logger.error({ err: new Error('tool call failed') }, 'unexpected MCP tool failure');

    const parsed = parseOrThrow(LogRecord, JSON.parse(stream.at(-1)!) as Record<string, unknown>);
    expect(parsed.service).toBe('mcp-01');
    expect(parsed.msg).toBe('unexpected MCP tool failure');
  });

  it('emits records conforming to the LogRecord schema', () => {
    const stream: string[] = [];
    const logger = createLogger({
      service: 'be-01',
      version: 'test-sha',
      destination: {
        write: (chunk: string) => {
          stream.push(chunk);
        },
      },
    });

    logger.info({ request_id: 'req-1', user_id: 'u-1' }, 'hello');

    const record = JSON.parse(stream.at(-1)!) as Record<string, unknown>;
    const parsed = parseOrThrow(LogRecord, record);
    expect(parsed.service).toBe('be-01');
    expect(parsed.request_id).toBe('req-1');
    expect(parsed.msg).toBe('hello');
    expect(parsed.version).toBe('test-sha');
  });

  it('child logger inherits context', () => {
    const stream: string[] = [];
    const base = createLogger({
      service: 'gw-01',
      version: 'v1',
      destination: {
        write: (c: string) => {
          stream.push(c);
        },
      },
    });
    const child = base.child({ connection_id: 'c-1', ws_subscription: 'doc:abc' });
    child.warn('test');
    const rec = JSON.parse(stream.at(-1)!) as Record<string, unknown>;
    expect(rec['connection_id']).toBe('c-1');
    expect(rec['ws_subscription']).toBe('doc:abc');
  });

  it('logs a failure as the diagnostic report and validates against the schema', () => {
    const stream: string[] = [];
    const logger = createLogger({
      service: 'be-01',
      destination: {
        write: (chunk: string) => {
          stream.push(chunk);
        },
      },
    });

    logger.error(
      { err: new Error('outer', { cause: new TypeError('inner') }), request_id: 'req-9' },
      'operation failed',
    );

    const parsed = parseOrThrow(LogRecord, JSON.parse(stream.at(-1)!) as Record<string, unknown>);
    const failure = parsed.err as { occurrence_id: string; fingerprint?: string; v: string };
    expect(failure.v).toBe('corj/v0.15');
    expect(failure.occurrence_id).toMatch(/^AE_/);
    expect(failure.fingerprint).toMatch(/^fp1_/);
    expect(parsed.request_id).toBe('req-9');
  });

  it('reports an explicitly present undefined failure instead of dropping it', () => {
    const stream: string[] = [];
    const logger = createLogger({
      service: 'be-01',
      destination: {
        write: (chunk: string) => {
          stream.push(chunk);
        },
      },
    });
    const caught: unknown = undefined;

    logger.error({ err: caught, request_id: 'req-u' }, 'operation failed');

    const parsed = parseOrThrow(LogRecord, JSON.parse(stream.at(-1)!) as Record<string, unknown>);
    const failure = parsed.err as { occurrence_id: string; v: string } | undefined;
    expect(failure).toBeDefined();
    expect(failure?.occurrence_id).toMatch(/^AE_/);
  });

  it('reports the failure it was given, never a substitute', () => {
    const stream: string[] = [];
    const logger = createLogger({
      service: 'be-01',
      destination: {
        write: (chunk: string) => {
          stream.push(chunk);
        },
      },
    });

    logger.error({ err: new Error('the real failure') }, 'operation failed');

    expect(stream.at(-1)!).toContain('Error: the real failure');
  });

  it('leaves a record that carries no failure alone', () => {
    const stream: string[] = [];
    const logger = createLogger({
      service: 'be-01',
      destination: {
        write: (chunk: string) => {
          stream.push(chunk);
        },
      },
    });

    logger.info({ request_id: 'req-plain' }, 'nothing failed');

    const parsed = parseOrThrow(LogRecord, JSON.parse(stream.at(-1)!) as Record<string, unknown>);
    expect(parsed.err).toBeUndefined();
    expect(parsed.request_id).toBe('req-plain');
  });

  it('refuses a public report where the schema expects a failure record', () => {
    const publicReport = {
      level: 'error',
      time: 1,
      msg: 'operation failed',
      service: 'be-01',
      err: {
        v: 'appex/public/v4',
        occurrence_id: 'AE_1',
        code: 'INTERNAL_ERROR',
        message: 'Something went wrong',
      },
    };
    expect(() => parseOrThrow(LogRecord, publicReport)).toThrow(/\^corj\//);
  });

  it('accepts a failure record written before the report format moved', () => {
    const olderRecord = {
      level: 'error',
      time: 1,
      msg: 'operation failed',
      service: 'be-01',
      err: {
        v: 'corj/v0.14',
        occurrence_id: 'AE_1',
        fingerprint: 'fp1_00000000000000000000000000000000',
        stack: ['Error: stored before the move'],
      },
    };
    expect(parseOrThrow(LogRecord, olderRecord).err).toMatchObject({ v: 'corj/v0.14' });
  });

  it('refuses a reporting loss that names no reason', () => {
    const halfLoss = {
      level: 'error',
      time: 1,
      msg: 'operation failed',
      service: 'be-01',
      err: { occurrence_id: 'UNREPORTED_1', reported: false },
    };
    expect(() => parseOrThrow(LogRecord, halfLoss)).toThrow(/reason must be a string/);
  });

  it('scrubs a secret this process owns out of the failure line', () => {
    const stream: string[] = [];
    const logger = createLogger({
      service: 'be-01',
      secrets: ['hunter2'],
      destination: {
        write: (chunk: string) => {
          stream.push(chunk);
        },
      },
    });

    logger.error({ err: new Error('token was hunter2') }, 'operation failed');

    expect(stream.at(-1)!).not.toContain('hunter2');
  });

  it('writes a line rather than throwing when the failure cannot be read', () => {
    const stream: string[] = [];
    const logger = createLogger({
      service: 'gw-01',
      destination: {
        write: (chunk: string) => {
          stream.push(chunk);
        },
      },
    });
    const revocable = Proxy.revocable({}, {});
    revocable.revoke();

    logger.error({ err: new Error('boom', { cause: revocable.proxy }) }, 'unreadable failure');

    const parsed = parseOrThrow(LogRecord, JSON.parse(stream.at(-1)!) as Record<string, unknown>);
    const failure = parsed.err as { occurrence_id: string; reported: false; reason: string };
    expect(failure.reported).toBe(false);
    expect(failure.occurrence_id).toContain('UNREPORTED_');
  });

  it('gives two lost reports two different correlation handles', () => {
    const losses = twoLostReports();
    expect(losses[0].reported).toBe(false);
    expect(losses[1].reported).toBe(false);
    expect(losses[0].occurrence_id).not.toBe(losses[1].occurrence_id);
  });

  it('states one fixed reason on every lost report', () => {
    const losses = twoLostReports();
    expect(losses[0].reason).toBe(losses[1].reason);
    expect(losses[0].reason.length).toBeGreaterThan(0);
  });
});
