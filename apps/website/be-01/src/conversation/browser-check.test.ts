import { solveBrowserCheck } from '@website/contracts';
import { expect, test } from 'bun:test';

import { mintBrowserCheck, verifyBrowserCheck } from './browser-check';

const now = Date.UTC(2026, 9, 7, 12, 0, 0);
const claimHash = 'c'.repeat(64);
const salts = new Map<string, Uint8Array>([
  ['2026-10-06', new Uint8Array(32).fill(6)],
  ['2026-10-07', new Uint8Array(32).fill(7)],
  ['2026-10-05', new Uint8Array(32).fill(5)],
]);
function readDaySalt(utcDay: string): Uint8Array {
  const salt = salts.get(utcDay);
  if (!salt) throw new Error(`No salt for ${utcDay}`);
  return salt;
}

function solved(mintedAt = now, maxnumber = 2_000) {
  const challenge = mintBrowserCheck(
    claimHash,
    readDaySalt(new Date(mintedAt).toISOString().slice(0, 10)),
    maxnumber,
    mintedAt,
  );
  const number = solveBrowserCheck(challenge.salt, challenge.challenge, challenge.maxnumber);
  if (number === null) throw new Error('The minted challenge has no solution');
  return { ...challenge, number };
}

test('a minted challenge is bound to its claim, signed and solvable', () => {
  const first = mintBrowserCheck(claimHash, readDaySalt('2026-10-07'), 200_000, now);
  const second = mintBrowserCheck(claimHash, readDaySalt('2026-10-07'), 200_000, now);
  expect(
    first.salt.startsWith(`${'c'.repeat(16)}.2026-10-07.${String(now + 30 * 60_000)}.200000.`),
  ).toBe(true);
  expect(first.expiresAt).toBe('2026-10-07T12:30:00.000Z');
  expect(first.challenge).not.toBe(second.challenge);
  const check = solved();
  expect(verifyBrowserCheck(check, claimHash, now, readDaySalt)).toEqual({ kind: 'verified' });
  // A challenge minted late yesterday still verifies just after midnight.
  const lateYesterday = Date.UTC(2026, 9, 6, 23, 50);
  expect(
    verifyBrowserCheck(solved(lateYesterday), claimHash, Date.UTC(2026, 9, 7, 0, 10), readDaySalt),
  ).toEqual({ kind: 'verified' });
});

test('every tampered or foreign solution is refused with its reason', () => {
  const check = solved();
  const refuse = (posted: unknown, at = now) =>
    verifyBrowserCheck(posted, claimHash, at, readDaySalt);
  expect(refuse({ ...check, number: check.number + 1 })).toEqual({
    kind: 'invalid',
    reason: 'solution',
  });
  const flipped = (check.signature.startsWith('0') ? '1' : '0') + check.signature.slice(1);
  expect(refuse({ ...check, signature: flipped })).toEqual({
    kind: 'invalid',
    reason: 'signature',
  });
  const lastFlipped = check.signature.slice(0, 63) + (check.signature[63] === '0' ? '1' : '0');
  expect(refuse({ ...check, signature: lastFlipped })).toEqual({
    kind: 'invalid',
    reason: 'signature',
  });
  expect(verifyBrowserCheck(check, 'd'.repeat(64), now, readDaySalt)).toEqual({
    kind: 'invalid',
    reason: 'claim',
  });
  expect(refuse(check, now + 30 * 60_000)).toEqual({ kind: 'invalid', reason: 'expired' });
  // Minted two days back, with its expiry rewritten forward: refused by its minting day.
  const old = solved(Date.UTC(2026, 9, 5, 23, 59));
  const [prefix, mintedDay, , maxnumber, random] = old.salt.split('.');
  const unexpired = [prefix, mintedDay, String(Date.UTC(2026, 9, 7, 1)), maxnumber, random].join(
    '.',
  );
  expect(
    verifyBrowserCheck(
      { ...old, salt: unexpired },
      claimHash,
      Date.UTC(2026, 9, 7, 0, 10),
      readDaySalt,
    ),
  ).toEqual({ kind: 'invalid', reason: 'minting_day' });
  // A smaller maxnumber rewritten into the salt no longer hashes to the signed challenge.
  const lowered = check.salt.replace('.2000.', '.10.');
  expect(refuse({ ...check, salt: lowered })).toEqual({ kind: 'invalid', reason: 'solution' });
  expect(refuse({ ...check, number: '12' })).toEqual({ kind: 'invalid', reason: 'shape' });
  expect(refuse(null)).toEqual({ kind: 'invalid', reason: 'shape' });
});
