import { createHash, createHmac, randomInt, timingSafeEqual } from 'node:crypto';

import {
  type BrowserChallenge,
  browserCheckLifetimeMilliseconds,
  type BrowserCheckSolution,
} from '@website/contracts';

const keyLabel = 'puni-browser-check-v1';

function utcDayOf(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

/** The HMAC key of one minting day, derived from that day's source salt; nothing new is stored. */
function deriveKey(daySalt: Uint8Array): Buffer {
  return createHmac('sha256', daySalt).update(keyLabel).digest();
}

function sign(daySalt: Uint8Array, challenge: string): string {
  return createHmac('sha256', deriveKey(daySalt)).update(challenge).digest('hex');
}

/**
 * Mints a browser check bound to the first 16 hex characters of the claim hash. The salt is
 * `<claimPrefix>.<mintedUtcDay>.<expiresMs>.<maxnumber>.<random>`, the challenge is
 * SHA-256 of the salt and a secret number in `[0, maxnumber]`, and the signature is HMAC-SHA256
 * of the challenge under a key derived from the minting day's source salt, so blue and green
 * agree and the key dies with the salt. Writes nothing.
 */
export function mintBrowserCheck(
  claimHash: string,
  daySalt: Uint8Array,
  maxnumber: number,
  now: number,
): BrowserChallenge {
  const expiresMs = now + browserCheckLifetimeMilliseconds;
  const random = createHash('sha256')
    .update(crypto.getRandomValues(new Uint8Array(16)))
    .digest('hex')
    .slice(0, 8);
  const salt = `${claimHash.slice(0, 16)}.${utcDayOf(now)}.${String(expiresMs)}.${String(maxnumber)}.${random}`;
  const number = randomInt(0, maxnumber + 1);
  const challenge = createHash('sha256')
    .update(`${salt}${String(number)}`)
    .digest('hex');
  return {
    salt,
    challenge,
    signature: sign(daySalt, challenge),
    maxnumber,
    expiresAt: new Date(expiresMs).toISOString(),
  };
}

/** Why a posted check was refused; every reason answers the same `challenge_invalid`. */
export type BrowserCheckRefusal =
  'shape' | 'salt' | 'expired' | 'minting_day' | 'claim' | 'signature' | 'solution';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The posted `check`, validated at the API boundary, or null when its shape is wrong. */
export function readBrowserCheck(value: unknown): BrowserCheckSolution | null {
  if (!isRecord(value)) return null;
  const { salt, challenge, signature, number } = value;
  if (
    typeof salt !== 'string' ||
    salt.length > 200 ||
    typeof challenge !== 'string' ||
    !/^[0-9a-f]{64}$/.test(challenge) ||
    typeof signature !== 'string' ||
    !/^[0-9a-f]{64}$/.test(signature) ||
    typeof number !== 'number' ||
    !Number.isSafeInteger(number) ||
    number < 0
  )
    return null;
  return { salt, challenge, signature, number };
}

/**
 * Verifies a posted browser check for the caller's claim, in this order: shape, salt layout,
 * unexpired, minted today or yesterday (a day-old challenge is still verifiable because
 * yesterday's salt is kept), the claim prefix, the signature under the minting day's key
 * (constant time) and finally that SHA-256 of the salt and the number is the challenge. A
 * rewritten salt (another claim, a later expiry, a smaller `maxnumber`) no longer hashes to the
 * signed challenge.
 */
export function verifyBrowserCheck(
  posted: unknown,
  claimHash: string,
  now: number,
  readDaySalt: (utcDay: string) => Uint8Array,
): { kind: 'verified' } | { kind: 'invalid'; reason: BrowserCheckRefusal } {
  const check = readBrowserCheck(posted);
  if (!check) return { kind: 'invalid', reason: 'shape' };
  const parts = /^([0-9a-f]{16})\.(\d{4}-\d{2}-\d{2})\.(\d{1,15})\.(\d{1,9})\.([0-9a-f]{8})$/.exec(
    check.salt,
  );
  if (!parts) return { kind: 'invalid', reason: 'salt' };
  const [, claimPrefix, mintedDay, expiresText, maxnumberText] = parts;
  if (Number(expiresText) <= now) return { kind: 'invalid', reason: 'expired' };
  const yesterday = utcDayOf(now - 86_400_000);
  if (mintedDay !== utcDayOf(now) && mintedDay !== yesterday)
    return { kind: 'invalid', reason: 'minting_day' };
  // Proof: skipping this prefix check accepted the foreign-claim solution in browser-check.test.ts.
  if (claimPrefix !== claimHash.slice(0, 16)) return { kind: 'invalid', reason: 'claim' };
  const expected = Buffer.from(sign(readDaySalt(mintedDay), check.challenge), 'hex');
  // Proof: comparing only the first byte with === let the altered-signature check pass.
  if (!timingSafeEqual(expected, Buffer.from(check.signature, 'hex')))
    return { kind: 'invalid', reason: 'signature' };
  if (
    check.number > Number(maxnumberText) ||
    createHash('sha256')
      .update(`${check.salt}${String(check.number)}`)
      .digest('hex') !== check.challenge
  )
    return { kind: 'invalid', reason: 'solution' };
  return { kind: 'verified' };
}
