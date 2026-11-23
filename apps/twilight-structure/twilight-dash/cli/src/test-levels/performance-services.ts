import { join } from 'node:path';

export interface PerformanceServiceDescriptor {
  command: string;
  cwd: string;
  url: string;
  env: Record<string, string>;
}

export type PerformanceServiceDescriptors = readonly [
  PerformanceServiceDescriptor,
  PerformanceServiceDescriptor,
  PerformanceServiceDescriptor,
];

/** Decodes the candidate WBS producer output before any command is launched. */
export function decodeServiceDescriptors(source: string): PerformanceServiceDescriptors {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch (cause) {
    // Proof: rethrowing the malformed candidate producer's SyntaxError made
    // the production runner test fail instead of naming invalid descriptor JSON.
    throw new Error('Performance service descriptor output is invalid JSON', { cause });
  }
  // Proof: disabling this guard made the production transport test fail at the
  // object-output fixture (0 pass/1 fail, 33 assertions).
  if (!Array.isArray(parsed) || parsed.length !== 3)
    throw new Error('Performance service descriptor output must contain three services');
  const entries: unknown[] = parsed;
  // The array boundary above requires exactly three entries; map validates every entry and preserves cardinality.
  return entries.map((entry, index) => {
    // Proof: disabling this guard made the committed [null,null,null] producer
    // fail the transport test (0 pass/1 fail, 40 assertions).
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry))
      throw new Error(`Performance service descriptor ${String(index)} is malformed`);
    const command: unknown = Reflect.get(entry, 'command');
    const cwd: unknown = Reflect.get(entry, 'cwd');
    const url: unknown = Reflect.get(entry, 'url');
    const environment: unknown = Reflect.get(entry, 'env');
    // Proof: disabling this guard made the numeric-command/missing-fields
    // producer fail the transport test (0 pass/1 fail, 47 assertions).
    if (
      typeof command !== 'string' ||
      typeof cwd !== 'string' ||
      typeof url !== 'string' ||
      typeof environment !== 'object' ||
      environment === null ||
      Array.isArray(environment)
    )
      throw new Error(`Performance service descriptor ${String(index)} is malformed`);
    const environmentEntries: [string, string][] = [];
    for (const [key, value] of Object.entries(environment)) {
      // Proof: the candidate producer's numeric PORT reached this decoder and
      // the transport fault test observed the malformed-environment refusal.
      if (typeof value !== 'string')
        throw new Error(`Performance service descriptor ${String(index)} has invalid environment`);
      environmentEntries.push([key, value]);
    }
    // Proof: a candidate JSON environment with an own __proto__ key previously
    // lost that key during assignment; the production runner accepted it.
    const env: Record<string, string> = Object.fromEntries(environmentEntries);
    return { command, cwd, url, env };
  }) as [PerformanceServiceDescriptor, PerformanceServiceDescriptor, PerformanceServiceDescriptor];
}

export function assertCandidateServiceDescriptors(
  descriptors: readonly PerformanceServiceDescriptor[],
  checkoutRoot: string,
  shift: number,
  runDatabase: string,
): void {
  const bePort = String(3100 + shift);
  const gwPort = String(3200 + shift);
  const fePort = String(4200 + shift);
  const beUrl = `http://localhost:${bePort}`;
  const gwUrl = `http://localhost:${gwPort}`;
  const expected: readonly PerformanceServiceDescriptor[] = [
    {
      command: 'bun src/testing/ordinary-browser-server.ts',
      cwd: join(checkoutRoot, 'apps/wbs/be-01'),
      url: beUrl + '/_ordinary/ready',
      env: {
        E2E_CURRENT_COHORT: 'current',
        NODE_ENV: 'development',
        AUTH_MODE: 'local',
        BROWSER_SESSION_AUTHORITY: 'enabled',
        APP_ORIGIN: 'http://localhost:' + fePort,
        PORT: bePort,
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
      },
    },
    {
      command: 'bun src/testing/ordinary-browser-gateway.ts',
      cwd: join(checkoutRoot, 'apps/wbs/gw-01'),
      url: gwUrl + '/health',
      env: {
        E2E_CURRENT_COHORT: 'current',
        AUTH_MODE: 'oidc',
        APP_ORIGIN: 'http://localhost:' + fePort,
        PORT: gwPort,
        BE_URL: beUrl,
        LOG_LEVEL: 'error',
        JWT_SIGNING_KEY_CURRENT: 'test-jwt-signing-key-at-least-32-chars',
        INTERNAL_AUTH_SECRET: 'ordinary-internal-secret-0123456789abcdef',
      },
    },
    {
      command: 'bun ordinary-browser-frontend.ts',
      cwd: join(checkoutRoot, 'apps/wbs/fe-01'),
      url: 'http://localhost:' + fePort,
      env: {
        PORT: fePort,
        VITE_BE_URL: beUrl,
        VITE_GW_URL: gwUrl,
        VITE_WS_URL: 'ws://localhost:' + gwPort + '/ws',
      },
    },
  ];
  const sameEnvironment = (left: Record<string, string>, right: Record<string, string>) =>
    JSON.stringify(Object.entries(left).sort()) === JSON.stringify(Object.entries(right).sort());
  // Proof: independently removing command/cwd/URL/environment comparison failed
  // performance-services.test.ts refusals against the real current WBS producer.
  if (
    descriptors.length !== expected.length ||
    descriptors.some((descriptor, index) => {
      const required = expected.at(index);
      if (required === undefined) return true;
      return (
        descriptor.command !== required.command ||
        descriptor.cwd !== required.cwd ||
        descriptor.url !== required.url ||
        !sameEnvironment(descriptor.env, required.env)
      );
    })
  )
    throw new Error('Performance service descriptors differ from the approved shifted WBS stack');
}
