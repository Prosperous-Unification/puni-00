import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';

/**
 * The proof-of-work range: the server picks the secret number in `[0, maxnumber]`, so solving
 * takes `maxnumber / 2` SHA-256 hashes on average. `elevated` applies once the site's UTC-day spend
 * reaches half the ceiling. Shared by the API that mints and the browser that solves.
 */
export const browserCheckDifficulty = { normal: 200_000, elevated: 1_000_000 } as const;

/** How long a minted challenge stays verifiable. */
export const browserCheckLifetimeMilliseconds = 30 * 60_000;

/** `GET /conversation` `challenge`: the signed puzzle for this claim's first paid reply. */
export interface BrowserChallenge {
  salt: string;
  challenge: string;
  signature: string;
  maxnumber: number;
  /** ISO-8601 expiry, also carried inside the salt. */
  expiresAt: string;
}

/** The initial operation's `check`: the challenge as minted plus the found number. */
export interface BrowserCheckSolution {
  salt: string;
  challenge: string;
  signature: string;
  number: number;
}

/** Lower-case hex SHA-256 of the salt followed by the decimal number. */
export function hashBrowserCheck(salt: string, number: number): string {
  return bytesToHex(sha256(utf8ToBytes(`${salt}${String(number)}`)));
}

/**
 * Finds the number in `[0, maxnumber]` whose {@link hashBrowserCheck} equals `challenge`, counting
 * up from zero with a synchronous SHA-256, or returns null when none does (a tampered or foreign
 * challenge). Runs in a Web Worker in the browser; the evaluation CLI and fixtures call it directly.
 *
 * @throws when `challenge` is not 64 hex characters or `maxnumber` is not a nonnegative integer.
 */
export function solveBrowserCheck(
  salt: string,
  challenge: string,
  maxnumber: number,
): number | null {
  if (!/^[0-9a-f]{64}$/.test(challenge))
    throw new Error('Browser check challenge is not SHA-256 hex');
  if (!Number.isSafeInteger(maxnumber) || maxnumber < 0)
    throw new Error('Browser check maxnumber must be a nonnegative integer');
  const target = hexToBytes(challenge);
  const prefix = utf8ToBytes(salt);
  for (let number = 0; number <= maxnumber; number += 1) {
    const digits = utf8ToBytes(String(number));
    const input = new Uint8Array(prefix.length + digits.length);
    input.set(prefix);
    input.set(digits, prefix.length);
    const digest = sha256(input);
    let isMatch = true;
    for (let index = 0; index < 32; index += 1)
      if (digest[index] !== target[index]) {
        isMatch = false;
        break;
      }
    if (isMatch) return number;
  }
  return null;
}
