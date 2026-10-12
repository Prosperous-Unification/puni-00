import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { issueToken, openScimWorld, scim, scimUser, type ScimWorld } from '../testing/scim-fixture';

const UNKNOWN = `wbs_scim_${'A'.repeat(43)}`;
let world: ScimWorld;

beforeEach(async () => {
  world = await openScimWorld();
});

afterEach(() => {
  world.h.close();
});

/** A POST whose body stream records whether anything pulled from it. */
function watchedPost(token: string, text: string) {
  let pulled = false;
  const body = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        pulled = true;
        controller.enqueue(new TextEncoder().encode(text));
        controller.close();
      },
      // No pull until a reader asks: a queue of zero is not filled eagerly.
    },
    { highWaterMark: 0 },
  );
  const request = new Request('http://localhost/scim/v2/Users', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/scim+json' },
    body,
    // Bun needs `duplex` for a streamed request body.
    duplex: 'half',
  } as RequestInit);
  return { request, pulled: () => pulled };
}

/**
 * A SCIM body is read only after the bearer token authenticates and is
 * admitted, and never past `SCIM_MOST_BODY_BYTES` (`organization-scim`).
 */
describe('the SCIM request body', () => {
  it('reads no body before the bearer token authenticates', async () => {
    const watched = watchedPost(UNKNOWN, JSON.stringify(scimUser('carol@acme.test')));
    const response = await world.h.app.handle(watched.request);
    expect(response.status).toBe(401);
    expect(watched.pulled()).toBe(false);
  });

  // Proof: reading without the byte bound (`request.text()` inside
  // `readBoundedText`) made both of these provision carol (201) instead of
  // 413; watched 2026-10-12.
  it('refuses a body over the bound 413 and stores nothing', async () => {
    const { token } = await issueToken(world.h, 'ada');
    const oversized = JSON.stringify(scimUser('carol@acme.test', { padding: 'x'.repeat(70_000) }));
    const answered = await scim(world.h, token, 'POST', '/scim/v2/Users', oversized);
    expect(answered.status).toBe(413);
    expect(answered.body).toMatchObject({ status: '413', detail: 'body_too_large' });
    const streamed = await world.h.app.handle(watchedPost(token, oversized).request);
    expect(streamed.status).toBe(413);
    expect(
      world.h.sqlite
        .query("SELECT id FROM organization_scim_user WHERE user_name = 'carol@acme.test'")
        .all(),
    ).toEqual([]);
  });
});
