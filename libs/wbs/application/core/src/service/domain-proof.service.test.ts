import { createHash } from 'node:crypto';

import { describe, expect, test } from 'bun:test';

import {
  DomainDnsUnavailableError,
  type DomainProofChecks,
  type DomainResolver,
  type RetainedDomainProof,
} from '../ports/domain-challenges';
import { checkDomainProofs } from './domain-proof.service';

const TXT = `wbs-domain-verification=org-a:example.org:${'a'.repeat(64)}`;
const proof: RetainedDomainProof = {
  id: 'claim-a',
  organizationId: 'org-a',
  domain: 'example.org',
  proofDigest: createHash('sha256').update(TXT).digest('hex'),
  previousProofDigest: null,
  previousProofValidUntil: null,
  lastCheckedAt: 1,
};

function createChecks(lookupTxt: DomainResolver['lookupTxt']) {
  const completions: ('current' | 'previous' | null)[] = [];
  const checks: DomainProofChecks = {
    resolver: { lookupTxt },
    readDueProofs: () => Promise.resolve([proof]),
    finishProofCheck: (_proof, matched) => {
      completions.push(matched);
      return Promise.resolve('checked');
    },
  };
  return { checks, completions };
}

describe('retained proof DNS failure and cancellation', () => {
  test('returns partial counts without counting a cancelled completion as stale', async () => {
    const { checks } = createChecks(() => Promise.resolve([TXT]));
    checks.readDueProofs = () => Promise.resolve([proof, { ...proof, id: 'claim-b' }]);
    checks.finishProofCheck = (claim) =>
      Promise.resolve(claim.id === proof.id ? 'checked' : 'cancelled');
    expect(await checkDomainProofs(checks, 7)).toEqual({ checked: 1, stale: 0 });
  });

  test('preserves a completion failure after parent cancellation', async () => {
    const cancellation = new AbortController();
    const fault = new Error('completion gate failed');
    const { checks } = createChecks(() => Promise.resolve([TXT]));
    checks.finishProofCheck = () => {
      cancellation.abort();
      return Promise.reject(fault);
    };
    expect(
      await checkDomainProofs(checks, 7, () => 7, cancellation.signal).catch(
        (cause: unknown) => cause,
      ),
    ).toBe(fault);
  });

  test('records modeled DNS unavailability as a failed proof', async () => {
    const { checks, completions } = createChecks(() =>
      Promise.reject(new DomainDnsUnavailableError('DNS network unavailable')),
    );
    expect(await checkDomainProofs(checks, 7, () => 7)).toEqual({ checked: 1, stale: 0 });
    expect(completions).toEqual([null]);
  });

  test('propagates unexpected resolver failures without finishing the proof', async () => {
    const fault = new TypeError('broken resolver invariant');
    const { checks, completions } = createChecks(() => Promise.reject(fault));
    expect(await checkDomainProofs(checks, 7).catch((cause: unknown) => cause)).toBe(fault);
    expect(completions).toEqual([]);
  });

  test('pre-aborted cancellation starts no repository read', async () => {
    const cancellation = new AbortController();
    cancellation.abort();
    const { checks, completions } = createChecks(() => Promise.resolve([TXT]));
    checks.readDueProofs = () => Promise.reject(new Error('unexpected read after cancellation'));
    expect(await checkDomainProofs(checks, 7, () => 7, cancellation.signal)).toEqual({
      checked: 0,
      stale: 0,
    });
    expect(completions).toEqual([]);
  });

  test('cancellation during snapshot read starts no lookup or finish', async () => {
    const cancellation = new AbortController();
    const { checks, completions } = createChecks(() =>
      Promise.reject(new Error('unexpected lookup after cancellation')),
    );
    checks.readDueProofs = () => {
      cancellation.abort();
      return Promise.resolve([proof]);
    };
    expect(await checkDomainProofs(checks, 7, () => 7, cancellation.signal)).toEqual({
      checked: 0,
      stale: 0,
    });
    expect(completions).toEqual([]);
  });

  for (const records of [[], [TXT]]) {
    test(`cancellation before DNS reply commits no proof for ${String(records.length)} TXT records`, async () => {
      const cancellation = new AbortController();
      const { checks, completions } = createChecks(() => {
        cancellation.abort();
        return Promise.resolve(records);
      });
      expect(await checkDomainProofs(checks, 7, () => 7, cancellation.signal)).toEqual({
        checked: 0,
        stale: 0,
      });
      expect(completions).toEqual([]);
    });
  }

  test('parent abort joins a modeled DNS failure without recording a failed proof', async () => {
    const cancellation = new AbortController();
    const entered = Promise.withResolvers<AbortSignal>();
    const reply = Promise.withResolvers<readonly string[]>();
    const { checks, completions } = createChecks((_name, signal) => {
      entered.resolve(signal);
      return reply.promise;
    });
    const checking = checkDomainProofs(checks, 7, () => 7, cancellation.signal);
    const lookupSignal = await entered.promise;
    cancellation.abort();
    expect(lookupSignal.aborted).toBe(true);
    let settled = false;
    const observed = checking.then((counts) => {
      settled = true;
      return counts;
    });
    for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
    expect(settled).toBe(false);
    reply.reject(new DomainDnsUnavailableError('DNS lookup cancelled after cleanup'));
    expect(await observed).toEqual({ checked: 0, stale: 0 });
    expect(completions).toEqual([]);
  });

  test('delayed unexpected cleanup failure survives parent cancellation', async () => {
    const cancellation = new AbortController();
    const entered = Promise.withResolvers<undefined>();
    const reply = Promise.withResolvers<readonly string[]>();
    const fault = new Error('DNS resource cleanup failed');
    const { checks, completions } = createChecks(() => {
      entered.resolve(undefined);
      return reply.promise;
    });
    const checking = checkDomainProofs(checks, 7, () => 7, cancellation.signal);
    const observed = checking.catch((cause: unknown) => cause);
    await entered.promise;
    cancellation.abort();
    for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
    reply.reject(fault);
    expect(await observed).toBe(fault);
    expect(completions).toEqual([]);
  });
});
