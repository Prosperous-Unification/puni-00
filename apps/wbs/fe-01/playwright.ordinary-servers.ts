import { join } from 'node:path';

const DEFAULT_PORTS = [3100, 3200, 4200];

/** The single shift parser used by ordinary Browser and Performance startup. */
export function parseOrdinaryPortShift(asked: string | undefined, requireShift = false): number {
  if (asked === undefined || asked === '') {
    if (requireShift) throw new Error('E2E_PORT_SHIFT must select non-default Performance ports');
    return 0;
  }
  const shift = Number(asked);
  if (!Number.isInteger(shift) || shift < 0 || shift > 9999) {
    throw new Error(`E2E_PORT_SHIFT must be a whole number between 0 and 9999; got ${asked}`);
  }
  if (requireShift && String(shift) !== asked)
    throw new Error('E2E_PORT_SHIFT must be canonical decimal for Performance');
  const shifted = DEFAULT_PORTS.map((port) => port + shift);
  const collision = shifted.find((port) => DEFAULT_PORTS.includes(port));
  if (shift !== 0 && collision !== undefined) {
    throw new Error(
      `E2E_PORT_SHIFT=${String(shift)} puts a tier on ${String(collision)}, another tier's usual port`,
    );
  }
  if (requireShift && shift === 0)
    throw new Error('E2E_PORT_SHIFT must select non-default Performance ports');
  return shift;
}

/** Exact service command, cwd, URL and environment shared by the two browser levels. */
export function ordinaryServerDescriptors(
  repoRoot: string,
  portShift: number,
  _isCi: boolean,
  runDatabase: string,
) {
  const bePort = 3100 + portShift;
  const gwPort = 3200 + portShift;
  const fePort = 4200 + portShift;
  const beUrl = `http://localhost:${String(bePort)}`;
  const gwUrl = `http://localhost:${String(gwPort)}`;
  const server = (app: string, command: string, url: string, env: Record<string, string>) => ({
    command,
    cwd: join(repoRoot, 'apps', 'wbs', app),
    url,
    env,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'pipe' as const,
    stderr: 'pipe' as const,
  });
  return [
    server('be-01', 'bun src/testing/ordinary-browser-server.ts', `${beUrl}/_ordinary/ready`, {
      E2E_CURRENT_COHORT: 'current',
      NODE_ENV: 'development',
      AUTH_MODE: 'local',
      BROWSER_SESSION_AUTHORITY: 'enabled',
      APP_ORIGIN: `http://localhost:${String(fePort)}`,
      PORT: String(bePort),
      GW_URL: gwUrl,
      DB_PATH: runDatabase,
      HOSTNAME: 'e2e000000000',
      LOG_LEVEL: 'error',
      JWT_SIGNING_KEY_CURRENT: 'test-jwt-signing-key-at-least-32-chars',
      INTERNAL_AUTH_SECRET: 'ordinary-internal-secret-0123456789abcdef',
      ORGANIZATION_DEFAULT_MAX_AGENT_PERSONS: '50',
      ORGANIZATION_DEFAULT_MAX_CONCURRENT_CLAIMS: '200',
      ORGANIZATION_DEFAULT_MAX_CAPACITY_UNITS_PER_RESOURCE: '10000',
      MCP_BE_INTERNAL_SECRET: 'mcp-secret-0123456789abcdefghijklmn',
      WBS_MACHINE_GRANT_SIGNING_KEY_CURRENT: 'grant-key-g-0123456789abcdefghijklmn',
      WBS_MCP_AUTHORIZATION_SERVER: 'https://wbs.example/mcp/oauth',
      SOLVER_BUDGET_MS: '60000',
      SOLVER_SEARCH_WORKERS: '2',
      SOLVER_MEMORY_LIMIT_MB: '512',
    }),
    server('gw-01', 'bun src/testing/ordinary-browser-gateway.ts', `${gwUrl}/health`, {
      E2E_CURRENT_COHORT: 'current',
      AUTH_MODE: 'oidc',
      APP_ORIGIN: `http://localhost:${String(fePort)}`,
      PORT: String(gwPort),
      BE_URL: beUrl,
      LOG_LEVEL: 'error',
      JWT_SIGNING_KEY_CURRENT: 'test-jwt-signing-key-at-least-32-chars',
      INTERNAL_AUTH_SECRET: 'ordinary-internal-secret-0123456789abcdef',
    }),
    server(
      'fe-01',
      'bun ordinary-browser-frontend.ts',
      `http://localhost:${String(fePort)}`,
      {
        PORT: String(fePort),
        VITE_BE_URL: beUrl,
        VITE_GW_URL: gwUrl,
        VITE_WS_URL: `ws://localhost:${String(gwPort)}/ws`,
      },
    ),
  ];
}
