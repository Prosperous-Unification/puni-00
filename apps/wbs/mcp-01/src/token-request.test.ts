import { inspect } from 'node:util';

import { newMachineKey } from '@wbs/core';
import { describe, expect, it } from 'bun:test';
import { SignJWT } from 'jose';

import {
  CLIENT_CREDENTIALS_GRANT,
  Concealed,
  JWT_BEARER_GRANT,
  parseMachineTokenRequest,
} from './token-request';

const RESOURCE = 'https://wbs.example/mcp';
const CREDENTIAL = '0b7c2f8e-3a41-4c55-9f0e-1d2e3f405162';
const OTHER_CREDENTIAL = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';

/** A whole API key minted at run time: the plaintext-secrets hook refuses a key literal. */
const KEY = newMachineKey(CREDENTIAL).key;

function form(fields: readonly (readonly [string, string])[]): FormData {
  const body = new FormData();
  for (const [name, value] of fields) body.append(name, value);
  return body;
}

function basic(user: string, password: string): string {
  return `Basic ${btoa(`${user}:${password}`)}`;
}

async function assertionTyped(typ: string | undefined): Promise<string> {
  const key = new TextEncoder().encode('k'.repeat(32));
  return await new SignJWT({ sub: 'workload' })
    .setProtectedHeader({ alg: 'HS256', ...(typ === undefined ? {} : { typ }) })
    .sign(key);
}

const credentialsBase = [
  ['grant_type', CLIENT_CREDENTIALS_GRANT],
  ['resource', RESOURCE],
] as const;

describe('client_credentials', () => {
  it('reads the key from HTTP Basic, with the default scope and no run', () => {
    const parsed = parseMachineTokenRequest(
      form(credentialsBase),
      basic(CREDENTIAL, KEY),
      RESOURCE,
    );
    expect(parsed).toMatchObject({
      kind: 'request',
      grant: 'client_credentials',
      clientId: CREDENTIAL,
      scopes: ['wbs:read', 'wbs:write'],
      run: null,
    });
    if (parsed.kind !== 'request' || parsed.grant !== 'client_credentials') throw new Error('');
    expect(parsed.key.reveal()).toBe(KEY);
  });

  it('reads the key from the body, with client_id optional', () => {
    const parsed = parseMachineTokenRequest(
      form([...credentialsBase, ['client_secret', KEY]]),
      null,
      RESOURCE,
    );
    expect(parsed).toMatchObject({ kind: 'request', clientId: null });
  });

  it('refuses two client authentication methods invalid_request', () => {
    expect(
      parseMachineTokenRequest(
        form([...credentialsBase, ['client_secret', KEY]]),
        basic(CREDENTIAL, KEY),
        RESOURCE,
      ),
    ).toEqual({ kind: 'refused', error: 'invalid_request' });
    expect(
      parseMachineTokenRequest(
        form([...credentialsBase, ['client_assertion', 'x.y.z']]),
        basic(CREDENTIAL, KEY),
        RESOURCE,
      ),
    ).toEqual({ kind: 'refused', error: 'invalid_request' });
    expect(
      parseMachineTokenRequest(
        form([...credentialsBase, ['client_secret', KEY], ['client_assertion', 'x.y.z']]),
        null,
        RESOURCE,
      ),
    ).toEqual({ kind: 'refused', error: 'invalid_request' });
  });

  it('refuses a lone client_assertion invalid_client: no assertion authenticates a client', () => {
    expect(
      parseMachineTokenRequest(
        form([
          ...credentialsBase,
          ['client_assertion', 'x.y.z'],
          ['client_assertion_type', 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer'],
        ]),
        null,
        RESOURCE,
      ),
    ).toEqual({ kind: 'refused', error: 'invalid_client' });
  });

  it('refuses no secret, an empty Basic secret, a non-key secret or a malformed Basic header invalid_client', () => {
    for (const [fields, authorization] of [
      [credentialsBase, null],
      [credentialsBase, basic(CREDENTIAL, '')],
      [credentialsBase, basic(CREDENTIAL, 'not-a-key')],
      [[...credentialsBase, ['client_secret', `${KEY}x`]], null],
      [credentialsBase, 'Basic !!!'],
      [credentialsBase, `Basic ${btoa('no-colon')}`],
      [credentialsBase, `Basic ${btoa(`${CREDENTIAL}:%E0%A4%A`)}`],
      [credentialsBase, `Bearer ${KEY}`],
      [[...credentialsBase, ['client_secret', KEY]], 'Basic !!!'],
      [[...credentialsBase, ['client_secret', KEY]], `Bearer ${KEY}`],
    ] as const)
      expect(parseMachineTokenRequest(form(fields), authorization, RESOURCE)).toEqual({
        kind: 'refused',
        error: 'invalid_client',
      });
  });

  it('refuses a client_id other than the key’s id invalid_client', () => {
    expect(
      parseMachineTokenRequest(form(credentialsBase), basic(OTHER_CREDENTIAL, KEY), RESOURCE),
    ).toEqual({ kind: 'refused', error: 'invalid_client' });
    expect(
      parseMachineTokenRequest(
        form([...credentialsBase, ['client_id', OTHER_CREDENTIAL], ['client_secret', KEY]]),
        null,
        RESOURCE,
      ),
    ).toEqual({ kind: 'refused', error: 'invalid_client' });
  });

  it('reads a Basic header with an empty user as sending no client_id', () => {
    expect(
      parseMachineTokenRequest(
        form([...credentialsBase, ['client_id', CREDENTIAL]]),
        basic('', KEY),
        RESOURCE,
      ),
    ).toMatchObject({ kind: 'request', clientId: CREDENTIAL });
  });

  it('refuses a client_id sent both by Basic and in the body invalid_request', () => {
    expect(
      parseMachineTokenRequest(
        form([...credentialsBase, ['client_id', CREDENTIAL]]),
        basic(CREDENTIAL, KEY),
        RESOURCE,
      ),
    ).toEqual({ kind: 'refused', error: 'invalid_request' });
  });
});

describe('JWT bearer', () => {
  const bearerBase = [
    ['grant_type', JWT_BEARER_GRANT],
    ['resource', RESOURCE],
  ] as const;

  it('admits an assertion without client authentication, and a client_id beside it', async () => {
    const assertion = await assertionTyped(undefined);
    const plain = parseMachineTokenRequest(
      form([...bearerBase, ['assertion', assertion]]),
      null,
      RESOURCE,
    );
    expect(plain).toMatchObject({ kind: 'request', grant: 'jwt_bearer', clientId: null });
    if (plain.kind !== 'request' || plain.grant !== 'jwt_bearer') throw new Error('');
    expect(plain.assertion.reveal()).toBe(assertion);
    expect(
      parseMachineTokenRequest(
        form([...bearerBase, ['assertion', assertion], ['client_id', CREDENTIAL]]),
        null,
        RESOURCE,
      ),
    ).toMatchObject({ kind: 'request', clientId: CREDENTIAL });
    expect(
      parseMachineTokenRequest(
        form([...bearerBase, ['assertion', assertion]]),
        basic(CREDENTIAL, ''),
        RESOURCE,
      ),
    ).toMatchObject({ kind: 'request', clientId: CREDENTIAL });
  });

  it('admits typ JWT in any case', async () => {
    for (const typ of ['JWT', 'jwt', 'Jwt'])
      expect(
        parseMachineTokenRequest(
          form([...bearerBase, ['assertion', await assertionTyped(typ)]]),
          null,
          RESOURCE,
        ),
      ).toMatchObject({ kind: 'request' });
  });

  it('refuses an ID-JAG, an access token or any other typ invalid_grant, naming it', async () => {
    for (const typ of ['oauth-id-jag+jwt', 'at+jwt', 'secevent+jwt']) {
      const parsed = parseMachineTokenRequest(
        form([...bearerBase, ['assertion', await assertionTyped(typ)]]),
        null,
        RESOURCE,
      );
      expect(parsed).toMatchObject({ kind: 'refused', error: 'invalid_grant' });
      if (parsed.kind !== 'refused') throw new Error('');
      expect(parsed.description).toContain(typ);
    }
  });

  it('echoes at most 64 printable characters of a typ', async () => {
    const parsed = parseMachineTokenRequest(
      form([...bearerBase, ['assertion', await assertionTyped(`a\u0007${'b'.repeat(100)}`)]]),
      null,
      RESOURCE,
    );
    if (parsed.kind !== 'refused') throw new Error('admitted');
    expect(parsed.description).toContain(`a?${'b'.repeat(62)}`);
    expect(parsed.description).not.toContain('b'.repeat(63));
  });

  it('refuses an assertion that is no JWT invalid_grant', () => {
    expect(
      parseMachineTokenRequest(form([...bearerBase, ['assertion', 'not-a-jwt']]), null, RESOURCE),
    ).toMatchObject({ kind: 'refused', error: 'invalid_grant' });
  });

  it('refuses a missing or empty assertion invalid_request', () => {
    expect(parseMachineTokenRequest(form(bearerBase), null, RESOURCE)).toEqual({
      kind: 'refused',
      error: 'invalid_request',
    });
    expect(
      parseMachineTokenRequest(form([...bearerBase, ['assertion', '']]), null, RESOURCE),
    ).toEqual({ kind: 'refused', error: 'invalid_request' });
  });

  it('refuses a Basic header without a colon invalid_client', async () => {
    expect(
      parseMachineTokenRequest(
        form([...bearerBase, ['assertion', await assertionTyped(undefined)]]),
        `Basic ${btoa('no-colon-here')}`,
        RESOURCE,
      ),
    ).toEqual({ kind: 'refused', error: 'invalid_client' });
  });

  it('refuses a typ that is not text, naming it as JSON', async () => {
    const key = new TextEncoder().encode('k'.repeat(32));
    const odd = await new SignJWT({ sub: 'workload' })
      .setProtectedHeader({ alg: 'HS256', typ: { kind: 'jwt' } as unknown as string })
      .sign(key);
    const parsed = parseMachineTokenRequest(
      form([...bearerBase, ['assertion', odd]]),
      null,
      RESOURCE,
    );
    expect(parsed).toMatchObject({ kind: 'refused', error: 'invalid_grant' });
    if (parsed.kind !== 'refused') throw new Error('admitted');
    expect(parsed.description).toContain('{"kind":"jwt"}');
  });

  it('refuses a Basic secret, a body secret and a client_id sent twice invalid_request', async () => {
    const assertion = await assertionTyped(undefined);
    expect(
      parseMachineTokenRequest(
        form([...bearerBase, ['assertion', assertion]]),
        basic(CREDENTIAL, KEY),
        RESOURCE,
      ),
    ).toEqual({ kind: 'refused', error: 'invalid_request' });
    expect(
      parseMachineTokenRequest(
        form([...bearerBase, ['assertion', assertion], ['client_secret', KEY]]),
        null,
        RESOURCE,
      ),
    ).toEqual({ kind: 'refused', error: 'invalid_request' });
    expect(
      parseMachineTokenRequest(
        form([...bearerBase, ['assertion', assertion], ['client_id', CREDENTIAL]]),
        basic(CREDENTIAL, ''),
        RESOURCE,
      ),
    ).toEqual({ kind: 'refused', error: 'invalid_request' });
  });

  it('refuses a client_assertion invalid_client', async () => {
    expect(
      parseMachineTokenRequest(
        form([
          ...bearerBase,
          ['assertion', await assertionTyped(undefined)],
          ['client_assertion', 'x.y.z'],
        ]),
        null,
        RESOURCE,
      ),
    ).toEqual({ kind: 'refused', error: 'invalid_client' });
  });
});

describe('resource, scope, run and repetition', () => {
  const withKey = (fields: readonly (readonly [string, string])[]) =>
    parseMachineTokenRequest(form(fields), basic(CREDENTIAL, KEY), RESOURCE);

  it('refuses a missing, foreign, non-canonical or repeated resource invalid_target', () => {
    for (const fields of [
      [['grant_type', CLIENT_CREDENTIALS_GRANT]],
      [
        ['grant_type', CLIENT_CREDENTIALS_GRANT],
        ['resource', 'https://elsewhere.example/mcp'],
      ],
      [
        ['grant_type', CLIENT_CREDENTIALS_GRANT],
        ['resource', `${RESOURCE}/`],
      ],
      [...credentialsBase, ['resource', RESOURCE]],
    ] as const)
      expect(withKey(fields)).toEqual({ kind: 'refused', error: 'invalid_target' });
  });

  it('narrows to a requested subset, in canonical order', () => {
    expect(withKey([...credentialsBase, ['scope', 'wbs:read']])).toMatchObject({
      scopes: ['wbs:read'],
    });
    expect(withKey([...credentialsBase, ['scope', 'wbs:write wbs:read']])).toMatchObject({
      scopes: ['wbs:read', 'wbs:write'],
    });
  });

  it('refuses wbs:editor, an unknown or empty scope invalid_scope', () => {
    for (const scope of ['wbs:editor', 'wbs:read wbs:editor', 'admin', '', 'wbs:read  wbs:write'])
      expect(withKey([...credentialsBase, ['scope', scope]])).toEqual({
        kind: 'refused',
        error: 'invalid_scope',
      });
  });

  it('carries a run of 1 to 256 characters', () => {
    expect(withKey([...credentialsBase, ['wbs_run', 'r']])).toMatchObject({ run: 'r' });
    expect(withKey([...credentialsBase, ['wbs_run', 'r'.repeat(256)]])).toMatchObject({
      run: 'r'.repeat(256),
    });
  });

  it('refuses an empty or over-long run invalid_request', () => {
    for (const run of ['', 'r'.repeat(257)])
      expect(withKey([...credentialsBase, ['wbs_run', run]])).toMatchObject({
        kind: 'refused',
        error: 'invalid_request',
      });
  });

  it('refuses any repeated parameter or a file value invalid_request', () => {
    for (const name of ['grant_type', 'scope', 'wbs_run', 'client_id'])
      expect(withKey([...credentialsBase, [name, 'wbs:read'], [name, 'wbs:read']])).toMatchObject({
        kind: 'refused',
        error: 'invalid_request',
      });
    const withFile = form(credentialsBase);
    withFile.append('scope', new Blob(['wbs:read']));
    expect(parseMachineTokenRequest(withFile, basic(CREDENTIAL, KEY), RESOURCE)).toEqual({
      kind: 'refused',
      error: 'invalid_request',
    });
  });
});

describe('carriers that redact', () => {
  it('never prints the key or the assertion', () => {
    const parsed = parseMachineTokenRequest(
      form(credentialsBase),
      basic(CREDENTIAL, KEY),
      RESOURCE,
    );
    const rendered = [
      JSON.stringify(parsed),
      String(parsed.kind === 'request' && parsed.grant === 'client_credentials' ? parsed.key : ''),
      inspect(parsed, { depth: 10 }),
      Bun.inspect(parsed),
      new Concealed(KEY).toString(),
      String(new Concealed(KEY)),
    ];
    for (const text of rendered) {
      expect(text).not.toContain(KEY);
      expect(text).not.toContain(KEY.slice(-43));
    }
    expect(JSON.stringify({ key: new Concealed(KEY) })).toBe('{"key":"[redacted]"}');
    expect(new Concealed(KEY).reveal()).toBe(KEY);
  });
});
