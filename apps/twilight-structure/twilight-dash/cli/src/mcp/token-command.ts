import { parseSecretsOrThrow, type } from '@shared/validation';

import type { Monotonic } from '../clock';
import {
  ApiKey,
  assertionFileReader,
  type AssertionReader,
  type FetchLike,
  gitHubActionsReader,
  JWT_BEARER_GRANT,
  mcpEndpointOf,
  refusalOf,
  retryAfterSecondsOf,
  runOf,
} from './machine-token';

/** Claude Code kills a `headersHelper` after 10 s (design.md, _Anthropic clients_). */
export const HELPER_BUDGET_MS = 10_000;
/** Kept back from the budget for the retry itself and printing (M2). */
const HELPER_MARGIN_MS = 1_000;

/** Everything `mcp token` reaches outside its arguments; `cli.ts` composes them. */
export interface McpTokenDependencies {
  readonly send: FetchLike;
  /** Measures the helper budget from the command's start. */
  readonly monotonic: Monotonic;
  readonly sleep: (milliseconds: number) => Promise<void>;
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly write: (text: string) => unknown;
}

const USAGE =
  'usage: mcp token --resource <url> (--key-file <path> | --assertion-file <path> | --github-actions-audience <audience>) [--run <id>]';
const FLAGS = new Set([
  '--resource',
  '--key-file',
  '--assertion-file',
  '--github-actions-audience',
  '--run',
]);
const CREDENTIAL_FLAGS = ['--key-file', '--assertion-file', '--github-actions-audience'] as const;

/** A machine credential as one token request presents it. */
type Presentation =
  | { readonly kind: 'api_key'; readonly key: ApiKey }
  | { readonly kind: 'assertion'; readonly read: AssertionReader };

const IssuedToken = type({ access_token: 'string > 0', token_type: /^[Bb]earer$/ });

/**
 * `twilight-dash mcp token`: prints `{"Authorization":"Bearer <token>"}` for Claude Code's
 * `headersHelper`, from a fresh token request on **every** run (`wbs-mcp-agent-surface` M2).
 * It keeps no cache, in memory or on disk, so Claude Code's re-run after a 401 (an expired
 * token, or `unknown_grant_key` after a grant key rotation) always issues a new token.
 *
 * The secret never travels in an argument: `--key-file` names an owner-only file holding a
 * `wbs_mk_` key (`client_credentials`, HTTP Basic); `--assertion-file` names a workload token
 * file reread per run (Kubernetes); `--github-actions-audience` fetches a GitHub Actions OIDC
 * token (JWT-bearer grant). `--run` adds `wbs_run` (M15).
 *
 * On a `429` it waits the `Retry-After` seconds, capped at what remains of the 10 s helper
 * budget minus 1 s measured from its start, and retries once; when that cap is zero or less it
 * does not retry. Every refusal throws, so the entrypoint exits 1 with one `error:` line that
 * names the status and OAuth error, never the key, the assertion or the token.
 */
export async function runMcpCommand(
  argv: readonly string[],
  deps: McpTokenDependencies,
): Promise<void> {
  const started = deps.monotonic.now();
  const [subcommand, ...flags] = argv;
  if (subcommand !== 'token') throw new Error(USAGE);
  const values = new Map<string, string>();
  for (let index = 0; index < flags.length; index += 2) {
    const name = flags.at(index);
    const value = flags.at(index + 1);
    if (
      name === undefined ||
      !FLAGS.has(name) ||
      values.has(name) ||
      value === undefined ||
      value.length === 0 ||
      value.startsWith('--')
    ) {
      throw new Error(USAGE);
    }
    values.set(name, value);
  }
  const resource = values.get('--resource');
  const chosen = CREDENTIAL_FLAGS.filter((name) => values.has(name));
  // Proof: admitting two credential flags made `refuses no credential or two` read the first
  // and print a token (2026-10-27).
  if (resource === undefined || chosen.length !== 1) throw new Error(USAGE);
  const endpoint = mcpEndpointOf(resource);
  const runFlag = values.get('--run');
  const run = runFlag === undefined ? undefined : runOf(runFlag);
  const presentation = presentationOf(chosen[0], values, deps);

  const form = new URLSearchParams({ resource: endpoint.resource });
  const headers = new Headers({
    'content-type': 'application/x-www-form-urlencoded',
    accept: 'application/json',
  });
  if (presentation.kind === 'api_key') {
    form.set('grant_type', 'client_credentials');
    headers.set('authorization', presentation.key.basicAuthorization());
  } else {
    form.set('grant_type', JWT_BEARER_GRANT);
    form.set('assertion', await presentation.read());
  }
  // Proof: dropping this made `a run is signed into the token as wbs_run` find no `wbs_run`
  // claim (2026-10-27).
  if (run !== undefined) form.set('wbs_run', run);

  const request = (): Promise<Response> =>
    deps.send(endpoint.tokenUrl, { method: 'POST', headers, body: form });
  let response = await request();
  if (response.status === 429) {
    const retryAfter = retryAfterSecondsOf(response);
    if (retryAfter === null) throw await refusalOf(response);
    const remaining = HELPER_BUDGET_MS - HELPER_MARGIN_MS - (deps.monotonic.now() - started);
    const wait = Math.min(retryAfter * 1_000, remaining);
    // Proof: dropping this check made `a 429 whose capped wait is zero or less is not retried`
    // retry and print a token (2026-10-27).
    if (wait <= 0) throw await refusalOf(response);
    await deps.sleep(wait);
    // One retry, never a loop: a second 429 falls through to the refusal below.
    // Proof: retrying while 429 made `a 429 retried once and refused again exits non-zero`
    // print the third answer's token (2026-10-27).
    response = await request();
  }
  // Proof: a refusal naming the request's `authorization` header made `the entrypoint prints
  // only the header map, and a refusal names no key` see the Basic form on stderr (2026-10-27).
  if (response.status !== 200) throw await refusalOf(response);
  const issued = parseSecretsOrThrow(IssuedToken, await response.json());
  deps.write(`${JSON.stringify({ Authorization: `Bearer ${issued.access_token}` })}\n`);
}

function presentationOf(
  flag: (typeof CREDENTIAL_FLAGS)[number] | undefined,
  values: ReadonlyMap<string, string>,
  deps: McpTokenDependencies,
): Presentation {
  const value = flag === undefined ? undefined : values.get(flag);
  if (flag === undefined || value === undefined) throw new Error(USAGE);
  if (flag === '--key-file') return { kind: 'api_key', key: ApiKey.read(value) };
  if (flag === '--assertion-file') return { kind: 'assertion', read: assertionFileReader(value) };
  return { kind: 'assertion', read: gitHubActionsReader(value, deps.environment, deps.send) };
}
