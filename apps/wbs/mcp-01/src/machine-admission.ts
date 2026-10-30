import { MCP_INTERNAL_SECRET_HEADER } from '@wbs/contracts/mcp-internal-auth';
import type { JWTPayload } from 'jose';

import type { DeploymentFaultReporter, McpDeploymentFault } from './deployment-fault';
import type { CallAdmission, MachineLimits } from './machine-limits';

/** Who a verified machine token acts as (`wbs-mcp-agent-surface` M6), from its signed claims. */
export interface MachineIdentity {
  readonly credentialId: string;
  readonly personId: string;
  readonly organizationId: string;
  /** The opted-in run (M15), or null. */
  readonly runId: string | null;
  readonly jti: string;
  /** The token's `exp`, in seconds. */
  readonly expiresAt: number;
  /** be-01's grant the token carries: the bearer of every be-01 call this caller makes. */
  readonly grant: string;
}

/**
 * The identity of a machine token whose signature, issuer, audience and `exp` mcp-01 has
 * verified. It requires `token_use: machine` and the grant (M5), so a consent token, which has
 * no grant, is never admitted here.
 *
 * @throws when a claim is missing or not text: the token is refused, never completed.
 */
export function machineIdentityOf(payload: JWTPayload): MachineIdentity {
  const text = (name: string): string => {
    const value = payload[name];
    if (typeof value !== 'string' || value === '')
      throw new Error(`machine token has no ${name} claim`);
    return value;
  };
  if (payload['token_use'] !== 'machine') throw new Error('not a machine token');
  const run = payload['wbs_run'];
  // Proof: with this check removed, `refuses a machine token whose run claim is not text`
  // (machine-admission.test.ts) admitted runs '' and 5; watched 2026-10-27.
  if (run !== undefined && (typeof run !== 'string' || run === ''))
    throw new Error('machine token has a malformed wbs_run claim');
  if (typeof payload.exp !== 'number') throw new Error('machine token has no exp');
  return {
    credentialId: text('sub'),
    personId: text('wbs_person'),
    organizationId: text('wbs_organization'),
    runId: run ?? null,
    jti: text('jti'),
    expiresAt: payload.exp,
    // Proof: reading the grant as optional made `refuses a machine token without its grant…`
    // (machine-admission.test.ts) send `Bearer undefined` to be-01; watched 2026-10-27.
    grant: text('wbs_machine_grant'),
  };
}

/**
 * The machine tokens this replica has seen be-01 refuse `unknown_identity` (M3): a revoked,
 * unbound or expired credential. Each is held until its own `exp`, after which signature
 * verification refuses it anyway, so the set never outgrows the refused tokens still alive.
 *
 * Memory, not a store (M5): another replica learns a refusal at its own first refused call.
 * Only `unknown_identity` enters it; a secret or key fault ends with the fault, so a token
 * is never kept refused after the deployment is repaired.
 */
export class RefusedMachineTokens {
  readonly #expiryByJti = new Map<string, number>();

  constructor(private readonly now: () => number) {}

  refuse(identity: MachineIdentity): void {
    const nowSeconds = this.now() / 1_000;
    for (const [jti, expiresAt] of this.#expiryByJti)
      if (expiresAt <= nowSeconds) this.#expiryByJti.delete(jti);
    this.#expiryByJti.set(identity.jti, identity.expiresAt);
  }

  isRefused(jti: string): boolean {
    const expiresAt = this.#expiryByJti.get(jti);
    if (expiresAt === undefined) return false;
    if (expiresAt > this.now() / 1_000) return true;
    this.#expiryByJti.delete(jti);
    return false;
  }

  /** How many refused tokens are held, for tests of the bound. */
  get size(): number {
    return this.#expiryByJti.size;
  }
}

/** The HTTP answer a machine request gets in place of its JSON-RPC body (M3). */
export type MachineHttpRefusal = 'invalid_token' | 'server_error';

/**
 * One HTTP request's machine caller. Its tool calls present the grant beside
 * `MCP_BE_INTERNAL_SECRET` (M14), and what be-01 answered them decides the request's HTTP
 * answer: a grant be-01 cannot verify (`unknown_grant_key`, `invalid_token`) makes it
 * `401 invalid_token`, so the client re-fetches a token; a deployment fault makes it
 * `502 server_error`, which wins over the first. The calls of one JSON-RPC batch run
 * concurrently and share this caller.
 *
 * Each `tools/call` message is admitted by M10's per-credential rate and per-organization
 * in-flight limits ({@link admitCall}); the caller counts what was admitted and what was
 * limited, so a request whose only answer is a limited call can be answered `429`
 * (`mcpHttpResponse`).
 *
 * The secret is a private field, so no printer of the caller reaches it.
 */
export class MachineCaller {
  readonly #secret: string;
  #httpRefusal: MachineHttpRefusal | null = null;
  #admittedCalls = 0;
  #longestLimit: number | null = null;

  constructor(
    readonly identity: MachineIdentity,
    secret: string,
    private readonly refused: RefusedMachineTokens,
    private readonly reportFault: DeploymentFaultReporter,
    private readonly limits: MachineLimits,
  ) {
    this.#secret = secret;
  }

  /**
   * One `tools/call` message against M10's limits: admitted with a release the caller runs when
   * the call ends, or limited, which this caller remembers with its wait.
   */
  admitCall(): CallAdmission {
    const admission = this.limits.admitCall(this.identity);
    if (admission.kind === 'admitted') this.#admittedCalls += 1;
    else this.#longestLimit = Math.max(this.#longestLimit ?? 0, admission.retryAfterSeconds);
    return admission;
  }

  /**
   * The longest wait of this request's limited calls when none of its calls was admitted, else
   * null: the request then ran nothing, and a single such call is answered `429`.
   */
  get unadmittedRetryAfter(): number | null {
    return this.#admittedCalls === 0 ? this.#longestLimit : null;
  }

  /** mcp-01's own header beside the grant on every be-01 call. */
  serviceHeaders(): Readonly<Record<string, string>> {
    return { [MCP_INTERNAL_SECRET_HEADER]: this.#secret };
  }

  get httpRefusal(): MachineHttpRefusal | null {
    return this.#httpRefusal;
  }

  /** be-01 refused the credential (`unknown_identity`): every later request with this token is 401. */
  credentialRefused(): void {
    this.refused.refuse(this.identity);
  }

  /** be-01 could not verify the grant: the request answers `401 invalid_token`. */
  grantRejected(): void {
    this.#httpRefusal ??= 'invalid_token';
  }

  /** Reports `fault`, and the request answers `502 server_error`. */
  deploymentFault(fault: McpDeploymentFault): void {
    this.reportFault(fault);
    // Proof: keeping an earlier outcome here (`??=`) made `answers a batch meeting a key fault
    // and a secret fault 502` (machine-admission.test.ts) answer 401; watched 2026-10-27.
    this.#httpRefusal = 'server_error';
  }
}
