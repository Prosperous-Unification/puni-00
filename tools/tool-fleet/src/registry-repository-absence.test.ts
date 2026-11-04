import { expect, test } from 'bun:test';

import { requireRegistryUnknownRepository } from './platform-registry';
import { requireRejection, requireResolution } from './registry-rejection.fixture';

const absence = {
  errors: [
    {
      code: 'NAME_UNKNOWN',
      message: 'repository name not known to registry',
      detail: { name: 'owned/image' },
    },
  ],
};
test('blob-only namespace check accepts only exact pinned named NAME_UNKNOWN404', async () => {
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: () => Response.json(absence, { status: 404 }),
  });
  try {
    expect(
      await requireResolution(
        requireRegistryUnknownRepository(
          { url: server.url.toString().replace(/\/$/, '') },
          'owned/image',
        ),
      ),
    ).toBeUndefined();
  } finally {
    await server.stop(true);
  }
});
for (const [name, status, body, link] of [
  ['successful error-shaped body', 200, absence, false],
  ['unavailable service', 503, absence, false],
  [
    'wrong repository',
    404,
    { errors: [{ ...absence.errors[0], detail: { name: 'foreign/image' } }] },
    false,
  ],
  ['generic404', 404, { error: 'not found' }, false],
  ['wrong code', 404, { errors: [{ ...absence.errors[0], code: 'MANIFEST_UNKNOWN' }] }, false],
  ['extra error', 404, { errors: [...absence.errors, ...absence.errors] }, false],
  ['trailing pagination', 404, absence, true],
] as const)
  test(`blob-only namespace check refuses ${name}`, async () => {
    const server = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      fetch: () =>
        Response.json(body, { status, headers: link ? { link: '</foreign>; rel="next"' } : {} }),
    });
    try {
      expect(
        (
          await requireRejection(
            requireRegistryUnknownRepository(
              { url: server.url.toString().replace(/\/$/, '') },
              'owned/image',
            ),
          )
        ).throwCause,
      ).toThrow();
    } finally {
      await server.stop(true);
    }
  });
