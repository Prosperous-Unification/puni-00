import { createHash } from 'node:crypto';

import { describe, expect, it } from 'bun:test';

import { bodySha256, verifyBody } from './saved-plan-integrity';

/**
 * Task 5.1b, without a database.
 *
 * The `.db` half of this slice proves the check runs on the real read path; this
 * half proves the check itself distinguishes the states, including two a
 * database is awkward to be made to produce. Both exist because a verification
 * that is only ever exercised through a service is a verification whose failing
 * branches are exercised once each, by whichever fault the harness could stage.
 */
describe('verifyBody', () => {
  const BYTES = '{"schemaVersion":1,"items":[{"id":"wi-1"}]}';

  it('accepts bytes whose recomputed digest is the stored one', () => {
    expect(verifyBody('sp-1', 'input', BYTES, bodySha256(BYTES))).toBeNull();
  });

  it('names the plan and the body when the digest disagrees', () => {
    const stored = bodySha256(`${BYTES} `);
    const refusal = verifyBody('sp-1', 'schedule', BYTES, stored);
    expect(refusal).toEqual({
      reason: 'body_hash_mismatch',
      savedPlanId: 'sp-1',
      body: 'schedule',
      stored,
      recomputed: bodySha256(BYTES),
    });
  });

  it('reports an absent body as absent rather than as a hash fault', () => {
    // The distinction 5.1b's refusal type exists for. A cascade that removed the
    // body row and a disk fault that rewrote it are different incidents, and a
    // reader told "hash mismatch" for the first would go looking for corruption
    // in bytes that are not there at all.
    expect(verifyBody('sp-1', 'input', null, bodySha256(BYTES))).toEqual({
      reason: 'body_missing',
      savedPlanId: 'sp-1',
      body: 'input',
    });
  });

  it('refuses an empty body against a real digest instead of treating it as absent', () => {
    // The other half of that distinction, and the one a `!bytes` test would get
    // wrong: `''` is a row that exists and holds nothing, which is a fault about
    // the bytes, not about the row.
    const refusal = verifyBody('sp-1', 'input', '', bodySha256(BYTES));
    expect(refusal?.reason).toBe('body_hash_mismatch');
  });

  it('hashes over utf8 bytes, so a multi-byte character is not two code units', () => {
    // `bodyByteLength` names the same encoding for the same reason. A digest
    // taken under a different one would refuse every plan whose names are not
    // ASCII — which is most of them — and pass every test written in ASCII.
    const emoji = '{"name":"🛠"}';
    const utf8 = createHash('sha256').update(Buffer.from(emoji, 'utf8')).digest('hex');
    const latin1 = createHash('sha256').update(Buffer.from(emoji, 'latin1')).digest('hex');
    // The control: the two encodings really do disagree on this string, so the
    // assertion below is about the encoding and not about two spellings of one
    // buffer.
    expect(utf8).not.toBe(latin1);
    expect(bodySha256(emoji)).toBe(utf8);
  });
});
