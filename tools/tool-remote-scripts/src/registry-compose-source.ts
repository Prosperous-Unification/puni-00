import { createHash } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

import {
  managedImageReferences,
  readRegistrySource,
  readTrustedEnrollment,
  runRegistryProcess,
  withRegistryExecutable,
} from '@tools/registry-publication';
import { type } from 'arktype';
import { parseDocument } from 'yaml';

import { parseRegistryTierState } from './lib/registry-state';
import { routedColorFromAdminConfig } from './lib/site';
import { type Tier } from './lib/state';
import { isPhase } from './lib/state';
import { DockerHost, DockerScope, scanDockerConsumers } from './registry-docker-consumers';

const Configuration = type({
  scope: DockerScope,
  host: DockerHost,
  root: type('string > 0').narrow(isAbsolute),
  prefix: 'string',
  siteAddress: 'string > 0',
  edgeContainer: 'string > 0',
  registryUrl: 'string > 0',
  docker: { path: type('string > 0').narrow(isAbsolute), sha256: /^[0-9a-f]{64}$/, '+': 'reject' },
  '+': 'reject',
});
export type ComposeSourceConfiguration = typeof Configuration.infer;
const tiers: Tier[] = ['be', 'gw', 'fe'];
export interface ComposeObservation {
  sourceRevision: string;
  references: { repository: string; digest: string }[];
  active: Record<Tier, string | null>;
  running: Record<Tier, boolean>;
  phases: Record<Tier, string | null>;
  hasReleaseEvidence: boolean;
}
/** Observe every active/idle container and literal desired Compose image without starting containers. */
export async function readComposeSource(
  input: unknown,
  read: typeof readTrustedEnrollment = readTrustedEnrollment,
): Promise<ComposeObservation> {
  const configuration = Configuration(input);
  if (configuration instanceof type.errors)
    throw new Error('Malformed Compose source configuration');
  const census = await scanDockerConsumers(
    {
      registryId: configuration.scope.registryId,
      registryUrl: configuration.registryUrl,
      docker: configuration.docker,
      host: configuration.host,
    },
    read,
  );
  const ownership = census.catalog.environments.find(
    (environment) => environment.environment === configuration.scope.environment,
  );
  if (
    ownership?.root !== configuration.root ||
    ownership.prefix !== configuration.prefix ||
    ownership.target !== configuration.scope.target ||
    ownership.owner !== configuration.scope.owner ||
    ownership.product !== configuration.scope.product
  )
    throw new Error('Compose source differs from trusted host environment ownership');
  return withRegistryExecutable(configuration.docker, async (executable, cwd) => {
    const run = (args: string[]) => runRegistryProcess([executable, ...args], cwd);
    // Proof: removing ownership filtering blocks B genesis/A retirement in the real owner-authority rehearsal.
    const names = [...census.containers.keys()].filter(
      (name) => census.owners.get(name) === configuration.scope.environment,
    );
    const containers = census.containers;
    const desired: string[] = [];
    const revisions: string[] = [census.sourceRevision];
    const directory = join(configuration.root, 'compose');
    const files = await readdir(directory);
    if (files.length > 64) throw new Error('Compose source inventory exceeds capacity');
    for (const name of ['../base.yml', ...files]) {
      if (name !== '../base.yml' && !/^[a-zA-Z0-9.-]+\.yml$/.test(name))
        throw new Error('Unknown file in Compose source directory');
      const source = await readRegistrySource(join(directory, name));
      revisions.push(source.sourceRevision);
      const document = parseDocument(source.text, { uniqueKeys: true });
      if (document.errors.length !== 0) throw new Error('Malformed Compose source');
      // Proof: removing the mapping refinement accepts services: [] in the checked-in-base source test.
      const mapping = type('object').narrow((value) => !Array.isArray(value));
      const rendered = type({
        'services?': mapping,
        'networks?': mapping,
        'volumes?': mapping,
        'name?': 'string',
        '+': 'reject',
      })(document.toJS() as unknown);
      // Proof: real dev base failed with required services; removing the tier distinction admits a service-free tier file.
      if (
        rendered instanceof type.errors ||
        (rendered.services === undefined &&
          (name !== '../base.yml' ||
            rendered.name === undefined ||
            rendered.networks === undefined))
      )
        throw new Error('Unsupported Compose source shape');
      for (const [serviceName, raw] of Object.entries(rendered.services ?? {})) {
        const service = type({
          image: 'string > 0',
          'container_name?': 'string',
          'restart?': 'string',
          'init?': 'boolean',
          'logging?': 'object',
          'networks?': type.or('object', 'string[]'),
          'env_file?': type.or('string', 'unknown[]'),
          'environment?': type.or('object', 'string[]'),
          'volumes?': 'unknown[]',
          'ports?': 'unknown[]',
          'healthcheck?': 'object',
          'depends_on?': type.or('object', 'string[]'),
          'labels?': type.or('object', 'string[]'),
          'command?': type.or('string', 'string[]'),
          'entrypoint?': type.or('string', 'string[]'),
          'user?': 'string',
          'read_only?': 'boolean',
          'tmpfs?': type.or('string', 'string[]'),
          'security_opt?': 'string[]',
          'cap_drop?': 'string[]',
          '+': 'reject',
        })(raw);
        if (
          service instanceof type.errors ||
          service.image.includes('$') ||
          serviceName.includes('$')
        )
          throw new Error('Unknown or interpolated Compose image selector');
        desired.push(service.image);
      }
    }
    for (const name of names) {
      const snapshot = containers.get(name);
      if (snapshot === undefined) throw new Error('Owned Docker container disappeared');
      desired.push(snapshot.image);
    }
    const routing = await run([
      'exec',
      configuration.edgeContainer,
      'wget',
      '-qO-',
      'http://127.0.0.1:2019/config/',
    ]);
    revisions.push(routing);
    const active: Record<Tier, string | null> = { be: null, gw: null, fe: null };
    const running: Record<Tier, boolean> = { be: false, gw: false, fe: false };
    const phases: Record<Tier, string | null> = { be: null, gw: null, fe: null };
    let hasReleaseEvidence = files.length !== 0;
    for (const tier of tiers) {
      // Proof: removing explicit prefix returns null for B active routing in the same-host test.
      const routed = routedColorFromAdminConfig(tier, configuration.siteAddress, routing, {
        containerPrefix: configuration.prefix,
      });
      for (const color of ['blue', 'green'] as const) {
        const name = `${configuration.prefix}${tier}-01-${color}`;
        if (!names.includes(name)) {
          if (routed === color) throw new Error('Compose routing names an absent container');
          continue;
        }
        hasReleaseEvidence = true;
        const snapshot = containers.get(name);
        if (snapshot === undefined)
          throw new Error('Compose container disappeared from complete inventory');
        if (routed === color) {
          active[tier] = snapshot.image;
          running[tier] = snapshot.running;
        }
      }
      for (const suffix of ['json', 'phase']) {
        const path = join(configuration.root, 'state', `${tier}.${suffix}`);
        try {
          const source = await readRegistrySource(path);
          revisions.push(source.sourceRevision);
          if (suffix === 'phase') {
            const phase = source.text.trim();
            if (!isPhase(phase)) throw new Error('Unknown Compose phase');
            phases[tier] = phase;
            hasReleaseEvidence = true;
          } else {
            const state = parseRegistryTierState(source.text);
            if (state.tier !== tier) throw new Error('Foreign Compose tier state');
            if (state.lastDeployedSha !== null) hasReleaseEvidence = true;
          }
        } catch (cause) {
          if (
            typeof cause === 'object' &&
            cause !== null &&
            'code' in cause &&
            cause.code === 'ENOENT'
          )
            continue;
          throw cause;
        }
      }
    }
    return {
      sourceRevision: `sha256:${createHash('sha256').update(JSON.stringify(revisions)).digest('hex')}`,
      references: managedImageReferences(desired, configuration.registryUrl),
      active,
      running,
      phases,
      hasReleaseEvidence,
    };
  });
}
