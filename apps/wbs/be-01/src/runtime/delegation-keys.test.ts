import { expect, it } from 'bun:test';
import { exportPKCS8, exportSPKI, generateKeyPair } from 'jose';

import { importDelegationKeys } from './delegation-keys';

it('accepts a matching dedicated RSA pair and refuses a mismatch', async () => {
  const first = await generateKeyPair('RS256', { extractable: true });
  const second = await generateKeyPair('RS256', { extractable: true });
  const signingKey = await exportPKCS8(first.privateKey);
  const verifyKey = await exportSPKI(first.publicKey);
  expect(await importDelegationKeys({ signingKey, verifyKey })).toHaveProperty('signingKey');
  let mismatch: unknown;
  try {
    await importDelegationKeys({ signingKey, verifyKey: await exportSPKI(second.publicKey) });
  } catch (failure) {
    mismatch = failure;
  }
  expect(mismatch).toBeInstanceOf(Error);
  let malformed: unknown;
  try {
    await importDelegationKeys({ signingKey: 'bad', verifyKey });
  } catch (failure) {
    malformed = failure;
  }
  expect(malformed).toBeInstanceOf(Error);
});

it('refuses a 1024-bit RSA pair and a non-RSA pair', async () => {
  const weak = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 1024,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  );
  const nonRsa = await generateKeyPair('ES256', { extractable: true });
  for (const keys of [weak, nonRsa]) {
    let failure: unknown;
    try {
      await importDelegationKeys({
        signingKey: await exportPKCS8(keys.privateKey),
        verifyKey: await exportSPKI(keys.publicKey),
      });
    } catch (caught) {
      failure = caught;
    }
    expect(failure).toBeInstanceOf(Error);
  }
});
