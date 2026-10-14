import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { parseAllDocuments } from 'yaml';

import { run } from './execute';
import type { FirstStartRequest } from './first-start';
import { sha256Of } from './migration-capture';

export interface SourceReceipt {
  bytes: string;
  sha256: string;
}
export interface ConditionalPatch {
  op: 'test' | 'replace';
  path: string;
  value: unknown;
}
export interface SourcePort {
  readKustomization(): Promise<unknown>;
  readGitRepository(): Promise<unknown>;
  patchGitRepository(patch: readonly ConditionalPatch[]): Promise<void>;
  patchKustomization(patch: readonly ConditionalPatch[]): Promise<void>;
  readTree(url: string, revision: string, path: string): Promise<{ bytes: string; tree: string }>;
  trustedManifest(request: FirstStartRequest): Promise<string>;
  sleep(): Promise<void>;
  timeoutMs: number;
}
function requireRecord(raw: unknown): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw))
    throw new Error('first-start source state is malformed');
  // Boundary: non-null non-array object checked before field inspection.
  return raw as Record<string, unknown>;
}
function text(raw: unknown): string {
  if (typeof raw !== 'string' || raw === '')
    throw new Error('first-start source identity is absent');
  return raw;
}
function canonical(raw: unknown): string {
  if (Array.isArray(raw)) return `[${raw.map(canonical).join(',')}]`;
  if (typeof raw === 'object' && raw !== null) {
    const fields = requireRecord(raw);
    return `{${Object.keys(fields)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(fields[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(raw);
}
/** Flatten all resources, refusing ambiguous identities or extra Flux/Kustomize machinery. */
export function manifestInventory(bytes: string): string {
  const resources: Record<string, unknown>[] = [];
  function collect(raw: unknown): void {
    const resource = requireRecord(raw);
    if (resource['kind'] === 'List') {
      if (!Array.isArray(resource['items']))
        throw new Error('first-start resource List is malformed');
      for (const child of resource['items']) collect(child);
      return;
    }
    if (resource['kind'] === 'Kustomization' || resource['kind'] === 'GitRepository')
      throw new Error('first-start source contains reconciliation machinery');
    const metadata = requireRecord(resource['metadata']);
    text(resource['apiVersion']);
    text(resource['kind']);
    text(metadata['name']);
    text(metadata['namespace']);
    resources.push(resource);
  }
  for (const document of parseAllDocuments(bytes)) {
    if (document.errors.length !== 0) throw new Error('first-start source YAML is malformed');
    collect(document.toJS() as unknown);
  }
  const keyed = resources
    .map((resource) => ({
      key: canonical([
        resource['apiVersion'],
        resource['kind'],
        requireRecord(resource['metadata'])['namespace'],
        requireRecord(resource['metadata'])['name'],
      ]),
      resource,
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
  if (keyed.length === 0 || new Set(keyed.map((entry) => entry.key)).size !== keyed.length)
    throw new Error('first-start source has empty or duplicate resource inventory');
  return canonical(keyed.map((entry) => entry.resource));
}
// Proof: key admission omission accepts unsupported postBuild/decryption/images/include source configuration.
function assertKeys(
  spec: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
): void {
  if (Object.keys(spec).some((key) => !allowed.includes(key)))
    throw new Error(`first-start ${label} has unsupported build or source configuration`);
}
function observeSource(request: FirstStartRequest, kraw: unknown, graw: unknown) {
  const k = requireRecord(kraw);
  const g = requireRecord(graw);
  const km = requireRecord(k['metadata']);
  const gm = requireRecord(g['metadata']);
  const ks = requireRecord(k['spec']);
  const gs = requireRecord(g['spec']);
  for (const metadata of [km, gm]) {
    text(metadata['uid']);
    text(metadata['resourceVersion']);
    if (
      typeof metadata['generation'] !== 'number' ||
      !Number.isSafeInteger(metadata['generation']) ||
      metadata['generation'] <= 0
    )
      throw new Error('first-start source generation is absent or malformed');
  }
  assertKeys(
    ks,
    [
      'interval',
      'path',
      'prune',
      'suspend',
      'sourceRef',
      'timeout',
      'retryInterval',
      'wait',
      'force',
    ],
    'Kustomization',
  );
  assertKeys(gs, ['interval', 'url', 'ref', 'timeout', 'secretRef', 'provider'], 'GitRepository');
  if (
    (Object.hasOwn(ks, 'force') && ks['force'] !== false) ||
    (Object.hasOwn(gs, 'provider') && gs['provider'] !== 'generic')
  )
    throw new Error('first-start source force/provider is unsupported');
  if (Object.hasOwn(gs, 'secretRef')) {
    const secret = requireRecord(gs['secretRef']);
    assertKeys(secret, ['name'], 'source secret');
    text(secret['name']);
  }
  const source = requireRecord(ks['sourceRef']);
  assertKeys(source, ['kind', 'name', 'namespace'], 'sourceRef');
  text(ks['interval']);
  text(gs['interval']);
  requireRecord(gs['ref']);
  if (
    typeof ks['prune'] !== 'boolean' ||
    (Object.hasOwn(ks, 'wait') && typeof ks['wait'] !== 'boolean')
  )
    throw new Error('first-start source build flags are malformed');
  const path = text(ks['path']);
  // Proof: path/sourceRef/build-config negatives refuse altered apply semantics before conditional resume.
  if (
    !/^\.\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(path) ||
    ks['suspend'] !== true ||
    source['kind'] !== 'GitRepository' ||
    source['name'] !== request.flux.gitRepository ||
    (Object.hasOwn(source, 'namespace') && source['namespace'] !== request.flux.namespace)
  )
    throw new Error('first-start Kustomization target/path/suspension differs');
  const url = text(gs['url']);
  const parsed = new URL(url);
  if (
    !['https:', 'http:', 'ssh:'].includes(parsed.protocol) ||
    parsed.password !== '' ||
    (['https:', 'http:'].includes(parsed.protocol) && parsed.username !== '')
  )
    throw new Error('first-start source URL transport is unsupported');
  return {
    k,
    g,
    ks,
    gs,
    km,
    gm,
    path: path.slice(2),
    url,
    kuid: text(km['uid']),
    guid: text(gm['uid']),
  };
}
// Proof: source-generation omission admits a stale-generation artifact in the readiness negative.
function conditionsReady(raw: Record<string, unknown>, metadata: Record<string, unknown>): boolean {
  const status = requireRecord(raw['status']);
  const conditions = status['conditions'];
  return (
    status['observedGeneration'] === metadata['generation'] &&
    Array.isArray(conditions) &&
    conditions.some((raw) => {
      const condition = requireRecord(raw);
      return (
        condition['type'] === 'Ready' &&
        condition['status'] === 'True' &&
        condition['observedGeneration'] === metadata['generation']
      );
    })
  );
}
// Proof: dropping conditional tests fails the production pin/resume preconditions negative.
function pinPatch(
  metadata: Record<string, unknown>,
  spec: Record<string, unknown>,
  field: string,
  value: unknown,
): readonly ConditionalPatch[] {
  return [
    { op: 'test', path: '/metadata/uid', value: text(metadata['uid']) },
    { op: 'test', path: '/metadata/resourceVersion', value: text(metadata['resourceVersion']) },
    { op: 'test', path: '/spec', value: spec },
    { op: 'replace', path: field, value },
  ];
}
/** Attended source transitions retain UID/version/spec preconditions and never reopen a mutable ref implicitly. */
export function buildSourceRefPatch(
  raw: unknown,
  ref: { commit: string } | { branch: 'main' },
): readonly ConditionalPatch[] {
  const source = requireRecord(raw);
  if ('commit' in ref && !/^[0-9a-f]{40}$/.test(ref.commit))
    throw new Error('first-start attended source commit is invalid');
  return pinPatch(
    requireRecord(source['metadata']),
    requireRecord(source['spec']),
    '/spec/ref',
    ref,
  );
}
/** Receipt validation is independent of the release journal; request and sealed bytes are exact. */
export function parseSourceReceipt(raw: unknown, request: FirstStartRequest): SourceReceipt {
  const envelope = requireRecord(raw);
  const bytes = text(envelope['bytes']);
  if (envelope['sha256'] !== sha256Of(bytes))
    throw new Error('first-start source receipt hash differs');
  const payload = requireRecord(JSON.parse(bytes) as unknown);
  if (payload['version'] !== 1 || payload['requestSha256'] !== sha256Of(JSON.stringify(request)))
    throw new Error('first-start source receipt belongs to another request');
  for (const field of [
    'kuid',
    'guid',
    'kSpec',
    'gSpec',
    'artifact',
    'tree',
    'manifestSha256',
    'inventorySha256',
  ])
    text(payload[field]);
  const ks = requireRecord(JSON.parse(text(payload['kSpec'])) as unknown);
  const gs = requireRecord(JSON.parse(text(payload['gSpec'])) as unknown);
  const artifact = requireRecord(JSON.parse(text(payload['artifact'])) as unknown);
  observeSource(
    request,
    {
      metadata: { uid: text(payload['kuid']), resourceVersion: 'receipt', generation: 1 },
      spec: ks,
    },
    {
      metadata: { uid: text(payload['guid']), resourceVersion: 'receipt', generation: 1 },
      spec: gs,
    },
  );
  if (
    canonical(gs['ref']) !== canonical({ commit: request.flux.desiredRevision }) ||
    typeof artifact['revision'] !== 'string' ||
    !artifact['revision'].endsWith(`sha1:${request.flux.desiredRevision}`) ||
    typeof artifact['digest'] !== 'string' ||
    !/^sha256:[0-9a-f]{64}$/.test(artifact['digest']) ||
    !/^[0-9a-f]{40}$/.test(text(payload['tree'])) ||
    !/^[0-9a-f]{64}$/.test(text(payload['manifestSha256'])) ||
    !/^[0-9a-f]{64}$/.test(text(payload['inventorySha256']))
  )
    throw new Error('first-start source receipt configuration/artifact is malformed');
  text(artifact['url']);
  text(artifact['path']);
  return { bytes, sha256: sha256Of(bytes) };
}
/** Pin the actual referenced source, wait its current-generation artifact, and admit exact Git bytes. */
export async function admitFirstStartSource(
  request: FirstStartRequest,
  port: SourcePort,
  prior: SourceReceipt | null,
): Promise<SourceReceipt> {
  if (prior !== null) parseSourceReceipt(prior, request);
  let observed = observeSource(
    request,
    await port.readKustomization(),
    await port.readGitRepository(),
  );
  const desired = { commit: request.flux.desiredRevision };
  if (prior !== null) {
    const payload = requireRecord(JSON.parse(prior.bytes) as unknown);
    if (
      payload['kuid'] !== observed.kuid ||
      payload['guid'] !== observed.guid ||
      payload['kSpec'] !== canonical(observed.ks) ||
      payload['gSpec'] !== canonical(observed.gs)
    )
      throw new Error('first-start live source identity/configuration changed');
  }
  if (canonical(observed.gs['ref']) !== canonical(desired)) {
    if (prior !== null) throw new Error('first-start immutable source pin changed');
    await port.patchGitRepository(buildSourceRefPatch(observed.g, desired));
  }
  const deadline = Date.now() + port.timeoutMs;
  for (;;) {
    const next = observeSource(
      request,
      await port.readKustomization(),
      await port.readGitRepository(),
    );
    const expectedGs = { ...observed.gs, ref: desired };
    if (
      next.kuid !== observed.kuid ||
      next.guid !== observed.guid ||
      canonical(next.ks) !== canonical(observed.ks) ||
      canonical(next.gs) !== canonical(expectedGs)
    )
      throw new Error('first-start source changed while pinning');
    observed = next;
    if (conditionsReady(next.g, next.gm)) break;
    if (Date.now() >= deadline)
      throw new Error('first-start pinned source artifact did not converge');
    await port.sleep();
  }
  const artifact = requireRecord(requireRecord(observed.g['status'])['artifact']);
  text(artifact['url']);
  text(artifact['path']);
  if (
    typeof artifact['revision'] !== 'string' ||
    !artifact['revision'].endsWith(`sha1:${request.flux.desiredRevision}`) ||
    typeof artifact['digest'] !== 'string' ||
    !/^sha256:[0-9a-f]{64}$/.test(artifact['digest'])
  )
    throw new Error('first-start source artifact differs from pinned revision');
  const tree = await port.readTree(observed.url, request.flux.desiredRevision, observed.path);
  const inventory = manifestInventory(tree.bytes);
  const trusted = manifestInventory(await port.trustedManifest(request));
  // Proof: manifest alteration negative refuses changed/open policy resources before resume.
  if (inventory !== trusted)
    throw new Error(
      'first-start complete Git resource inventory differs from trusted fenced render',
    );
  const bytes = JSON.stringify({
    version: 1,
    requestSha256: sha256Of(JSON.stringify(request)),
    kuid: observed.kuid,
    guid: observed.guid,
    kSpec: canonical(observed.ks),
    gSpec: canonical(observed.gs),
    artifact: canonical(artifact),
    tree: tree.tree,
    manifestSha256: sha256Of(tree.bytes),
    inventorySha256: sha256Of(inventory),
  });
  const receipt = { bytes, sha256: sha256Of(bytes) };
  if (prior !== null && receipt.bytes !== prior.bytes)
    throw new Error('first-start source/artifact receipt changed');
  return receipt;
}
/** Re-admit immediately before a UID/version/spec conditional resume; keep the source commit pinned. */
export async function resumeFirstStartSource(
  request: FirstStartRequest,
  port: SourcePort,
  receipt: SourceReceipt,
): Promise<void> {
  await admitFirstStartSource(request, port, receipt);
  const payload = requireRecord(JSON.parse(receipt.bytes) as unknown);
  const [kraw, graw] = await Promise.all([port.readKustomization(), port.readGitRepository()]);
  const k = requireRecord(kraw);
  const metadata = requireRecord(k['metadata']);
  const spec = requireRecord(k['spec']);
  const git = requireRecord(graw);
  const gm = requireRecord(git['metadata']);
  if (
    metadata['uid'] !== payload['kuid'] ||
    canonical(spec) !== payload['kSpec'] ||
    gm['uid'] !== payload['guid'] ||
    canonical(git['spec']) !== payload['gSpec'] ||
    canonical(requireRecord(git['status'])['artifact']) !== payload['artifact'] ||
    !conditionsReady(git, gm)
  )
    throw new Error('first-start source or Kustomization changed before resume');
  await port.patchKustomization(pinPatch(metadata, spec, '/spec/suspend', false));
  const deadline = Date.now() + port.timeoutMs;
  for (;;) {
    const current = requireRecord(await port.readKustomization());
    const cm = requireRecord(current['metadata']);
    const cs = requireRecord(current['spec']);
    const git = requireRecord(await port.readGitRepository());
    if (
      cm['uid'] !== payload['kuid'] ||
      canonical({ ...cs, suspend: true }) !== payload['kSpec'] ||
      requireRecord(git['metadata'])['uid'] !== payload['guid'] ||
      canonical(git['spec']) !== payload['gSpec'] ||
      canonical(requireRecord(git['status'])['artifact']) !== payload['artifact']
    )
      throw new Error('first-start source or Kustomization changed during handoff');
    const status = requireRecord(current['status']);
    if (
      conditionsReady(current, cm) &&
      typeof status['lastAppliedRevision'] === 'string' &&
      status['lastAppliedRevision'].endsWith(`sha1:${request.flux.desiredRevision}`)
    )
      return;
    if (Date.now() >= deadline) throw new Error('first-start Flux handoff did not converge');
    await port.sleep();
  }
}
/** Fetch from the observed live URL, inspect Git objects without checkout, and admit one regular file. */
export async function readFirstStartTree(
  stateDir: string,
  url: string,
  revision: string,
  path: string,
): Promise<{ bytes: string; tree: string }> {
  if (!/^[0-9a-f]{40}$/.test(revision) || !/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(path))
    throw new Error('first-start Git revision/path is invalid');
  const scratch = mkdtempSync(join(stateDir, '.source-'));
  async function git(args: readonly string[]): Promise<string> {
    const invocation = await run(
      [
        'git',
        '-c',
        'protocol.ext.allow=never',
        '-c',
        'core.hooksPath=/dev/null',
        '-C',
        scratch,
        ...args,
      ],
      null,
      120_000,
    );
    if (invocation.exitCode !== 0) throw new Error('first-start source Git operation failed');
    return invocation.stdout;
  }
  try {
    await git(['init', '--bare', '--quiet']);
    await git(['fetch', '--quiet', '--depth=1', '--no-tags', '--', url, revision]);
    if ((await git(['rev-parse', 'FETCH_HEAD'])).trim() !== revision)
      throw new Error('first-start fetched another commit');
    const listing = await git(['ls-tree', '-z', `${revision}:${path}`]);
    // Proof: real Git symlink/extra-file/subtree negatives require one exact regular release.yaml.
    if (
      !listing.endsWith('\0') ||
      listing.split('\0').length !== 2 ||
      !/^100644 blob [0-9a-f]{40}\trelease\.yaml$/.test(listing.slice(0, -1))
    )
      throw new Error('first-start source subtree must contain only regular release.yaml');
    return {
      bytes: await git(['show', `${revision}:${path}/release.yaml`]),
      tree: (await git(['rev-parse', `${revision}:${path}`])).trim(),
    };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
