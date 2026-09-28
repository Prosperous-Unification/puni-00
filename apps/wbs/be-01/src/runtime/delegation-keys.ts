import { importPKCS8, importSPKI } from 'jose';

import type { DelegationKeys } from '../config';

/** Imported dedicated RSA keys, validated before the listener starts. */
export interface ImportedDelegationKeys {
  readonly signingKey: CryptoKey;
  readonly verifyKey: CryptoKey;
}

/** Validates literal PEMs, RSA strength and that the public key matches the private key. */
export async function importDelegationKeys(keys: DelegationKeys): Promise<ImportedDelegationKeys> {
  if (
    !keys.signingKey.startsWith('-----BEGIN PRIVATE KEY-----') ||
    !keys.verifyKey.startsWith('-----BEGIN PUBLIC KEY-----')
  ) {
    throw new Error('delegation keys must be PKCS#8 and SPKI PEM');
  }
  const signingKey = await importPKCS8(keys.signingKey, 'RS256');
  const verifyKey = await importSPKI(keys.verifyKey, 'RS256');
  if (
    !(signingKey instanceof CryptoKey) ||
    !(verifyKey instanceof CryptoKey) ||
    signingKey.algorithm.name !== 'RSASSA-PKCS1-v1_5' ||
    verifyKey.algorithm.name !== 'RSASSA-PKCS1-v1_5'
  ) {
    throw new Error('delegation keys must be RSA');
  }
  // The WebCrypto algorithm boundary is known to be RSA after the name check.
  const signingAlgorithm = signingKey.algorithm as RsaHashedKeyAlgorithm;
  const verifyAlgorithm = verifyKey.algorithm as RsaHashedKeyAlgorithm;
  // Proof: removing this threshold made `refuses a 1024-bit RSA pair and a
  // non-RSA pair` accept the 1024-bit pair (2026-09-28).
  if (signingAlgorithm.modulusLength < 2048 || verifyAlgorithm.modulusLength < 2048) {
    throw new Error('delegation RSA keys must be at least 2048 bits');
  }
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', signingKey, challenge);
  // Proof: skipping this match admitted two independent RSA pairs in
  // `accepts a matching dedicated RSA pair and refuses a mismatch` (2026-09-28).
  if (!(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', verifyKey, signature, challenge))) {
    throw new Error('delegation signing and verification keys do not match');
  }
  return { signingKey, verifyKey };
}
