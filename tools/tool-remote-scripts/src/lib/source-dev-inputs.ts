import { createHash } from 'node:crypto';
import { posix } from 'node:path';

import {
  decodeRoleDependencyCapabilities,
  type DependencyCapabilityRole,
} from './dependency-capability';
import { type RunDocker } from './docker-deadline';
import { parseDockerInspection } from './docker-inspection-json';
import { assertDependencyOwner, type DependencyOwner, ownerDockerHashed } from './edge-ownership';
import { type EnvLayout, sourceDevContract } from './env';
import { assertSame, readFields, readIdentity } from './managed-cohort';
import { decodeSourceDev, identifySourceInventory } from './source-dev-cohort';
import {
  inspectExcludedSourceMember,
  inspectSourceDevExclusion,
  type SourceDevExclusion,
} from './source-dev-exclusion';
import {
  assertSourceDeadline,
  assertSourceEnvironment,
  captureSourceRestartTree,
  captureSourceStartupTree,
  decodeSourceDevPins,
  decodeSourceStartupManifest,
  type SourceDevPins,
} from './source-startup-manifest';

interface SourceCapability {
  readonly role: DependencyCapabilityRole;
  readonly purpose: 'candidate' | 'retained';
  readonly semantics: readonly 'cross-project-dependencies-v1'[];
}
/** Hash-only cold input evidence. This record grants neither activation nor startup authority. */
export interface SourceDevInputObservation {
  readonly format: 'wbs-source-input-observation';
  readonly version: 1;
  readonly activation: 'blocked';
  readonly profile: 'wbs-source-cold-v1';
  readonly sourceSha: string;
  readonly manifestSha256: string;
  readonly runtimeImageId: string;
  readonly environmentSha256: string;
  readonly containerId: string;
  readonly capabilities: readonly SourceCapability[];
}
/** Read-only source monitors remain bound to the original outer owner, never to a revived exclusion token. */
export interface SourceDevRestartInputs {
  readonly openapiSha256: string;
  inspectCold(): Promise<void>;
  inspectRunning(): Promise<void>;
}
interface ObservationScope {
  owner: DependencyOwner;
  recheck: () => Promise<void>;
  captureRestart: (runtimeReference: string) => Promise<SourceDevRestartInputs>;
}
const observations = new WeakMap<SourceDevInputObservation, ObservationScope>();
// Proof: retained backend invocation omitted; exact ordered roster and four-call observation test failed.
const ROLES: readonly {
  role: DependencyCapabilityRole;
  purpose: 'candidate' | 'retained';
  tier: string;
}[] = [
  { role: 'backend', purpose: 'candidate', tier: 'be-01' },
  { role: 'backend', purpose: 'retained', tier: 'be-01' },
  { role: 'gateway', purpose: 'candidate', tier: 'gw-01' },
  { role: 'mcp', purpose: 'candidate', tier: 'mcp-01' },
];
// Proof: native home/source absence, canonical-home, failed enumeration and malformed-output omissions admitted their isolated poison fixtures; passwd size/UID omissions admitted oversized/foreign records.
const IMAGE_CONFIG_PROBE = `set -eu
set -f
for tool in /usr/bin/id /usr/bin/getent /usr/bin/readlink /usr/bin/find; do
  [ -x "$tool" ] || exit 73
done
[ "$(/usr/bin/id -u)" = 1000 ] && [ "$(/usr/bin/id -g)" = 1000 ] || exit 73
if [ "\${HOME+x}" = x ]; then
  resolved_home=$HOME
else
  entry=$(/usr/bin/getent passwd 1000) || exit 73
  [ "\${#entry}" -le 16384 ] || exit 73
  case "$entry" in *'
'*) exit 73 ;; esac
  previous=$IFS
  IFS=:
  set -- $entry
  IFS=$previous
  [ "$#" -eq 7 ] && [ "$3" = 1000 ] || exit 73
  resolved_home=$6
fi
case "$resolved_home" in /*) ;; *) exit 73 ;; esac
[ "\${#resolved_home}" -le 4096 ] || exit 73
check_directory() {
  [ -d "$1" ] && [ -r "$1" ] && [ -x "$1" ] || exit 73
  canonical=$(/usr/bin/readlink -e -- "$1") || exit 73
  [ "$canonical" = "$1" ] || exit 73
}
check_absent() {
  check_directory "$1"
  found=$(cd "$1" && /usr/bin/find -P . -mindepth 1 -maxdepth 1 -name "$2" -printf present) || exit 73
  [ -z "$found" ] || exit 73
}
check_absent "$resolved_home" .bunfig.toml
source=/src
parent=\${source%/*}
[ -n "$parent" ] || parent=/
check_directory "$parent"
found=$(cd "$parent" && /usr/bin/find -P . -mindepth 1 -maxdepth 1 -name "\${source##*/}" -printf present) || exit 73
case "$found" in
  '') ;;
  present) check_absent "$source" bunfig.toml ;;
  *) exit 73 ;;
esac
printf '%s\n' wbs-source-image-config-absent-v1`;
function refuse(): never {
  throw new Error('source dev input observation refused');
}
// Proof: no-env omitted and a /data argv injected independently; production observer command assertions failed.
function createImageCommand(image: string): string[] {
  return [
    'run',
    '--rm',
    '--pull',
    'never',
    '--network',
    'none',
    '--read-only',
    '--user',
    '1000:1000',
    '--entrypoint',
    '/usr/bin/env',
    image,
    '-i',
    'PATH=/usr/local/bin:/usr/bin:/bin',
    'BUN_RUNTIME_TRANSPILER_CACHE_PATH=0',
  ];
}
function createRoleCommand(image: string, root: string, tier: string): string[] {
  const command = createImageCommand(image);
  const imageIndex = command.indexOf(image);
  command.splice(
    imageIndex,
    0,
    '--mount',
    `type=bind,source=${root},target=/src,readonly,bind-propagation=rprivate,bind-recursive=readonly`,
    '--workdir',
    `/src/apps/wbs/${tier}`,
  );
  return [
    ...command,
    '/usr/local/bin/bun',
    '--no-env-file',
    'run',
    'src/dependency-capabilities-cli.ts',
  ];
}
// Proof: diff check omitted admitted /usr/local/bin/bun change; observer refuses diff test failed.
function validateDiff(contents: string): void {
  if (Buffer.byteLength(contents) > 1024 * 1024) refuse();
  if (contents === '') return;
  const lines = contents.endsWith('\n') ? contents.slice(0, -1).split('\n') : contents.split('\n');
  for (const line of lines) {
    if (!/^[ACD] \/tmp(?:\/[^\0\r\n]+)?$/.test(line)) refuse();
    const path = line.slice(2);
    if (posix.normalize(path) !== path || path.endsWith('/')) refuse();
  }
}
/**
 * A deadline cancels the owner-wrapped read and awaits its complete settlement.
 * Failed read-only probes retain owner intent and return no evidence. Transport
 * settlement does not independently prove daemon-side probe container cleanup.
 */
async function readSourceDocker(
  args: string[],
  docker: RunDocker,
  deadline: number,
): Promise<string> {
  assertSourceDeadline(deadline);
  const controller = new AbortController();
  const clock = { expired: false };
  const timer = setTimeout(() => {
    clock.expired = true;
    controller.abort();
  }, deadline - performance.now());
  try {
    // Proof: abort-race substitution returned while image/role cleanup gates were closed; both at-return negatives failed.
    const response = await docker(args, controller.signal);
    if (clock.expired) refuse();
    assertSourceDeadline(deadline);
    return response;
  } finally {
    clearTimeout(timer);
  }
}
async function readInventory(docker: RunDocker, deadline: number): Promise<unknown[]> {
  const listed = (
    await readSourceDocker(['ps', '-a', '--no-trunc', '--format', '{{.ID}}'], docker, deadline)
  ).trim();
  const ids = listed === '' ? [] : listed.split('\n');
  if (ids.length === 0 || new Set(ids).size !== ids.length) refuse();
  for (const id of ids) readIdentity(id);
  const inspected: unknown = parseDockerInspection(
    await readSourceDocker(['inspect', ...ids], docker, deadline),
  );
  if (!Array.isArray(inspected) || inspected.length !== ids.length) refuse();
  assertSame(
    [...ids].sort(),
    inspected.map((raw: unknown) => readIdentity(readFields(raw)['Id'])).sort(),
    'source input complete inventory',
  );
  return inspected.map((raw: unknown) => raw);
}
/**
 * Checks independently supplied cold inputs against the exact live stopped participant.
 * Runs four DB-free role subprocesses independently, even when both backend inputs are equal.
 * Never writes source/config, installs dependencies, starts an application or admits activation.
 */
export async function observeSourceDevInputs(
  owner: DependencyOwner,
  layouts: { readonly prod: EnvLayout; readonly dev: EnvLayout },
  source: SourceDevExclusion,
  pins: SourceDevPins,
  manifestContents: string,
  runDocker: RunDocker,
  deadline: number,
): Promise<SourceDevInputObservation> {
  try {
    assertSourceDeadline(deadline);
    pins = decodeSourceDevPins(pins);
    const manifest = decodeSourceStartupManifest(manifestContents, pins);
    layouts = structuredClone(layouts);
    if (layouts.prod.env !== 'prod' || layouts.dev.env !== 'dev') refuse();
    // Proof: owner SHA arguments omitted admitted self-consistent foreign pins; manifest source identity test failed.
    await assertDependencyOwner(owner, layouts.prod, pins.sourceSha);
    await assertDependencyOwner(owner, layouts.dev, pins.sourceSha);
    // Proof: source-token binding omitted admitted a copied token; copied source token test failed.
    // Proof: tighter-budget omission made the stalled source read outlive the caller deadline.
    await inspectSourceDevExclusion(owner, source, deadline);
    // Proof: raw ownerDocker substitution exposed a synthetic Env secret in durable records; private application environment test failed.
    const docker = ownerDockerHashed(owner, layouts.dev, runDocker);
    const initial = await readInventory(docker, deadline);
    const initialRaw = await inspectExcludedSourceMember(
      owner,
      layouts.prod,
      source,
      initial,
      deadline,
    );
    // Proof: raw-array identity substitution refused successive valid source mount permutations.
    const initialIdentity = createHash('sha256')
      .update(JSON.stringify(identifySourceInventory(initial, initialRaw)))
      .digest('hex');
    const member = decodeSourceDev(initialRaw, layouts.dev);
    async function inspectCurrentInventory() {
      const current = await readInventory(docker, deadline);
      const currentRaw = await inspectExcludedSourceMember(
        owner,
        layouts.prod,
        source,
        current,
        deadline,
      );
      // Proof: replacing current identity with the initial identity admitted unrelated mount/field/process/config drift.
      assertSame(
        initialIdentity,
        createHash('sha256')
          .update(JSON.stringify(identifySourceInventory(current, currentRaw)))
          .digest('hex'),
        'source input stable complete inventory',
      );
      return decodeSourceDev(currentRaw, layouts.dev);
    }
    async function inspectRuntime(): Promise<void> {
      // Proof: owner SHA arguments omitted admitted self-consistent foreign pins; manifest source identity test failed.
      await assertDependencyOwner(owner, layouts.prod, pins.sourceSha);
      await assertDependencyOwner(owner, layouts.dev, pins.sourceSha);
      // Proof: source-token binding omitted admitted a copied token; copied source token test failed.
      await inspectSourceDevExclusion(owner, source, deadline);
      const observed = await inspectCurrentInventory();
      // Proof: immutable-image equalities omitted admitted a foreign expected ID; expected image negative failed.
      if (observed.image !== pins.runtimeImageId) refuse();
      const tagged = (
        await readSourceDocker(
          ['image', 'inspect', '--format', '{{.Id}}', sourceDevContract(layouts.dev).image],
          docker,
          deadline,
        )
      ).trim();
      if (tagged !== pins.runtimeImageId) refuse();
      const images: unknown = parseDockerInspection(
        await readSourceDocker(['image', 'inspect', pins.runtimeImageId], docker, deadline),
      );
      if (!Array.isArray(images) || images.length !== 1) refuse();
      const image = readFields(images[0]);
      if (image['Id'] !== pins.runtimeImageId) refuse();
      const config = readFields(image['Config']);
      assertSame(
        config['Entrypoint'],
        observed.config['Entrypoint'],
        'source input inherited entrypoint',
      );
      assertSourceEnvironment(observed.config['Env'], config['Env'], pins.environmentSha256);
      validateDiff(await readSourceDocker(['diff', member.id], docker, deadline));
      const imageEnvironment = config['Env'];
      if (!Array.isArray(imageEnvironment)) refuse();
      const home: unknown = imageEnvironment.find(
        (assignment: unknown) => typeof assignment === 'string' && assignment.startsWith('HOME='),
      );
      // Proof: omitting each context independently admitted only that home's bunfig poison.
      const contexts = [createImageCommand(pins.runtimeImageId)];
      if (typeof home === 'string')
        contexts.push([...createImageCommand(pins.runtimeImageId), home]);
      for (const context of contexts) {
        const output = await readSourceDocker(
          [...context, '/bin/sh', '-c', IMAGE_CONFIG_PROBE],
          docker,
          deadline,
        );
        if (output !== 'wbs-source-image-config-absent-v1\n') refuse();
      }
      // Proof: post-probe inventory omission admitted a successful final probe still present in complete inventory.
      await inspectCurrentInventory();
    }
    await inspectRuntime();
    const recheckTree = await captureSourceStartupTree(
      `${layouts.dev.root}/src`,
      manifest,
      deadline,
    );
    const capabilities: SourceCapability[] = [];
    for (const { role, purpose, tier } of ROLES) {
      assertSourceDeadline(deadline);
      await assertDependencyOwner(owner, layouts.dev, pins.sourceSha);
      // Proof: source-token binding omitted admitted a copied token; copied source token test failed.
      await inspectSourceDevExclusion(owner, source, deadline);
      const output = await readSourceDocker(
        createRoleCommand(pins.runtimeImageId, `${layouts.dev.root}/src`, tier),
        docker,
        deadline,
      );
      if (Buffer.byteLength(output) > 65536) refuse();
      // Proof: role attributed from untrusted stdout admitted a foreign role; observer refuses role test failed.
      const semantics = decodeRoleDependencyCapabilities(output, role);
      if (semantics.length !== 1) refuse();
      capabilities.push(Object.freeze({ role, purpose, semantics: Object.freeze([...semantics]) }));
    }
    async function recheck(): Promise<void> {
      await inspectRuntime();
      await recheckTree();
      // Proof: owner SHA arguments omitted admitted self-consistent foreign pins; manifest source identity test failed.
      await assertDependencyOwner(owner, layouts.prod, pins.sourceSha);
      await assertDependencyOwner(owner, layouts.dev, pins.sourceSha);
      // Proof: source-token binding omitted admitted a copied token; copied source token test failed.
      await inspectSourceDevExclusion(owner, source, deadline);
      assertSourceDeadline(deadline);
    }
    // Proof: final recheck omitted admitted dependency drift during the last probe; observer refuses drift test failed.
    await recheck();
    const observation: SourceDevInputObservation = Object.freeze({
      format: 'wbs-source-input-observation',
      version: 1,
      activation: 'blocked',
      profile: 'wbs-source-cold-v1',
      sourceSha: pins.sourceSha,
      manifestSha256: pins.manifestSha256,
      runtimeImageId: pins.runtimeImageId,
      environmentSha256: pins.environmentSha256,
      containerId: member.id,
      capabilities: Object.freeze(capabilities),
    });
    async function captureRestart(runtimeReference: string): Promise<SourceDevRestartInputs> {
      if (!/^[^\s@]+@sha256:[a-f0-9]{64}$/.test(runtimeReference)) refuse();
      await recheck();
      const command = createRoleCommand(pins.runtimeImageId, `${layouts.dev.root}/src`, 'be-01');
      command[command.indexOf('--workdir') + 1] = '/src';
      command[command.length - 1] = 'apps/wbs/be-01/src/openapi/emit-openapi-cli.ts';
      const generated = await readSourceDocker(command, docker, deadline);
      if (Buffer.byteLength(generated) > 16 * 1024 * 1024) refuse();
      const document = readFields(JSON.parse(generated));
      if (typeof document['openapi'] !== 'string' || !document['openapi'].startsWith('3.'))
        refuse();
      readFields(document['info']);
      readFields(document['paths']);
      const openapiSha256 = createHash('sha256').update(generated).digest('hex');
      const tree = await captureSourceRestartTree(
        `${layouts.dev.root}/src`,
        manifest,
        deadline,
        openapiSha256,
      );
      await recheck();
      async function inspectRestartRuntime(): Promise<void> {
        await assertDependencyOwner(owner, layouts.prod, pins.sourceSha);
        await assertDependencyOwner(owner, layouts.dev, pins.sourceSha);
        assertSourceDeadline(deadline);
        const inventory = await readInventory(docker, deadline);
        const matching = inventory.filter((raw) => readFields(raw)['Id'] === member.id);
        const raw = matching.at(0);
        if (matching.length !== 1 || raw === undefined) refuse();
        const current = decodeSourceDev(raw, layouts.dev);
        const resolved = (
          await readSourceDocker(
            ['image', 'inspect', '--format', '{{.Id}}', sourceDevContract(layouts.dev).image],
            docker,
            deadline,
          )
        ).trim();
        const references = parseDockerInspection(
          await readSourceDocker(['image', 'inspect', pins.runtimeImageId], docker, deadline),
        );
        if (!Array.isArray(references) || references.length !== 1) refuse();
        const image = readFields(references[0]);
        if (
          current.image !== pins.runtimeImageId ||
          resolved !== pins.runtimeImageId ||
          image['Id'] !== pins.runtimeImageId ||
          !Array.isArray(image['RepoDigests']) ||
          !image['RepoDigests'].includes(runtimeReference)
        )
          refuse();
        const defaults = readFields(image['Config']);
        assertSame(
          defaults['Entrypoint'],
          current.config['Entrypoint'],
          'source restart inherited entrypoint',
        );
        assertSourceEnvironment(current.config['Env'], defaults['Env'], pins.environmentSha256);
        validateDiff(await readSourceDocker(['diff', member.id], docker, deadline));
        await assertDependencyOwner(owner, layouts.prod, pins.sourceSha);
        await assertDependencyOwner(owner, layouts.dev, pins.sourceSha);
        assertSourceDeadline(deadline);
      }
      async function inspect(cold: boolean): Promise<void> {
        try {
          await inspectRestartRuntime();
          if (cold) await tree.inspectCold();
          else await tree.inspectRunning();
          await inspectRestartRuntime();
        } catch {
          return refuse();
        }
      }
      await inspect(true);
      return Object.freeze({
        openapiSha256,
        inspectCold: () => inspect(true),
        inspectRunning: () => inspect(false),
      });
    }
    observations.set(observation, { owner, recheck, captureRestart });
    return observation;
  } catch {
    // Proof: raw rethrow exposed the synthetic stdout secret; observer refuses malformed test failed.
    return refuse();
  }
}
/** Rechecks only the original in-memory observation under its still-live owner/source/deadline. */
export async function inspectSourceDevInputs(
  owner: DependencyOwner,
  observation: SourceDevInputObservation,
): Promise<void> {
  try {
    const scope = observations.get(observation);
    if (scope?.owner !== owner) refuse();
    await scope.recheck();
  } catch {
    return refuse();
  }
}

/** Captures independent generated-document expectation and original cold identities while the actual input/exclusion scope is still live. */
export async function captureSourceDevRestartInputs(
  owner: DependencyOwner,
  observation: SourceDevInputObservation,
  runtimeReference: string,
): Promise<SourceDevRestartInputs> {
  try {
    const scope = observations.get(observation);
    if (scope?.owner !== owner) refuse();
    await scope.recheck();
    return await scope.captureRestart(runtimeReference);
  } catch {
    return refuse();
  }
}
