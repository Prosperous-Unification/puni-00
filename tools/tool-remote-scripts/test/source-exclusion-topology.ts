import { join } from 'node:path';

import type { EnvLayout } from '../src/lib/env';

/** Physical topology shared by the actual runner and its production-path preflight tests. */
export function renderSourceTopology(
  root: string,
  token: string,
  bases: { prod: EnvLayout; dev: EnvLayout },
) {
  const prodNetwork = `source-exclusion-prod-${token}`;
  // Proof: omit-prod-dev-network caused the production source owner boundary to reject transitional topology.
  const devNetwork = `source-exclusion-dev-${token}`;
  const caddy = join(root, 'prod', 'caddy');
  return {
    prod: {
      ...bases.prod,
      sharedEnvPath: join(root, 'prod', '.env'),
      oidcEnvPath: null,
      network: prodNetwork,
      containerPrefix: `source-exclusion-${token}-`,
      siteAddress: 'prod.owner.test',
      siteCaddyPath: join(caddy, 'site.caddy'),
    },
    dev: {
      ...bases.dev,
      sharedEnvPath: join(root, 'dev', '.env'),
      oidcEnvPath: null,
      network: devNetwork,
      siteAddress: 'dev.owner.test',
      siteCaddyPath: join(caddy, 'site-dev.caddy'),
    },
  };
}
/** Actual Docker create arguments for initialized managed namespace participants. */
export function renderManagedParticipant(tier: 'be' | 'gw', layout: EnvLayout, token: string) {
  const name = `${layout.containerPrefix}${tier}-01-blue`;
  const program =
    tier === 'gw'
      ? 'setInterval(()=>{},1000)'
      : `const {Database}=require('bun:sqlite'); const db=new Database('/data/wbs.db'); db.query('INSERT INTO acceptance VALUES (?)').run(process.env.WRITER); setInterval(()=>{},1000);`;
  return {
    name,
    program,
    args: [
      '--init',
      '--network',
      layout.network,
      '--restart=always',
      '--label',
      `com.docker.compose.service=${name}`,
      '--label',
      `com.docker.compose.project=source-${token}`,
      // Proof: omit-gateway-db-bind caused the stopped gateway to fail strict production unmanaged mount audit.
      ...(tier === 'be'
        ? [
            '--env',
            'DB_PATH=/data/wbs.db',
            '--env',
            `WRITER=${tier}`,
            '--mount',
            `type=bind,src=${layout.root}/db,dst=/data`,
          ]
        : []),
      '--entrypoint',
      'bun',
    ],
    argv: ['-e', program],
  };
}
