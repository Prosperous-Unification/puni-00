export type Tier = 'be' | 'gw' | 'fe';

export interface DeployArgs {
  tiers: Tier[] | 'affected' | 'all';
  version?: string;
  since?: string;
  bundle?: string;
  host?: string;
  dryRun: boolean;
  skipBuild: boolean;
  /** Acknowledges the deploy carries a reviewed, additive-only migration. */
  withMigrations: boolean;
  /** Acknowledges the deploy carries a migration too risky for blue/green; plain restart, brief outage. */
  stopTheWorld: boolean;
}

function parseTierArg(v: string): Tier[] {
  const ts = v
    .split(/[,\s]+/)
    .filter(Boolean)
    .map((t) => t.toLowerCase());
  for (const t of ts) {
    if (t !== 'be' && t !== 'gw' && t !== 'fe') {
      throw new Error(`unknown tier: ${t}`);
    }
  }
  return ts as Tier[];
}

export function parseDeployArgs(argv: string[]): DeployArgs {
  const result: DeployArgs = {
    tiers: 'affected',
    dryRun: true,
    skipBuild: false,
    withMigrations: false,
    stopTheWorld: false,
  };
  const positional: string[] = [];

  for (const raw of argv) {
    if (!raw.startsWith('--')) {
      positional.push(raw);
      continue;
    }
    const m = /^--([^=]+)(?:=(.*))?$/.exec(raw);
    if (!m) continue;
    const key = m[1];
    const val = (m[2] as string | undefined) ?? '';
    if (key === 'all') result.tiers = 'all';
    else if (key === 'since') result.since = val;
    else if (key === 'version') result.version = val;
    else if (key === 'bundle') result.bundle = val;
    else if (key === 'host') result.host = val;
    else if (key === 'dry-run') result.dryRun = true;
    else if (key === 'execute') result.dryRun = false;
    else if (key === 'skip-build') result.skipBuild = true;
    else if (key === 'with-migrations') result.withMigrations = true;
    else if (key === 'stop-the-world') result.stopTheWorld = true;
  }

  if (positional.length > 0) {
    const parsed = parseTierArg(positional.join(','));
    if (parsed.length > 0) result.tiers = parsed;
  }

  return result;
}

export function materialize(args: DeployArgs, affected: Tier[]): Tier[] {
  if (args.tiers === 'all') return ['be', 'gw', 'fe'];
  if (args.tiers === 'affected') return affected;
  return args.tiers;
}
