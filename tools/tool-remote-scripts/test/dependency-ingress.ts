import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CADDY_IMAGE } from '../caddy/image';
import { fenceDependencyIngress, inspectDependencyIngress } from '../src/lib/dependency-ingress';
import { type RunDocker, runDockerBefore, runDockerCli } from '../src/lib/docker-deadline';
import { withDependencyOwner } from '../src/lib/edge-ownership';
import { EDGE_CONTAINER, envLayout } from '../src/lib/env';
import { readFields, readString } from '../src/lib/managed-cohort';

/** Bounds each actual Docker call, including cleanup, independently of serving convergence. */
async function fixtureDocker(args: string[], signal?: AbortSignal): Promise<string> {
  // Proof: without this boundary a stalled fake Docker exceeded 15s; restored call reaped it at 10s.
  return runDockerBefore(
    args,
    (command, timeout) => {
      if (timeout === undefined) throw new Error('fixture Docker deadline signal absent');
      return runDockerCli(
        command,
        signal === undefined ? timeout : AbortSignal.any([signal, timeout]),
      );
    },
    performance.now() + 10000,
  );
}

/**
 * Disposable actual-Caddy acceptance. Never targets a production name/path: the
 * read-only logical edge lookup maps to this invocation's validated fixture ID,
 * and every mutation requires that same ID. Container-name normalization exists
 * only at this fixture boundary; actual Caddy adaptation/admin/serving are real.
 * Retains its private directory and owner evidence. Removes only its own labelled
 * container after checking identity, and treats failed cleanup as a failure.
 */
export async function runDependencyIngressAcceptance(): Promise<void> {
  const attempt = randomUUID();
  const name = `dependency-ingress-${attempt}`;
  const directory = await mkdtemp(join(tmpdir(), 'dependency-ingress-acceptance-'));
  const caddy = join(directory, 'caddy');
  await mkdir(caddy, { mode: 0o700 });
  const layout = {
    ...envLayout('prod'),
    root: directory,
    stateDir: directory,
    siteAddress: 'prod.owner.test',
    siteCaddyPath: join(caddy, 'site.caddy'),
  };
  const files = {
    Caddyfile:
      '{\n auto_https disable_redirects\n https_port 8443\n local_certs\n}\nimport log-redact.caddy\nimport site.caddy\nimport site-dev.caddy\nimport registry.caddy\nimport aivn.caddy\n',
    'log-redact.caddy':
      '(access-log) {\n log {\n output stdout\n format filter {\n wrap json\n fields {\n request>uri query {\n replace session REDACTED\n }\n }\n }\n }\n}\n',
    'site.caddy': 'prod.owner.test {\n respond "prod original" 200\n import access-log\n}\n',
    'site-dev.caddy': 'dev.owner.test {\n respond "dev original" 200\n import access-log\n}\n',
    'registry.caddy': 'registry.owner.test {\n respond "registry unchanged" 201\n}\n',
    'aivn.caddy': 'aivn.owner.test {\n respond "aivn unchanged" 202\n}\n',
  };
  for (const [filename, contents] of Object.entries(files))
    await writeFile(join(caddy, filename), contents, { mode: 0o600, flag: 'wx' });
  await writeFile(
    join(directory, 'fixture-intent.json'),
    JSON.stringify({ name, label: attempt, image: CADDY_IMAGE }) + '\n',
    { mode: 0o600, flag: 'wx' },
  );
  let id: string | undefined;
  let failure: unknown;
  async function inspectOwned() {
    if (id === undefined || !/^[a-f0-9]{64}$/.test(id))
      throw new Error('fixture has no exact owned ID');
    const inspected: unknown = JSON.parse(await fixtureDocker(['inspect', id]));
    if (!Array.isArray(inspected) || inspected.length !== 1)
      throw new Error('fixture identity absent');
    const container = readFields(inspected[0]);
    if (
      container['Id'] !== id ||
      container['Name'] !== `/${name}` ||
      readFields(readFields(container['Config'])['Labels'])['puni.dependency-ingress-fixture'] !==
        attempt
    )
      throw new Error('fixture container ownership changed');
    return container;
  }
  try {
    // Missing image/daemon is a blocking failure; this runner never silently skips.
    await fixtureDocker(['image', 'inspect', CADDY_IMAGE]);
    const created = (
      await fixtureDocker([
        'run',
        '--detach',
        '--init',
        '--name',
        name,
        '--label',
        `puni.dependency-ingress-fixture=${attempt}`,
        '--publish',
        '127.0.0.1::8443',
        '--volume',
        `${caddy}:/etc/caddy:ro`,
        CADDY_IMAGE,
      ])
    ).trim();
    if (!/^[a-f0-9]{64}$/.test(created)) throw new Error('Docker did not return a full fixture ID');
    id = created;
    const inspection = await inspectOwned();
    const bindings = readFields(readFields(inspection['NetworkSettings'])['Ports'])['8443/tcp'];
    if (!Array.isArray(bindings) || bindings.length !== 1)
      throw new Error('fixture port binding is ambiguous');
    const binding = readFields(bindings[0]);
    const port = readString(binding['HostPort']);
    if (binding['HostIp'] !== '127.0.0.1' || !/^[0-9]+$/.test(port))
      throw new Error('fixture port is not loopback');
    async function request(host: string, status: number, body: string): Promise<void> {
      let last: unknown;
      for (let attempt = 0; attempt < 100; attempt++) {
        try {
          const response = await fetch(
            `https://127.0.0.1:${port}/nested/path?session=fixture-secret`,
            {
              headers: { Host: host },
              // Fixture-only internal CA over the invocation-owned loopback listener.
              tls: { serverName: host, rejectUnauthorized: false },
              signal: AbortSignal.timeout(1000),
            },
          );
          if (response.status !== status || (await response.text()) !== body)
            throw new Error('fixture HTTP response differs');
          return;
        } catch (cause) {
          last = cause;
        }
        await new Promise<void>((resolve) => setTimeout(resolve, 100));
      }
      throw new Error('fixture HTTP convergence exhausted', { cause: last });
    }
    const runner: RunDocker = async (args, signal) => {
      if (
        id === undefined ||
        (args[0] !== 'inspect' && args[0] !== 'exec') ||
        (args[1] !== EDGE_CONTAINER && args[1] !== id) ||
        (args[0] === 'exec' && args[1] !== id)
      )
        throw new Error('fixture refuses non-owned Docker operation');
      const mapped = [...args];
      mapped[1] = id;
      const output = await fixtureDocker(mapped, signal);
      if (args[0] !== 'inspect') return output;
      const actual = await inspectOwned();
      return JSON.stringify([{ ...actual, Name: `/${EDGE_CONTAINER}` }]);
    };
    await request(layout.siteAddress, 200, 'prod original');
    await withDependencyOwner(
      { sha: 'a'.repeat(40), layouts: [layout] },
      async (owner) => {
        await fenceDependencyIngress(owner, [layout], runner, performance.now() + 60000);
        await inspectDependencyIngress(owner, [layout], runner, performance.now() + 60000);
        await request(layout.siteAddress, 503, 'WBS dependency maintenance');
        await request('dev.owner.test', 200, 'dev original');
        await request('registry.owner.test', 201, 'registry unchanged');
        await request('aivn.owner.test', 202, 'aivn unchanged');
      },
      directory,
    );
    await inspectOwned();
    // Only the invocation-owned disposable server is restarted to test disk persistence.
    await fixtureDocker(['restart', id]);
    await inspectOwned();
    await request(layout.siteAddress, 503, 'WBS dependency maintenance');
    await request('dev.owner.test', 200, 'dev original');
    await request('registry.owner.test', 201, 'registry unchanged');
    await request('aivn.owner.test', 202, 'aivn unchanged');
    await writeFile(
      join(directory, 'acceptance.json'),
      JSON.stringify({
        state: 'passed',
        image: CADDY_IMAGE,
        fixtureId: id,
        serving503: true,
        unselectedPreserved: true,
        restartPersistence: true,
      }) + '\n',
      { mode: 0o600, flag: 'wx' },
    );
  } catch (cause) {
    failure = cause;
  }
  if (id !== undefined) {
    try {
      await inspectOwned();
      await fixtureDocker(['rm', '--force', '--volumes', id]);
      const remaining = await fixtureDocker([
        'ps',
        '--all',
        '--quiet',
        '--no-trunc',
        '--filter',
        `label=puni.dependency-ingress-fixture=${attempt}`,
      ]);
      if (remaining.trim() !== '') throw new Error('fixture cleanup retained a container');
    } catch (cause) {
      throw new AggregateError(
        failure === undefined ? [cause] : [failure, cause],
        `fixture ${name} failed; retain private evidence at ${directory}`,
        { cause },
      );
    }
  }
  if (failure !== undefined)
    throw new Error(`fixture ${name} failed; retain private evidence at ${directory}`, {
      cause: failure,
    });
  console.log(JSON.stringify({ state: 'passed', evidence: directory }));
}
if (import.meta.main) await runDependencyIngressAcceptance();
