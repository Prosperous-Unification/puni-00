import { inspect } from 'node:util';

import { describe, expect, it } from 'bun:test';

import { authenticatesClient, issueClientSecret, presentedClientOf } from './consent-client';

function form(fields: Record<string, string | readonly string[]>): FormData {
  const body = new FormData();
  for (const [name, value] of Object.entries(fields))
    for (const each of typeof value === 'string' ? [value] : value) body.append(name, each);
  return body;
}

const basic = (user: string, password: string) => `Basic ${btoa(`${user}:${password}`)}`;

describe('presentedClientOf', () => {
  it('reads none, client_secret_post and client_secret_basic', () => {
    expect(presentedClientOf(form({ client_id: 'c1' }), null)).toEqual({
      clientId: 'c1',
      method: 'none',
      secret: undefined,
    });
    const post = presentedClientOf(form({ client_id: 'c1', client_secret: 's1' }), null);
    expect(post).toMatchObject({ clientId: 'c1', method: 'client_secret_post' });
    const viaBasic = presentedClientOf(form({}), basic('c1', 's1'));
    expect(viaBasic).toMatchObject({ clientId: 'c1', method: 'client_secret_basic' });
    // A body client_id equal to the Basic user is the same client.
    expect(presentedClientOf(form({ client_id: 'c1' }), basic('c1', 's1'))).toMatchObject({
      clientId: 'c1',
    });
  });

  it('refuses two methods, a repeated field and a Basic user unlike the body client_id invalid_request', () => {
    expect(presentedClientOf(form({ client_secret: 's1' }), basic('c1', 's1'))).toBe(
      'invalid_request',
    );
    expect(presentedClientOf(form({ client_id: ['c1', 'c2'] }), null)).toBe('invalid_request');
    expect(presentedClientOf(form({ client_id: 'c1', client_secret: ['a', 'b'] }), null)).toBe(
      'invalid_request',
    );
    expect(presentedClientOf(form({ client_id: 'c2' }), basic('c1', 's1'))).toBe('invalid_request');
    const file = new FormData();
    file.append('client_secret', new Blob(['s1']));
    expect(presentedClientOf(file, null)).toBe('invalid_request');
  });

  it('refuses a client_assertion and a non-Basic Authorization header invalid_client', () => {
    expect(presentedClientOf(form({ client_id: 'c1', client_assertion: 'x.y.z' }), null)).toBe(
      'invalid_client',
    );
    expect(presentedClientOf(form({ client_id: 'c1' }), 'Bearer token')).toBe('invalid_client');
    // RFC 6749 §2.3.1: Basic names the client; an empty user is no body client_id's stand-in.
    expect(presentedClientOf(form({}), basic('', 's1'))).toBe('invalid_client');
    expect(presentedClientOf(form({ client_id: 'c1' }), basic('', 's1'))).toBe('invalid_client');
    expect(presentedClientOf(form({ client_id: 'c1' }), 'Basic bm9jb2xvbg==')).toBe(
      'invalid_client',
    );
  });

  it('never prints the presented secret', () => {
    const presented = presentedClientOf(form({ client_id: 'c1', client_secret: 'hunter2' }), null);
    expect(JSON.stringify(presented)).not.toContain('hunter2');
    expect(inspect(presented)).not.toContain('hunter2');
    expect(Bun.inspect(presented)).not.toContain('hunter2');
  });
});

describe('authenticatesClient', () => {
  it('accepts only the registered method and secret', () => {
    const { secret, authentication } = issueClientSecret('client_secret_post');
    const presented = (fields: Record<string, string>, authorization: string | null = null) => {
      const read = presentedClientOf(form(fields), authorization);
      if (typeof read === 'string') throw new Error(read);
      return read;
    };
    expect(
      authenticatesClient(authentication, presented({ client_id: 'c', client_secret: secret })),
    ).toBe(true);
    expect(
      authenticatesClient(authentication, presented({ client_id: 'c', client_secret: 'no' })),
    ).toBe(false);
    expect(authenticatesClient(authentication, presented({ client_id: 'c' }))).toBe(false);
    expect(authenticatesClient(authentication, presented({}, basic('c', secret)))).toBe(false);
    expect(authenticatesClient({ method: 'none' }, presented({ client_id: 'c' }))).toBe(true);
    expect(
      authenticatesClient({ method: 'none' }, presented({ client_id: 'c', client_secret: secret })),
    ).toBe(false);
  });

  it('keeps only a digest of the issued secret', () => {
    const { secret, authentication } = issueClientSecret('client_secret_basic');
    expect(secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(JSON.stringify(authentication)).not.toContain(secret);
    expect(authentication).toMatchObject({ method: 'client_secret_basic' });
  });
});
