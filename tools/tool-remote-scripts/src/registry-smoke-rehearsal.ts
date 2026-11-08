import type { EnvLayout } from './lib/env';
import { runComposeSmoke } from './registry-compose-smoke';

const root = Bun.argv.at(2);
const network = Bun.argv.at(3);
const docker = Bun.argv.at(4);
const sha256 = Bun.argv.at(5);
const mode = Bun.argv.at(6);
if (
  root === undefined ||
  network === undefined ||
  docker === undefined ||
  sha256 === undefined ||
  mode === undefined ||
  !['success', 'failure', 'cancel'].includes(mode)
)
  throw new Error('Expected owned fixture root/network, pinned Docker and proof mode');
const layout: EnvLayout = {
  env: 'prod',
  root,
  network,
  containerPrefix: 'fixture-',
  sharedEnvPath: `${root}/.env`,
  oidcEnvPath: null,
  stateDir: `${root}/state`,
  siteCaddyPath: `${root}/site.caddy`,
  siteAddress: 'fixture.invalid',
};
const artifact = new TextEncoder().encode(
  mode === 'cancel'
    ? 'setInterval(()=>{},1000);'
    : mode === 'failure'
      ? "throw new Error('intentional smoke fixture failure');"
      : "console.log('native owned smoke fixture executed');",
);
try {
  await runComposeSmoke(artifact, { path: docker, sha256 }, layout);
  if (mode !== 'success') throw new Error('Expected smoke failure or cancellation was omitted');
  console.log('native smoke success and cleanup passed');
} catch (cause) {
  if (
    mode === 'success' ||
    !String(cause).includes(mode === 'cancel' ? 'cancelled' : 'command failed')
  )
    throw cause;
  console.log(`native smoke ${mode} and cleanup passed`);
}
