import { expect, test } from 'bun:test';
import { decodeJwt } from 'jose';

import { joseTokenCodec } from './bun-runtime';

test('two native sessions issued in one second have distinct credential identities', async () => {
  const codec = joseTokenCodec('a'.repeat(64));
  const claims = { subject: 'user-1', username: 'ada' };
  const first = await codec.sign(claims, 3600);
  const second = await codec.sign(claims, 3600);

  expect(first).not.toBe(second);
  expect(decodeJwt(first).jti).toBeString();
  expect(decodeJwt(second).jti).toBeString();
  expect(await codec.verify(first)).toEqual(claims);
});
