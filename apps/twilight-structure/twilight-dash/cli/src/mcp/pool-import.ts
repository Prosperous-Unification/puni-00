import { randomBytes } from 'node:crypto';
import {
  closeSync,
  constants,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readlinkSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { parseSecretsOrThrow, type } from '@shared/validation';

import { ConfigurationRefusal, readOwnerOnly } from '../compute/configuration';
import {
  ApiKey,
  type FetchLike,
  IssuedToken,
  type McpEndpoint,
  mcpEndpointOf,
  postTokenRequest,
  refusalOf,
  retryAfterSecondsOf,
  runOf,
} from './machine-token';

/** Everything `pool import` reaches outside its arguments; `entrypoint.ts` composes them. */
export interface PoolImportDependencies {
  readonly send: FetchLike;
  readonly write: (text: string) => unknown;
  /**
   * The command that starts this Dash, `[bun, entrypoint.ts]`, which each agent's
   * `headersHelper` runs with `mcp token`.
   */
  readonly helper: readonly string[];
  /** Waits out a token endpoint `Retry-After` while proving the keys. */
  readonly sleep: (milliseconds: number) => Promise<void>;
  /** The store writes a test can fail; production passes {@link systemPoolFiles}. */
  readonly files: PoolFiles;
}

/** The two store writes whose failure `pool import` must survive with the store intact. */
export interface PoolFiles {
  /** Writes `text` to a new `0600` file, never following a link or replacing a file. */
  writeNewText(path: string, text: string): void;
  /** Renames `from` over `to` in one step (`rename(2)`). */
  rename(from: string, to: string): void;
}

/** {@link PoolFiles} on the real file system. */
export const systemPoolFiles: PoolFiles = {
  writeNewText(path, text) {
    const descriptor = openSync(
      path,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600,
    );
    try {
      writeSync(descriptor, text);
    } finally {
      closeSync(descriptor);
    }
  },
  rename: (from, to) => {
    renameSync(from, to);
  },
};

export const USAGE = 'usage: pool import <pool-keys.json> --store <directory>';
const DOCUMENT_FORMAT = 'wbs-agent-pool-keys';
/**
 * be-01 caps a pool at 100 agents (`createAgentPool`). A document of 100 fits `readOwnerOnly`'s
 * 64 KiB cap: each agent entry, pretty-printed with the longest name (64 characters) and UUIDs,
 * is about 330 bytes, so 100 are 32,802 bytes (measured 2026-10-28).
 */
const MOST_AGENTS = 100;
/** A pool's issuances share one per-source bucket at mcp-01 (M10): a 429 is waited out. */
const MOST_RATE_LIMIT_RETRIES = 3;
/** The longest `Retry-After` waited before the import gives up and says how long to wait. */
const MOST_RETRY_AFTER_SECONDS = 60;
/** An id that is safe as one path component and inside a `wbs_run`. */
const ID = /^[A-Za-z0-9_-]{1,100}$/;

/**
 * `wbs-agent-pool-keys` v1 as Dash reads it: a copy of be-01's `agentPoolKeys`
 * (`@wbs/contracts` `agent-pool-shapes.ts`, which Dash's product boundary does not reach),
 * narrowed to what Dash relies on. Ids become file names and runs, so they are held to
 * {@link ID}; be-01 mints them with `crypto.randomUUID()` (`agent-pool.routes.ts`).
 */
const PoolKeys = type({
  format: `'${DOCUMENT_FORMAT}'`,
  version: '1',
  organizationId: 'string > 0',
  authorizationServer: 'string > 0',
  mcpResource: 'string > 0',
  poolId: ID,
  name: 'string > 0',
  expiresAt: 'number | null',
  issuedAt: 'number',
  agents: type({
    personId: ID,
    personName: 'string > 0',
    credentialId: ID,
    key: 'string > 0',
  })
    .array()
    .atLeastLength(1)
    .atMostLength(MOST_AGENTS),
});
type PoolKeys = typeof PoolKeys.infer;

/** One agent as the store records it; never its key. */
interface StoredAgent {
  readonly personId: string;
  readonly personName: string;
  readonly credentialId: string;
  readonly run: string;
  readonly keyFile: string;
  readonly mcpConfig: string;
}

/** An agent of the document, its key held as an {@link ApiKey}. */
interface PoolAgent {
  readonly personId: string;
  readonly personName: string;
  readonly credentialId: string;
  readonly key: ApiKey;
  readonly run: string;
}

/**
 * `twilight-dash pool import <file> --store <directory>`: takes the `wbs-agent-pool-keys` v1
 * document an admin downloaded when creating or re-keying an agent pool
 * (`wbs-mcp-agent-surface` M7) and stores it as the files `mcp token` reads.
 *
 * - The document is read from an owner-only (`0600`) file and validated once; an unknown
 *   `format` or `version` is refused. Its `authorizationServer` must be the one `mcp token`
 *   derives from `mcpResource`, or the stored helpers would ask another server.
 * - **Every key is proven before anything is written**: one `client_credentials` token request
 *   each, with the agent's run, as `mcp token` sends it. One refusal aborts the import, the store
 *   untouched.
 * - Each agent gets its own run, `pool-<poolId>/<personId>`: stable across re-keys and
 *   re-imports, so a process re-fetching after a re-key keeps its leases (M15).
 * - The store holds, per pool, a directory `pool-<poolId>` (a link to one generation) with
 *   `<personId>.key` (`0600`, as `--key-file` requires), `<personId>.mcp.json` (an MCP config
 *   whose `headersHelper` runs `mcp token` with that key file and run) and `pool.json` (the
 *   agents, their runs and paths; no key). A re-import writes a new generation and switches the
 *   link in one rename, so an agent absent from the new document (its key revoked alone) loses
 *   its key file, and a helper never reads half a pool.
 *
 * Output names the pool, its agents and their runs, never a key; refusals name an agent by its
 * person name and the token endpoint's status and OAuth error.
 */
export async function runPoolCommand(
  argv: readonly string[],
  deps: PoolImportDependencies,
): Promise<void> {
  const file = argv.at(1);
  const store = argv.at(3);
  if (
    argv.length !== 4 ||
    argv.at(0) !== 'import' ||
    argv.at(2) !== '--store' ||
    file === undefined ||
    file.length === 0 ||
    store === undefined ||
    store.length === 0
  ) {
    throw new Error(USAGE);
  }
  // A key or the whole document pasted where the path belongs would be echoed by a file error.
  // Proof: without this check `refuses a key pasted where the file belongs` got the file refusal
  // `the pool key file does not exist` instead of this one (2026-10-28).
  if (file.includes('wbs_mk_') || file.trimStart().startsWith('{')) {
    throw new Error('pool import names the pool key file, not its contents');
  }
  const pool = readPoolKeys(file);
  const endpoint = endpointOf(pool);
  const agents = agentsOf(pool);

  // Proof: continuing past a refused agent (`.catch(() => undefined)`) made `a key that fails to
  // issue aborts the import with nothing written` and `a refused re-import keeps the pool as it
  // was` resolve, importing every agent (2026-10-28).
  for (const agent of agents) await proveIssues(agent, endpoint, deps);

  const storeDirectory = openStore(store);
  const stored = writePool(storeDirectory, pool, endpoint, agents, deps);
  deps.write(
    `imported pool ${pool.name} (${pool.poolId}): ${String(stored.length)} agents, every key ` +
      `issued a token, into ${join(storeDirectory, `pool-${pool.poolId}`)}\n`,
  );
  for (const agent of stored) {
    deps.write(`  ${agent.personName} (${agent.personId}) run ${agent.run}: ${agent.mcpConfig}\n`);
  }
  deps.write(`delete ${file} now: it holds every key of the pool\n`);
}

/**
 * What a pool key file refusal says for each of `readOwnerOnly`'s reasons. Only the mode refusal
 * names the path, as the command that fixes it: a key pasted as the path is refused before.
 */
function poolFileRefusal(reason: ConfigurationRefusal['reason'], path: string): string {
  if (reason === 'config_absent') return 'the pool key file does not exist';
  if (reason === 'config_malformed') return 'the pool key file is over 64 KiB';
  if (reason === 'credential_not_owner_only') {
    return `the pool key file must be owned by this user with mode 0600; run: chmod 600 ${shellWord(path)}`;
  }
  return 'the pool key file cannot be read';
}

/**
 * The validated document at `path`.
 * @throws when the file is not owner-only `0600`, is not JSON, is another format or version, or
 * does not hold a valid v1 document; no message carries a value from it but the version.
 */
function readPoolKeys(path: string): PoolKeys {
  let text: string;
  try {
    // A browser saves the download `0644`; the most restrictive reading refuses it until the
    // admin narrows it, as `--key-file` does.
    // Proof: reading it with `readFileSync` made `refuses a group-readable pool key file` fail
    // (2026-10-28).
    text = readOwnerOnly(path);
  } catch (cause) {
    if (!(cause instanceof ConfigurationRefusal)) throw cause;
    // Proof: naming no path made `refuses a group-readable pool key file, naming the chmod`
    // fail (2026-10-28).
    throw new Error(poolFileRefusal(cause.reason, path), { cause });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // The parser's message quotes the bytes, which hold keys; the cause is dropped on purpose.
    throw new Error('the pool key file is not JSON');
  }
  const header = type({ format: 'unknown', version: 'unknown' })(parsed);
  if (header instanceof type.errors || header.format !== DOCUMENT_FORMAT) {
    throw new Error(`the pool key file is not a ${DOCUMENT_FORMAT} document`);
  }
  // Proof: without this check `refuses an unknown document version` got the field-path refusal
  // `Validation failed for version` instead of naming the version (2026-10-28).
  if (header.version !== 1) {
    const named = typeof header.version === 'number' ? String(header.version) : 'that is no number';
    throw new Error(`${DOCUMENT_FORMAT} version ${named} is not supported; this Dash reads 1`);
  }
  return parseSecretsOrThrow(PoolKeys, parsed);
}

/**
 * The endpoint every stored helper will ask: `mcp token`'s, derived from `mcpResource`.
 * @throws when `mcpResource` is not https (or loopback http), or `authorizationServer` differs
 * from the derived issuer.
 */
function endpointOf(pool: PoolKeys): McpEndpoint {
  const endpoint = mcpEndpointOf(pool.mcpResource);
  // Proof: dropping this check made `refuses an authorizationServer that mcp token would not
  // ask` fail (2026-10-28).
  if (endpoint.issuer !== pool.authorizationServer) {
    throw new Error(
      `the document's authorizationServer ${pool.authorizationServer} is not ${endpoint.issuer}, the one mcp token asks for ${endpoint.resource}`,
    );
  }
  return endpoint;
}

/**
 * The document's agents, each with its key and run.
 * @throws when a key is no `wbs_mk_` key, names another credential, or a person or credential
 * appears twice.
 */
function agentsOf(pool: PoolKeys): PoolAgent[] {
  const seen = new Set<string>();
  return pool.agents.map((entry) => {
    const where = `agent ${entry.personName}`;
    const key = ApiKey.of(entry.key, `the key of ${where}`);
    // Proof: dropping this check made `refuses a key that names another credential, and an
    // agent listed twice` fail (2026-10-28).
    if (key.credentialId !== entry.credentialId) {
      throw new Error(`the key of ${where} is not of its credential ${entry.credentialId}`);
    }
    for (const identity of [
      `person ${entry.personId}`,
      `name ${entry.personName}`,
      `credential ${entry.credentialId}`,
    ]) {
      // Proof: dropping this check made `…and an agent listed twice` get `pool pool-a could not
      // be written; the store keeps what it had` (EEXIST on the second key file) (2026-10-28).
      if (seen.has(identity)) throw new Error(`the pool lists ${identity} twice`);
      seen.add(identity);
    }
    return {
      personId: entry.personId,
      personName: entry.personName,
      credentialId: entry.credentialId,
      key,
      run: runOf(`pool-${pool.poolId}/${entry.personId}`),
    };
  });
}

/**
 * Issues one token with the agent's key and run, as `mcp token` would, and drops it. The proofs
 * run one after another, and each mints a real bearer that is never stored or printed; it stays
 * valid until it expires, as any token a helper drops does. A `429` (the pool shares mcp-01's
 * per-source bucket: burst 100, 5 a second) is waited out per its `Retry-After`, at most
 * {@link MOST_RATE_LIMIT_RETRIES} times and {@link MOST_RETRY_AFTER_SECONDS} each.
 * @throws naming the agent and the token endpoint's refusal; for a rate limit not waited out,
 * how long to wait before rerunning.
 */
async function proveIssues(
  agent: PoolAgent,
  endpoint: McpEndpoint,
  deps: Pick<PoolImportDependencies, 'send' | 'sleep'>,
) {
  const form = new URLSearchParams({
    grant_type: 'client_credentials',
    resource: endpoint.resource,
    wbs_run: agent.run,
  });
  const headers = new Headers({
    'content-type': 'application/x-www-form-urlencoded',
    accept: 'application/json',
    authorization: agent.key.basicAuthorization(),
  });
  try {
    let response = await postTokenRequest(deps.send, endpoint.tokenUrl, headers, form);
    for (let retry = 0; response.status === 429; retry += 1) {
      const retryAfter = retryAfterSecondsOf(response) ?? MOST_RETRY_AFTER_SECONDS;
      // Proof: dropping this bound made `a 429 not waited out within its bound aborts, saying
      // how long to wait` resolve (2026-10-28).
      if (retry === MOST_RATE_LIMIT_RETRIES || retryAfter > MOST_RETRY_AFTER_SECONDS) {
        throw new Error(
          `the MCP token endpoint is rate limiting issuances; wait ${String(retryAfter)} s and rerun`,
        );
      }
      // Proof: not waiting made `waits out a 429 per its Retry-After and imports` fail
      // (2026-10-28).
      await deps.sleep(retryAfter * 1_000);
      response = await postTokenRequest(deps.send, endpoint.tokenUrl, headers, form);
    }
    if (response.status !== 200) throw await refusalOf(response);
    parseSecretsOrThrow(IssuedToken, await response.json());
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    throw new Error(
      `agent ${agent.personName}'s key did not issue a token, so nothing was imported: ${reason}`,
      { cause },
    );
  }
}

/**
 * The store directory, created with every missing parent `0700` when absent.
 * @throws when it is not a directory (a link included) owned by this user without group or
 * other permissions.
 */
function openStore(path: string): string {
  const directory = resolve(path);
  try {
    // Proof: creating the parents without a mode made `creates a missing store and its parents
    // 0700` see a 0775 parent (umask 002) (2026-10-28).
    mkdirSync(directory, { recursive: true, mode: 0o700 });
  } catch (cause) {
    throw new Error(`--store ${directory} cannot be created`, { cause });
  }
  // Proof: `statSync` here made `refuses a store that is a link` import through the link
  // (2026-10-28); dropping the check made `refuses a store other users can enter` resolve,
  // writing the keys into the 0755 directory (2026-10-28).
  const entry = lstatSync(directory);
  if (!entry.isDirectory() || entry.uid !== process.getuid?.() || (entry.mode & 0o077) !== 0) {
    throw new Error(
      `--store ${directory} must be a directory owned by this user with mode 0700, not a link`,
    );
  }
  return directory;
}

/** `value` as one POSIX shell word. */
function shellWord(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

/**
 * Writes a new generation of the pool into `store` and switches `pool-<poolId>` to it in one
 * rename, then removes the generation it replaced.
 * @throws when a file cannot be written, after removing the partial generation; the pool's
 * previous generation stays in place.
 */
function writePool(
  store: string,
  pool: PoolKeys,
  endpoint: McpEndpoint,
  agents: readonly PoolAgent[],
  deps: Pick<PoolImportDependencies, 'helper' | 'files'>,
): StoredAgent[] {
  const { helper, files } = deps;
  const current = join(store, `pool-${pool.poolId}`);
  const generationName = `.pool-${pool.poolId}.${randomBytes(8).toString('hex')}`;
  const generation = join(store, generationName);
  assertImportedPool(current, pool.poolId);
  mkdirSync(generation, { mode: 0o700 });
  const stored: StoredAgent[] = [];
  try {
    for (const agent of agents) {
      // Paths name the stable link, never the generation: a helper started before a re-key reads
      // the new key on its next run.
      const keyFile = join(current, `${agent.personId}.key`);
      const mcpConfig = join(current, `${agent.personId}.mcp.json`);
      agent.key.writeNew(join(generation, `${agent.personId}.key`));
      const headersHelper = [
        ...helper,
        'mcp',
        'token',
        '--resource',
        endpoint.resource,
        '--key-file',
        keyFile,
        '--run',
        agent.run,
      ]
        .map(shellWord)
        .join(' ');
      files.writeNewText(
        join(generation, `${agent.personId}.mcp.json`),
        `${JSON.stringify(
          { mcpServers: { wbs: { type: 'http', url: endpoint.resource, headersHelper } } },
          null,
          2,
        )}\n`,
      );
      stored.push({
        personId: agent.personId,
        personName: agent.personName,
        credentialId: agent.credentialId,
        run: agent.run,
        keyFile,
        mcpConfig,
      });
    }
    files.writeNewText(
      join(generation, 'pool.json'),
      `${JSON.stringify(
        {
          format: 'twilight-dash-pool',
          version: 1,
          organizationId: pool.organizationId,
          poolId: pool.poolId,
          name: pool.name,
          mcpResource: endpoint.resource,
          authorizationServer: pool.authorizationServer,
          expiresAt: pool.expiresAt,
          issuedAt: pool.issuedAt,
          agents: stored,
        },
        null,
        2,
      )}\n`,
    );
    const link = `${generation}.link`;
    symlinkSync(generationName, link);
    // Proof: renaming only on a first import made `a re-import replaces the pool keys, and an
    // agent absent from it loses its key` read fleet-1's first key (2026-10-28).
    files.rename(link, current);
  } catch (cause) {
    // Proof: not removing the generation made `a write that fails leaves no partial
    // generation…` find the first agent's key file in a stray generation (2026-10-28).
    rmSync(generation, { recursive: true, force: true });
    rmSync(`${generation}.link`, { force: true });
    throw new Error(`pool ${pool.poolId} could not be written; the store keeps what it had`, {
      cause,
    });
  }
  const target = readlinkSync(current);
  sweepGenerations(store, pool.poolId, target);
  // Proof: dropping this check made `an import replaced concurrently exits non-zero…` resolve
  // (2026-10-28).
  if (target !== generationName || !existsSync(join(generation, 'pool.json'))) {
    throw new Error(
      `another import replaced pool ${pool.poolId} concurrently; check ${current} and rerun`,
    );
  }
  return stored;
}

/**
 * Removes every generation of the pool, and every pending link, but `target`, the one
 * `pool-<poolId>` links to:
 * the generation this import replaced, a crashed import's leftovers, and a concurrent import's
 * generation (that import then fails its own check). None keeps a key on disk.
 */
function sweepGenerations(store: string, poolId: string, target: string): void {
  const leftover = new RegExp(`^\\.pool-${poolId}\\.[0-9a-f]{16}(\\.link)?$`);
  for (const entry of readdirSync(store)) {
    // Proof: sparing the stray generation made `sweeps a stray generation…` fail; skipping the
    // sweep made it and `…loses its key` find two generations of pool-a (2026-10-28).
    if (leftover.test(entry) && entry !== target) {
      rmSync(join(store, entry), { recursive: true, force: true });
    }
  }
}

/**
 * Checks that `current` is absent or a link this Dash made to a generation of this pool.
 * @throws when it is anything else: a directory, or a link elsewhere (`/etc`).
 */
function assertImportedPool(current: string, poolId: string): void {
  let entry: ReturnType<typeof lstatSync>;
  try {
    entry = lstatSync(current);
  } catch (cause) {
    if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') return;
    throw cause;
  }
  const target = entry.isSymbolicLink() ? readlinkSync(current) : null;
  // Proof: accepting a non-link here made `refuses to replace a pool directory it did not
  // write` get `pool pool-a could not be written; the store keeps what it had` (2026-10-28).
  if (
    target === null ||
    dirname(target) !== '.' ||
    !new RegExp(`^\\.pool-${poolId}\\.[0-9a-f]{16}$`).test(target)
  ) {
    throw new Error(`${current} is not a pool this Dash imported; move it aside first`);
  }
}
