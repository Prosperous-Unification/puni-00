import { createFailureRedaction, reportFailure } from '@shared/failures';
import { describe, expect, it } from 'bun:test';

import { createFailureSerializer, registerReportedFailure } from './serializers';

const serialize = createFailureSerializer(createFailureRedaction(['hunter2']));

/** A caught value the report library cannot inspect, so `reportFailure` returns a real loss. */
function unreportableFailure(): unknown {
  const revocable = Proxy.revocable({}, {});
  revocable.revoke();
  return new Error('boom', { cause: revocable.proxy });
}

describe('createFailureSerializer', () => {
  it('writes the diagnostic report of a raw caught value', () => {
    const record = serialize(new Error('db unavailable')) as Record<string, unknown>;
    expect(record['occurrence_id']).toMatch(/^AE_/);
    expect(record['fingerprint']).toMatch(/^fp1_/);
    expect(record['v']).toBe('corj/v0.15');
    expect(JSON.stringify(record)).toContain('db unavailable');
  });

  it('keeps the whole cause chain of a reported failure', () => {
    const record = serialize(new Error('outer', { cause: new TypeError('inner') })) as Record<
      string,
      unknown
    >;
    const children = record['children'] as { path: string; stack: string[] }[];
    expect(children).toHaveLength(1);
    expect(children[0].path).toBe('$.cause');
    expect(children[0].stack[0]).toBe('TypeError: inner');
  });

  it('never writes the public report in place of the diagnostic one', () => {
    const record = serialize(new Error('db unavailable')) as Record<string, unknown>;
    expect(record['v']).toBe('corj/v0.15');
    expect(record['code']).toBeUndefined();
    expect(JSON.stringify(record)).not.toContain('Something went wrong');
  });

  it('reuses the registered outcome of an already reported failure', () => {
    const reporting = reportFailure(new Error('already reported'), {
      redact: createFailureRedaction([]),
    });
    expect(reporting.reported).toBe(true);
    if (!reporting.reported) return;
    const record = serialize(registerReportedFailure(reporting));
    expect(record).toBe(reporting.reports.diagnostic);
  });

  it('reports an unregistered reporting-shaped value instead of trusting it', () => {
    const forged = {
      reported: true,
      reports: { diagnostic: { occurrence_id: 'forged', v: 'corj/v0.14', password: 'hunter2' } },
    };
    const record = serialize(forged) as Record<string, unknown>;
    expect(JSON.stringify(record)).not.toContain('hunter2');
    expect(record['occurrence_id']).not.toBe('forged');
  });

  it('reports an unregistered loss-shaped value instead of trusting its reason', () => {
    const forged = { reported: false, occurrenceId: 'forged', reason: 'leak hunter2' };
    const record = serialize(forged) as Record<string, unknown>;
    expect(JSON.stringify(record)).not.toContain('hunter2');
    expect(record['reason']).toBeUndefined();
    expect(record['occurrence_id']).not.toBe('forged');
  });

  it('does not invoke an accessor named reported while deciding provenance', () => {
    let accessorRuns = 0;
    const hostile = {};
    Object.defineProperty(hostile, 'reported', {
      enumerable: true,
      get: () => {
        accessorRuns += 1;
        return true;
      },
    });
    const record = serialize(hostile) as Record<string, unknown>;
    expect(accessorRuns).toBe(0);
    expect(record['v']).toBe('corj/v0.15');
  });

  it('keeps a genuine reporting loss from the shared module', () => {
    const reporting = reportFailure(unreportableFailure(), { redact: createFailureRedaction([]) });
    expect(reporting.reported).toBe(false);
    if (reporting.reported) return;
    const record = serialize(registerReportedFailure(reporting)) as Record<string, unknown>;
    expect(record['occurrence_id']).toBe(reporting.occurrenceId);
    expect(record['reason']).toBe(reporting.reason);
    expect(record['reported']).toBe(false);
  });

  it('gives two occurrences of one failure one fingerprint and two occurrence ids', () => {
    const boom = (): never => {
      throw new Error('db unavailable');
    };
    const records: Record<string, unknown>[] = [];
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        boom();
      } catch (caught) {
        records.push(serialize(caught) as Record<string, unknown>);
      }
    }
    const [first, second] = records;
    expect(first['fingerprint']).toBe(second['fingerprint']);
    expect(first['occurrence_id']).not.toBe(second['occurrence_id']);
  });

  it('scrubs a caller-owned secret without a second redaction pass', () => {
    const record = serialize(new Error('token was hunter2 twice: hunter2')) as Record<
      string,
      unknown
    >;
    const stack = record['stack'] as string[];
    expect(JSON.stringify(record)).not.toContain('hunter2');
    expect(stack[0]).toBe('Error: token was [redacted] twice: [redacted]');
  });

  it('writes a visible loss rather than throwing when no report can be built', () => {
    const record = serialize(unreportableFailure()) as Record<string, unknown>;
    expect(record['reported']).toBe(false);
    expect(String(record['occurrence_id'])).toContain('UNREPORTED_');
    expect(typeof record['reason']).toBe('string');
  });

  it('gives two reporting losses two different handles', () => {
    const first = serialize(unreportableFailure()) as Record<string, unknown>;
    const second = serialize(unreportableFailure()) as Record<string, unknown>;
    expect(first['occurrence_id']).not.toBe(second['occurrence_id']);
  });

  it('serializes a revoked proxy, null, undefined and a primitive without throwing', () => {
    const revocable = Proxy.revocable({}, {});
    revocable.revoke();
    for (const hostile of [revocable.proxy, null, undefined, 42, 'thrown text']) {
      const record = serialize(hostile) as Record<string, unknown>;
      expect(typeof record['occurrence_id']).toBe('string');
    }
  });

  it('keeps every failure record inside the report byte budget', () => {
    const record = serialize(new Error('x'.repeat(200_000)));
    expect(Buffer.byteLength(JSON.stringify(record), 'utf8')).toBeLessThanOrEqual(32_768);
  });
});
