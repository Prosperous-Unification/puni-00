import { chmod, mkdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { describe, expect, it } from 'bun:test';

import { MissingEnvExampleError, seedApp } from './setup';

async function makeFakeRepo(apps: Record<string, { example?: string; env?: string }>) {
  const root = await scratchAsync('dev-setup-');
  for (const [app, files] of Object.entries(apps)) {
    await mkdir(join(root, 'apps', 'wbs', app), { recursive: true });
    if (files.example !== undefined)
      await writeFile(join(root, 'apps', 'wbs', app, '.env.example'), files.example, 'utf8');
    if (files.env !== undefined)
      await writeFile(join(root, 'apps', 'wbs', app, '.env'), files.env, 'utf8');
  }
  return root;
}

describe('dev:setup seedApp', () => {
  it('writes .env from .env.example when .env is absent', async () => {
    const root = await makeFakeRepo({ 'be-01': { example: 'PORT=3100\n' } });
    expect(await seedApp('be-01', root)).toBe('wrote');
    expect(await Bun.file(join(root, 'apps', 'wbs', 'be-01', '.env')).text()).toBe('PORT=3100\n');
  });

  // Proof: copying the committed placeholders makes mcp-01 fail startup, while
  // a world-readable mode exposes both durable keys.
  it('generates private MCP persistence keys with mode 600', async () => {
    const root = await makeFakeRepo({
      'mcp-01': {
        example:
          'MCP_SIGNING_KEY_CURRENT=replace-with-base64-pkcs8\n' +
          'MCP_STORE_KEY_CURRENT=replace-with-32-byte-base64\n',
      },
    });
    expect(await seedApp('mcp-01', root)).toBe('wrote');
    const path = join(root, 'apps', 'wbs', 'mcp-01', '.env');
    const contents = await Bun.file(path).text();
    expect(contents).not.toContain('replace-with');
    const values = new Map(
      contents
        .trim()
        .split('\n')
        .map((line) => {
          const separator = line.indexOf('=');
          return [line.slice(0, separator), line.slice(separator + 1)];
        }),
    );
    expect(Buffer.from(values.get('MCP_STORE_KEY_CURRENT') ?? '', 'base64')).toHaveLength(32);
    expect(
      Buffer.from(values.get('MCP_SIGNING_KEY_CURRENT') ?? '', 'base64').length,
    ).toBeGreaterThan(100);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
  });

  it('leaves an existing .env alone', async () => {
    const root = await makeFakeRepo({
      'be-01': { example: 'PORT=3100\n', env: 'PORT=9999\n' },
    });
    expect(await seedApp('be-01', root)).toBe('already-present');
    // The point of non-destructive: the developer's edits survive.
    expect(await Bun.file(join(root, 'apps', 'wbs', 'be-01', '.env')).text()).toBe('PORT=9999\n');
  });

  // The negative test. This used to log "no .env.example — skipping" and return,
  // so a checkout missing a committed file produced a green setup and the
  // failure surfaced much later as an unexplained missing-env crash at serve.
  it('throws when .env.example is missing rather than skipping', async () => {
    const root = await makeFakeRepo({ 'be-01': {} });
    expect(seedApp('be-01', root)).rejects.toThrow(MissingEnvExampleError);
    // Proof: restoring seedApp's pre-move `apps/<app>` lookup made this moved
    // fixture throw the legacy path instead of this namespaced diagnostic.
    expect(seedApp('be-01', root)).rejects.toThrow('apps/wbs/be-01/.env.example is missing');
  });
});

describe('the seeded env files must agree where two tiers share a secret', () => {
  // be-01 signs the tokens gw-01 verifies. When the two `.env.example` files
  // disagree, `dev:setup` seeds a checkout where registration and login work
  // and the WebSocket then 401s -- which reads as a gateway fault rather than a
  // configuration one. That shipped for a day, with be-01's own comment stating
  // the rule the value beneath it broke.
  it('gives be-01 and gw-01 the same JWT_SIGNING_KEY_CURRENT', async () => {
    const root = new URL('../../', import.meta.url).pathname;
    const read = async (app: string): Promise<string> => {
      const text = await Bun.file(`${root}apps/wbs/${app}/.env.example`).text();
      const line = text.split('\n').find((l) => l.startsWith('JWT_SIGNING_KEY_CURRENT='));
      if (line === undefined) throw new Error(`${app}/.env.example has no JWT_SIGNING_KEY_CURRENT`);
      return line.slice('JWT_SIGNING_KEY_CURRENT='.length);
    };

    const [be, gw] = await Promise.all([read('be-01'), read('gw-01')]);
    expect(be).toBe(gw);
    // A shared secret that is not a secret-sized string is its own defect: both
    // configs hold this to >=32 characters, so a seeded checkout that passes
    // this test must also pass startup validation.
    expect(be.length).toBeGreaterThanOrEqual(32);
  });

  it('seeds be-01 and gw-01 into local auth with an explicit development signal', async () => {
    const root = new URL('../../', import.meta.url).pathname;
    const read = async (app: string): Promise<Map<string, string>> => {
      const text = await Bun.file(`${root}apps/wbs/${app}/.env.example`).text();
      return new Map(
        text
          .split('\n')
          .filter((line) => line !== '' && !line.startsWith('#'))
          .map((line) => {
            const splitAt = line.indexOf('=');
            return [line.slice(0, splitAt), line.slice(splitAt + 1)];
          }),
      );
    };

    for (const env of await Promise.all([read('be-01'), read('gw-01')])) {
      expect(env.get('AUTH_MODE')).toBe('local');
      expect(env.get('NODE_ENV')).toBe('development');
    }
  });
});

describe('existing local backend configuration', () => {
  it('diagnoses the missing origin without replacing unrelated configuration', async () => {
    const existing = 'AUTH_MODE=local\nPORT=9999\nCUSTOM=value\n';
    const root = await makeFakeRepo({
      'be-01': { example: 'AUTH_MODE=local\nAPP_ORIGIN=http://localhost:4200\n', env: existing },
    });
    await seedApp('be-01', root).then(
      () => {
        throw new Error('expected missing-origin refusal');
      },
      (error: unknown) => {
        expect(error).toBeInstanceOf(Error);
        expect(String(error)).toContain('APP_ORIGIN=http://localhost:4200');
      },
    );
    expect(await Bun.file(join(root, 'apps/wbs/be-01/.env')).text()).toBe(existing);
  });
  it('accepts an existing configured local origin and quoted auth mode', async () => {
    const root = await makeFakeRepo({
      'be-01': {
        example: 'AUTH_MODE=local\n',
        env: 'AUTH_MODE="local"\nAPP_ORIGIN="http://localhost:4700"\n',
      },
    });
    expect(await seedApp('be-01', root)).toBe('already-present');
  });
  it('leaves OIDC configuration on its callback-derived origin', async () => {
    const root = await makeFakeRepo({
      'be-01': {
        example: 'AUTH_MODE=local\n',
        env: 'AUTH_MODE=oidc\nAUTH_REDIRECT_URI=https://app.example/api/auth/okta/callback\n',
      },
    });
    expect(await seedApp('be-01', root)).toBe('already-present');
  });
});

it('refuses an unreadable existing backend environment', async () => {
  const root = await makeFakeRepo({
    'be-01': {
      example: 'AUTH_MODE=local\n',
      env: 'AUTH_MODE=local\nAPP_ORIGIN=http://localhost:4200\n',
    },
  });
  const target = join(root, 'apps/wbs/be-01/.env');
  await chmod(target, 0);
  try {
    await seedApp('be-01', root).then(
      () => {
        throw new Error('expected unreadable-environment refusal');
      },
      (error: unknown) => {
        expect(error).toMatchObject({ code: 'EACCES' });
      },
    );
  } finally {
    await chmod(target, 0o600);
  }
});
