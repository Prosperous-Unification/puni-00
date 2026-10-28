import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, test } from 'bun:test';

import { urlOf } from './machine-token';
import { type PoolFiles, runPoolCommand, systemPoolFiles } from './pool-import';

/**
 * `pool import` against a fake token endpoint that answers as mcp-01 does: `200` with a bearer,
 * or `401 {"error":"invalid_client"}` for a key it refuses.
 */
const RESOURCE = 'https://wbs.example/mcp';
const ISSUER = 'https://wbs.example/mcp/oauth';
const TOKEN_URL = `${ISSUER}/token`;
const HELPER = ['/usr/local/bin/bun', '/srv/puni-00/dash/entrypoint.ts'] as const;
const ENTRYPOINT = join(import.meta.dir, '../entrypoint.ts');
/**
 * The committed v1 document, which `@wbs/contracts`' `agent-pool-shapes.test.ts` checks against
 * be-01's `agentPoolKeys`. Its secrets are `*` so no secret scanner matches; tests put valid ones in.
 */
const FIXTURE = JSON.parse(
  readFileSync(join(import.meta.dir, 'testing/pool-keys.v1.json'), 'utf8'),
) as Record<string, unknown> & { agents: { key: string }[] };

const scratch = mkdtempSync(join(tmpdir(), 'dash-pool-import-'));
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});
let made = 0;
/** A fresh path under the scratch directory. */
function fresh(name: string): string {
  made += 1;
  return join(scratch, `${String(made)}-${name}`);
}

function credentialId(n: number, generation: number): string {
  return `0b9f6c1e-4a1d-4c5e-9a7b-${String(generation).padStart(4, '0')}${String(n).padStart(8, '0')}`;
}
function keyOf(n: number, generation: number): string {
  return `wbs_mk_${credentialId(n, generation)}.${String.fromCharCode(96 + n).repeat(43)}`;
}

interface DocumentOptions {
  readonly agents?: readonly number[];
  readonly generation?: number;
  readonly poolId?: string;
}

/** A `wbs-agent-pool-keys` v1 document of agents `fleet-<n>`, keys of `generation`. */
function poolDocument(options: DocumentOptions = {}): Record<string, unknown> {
  const generation = options.generation ?? 1;
  return {
    ...FIXTURE,
    poolId: options.poolId ?? 'pool-a',
    agents: (options.agents ?? [1, 2, 3]).map((n) => ({
      personId: `person-${String(n)}`,
      personName: `fleet-${String(n)}`,
      credentialId: credentialId(n, generation),
      key: keyOf(n, generation),
    })),
  };
}

function writeDocument(document: unknown, mode = 0o600): string {
  const path = fresh('pool.keys.json');
  writeFileSync(path, JSON.stringify(document, null, 2), { mode });
  chmodSync(path, mode);
  return path;
}

/** The key a request authenticated with, from its HTTP Basic header. */
function keyOfRequest(authorization: string | null): string {
  return atob((authorization ?? '').slice('Basic '.length)).split(':')[1] ?? '';
}

interface EndpointOptions {
  /** Answered before anything else, one per request, while any remain. */
  readonly rateLimits?: (string | null)[];
  readonly files?: PoolFiles;
}

/** A 429 as mcp-01's M10 refusal answers it. */
function rateLimited(retryAfter: string | null): Response {
  return Response.json(
    { error: 'invalid_request', error_description: 'rate_limited' },
    { status: 429, headers: retryAfter === null ? {} : { 'retry-after': retryAfter } },
  );
}

/** A fake endpoint refusing the keys in `refused`; records every request and sleep. */
function endpoint(refused: ReadonlySet<string> = new Set(), options: EndpointOptions = {}) {
  const requests: { url: string; form: URLSearchParams; key: string; redirect: unknown }[] = [];
  const printed: string[] = [];
  const sleeps: number[] = [];
  const rateLimits = [...(options.rateLimits ?? [])];
  const run = (argv: readonly string[]): Promise<void> =>
    runPoolCommand(argv, {
      send: (input, init) => {
        const key = keyOfRequest(new Headers(init?.headers).get('authorization'));
        requests.push({
          url: urlOf(input),
          form: new URLSearchParams(init?.body as URLSearchParams),
          key,
          redirect: init?.redirect,
        });
        if (rateLimits.length > 0) return Promise.resolve(rateLimited(rateLimits.shift() ?? null));
        if (refused.has(key)) {
          return Promise.resolve(Response.json({ error: 'invalid_client' }, { status: 401 }));
        }
        return Promise.resolve(
          Response.json({ access_token: `token-${key.slice(-3)}`, token_type: 'Bearer' }),
        );
      },
      write: (text) => printed.push(text),
      helper: HELPER,
      sleep: (milliseconds) => {
        sleeps.push(milliseconds);
        return Promise.resolve();
      },
      files: options.files ?? systemPoolFiles,
    });
  return { requests, printed, sleeps, run };
}

/** The message `pending` rejects with; fails the test when it resolves. */
async function rejection(pending: Promise<unknown>): Promise<string> {
  const outcome = await pending.then(
    () => new Error('resolved, but a refusal was expected'),
    (cause: unknown) => cause,
  );
  if (!(outcome instanceof Error) || outcome.message === 'resolved, but a refusal was expected')
    throw new Error(`expected a refusal, got ${String(outcome)}`);
  return outcome.message;
}

/** Every file under `directory`, relative, links followed. */
function filesUnder(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { recursive: true }).map(String).sort();
}

interface StoredPool {
  agents: {
    personId: string;
    personName: string;
    run: string;
    keyFile: string;
    mcpConfig: string;
  }[];
}
function storedPool(store: string, poolId = 'pool-a'): StoredPool {
  return JSON.parse(readFileSync(join(store, `pool-${poolId}`, 'pool.json'), 'utf8')) as StoredPool;
}

describe('twilight-dash pool import', () => {
  test('stores each agent its key file and MCP config, each with its own run', async () => {
    const store = fresh('store');
    const file = writeDocument(poolDocument());
    const fake = endpoint();
    await fake.run(['import', file, '--store', store]);

    // One token request per agent, before anything is written, each with its run.
    expect(fake.requests.map((each) => each.url)).toEqual([TOKEN_URL, TOKEN_URL, TOKEN_URL]);
    expect(fake.requests.map((each) => each.key)).toEqual([keyOf(1, 1), keyOf(2, 1), keyOf(3, 1)]);
    expect(fake.requests.every((each) => each.redirect === 'manual')).toBe(true);
    const sentRuns = fake.requests.map((each) => each.form.get('wbs_run'));
    expect(fake.requests.map((each) => each.form.get('grant_type'))).toEqual([
      'client_credentials',
      'client_credentials',
      'client_credentials',
    ]);

    const pool = storedPool(store);
    const runs = pool.agents.map((agent) => agent.run);
    // Proof: a constant run (`runOf('pool-' + pool.poolId)`) made this see one run three times
    // (2026-10-28).
    expect(new Set(runs).size).toBe(3);
    expect(runs).toEqual(['pool-pool-a/person-1', 'pool-pool-a/person-2', 'pool-pool-a/person-3']);
    expect(sentRuns).toEqual(runs);

    const current = join(store, 'pool-pool-a');
    for (const [index, agent] of pool.agents.entries()) {
      const n = index + 1;
      expect(agent.keyFile).toBe(join(current, `person-${String(n)}.key`));
      expect(readFileSync(agent.keyFile, 'utf8')).toBe(`${keyOf(n, 1)}\n`);
      expect(statSync(agent.keyFile).mode & 0o777).toBe(0o600);
      const config = JSON.parse(readFileSync(agent.mcpConfig, 'utf8')) as {
        mcpServers: { wbs: { type: string; url: string; headersHelper: string } };
      };
      expect(config.mcpServers.wbs).toEqual({
        type: 'http',
        url: RESOURCE,
        headersHelper:
          `'${HELPER[0]}' '${HELPER[1]}' 'mcp' 'token' '--resource' '${RESOURCE}' ` +
          `'--key-file' '${agent.keyFile}' '--run' '${agent.run}'`,
      });
      expect(statSync(agent.mcpConfig).mode & 0o777).toBe(0o600);
    }
    expect(statSync(store).mode & 0o777).toBe(0o700);
    expect(readFileSync(join(current, 'pool.json'), 'utf8')).not.toContain('wbs_mk_');

    const output = fake.printed.join('');
    expect(output).toContain('imported pool fleet (pool-a): 3 agents');
    expect(output).toContain('fleet-2 (person-2) run pool-pool-a/person-2');
    expect(output).toContain(`delete ${file} now`);
    // Proof: printing the document's agents (`JSON.stringify(pool.agents)`) failed this test
    // and the entrypoint's `prints no key` (2026-10-28).
    expect(output).not.toContain('wbs_mk_');
  });

  test('a key that fails to issue aborts the import with nothing written', async () => {
    const store = fresh('store');
    const file = writeDocument(poolDocument());
    const fake = endpoint(new Set([keyOf(2, 1)]));
    const message = await rejection(fake.run(['import', file, '--store', store]));
    expect(message).toBe(
      "agent fleet-2's key did not issue a token, so nothing was imported: the MCP token endpoint refused: HTTP 401 invalid_client",
    );
    expect(message).not.toContain('wbs_mk_');
    expect(existsSync(store)).toBe(false);
    expect(fake.printed).toEqual([]);
  });

  test('a re-import replaces the pool keys, and an agent absent from it loses its key', async () => {
    const store = fresh('store');
    await endpoint().run(['import', writeDocument(poolDocument()), '--store', store]);
    await endpoint().run([
      'import',
      writeDocument(poolDocument({ poolId: 'pool-b', agents: [7] })),
      '--store',
      store,
    ]);
    const before = storedPool(store);

    // Re-keyed after fleet-2's key was revoked alone: fleet-1 and fleet-3, new keys.
    await endpoint().run([
      'import',
      writeDocument(poolDocument({ agents: [1, 3], generation: 2 })),
      '--store',
      store,
    ]);
    const current = join(store, 'pool-pool-a');
    expect(readFileSync(join(current, 'person-1.key'), 'utf8')).toBe(`${keyOf(1, 2)}\n`);
    expect(readFileSync(join(current, 'person-3.key'), 'utf8')).toBe(`${keyOf(3, 2)}\n`);
    expect(existsSync(join(current, 'person-2.key'))).toBe(false);
    // The runs, and so the paths a running agent's helper reads, survive the re-key.
    expect(storedPool(store).agents.map((agent) => agent.run)).toEqual([
      before.agents[0]?.run,
      before.agents[2]?.run,
    ]);
    // One generation per pool: the replaced one, with fleet-2's old key, is gone.
    const entries = readdirSync(store).sort();
    expect(entries.filter((entry) => entry.startsWith('.pool-pool-a.'))).toHaveLength(1);
    expect(entries.filter((entry) => !entry.startsWith('.'))).toEqual([
      'pool-pool-a',
      'pool-pool-b',
    ]);
    expect(filesUnder(store).filter((entry) => entry.endsWith('person-2.key'))).toEqual([]);
    expect(readFileSync(join(store, 'pool-pool-b', 'person-7.key'), 'utf8')).toBe(
      `${keyOf(7, 1)}\n`,
    );
  });

  test('a refused re-import keeps the pool as it was', async () => {
    const store = fresh('store');
    await endpoint().run(['import', writeDocument(poolDocument()), '--store', store]);
    const before = filesUnder(store);
    const message = await rejection(
      endpoint(new Set([keyOf(3, 2)])).run([
        'import',
        writeDocument(poolDocument({ generation: 2 })),
        '--store',
        store,
      ]),
    );
    expect(message).toStartWith("agent fleet-3's key did not issue a token");
    expect(filesUnder(store)).toEqual(before);
    expect(readFileSync(join(store, 'pool-pool-a', 'person-1.key'), 'utf8')).toBe(
      `${keyOf(1, 1)}\n`,
    );
  });

  test('refuses an unknown document version, naming it, and another format', async () => {
    const fake = endpoint();
    const store = fresh('store');
    const message = await rejection(
      fake.run(['import', writeDocument({ ...poolDocument(), version: 2 }), '--store', store]),
    );
    expect(message).toBe('wbs-agent-pool-keys version 2 is not supported; this Dash reads 1');
    expect(
      await rejection(
        fake.run([
          'import',
          writeDocument({ ...poolDocument(), format: 'other' }),
          '--store',
          store,
        ]),
      ),
    ).toBe('the pool key file is not a wbs-agent-pool-keys document');
    expect(fake.requests).toEqual([]);
    expect(existsSync(store)).toBe(false);
  });

  test('refuses a group-readable pool key file, naming the chmod', async () => {
    const fake = endpoint();
    const file = writeDocument(poolDocument(), 0o644);
    const message = await rejection(fake.run(['import', file, '--store', fresh('store')]));
    expect(message).toBe(
      `the pool key file must be owned by this user with mode 0600; run: chmod 600 '${file}'`,
    );
    expect(fake.requests).toEqual([]);
  });

  test('refuses an authorizationServer that mcp token would not ask', async () => {
    const fake = endpoint();
    const message = await rejection(
      fake.run([
        'import',
        writeDocument({ ...poolDocument(), authorizationServer: 'https://other.example/oauth' }),
        '--store',
        fresh('store'),
      ]),
    );
    expect(message).toBe(
      `the document's authorizationServer https://other.example/oauth is not ${ISSUER}, the one mcp token asks for ${RESOURCE}`,
    );
    expect(fake.requests).toEqual([]);
  });

  test('refuses a key that names another credential, and an agent listed twice', async () => {
    const fake = endpoint();
    const document = poolDocument();
    const agents = document['agents'] as { credentialId: string; personId: string }[];
    const swapped = agents.map((agent, index) =>
      index === 0 ? { ...agent, credentialId: credentialId(9, 1) } : agent,
    );
    expect(
      await rejection(
        fake.run([
          'import',
          writeDocument({ ...document, agents: swapped }),
          '--store',
          fresh('s'),
        ]),
      ),
    ).toBe(`the key of agent fleet-1 is not of its credential ${credentialId(9, 1)}`);
    const twice = [...agents, { ...agents[0], credentialId: credentialId(4, 1), key: keyOf(4, 1) }];
    expect(
      await rejection(
        fake.run(['import', writeDocument({ ...document, agents: twice }), '--store', fresh('s')]),
      ),
    ).toBe('the pool lists person person-1 twice');
    expect(fake.requests).toEqual([]);
  });

  test('refuses a document whose key is no wbs_mk_ key, never echoing it', async () => {
    const fake = endpoint();
    const document = poolDocument();
    const agents = document['agents'] as { key: string }[];
    const message = await rejection(
      fake.run([
        'import',
        writeDocument({ ...document, agents: [{ ...agents[0], key: 'sk-not-a-wbs-key-secret' }] }),
        '--store',
        fresh('s'),
      ]),
    );
    expect(message).toBe('the key of agent fleet-1 holds no wbs_mk_ API key');
  });

  test('refuses a store other users can enter', async () => {
    const store = fresh('store');
    // A directory other users can list.
    mkdirSync(store, { mode: 0o755 });
    chmodSync(store, 0o755);
    writeFileSync(join(store, '.keep'), '');
    const message = await rejection(
      endpoint().run(['import', writeDocument(poolDocument()), '--store', store]),
    );
    expect(message).toBe(
      `--store ${store} must be a directory owned by this user with mode 0700, not a link`,
    );
    expect(readdirSync(store)).toEqual(['.keep']);
  });

  test('refuses to replace a pool directory it did not write', async () => {
    const store = fresh('store');
    mkdirSync(join(store, 'pool-pool-a'), { recursive: true, mode: 0o700 });
    chmodSync(store, 0o700);
    writeFileSync(join(store, 'pool-pool-a', 'mine'), 'kept');
    const message = await rejection(
      endpoint().run(['import', writeDocument(poolDocument()), '--store', store]),
    );
    expect(message).toBe(
      `${join(store, 'pool-pool-a')} is not a pool this Dash imported; move it aside first`,
    );
    expect(readdirSync(store)).toEqual(['pool-pool-a']);
    expect(readFileSync(join(store, 'pool-pool-a', 'mine'), 'utf8')).toBe('kept');
  });

  test('refuses a key pasted where the file belongs', async () => {
    const fake = endpoint();
    const message = await rejection(fake.run(['import', keyOf(1, 1), '--store', fresh('s')]));
    expect(message).toBe('pool import names the pool key file, not its contents');
    expect(message).not.toContain('wbs_mk_');
    expect(await rejection(fake.run(['import', 'file.json']))).toStartWith('usage: pool import');
  });
});

const GENERATION = /^\.pool-pool-a\.[0-9a-f]{16}$/;

describe('twilight-dash pool import, the store', () => {
  test('creates a missing store and its parents 0700', async () => {
    const top = fresh('parents');
    const store = join(top, 'config', 'twilight-dash', 'pools');
    await endpoint().run(['import', writeDocument(poolDocument()), '--store', store]);
    for (const directory of [top, join(top, 'config'), join(top, 'config', 'twilight-dash'), store])
      expect(statSync(directory).mode & 0o777).toBe(0o700);
  });

  test('refuses a store that is a link', async () => {
    const real = fresh('real-store');
    mkdirSync(real, { mode: 0o700 });
    chmodSync(real, 0o700);
    const store = fresh('linked-store');
    symlinkSync(real, store);
    const message = await rejection(
      endpoint().run(['import', writeDocument(poolDocument()), '--store', store]),
    );
    expect(message).toBe(
      `--store ${store} must be a directory owned by this user with mode 0700, not a link`,
    );
    expect(readdirSync(real)).toEqual([]);
  });

  test('refuses a pool link it did not make, to /etc, leaving both alone', async () => {
    const store = fresh('store');
    mkdirSync(store, { mode: 0o700 });
    chmodSync(store, 0o700);
    symlinkSync('/etc', join(store, 'pool-pool-a'));
    const before = readdirSync('/etc').sort();
    const message = await rejection(
      endpoint().run(['import', writeDocument(poolDocument()), '--store', store]),
    );
    expect(message).toBe(
      `${join(store, 'pool-pool-a')} is not a pool this Dash imported; move it aside first`,
    );
    expect(readlinkSync(join(store, 'pool-pool-a'))).toBe('/etc');
    expect(readdirSync(store)).toEqual(['pool-pool-a']);
    expect(readdirSync('/etc').sort()).toEqual(before);
  });

  test('sweeps a stray generation of the pool, its key file included', async () => {
    const store = fresh('store');
    mkdirSync(join(store, '.pool-pool-a.00112233445566ff'), { recursive: true, mode: 0o700 });
    chmodSync(store, 0o700);
    writeFileSync(join(store, '.pool-pool-a.00112233445566ff', 'person-9.key'), keyOf(9, 1), {
      mode: 0o600,
    });
    writeFileSync(join(store, '.pool-pool-b.00112233445566ff'), 'another pool');
    await endpoint().run(['import', writeDocument(poolDocument()), '--store', store]);
    const entries = readdirSync(store).sort();
    expect(entries.filter((entry) => GENERATION.test(entry))).toEqual([
      readlinkSync(join(store, 'pool-pool-a')),
    ]);
    expect(filesUnder(store).filter((entry) => entry.endsWith('person-9.key'))).toEqual([]);
    expect(entries).toContain('.pool-pool-b.00112233445566ff');
  });

  test('a write that fails leaves no partial generation, and the pool as it was', async () => {
    const store = fresh('store');
    await endpoint().run(['import', writeDocument(poolDocument()), '--store', store]);
    const before = filesUnder(store);
    // ENOSPC after the first agent's key file: the first write through the seam.
    const failing: PoolFiles = {
      ...systemPoolFiles,
      writeNewText: () => {
        throw Object.assign(new Error('no space left on device'), { code: 'ENOSPC' });
      },
    };
    const message = await rejection(
      endpoint(new Set(), { files: failing }).run([
        'import',
        writeDocument(poolDocument({ generation: 2 })),
        '--store',
        store,
      ]),
    );
    expect(message).toBe('pool pool-a could not be written; the store keeps what it had');
    expect(filesUnder(store)).toEqual(before);
    expect(readFileSync(join(store, 'pool-pool-a', 'person-1.key'), 'utf8')).toBe(
      `${keyOf(1, 1)}\n`,
    );
  });

  test('an import replaced concurrently exits non-zero and keeps no key of its own', async () => {
    const store = fresh('store');
    // Right after this import's switch, another import switches the pool to its generation.
    const racing: PoolFiles = {
      ...systemPoolFiles,
      rename: (from, to) => {
        renameSync(from, to);
        const other = '.pool-pool-a.ffeeddccbbaa9988';
        mkdirSync(join(store, other), { mode: 0o700 });
        writeFileSync(join(store, other, 'pool.json'), '{}');
        symlinkSync(other, join(store, 'other.link'));
        renameSync(join(store, 'other.link'), to);
      },
    };
    const message = await rejection(
      endpoint(new Set(), { files: racing }).run([
        'import',
        writeDocument(poolDocument()),
        '--store',
        store,
      ]),
    );
    expect(message).toBe(
      `another import replaced pool pool-a concurrently; check ${join(store, 'pool-pool-a')} and rerun`,
    );
    expect(readdirSync(store).filter((entry) => GENERATION.test(entry))).toEqual([
      '.pool-pool-a.ffeeddccbbaa9988',
    ]);
    expect(filesUnder(store).filter((entry) => entry.endsWith('.key'))).toEqual([]);
  });
});

describe('twilight-dash pool import, rate limits', () => {
  test('waits out a 429 per its Retry-After and imports', async () => {
    const fake = endpoint(new Set(), { rateLimits: ['2', '3'] });
    const store = fresh('store');
    await fake.run(['import', writeDocument(poolDocument()), '--store', store]);
    expect(fake.sleeps).toEqual([2_000, 3_000]);
    expect(fake.requests).toHaveLength(5);
    expect(storedPool(store).agents).toHaveLength(3);
  });

  test('a 429 not waited out within its bound aborts, saying how long to wait', async () => {
    const fake = endpoint(new Set(), { rateLimits: ['1', '1', '1', '7'] });
    const store = fresh('store');
    const message = await rejection(
      fake.run(['import', writeDocument(poolDocument()), '--store', store]),
    );
    expect(message).toBe(
      "agent fleet-1's key did not issue a token, so nothing was imported: the MCP token endpoint is rate limiting issuances; wait 7 s and rerun",
    );
    expect(fake.sleeps).toEqual([1_000, 1_000, 1_000]);
    expect(existsSync(store)).toBe(false);
    const long = endpoint(new Set(), { rateLimits: ['120'] });
    expect(
      await rejection(long.run(['import', writeDocument(poolDocument()), '--store', fresh('s')])),
    ).toEndWith('wait 120 s and rerun');
    expect(long.sleeps).toEqual([]);
  });
});

describe('twilight-dash pool import, the committed v1 document', () => {
  test('imports it once its secrets are real-shaped', async () => {
    const agents = FIXTURE.agents.map((agent) => ({
      ...agent,
      key: agent.key.replace(/\.\*{43}$/, `.${'k'.repeat(43)}`),
    }));
    const store = fresh('store');
    const fake = endpoint();
    await fake.run(['import', writeDocument({ ...FIXTURE, agents }), '--store', store]);
    expect(fake.requests).toHaveLength(3);
    expect(
      storedPool(store, String(FIXTURE['poolId'])).agents.map((agent) => agent.personName),
    ).toEqual(['fleet-1', 'fleet-2', 'fleet-3']);
  });
});

describe('twilight-dash pool import through the entrypoint', () => {
  /** A loopback token endpoint refusing `refused`. */
  function serve(refused: ReadonlySet<string>) {
    return Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      fetch: (request) => {
        const key = keyOfRequest(request.headers.get('authorization'));
        if (refused.has(key)) return Response.json({ error: 'invalid_client' }, { status: 401 });
        return Response.json({ access_token: 'issued', token_type: 'Bearer' });
      },
    });
  }

  async function dash(args: readonly string[]) {
    const child = Bun.spawn(['bun', ENTRYPOINT, ...args], { stdout: 'pipe', stderr: 'pipe' });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    return { stdout, stderr, exitCode };
  }

  test('prints no key on success or refusal, and its MCP config runs mcp token', async () => {
    const server = serve(new Set([keyOf(3, 2)]));
    try {
      const resource = `http://127.0.0.1:${String(server.port)}/mcp`;
      const document = {
        ...poolDocument(),
        mcpResource: resource,
        authorizationServer: `${resource}/oauth`,
      };
      const store = fresh('store');
      const imported = await dash(['pool', 'import', writeDocument(document), '--store', store]);
      expect(imported).toMatchObject({ exitCode: 0, stderr: '' });
      expect(imported.stdout).toContain('3 agents');
      expect(imported.stdout).not.toContain('wbs_mk_');

      const refused = await dash([
        'pool',
        'import',
        writeDocument({ ...document, agents: poolDocument({ generation: 2 })['agents'] }),
        '--store',
        store,
      ]);
      expect(refused.exitCode).toBe(1);
      expect(refused.stdout).toBe('');
      expect(refused.stderr).toStartWith("error: agent fleet-3's key did not issue a token");
      expect(refused.stderr).not.toContain('wbs_mk_');

      // The stored helper, run by a shell as Claude Code runs it, prints the header map.
      const config = JSON.parse(
        readFileSync(storedPool(store).agents[0]?.mcpConfig ?? '', 'utf8'),
      ) as { mcpServers: { wbs: { headersHelper: string } } };
      const shell = Bun.spawn(['sh', '-c', config.mcpServers.wbs.headersHelper], {
        stdout: 'pipe',
        stderr: 'pipe',
      });
      expect(await new Response(shell.stdout).text()).toBe('{"Authorization":"Bearer issued"}\n');
      expect(await shell.exited).toBe(0);
    } finally {
      await server.stop(true);
    }
  });
});
