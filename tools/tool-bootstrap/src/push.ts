export interface PushArgs {
  host: string;
  user: string;
  scriptPath: string;
  dryRun: boolean;
}

export function parsePushArgs(argv: string[], defaults?: Partial<PushArgs>): PushArgs {
  let host = defaults?.host ?? '';
  let user = defaults?.user ?? 'root';
  const scriptPath = defaults?.scriptPath ?? 'tools/tool-bootstrap/src/bootstrap.sh';
  let dryRun = defaults?.dryRun ?? true;

  for (const raw of argv) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(raw);
    if (!m) continue;
    const key = m[1];
    const val = (m[2] as string | undefined) ?? '';
    if (key === 'host') host = val;
    else if (key === 'user') user = val;
    else if (key === 'dry-run') dryRun = true;
    else if (key === 'execute') dryRun = false;
  }

  if (!host) throw new Error('--host=<hostname> required');
  return { host, user, scriptPath, dryRun };
}

export function buildPlan(args: PushArgs): { scp: string; ssh: string } {
  const dest = `${args.user}@${args.host}:/tmp/bootstrap.sh`;
  return {
    scp: `scp ${args.scriptPath} ${dest}`,
    ssh: `ssh ${args.user}@${args.host} 'sudo sh /tmp/bootstrap.sh'`,
  };
}

function main(): void {
  const args = parsePushArgs(process.argv.slice(2));
  const plan = buildPlan(args);
  console.log(
    `[tool-bootstrap] host=${args.host} user=${args.user} dry-run=${String(args.dryRun)}`,
  );
  console.log(`[tool-bootstrap] would run:\n  ${plan.scp}\n  ${plan.ssh}`);
  if (args.dryRun) {
    console.log('[tool-bootstrap] dry-run only. re-run with --execute to ship the script.');
    return;
  }
  console.log('[tool-bootstrap] --execute is not wired to a real SSH call in this scaffold.');
  console.log(
    '[tool-bootstrap] wire to @wbs/scripts ssh helpers once a real deploy target is configured.',
  );
}

if (import.meta.main) {
  main();
}
