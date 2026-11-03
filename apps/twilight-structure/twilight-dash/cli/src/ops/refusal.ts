/**
 * The exit codes `ops` commands keep from the shell lock (`dash-host-jobs` J13): 64 usage or an
 * uncatalogued job or a checkout that moved, 70 a host that cannot run the job measured, 73 an envelope the pool can never
 * hold, 75 no room within the wait budget, 129, 130 and 143 a launcher interrupted by SIGHUP,
 * SIGINT or SIGTERM before its payload started.
 */
export type OpsExitCode = 64 | 70 | 73 | 75 | 129 | 130 | 143;

/**
 * A refusal an `ops` command prints as one `error: ` line and exits with, before the payload
 * runs. Anything else an `ops` command throws exits 1 through the entrypoint.
 */
export class OpsRefusal extends Error {
  override readonly name = 'OpsRefusal';

  constructor(
    readonly exitCode: OpsExitCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

/** `cause`'s message, for a refusal that names what failed underneath it. */
export function causeText(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
