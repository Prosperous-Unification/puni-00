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
  isCi: boolean,
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
    reuseExistingServer: !isCi,
    timeout: 120_000,
    stdout: 'pipe' as const,
    stderr: 'pipe' as const,
  });
  return [
    server('be-01', 'bun src/main.ts', `${beUrl}/health`, {
      APP_ORIGIN: `http://localhost:${String(fePort)}`,
      PORT: String(bePort),
      GW_URL: gwUrl,
      DB_PATH: runDatabase,
      HOSTNAME: 'e2e000000000',
      MIGRATE_ON_STARTUP: 'true',
    }),
    server('gw-01', 'bun src/main.ts', `${gwUrl}/health`, {
      PORT: String(gwPort),
      BE_URL: beUrl,
    }),
    server(
      'fe-01',
      'bunx vite build --minify=false && bunx vite preview',
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
