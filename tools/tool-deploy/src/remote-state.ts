import type { Tier } from './affected';

export interface RemoteTierState {
  tier: Tier;
  activeColor: 'blue' | 'green';
  lastDeployedSha: string | null;
}

/** One round trip for all three tiers; missing files come back as null. */
export async function readRemoteState(
  host: string,
): Promise<Partial<Record<Tier, RemoteTierState>>> {
  // `|| true` matters: `cat`'s own exit code survives `2>/dev/null` (only the
  // message is silenced), so without it a missing *last* tier's file (the
  // normal state of a never-deployed server) makes the whole ssh invocation
  // exit non-zero and this function would throw on the one case it's
  // explicitly meant to tolerate. Verified live against h2puni pre-fix.
  const cmd =
    'for t in be gw fe; do echo "== $t"; cat /srv/wbs/state/$t.json 2>/dev/null || true; done';
  const p = Bun.spawn(['ssh', host, cmd], { stdout: 'pipe', stderr: 'pipe' });
  const out = await new Response(p.stdout).text();
  if ((await p.exited) !== 0) throw new Error(`cannot read remote state from ${host}`);

  const result: Partial<Record<Tier, RemoteTierState>> = {};
  for (const block of out.split('== ').slice(1)) {
    const nl = block.indexOf('\n');
    const tier = block.slice(0, nl).trim() as Tier;
    const body = block.slice(nl + 1).trim();
    if (body === '') continue;
    result[tier] = JSON.parse(body) as RemoteTierState;
  }
  return result;
}
