import { createHash } from 'node:crypto';
import { posix } from 'node:path';
import { isProxy } from 'node:util/types';

import { z } from 'zod';

import { WRITER_MEMBERS } from '../src/lib/installed-writers';

const sha = z.string().regex(/^[a-f0-9]{64}$/);
const revision = z.string().regex(/^[a-f0-9]{40}$/);
const nonce = z.string().regex(/^[a-f0-9]{32}$/);
const identifier = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-z0-9-]*$/);
const reference = z.string().min(1).max(256);
const principal = z.number().int().min(0).max(4294967295);
const decimal = z.string().regex(/^(0|[1-9][0-9]{0,23})$/);
const inode = z.string().regex(/^[1-9][0-9]{0,23}$/);
const pathname = z
  .string()
  .min(1)
  .max(4096)
  .refine(
    (path) =>
      path.startsWith('/') &&
      path !== '/' &&
      !path.includes('\0') &&
      posix.normalize(path) === path &&
      !path.endsWith('/'),
  );
const relative = z
  .string()
  .min(1)
  .max(256)
  .refine(
    (path) =>
      !path.startsWith('/') &&
      !path.includes('\0') &&
      posix.normalize(path) === path &&
      path !== '.' &&
      path !== '..' &&
      !path.startsWith('../') &&
      !path.endsWith('/'),
  );
const evidenceClass = z.enum(['synthetic-source-fixture', 'independent-production']);
const buildId = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_.-]+$/);
const member = z.enum(WRITER_MEMBERS);
const mode = z.union([z.literal(384), z.literal(420), z.literal(493)]);
const metadata = { device: decimal, inode, uid: principal, gid: principal };
const anchor = z
  .object({
    id: identifier,
    path: pathname,
    ...metadata,
    mode: z.union([z.literal(448), z.literal(493)]),
  })
  .strict();
const group = z
  .object({
    id: identifier,
    anchor: identifier,
    child: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[a-z][a-z0-9-]*$/),
    mode: z.union([z.literal(448), z.literal(488), z.literal(493)]),
    uid: principal,
    gid: principal,
  })
  .strict();
const nativeDirectoryPath = z
  .string()
  .min(1)
  .max(4096)
  .refine(
    (path) =>
      path.startsWith('/') &&
      !path.includes('\0') &&
      posix.normalize(path) === path &&
      (path === '/' || !path.endsWith('/')),
  );
const nativeTimes = { mtimeNs: decimal, ctimeNs: decimal };
const nativeRegular = z
  .object({
    path: pathname,
    device: decimal,
    inode,
    uid: z.literal(0),
    gid: z.literal(0),
    mode: z.union([z.literal(420), z.literal(493)]),
    bytes: z.number().int().min(1).max(134217728),
    sha256: sha,
    ...nativeTimes,
  })
  .strict();
const nativeProgram = <R extends string, P extends string>(role: R, path: P) =>
  z
    .object({
      role: z.literal(role),
      ...nativeRegular.shape,
      path: z.literal(path),
      mode: z.literal(493),
    })
    .strict();
const nativeSocket = z
  .object({
    path: pathname,
    device: decimal,
    inode,
    uid: principal,
    gid: principal,
    mode: z.number().int().min(0).max(511),
    ...nativeTimes,
  })
  .strict();
const nativeCustodySchema = z
  .object({
    qualificationReference: z.string().min(1).max(256),
    manager: z
      .object({
        pid: z.number().int().min(1).max(4194304),
        startTicks: inode,
        uid: z.literal(1000),
        gid: z.literal(1000),
        supplementaryGroups: z.array(principal).max(32),
        executable: z.literal('/usr/lib/systemd/systemd'),
        cgroup: z
          .object({
            path: z.literal('/user.slice/user-1000.slice/user@1000.service/init.scope'),
            device: decimal,
            inode,
          })
          .strict(),
      })
      .strict(),
    programs: z.tuple([
      nativeProgram('docker', '/usr/bin/docker'),
      nativeProgram('setpriv', '/usr/bin/setpriv'),
      nativeProgram('systemctl', '/usr/bin/systemctl'),
      nativeProgram('busctl', '/usr/bin/busctl'),
      nativeProgram('manager', '/usr/lib/systemd/systemd'),
    ]),
    loaderClosure: z
      .object({
        files: z
          .array(
            z
              .object({
                role: z.enum(['loader', 'library', 'loader-cache']),
                ...nativeRegular.shape,
              })
              .strict(),
          )
          .min(2)
          .max(27),
        links: z
          .array(
            z
              .object({
                path: pathname,
                target: z
                  .string()
                  .min(1)
                  .max(4096)
                  .refine((target) => !target.includes('\0')),
                resolvedPath: pathname,
                device: decimal,
                inode,
                uid: z.literal(0),
                gid: z.literal(0),
                mode: z.literal(511),
                ...nativeTimes,
              })
              .strict(),
          )
          .max(8),
        absentPaths: z.tuple([z.literal('/etc/ld.so.preload')]),
      })
      .strict(),
    parents: z
      .array(
        z
          .object({
            path: nativeDirectoryPath,
            ...metadata,
            mode: z.number().int().min(0).max(511),
          })
          .strict(),
      )
      .min(1)
      .max(48),
    endpoints: z.tuple([
      z
        .object({
          role: z.literal('docker'),
          ...nativeSocket.shape,
          path: z.literal('/run/docker.sock'),
          uid: z.literal(0),
          gid: principal,
        })
        .strict(),
      z
        .object({
          role: z.literal('user-bus'),
          ...nativeSocket.shape,
          path: z.literal('/run/user/1000/bus'),
          uid: z.literal(1000),
          gid: z.literal(1000),
        })
        .strict(),
      z
        .object({
          role: z.literal('manager-private'),
          ...nativeSocket.shape,
          path: z.literal('/run/user/1000/systemd/private'),
          uid: z.literal(1000),
          gid: z.literal(1000),
        })
        .strict(),
    ]),
  })
  .strict();
type NativeCustody = z.infer<typeof nativeCustodySchema>;
type NativeCode =
  NativeCustody['programs'][number] | NativeCustody['loaderClosure']['files'][number];
const facilitySchema = z
  .object({
    format: z.literal('source-stageb-fixture-authority'),
    version: z.literal(1),
    evidenceClass,
    sourceSha: revision,
    workflowSha: revision,
    nonce,
    custodyReference: reference,
    machineIdSha256: sha,
    bootId: z.string().regex(/^[a-f0-9-]{36}$/),
    coordinator: z.object({ directory: pathname, ...metadata, mode: z.literal(448) }).strict(),
    anchors: z.array(anchor).min(5).max(10),
    groups: z.array(group).min(5).max(10),
    unit: z
      .object({ anchor: z.literal('user-units'), leaf: z.literal('wbs-solver-supervisor.service') })
      .strict(),
    selectedColor: z.enum(['blue', 'green']),
    runtime: z
      .object({
        artifact: z.literal('solver-artifacts'),
        member: z.literal('bun'),
        bytes: z.number().int().min(1).max(134217728),
        sha256: sha,
      })
      .strict(),
    worker: z
      .object({
        source: z.literal('tools/tool-remote-scripts/rehearsals/source-stageb-migration-worker.ts'),
        recipe: z.literal('fixed-bun-worker-v1'),
        bytes: z.number().int().min(1).max(16777216),
        sha256: sha,
      })
      .strict(),
    migration: z
      .object({
        manifestSha256: sha,
        envelope: pathname,
        databases: z.tuple([
          z.object({ environment: z.literal('prod'), path: pathname }).strict(),
          z.object({ environment: z.literal('dev'), path: pathname }).strict(),
        ]),
      })
      .strict(),
    images: z
      .array(
        z
          .object({
            role: z.enum(['backend', 'gateway', 'source', 'caddy', 'solver-prod', 'solver-dev']),
            reference: z.string().min(1).max(512),
            imageId: z.string().regex(/^sha256:[a-f0-9]{64}$/),
          })
          .strict(),
      )
      .length(6),
    configurationSha256: sha,
    limits: z
      .object({
        groups: z.literal(10),
        declaredGroups: z.literal(5),
        helpers: z.literal(177),
        resources: z.literal(178),
        records: z.literal(2318),
        controlRecordBytes: z.literal(1024),
        outstanding: z.literal(8),
      })
      .strict(),
    enablement: z
      .object({
        parent: z.object({ path: pathname, ...metadata, mode: z.literal(493) }).strict(),
        leaf: z.literal('wbs-solver-supervisor.service'),
        admission: z.literal('preexisting-parent-only'),
      })
      .strict(),
    nativeCustody: nativeCustodySchema,
  })
  .strict();
const producerReference = z
  .object({ id: identifier, bytes: z.number().int().min(1).max(16384), sha256: sha })
  .strict();
const rosterSchema = z
  .object({
    format: z.literal('source-stageb-roster-policy'),
    version: z.literal(1),
    evidenceClass,
    sourceSha: revision,
    buildSha: revision,
    buildId,
    members: z
      .array(
        z
          .object({
            member,
            group: identifier,
            relative,
            destination: pathname,
            mode,
            origin: z.enum(['source', 'build']),
            producer: producerReference,
          })
          .strict(),
      )
      .length(12),
  })
  .strict();
const inputSchema = z
  .object({
    role: z.enum([
      'source-file',
      'source-tree',
      'dependencies',
      'lockfile',
      'bun-runtime',
      'configuration',
    ]),
    path: relative,
    bytes: z.number().int().min(1).max(17179869184),
    sha256: sha,
  })
  .strict();
const producerSchema = z
  .object({
    format: z.literal('source-stageb-producer-evidence'),
    version: z.literal(1),
    evidenceClass,
    id: identifier,
    sourceSha: revision,
    buildSha: revision,
    buildId,
    recipe: z.enum([
      'configuration-capture-v1',
      'runtime-copy-v1',
      'smoke-bundle-v1',
      'source-copy-v1',
      'swap-bundle-v1',
    ]),
    entry: relative.nullable(),
    inputs: z.array(inputSchema).min(1).max(4),
    output: z
      .object({ member, bytes: z.number().int().min(1).max(134217728), sha256: sha, mode })
      .strict(),
    execution: z
      .object({
        observationClass: z.enum(['synthetic-model', 'independent-owned-execution']),
        attempt: nonce,
        toolSha256: sha,
        started: z.literal(true),
        exitCode: z.literal(0),
        inputClosureSha256: sha,
        outputReadbackSha256: sha,
        settled: z.literal(true),
      })
      .strict(),
    provenanceReference: reference,
  })
  .strict();
export type SourceFixtureAuthority = z.infer<typeof facilitySchema>;
export type SourceFixtureRoster = z.infer<typeof rosterSchema>;
export type SourceProducerEvidence = z.infer<typeof producerSchema>;
function refusePolicy(reason: string): never {
  throw Error('source fixture policy ' + reason);
}
function digest(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}
/** Bounds and copies untrusted proposed package bytes before decoding or retaining lexical commitments. @internal */
export function copySourceFixtureBytes(bytes: Uint8Array, maximum: number): Uint8Array {
  if (isProxy(bytes) || !(bytes instanceof Uint8Array)) return refusePolicy('bytes refused');
  const prototype: unknown = Object.getPrototypeOf(bytes);
  const length: unknown = Reflect.get(Uint8Array.prototype, 'byteLength', bytes);
  if (
    (prototype !== Uint8Array.prototype && prototype !== Buffer.prototype) ||
    typeof length !== 'number' ||
    length < 1 ||
    length > maximum ||
    Reflect.ownKeys(bytes).some((key) => typeof key !== 'string' || !/^(0|[1-9][0-9]*)$/.test(key))
  )
    return refusePolicy('byte custody refused');
  return Uint8Array.prototype.slice.call(bytes);
}
function decodeCanonical<T>(bytes: Uint8Array, schema: z.ZodType<T>, maximum: number): T {
  const copied = copySourceFixtureBytes(bytes, maximum);
  const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(copied);
  const parsed = schema.parse(JSON.parse(text));
  // Proof: noncanonical policy input consumer refuses surplus whitespace and undeclared fields before native use.
  if (JSON.stringify(parsed) + '\n' !== text)
    return refusePolicy('canonical representation refused');
  return parsed;
}
function requireEqual(left: unknown, right: unknown, reason: string): void {
  if (JSON.stringify(left) !== JSON.stringify(right)) refusePolicy(reason);
}
function requireUnique(values: readonly string[], reason: string): void {
  if (new Set(values).size !== values.length) refusePolicy(reason);
}
/** Joins the authenticated finite native tuple; closure completeness remains an independently qualified G1 premise. */
function assertNativePolicy(facility: SourceFixtureAuthority): void {
  const native = facility.nativeCustody;
  const files = [...native.programs, ...native.loaderClosure.files];
  if (files.length > 32 || files.reduce((total, file) => total + file.bytes, 0) > 536870912)
    return refusePolicy('native code aggregate bound');
  requireUnique(
    files.map((file) => file.path),
    'native code paths',
  );
  requireUnique(
    native.loaderClosure.links.map((link) => link.path),
    'native alias paths',
  );
  requireUnique(
    native.parents.map((parent) => parent.path),
    'native parent paths',
  );
  requireUnique(
    native.endpoints.map((endpoint) => endpoint.path),
    'native endpoint paths',
  );
  requireUnique(native.manager.supplementaryGroups.map(String), 'native manager groups');
  const paths = [
    ...files.map((file) => file.path),
    ...native.loaderClosure.links.map((link) => link.path),
    ...native.parents.map((parent) => parent.path),
    ...native.endpoints.map((endpoint) => endpoint.path),
  ];
  requireUnique(paths, 'native object path overlap');
  const closure = native.loaderClosure.files;
  if (
    closure.filter((file) => file.role === 'loader').length !== 1 ||
    closure.filter((file) => file.role === 'loader-cache').length !== 1
  )
    return refusePolicy('native loader/cache cardinality');
  for (const file of closure) {
    if (file.role === 'loader-cache') {
      if (file.path !== '/etc/ld.so.cache' || file.mode !== 420)
        return refusePolicy('native cache coordinate');
    } else if (!file.path.startsWith('/usr/lib/')) return refusePolicy('native code coordinate');
  }
  const parents = new Map(native.parents.map((parent) => [parent.path, parent]));
  const ancestors = (path: string) => {
    let parent = posix.dirname(path);
    for (;;) {
      if (!parents.has(parent)) return refusePolicy('native canonical ancestor absent');
      if (parent === '/') break;
      parent = posix.dirname(parent);
    }
  };
  for (const parent of native.parents) {
    const userScope =
      parent.path === '/run/user/1000' ||
      parent.path.startsWith('/run/user/1000/') ||
      parent.path === '/sys/fs/cgroup/user.slice/user-1000.slice/user@1000.service' ||
      parent.path.startsWith('/sys/fs/cgroup/user.slice/user-1000.slice/user@1000.service/');
    if ((parent.mode & 0o022) !== 0 || (parent.uid !== 0 && !(userScope && parent.uid === 1000)))
      return refusePolicy('native directory owner/mode');
    if (parent.path !== '/') ancestors(parent.path);
    const existing = facility.anchors.find((anchor) => anchor.path === parent.path);
    if (existing !== undefined)
      requireEqual(
        [parent.device, parent.inode, parent.uid, parent.gid, parent.mode],
        [existing.device, existing.inode, existing.uid, existing.gid, existing.mode],
        'native repeated anchor',
      );
  }
  for (const file of files) ancestors(file.path);
  for (const endpoint of native.endpoints) ancestors(endpoint.path);
  for (const link of native.loaderClosure.links) {
    if (!(
      link.path === '/lib' ||
      link.path === '/lib64' ||
      link.path.startsWith('/usr/lib/') ||
      link.path.startsWith('/usr/lib64/')
    ))
      return refusePolicy('native alias coordinate');
    if (posix.resolve(posix.dirname(link.path), link.target) !== link.resolvedPath)
      return refusePolicy('native alias target join');
    ancestors(link.path);
    ancestors(link.resolvedPath);
    if (!files.some((file) => file.path === link.resolvedPath) && !parents.has(link.resolvedPath))
      return refusePolicy('native alias target absent');
  }
  const group = parents.get('/sys/fs/cgroup' + native.manager.cgroup.path);
  if (group?.device !== native.manager.cgroup.device || group.inode !== native.manager.cgroup.inode)
    return refusePolicy('native manager cgroup parent join');
}
/** Decodes all exact lexical policy/provenance bodies; this proposed packet supplies no native permission. */
export function decodeSourceFixturePolicy(
  facilityBytes: Uint8Array,
  rosterBytes: Uint8Array,
  producerBytes: readonly Uint8Array[],
) {
  const proposedProducers: unknown = producerBytes;
  if (isProxy(producerBytes) || !Array.isArray(proposedProducers) || producerBytes.length !== 12)
    return refusePolicy('twelve producers required');
  const facility = decodeCanonical(facilityBytes, facilitySchema, 32768);
  assertNativePolicy(facility);
  const roster = decodeCanonical(rosterBytes, rosterSchema, 16384);
  const producers = producerBytes.map((bytes) => decodeCanonical(bytes, producerSchema, 16384));
  if (
    producerBytes.reduce((sum, bytes) => sum + bytes.byteLength, 0) > 196608 ||
    facilityBytes.byteLength +
      rosterBytes.byteLength +
      producerBytes.reduce((sum, bytes) => sum + bytes.byteLength, 0) >
      245760
  )
    return refusePolicy('aggregate byte bound');
  requireEqual(
    roster.members.map((row) => row.member),
    WRITER_MEMBERS,
    'member order',
  );
  requireUnique(
    roster.members.map((row) => row.destination),
    'duplicate destination',
  );
  requireUnique(
    producers.map((producer) => producer.id),
    'duplicate producer',
  );
  requireUnique(
    facility.anchors.map((parent) => parent.id),
    'duplicate anchor',
  );
  requireUnique(
    facility.groups.map((scope) => scope.id),
    'duplicate group',
  );
  requireUnique(
    facility.images.map((image) => image.role),
    'duplicate image role',
  );
  requireEqual(
    facility.images.map((image) => image.role),
    ['backend', 'gateway', 'source', 'caddy', 'solver-prod', 'solver-dev'],
    'image role order',
  );
  requireEqual(
    [roster.sourceSha, roster.buildSha, roster.evidenceClass],
    [facility.sourceSha, facility.sourceSha, facility.evidenceClass],
    'source identity',
  );
  const fixedAnchors = [
    ['home', '/home/puni1'],
    ['lib', '/home/puni1/.local/lib'],
    ['config', '/home/puni1/.config'],
    ['user-units', '/home/puni1/.config/systemd/user'],
    ['runtime', '/run/user/1000'],
  ] as const;
  requireEqual(
    facility.anchors.slice(0, 5).map((parent) => [parent.id, parent.path]),
    fixedAnchors,
    'fixed anchors',
  );
  const fixedGroups = [
    ['prod', 'home', 'wbs', 493],
    ['dev', 'home', 'wbs-dev', 493],
    ['solver-lib', 'lib', 'wbs-solver', 493],
    ['solver-config', 'config', 'wbs-solver', 448],
    ['solver-runtime', 'runtime', 'wbs-solver', 488],
  ] as const;
  requireEqual(
    facility.groups.slice(0, 5).map((scope) => [scope.id, scope.anchor, scope.child, scope.mode]),
    fixedGroups,
    'fixed groups',
  );
  const anchors = new Map(facility.anchors.map((parent) => [parent.id, parent]));
  const paths = new Map<string, string>();
  for (const [index, scope] of facility.groups.entries()) {
    const parent = anchors.get(scope.anchor);
    if (parent === undefined) return refusePolicy('group anchor absent');
    if (scope.uid !== 1000 || scope.gid !== 1000 || parent.uid !== 1000 || parent.gid !== 1000)
      return refusePolicy('fixed principal');
    if (
      index >= 5 &&
      (!/^declared-[1-5]$/.test(scope.id) ||
        !/^declared-parent-[1-5]$/.test(scope.anchor) ||
        scope.child !== 'owned' ||
        scope.mode !== 448)
    )
      return refusePolicy('declared group');
    const path = parent.path + '/' + scope.child;
    if (
      [...paths.values()].some(
        (other) => path === other || path.startsWith(other + '/') || other.startsWith(path + '/'),
      ) ||
      path === facility.coordinator.directory ||
      path.startsWith(facility.coordinator.directory + '/') ||
      facility.coordinator.directory.startsWith(path + '/')
    )
      return refusePolicy('group overlap');
    paths.set(scope.id, path);
  }
  requireEqual(
    facility.enablement.parent.path,
    '/home/puni1/.config/systemd/user/default.target.wants',
    'enablement parent',
  );
  if (facility.enablement.parent.uid !== 1000 || facility.enablement.parent.gid !== 1000)
    return refusePolicy('enablement principal');
  if (
    facility.migration.envelope !==
    '/home/puni1/wbs/state/dependency-artifacts/' + facility.migration.manifestSha256
  )
    return refusePolicy('migration envelope');
  for (const store of facility.migration.databases) {
    const root = paths.get(store.environment);
    if (
      root === undefined ||
      !store.path.startsWith(root + '/data/') ||
      store.path.slice((root + '/data/').length).includes('/')
    )
      return refusePolicy('database scope');
  }
  const fixedDestinations = [
    '/home/puni1/wbs/bin/swap.js',
    '/home/puni1/wbs/bin/smoke.js',
    '/home/puni1/wbs-dev/bin/swap.js',
    '/home/puni1/wbs-dev/bin/smoke.js',
    '/home/puni1/wbs-dev/bin/poll.sh',
    '/home/puni1/wbs-dev/bin/dev-poll-sync.sh',
    '/home/puni1/wbs-dev/bin/bun',
  ];
  for (const [index, row] of roster.members.entries()) {
    const scope = paths.get(row.group);
    if (scope === undefined || row.destination !== scope + '/' + row.relative)
      return refusePolicy('destination group join');
    if (index < 7 && (row.destination !== fixedDestinations[index] || row.mode !== 493))
      return refusePolicy('fixed destination');
    if (index >= 7 && (!row.group.startsWith('declared-') || row.relative.includes('/')))
      return refusePolicy('declared destination');
    const producer = producers.at(index);
    const bytes = producerBytes.at(index);
    if (producer === undefined || bytes === undefined) return refusePolicy('producer missing');
    requireEqual(
      [row.producer.id, row.producer.bytes, row.producer.sha256],
      [producer.id, bytes.byteLength, digest(bytes)],
      'producer lexical join',
    );
    requireEqual(
      [producer.sourceSha, producer.buildSha, producer.buildId, producer.evidenceClass],
      [roster.sourceSha, roster.buildSha, roster.buildId, roster.evidenceClass],
      'producer source join',
    );
    requireEqual(
      [producer.output.member, producer.output.mode],
      [row.member, row.mode],
      'producer output join',
    );
    requireUnique(
      producer.inputs.map((input) => input.role),
      'duplicate input role',
    );
    requireEqual(
      producer.execution.inputClosureSha256,
      digest(JSON.stringify(producer.inputs) + '\n'),
      'producer input closure',
    );
    requireEqual(
      producer.execution.outputReadbackSha256,
      producer.output.sha256,
      'producer readback claim',
    );
    requireEqual(
      producer.execution.observationClass,
      facility.evidenceClass === 'synthetic-source-fixture'
        ? 'synthetic-model'
        : 'independent-owned-execution',
      'producer evidence class',
    );
    requireEqual(producer.execution.attempt, facility.nonce, 'producer attempt');
    const roles = producer.inputs.map((input) => input.role);
    if (producer.recipe === 'source-copy-v1') {
      const input = producer.inputs.at(0);
      if (input === undefined) return refusePolicy('source input absent');
      requireEqual(
        [roles, row.origin, producer.entry, input.path, input.bytes, input.sha256],
        [
          ['source-file'],
          'source',
          input.path,
          input.path,
          producer.output.bytes,
          producer.output.sha256,
        ],
        'source copy join',
      );
      if (row.member === 'dev-poller' && producer.entry !== 'bin/dev-poll.sh')
        return refusePolicy('poller mapping');
      if (row.member === 'dev-loader' && producer.entry !== 'bin/dev-poll-sync.sh')
        return refusePolicy('loader mapping');
    } else if (producer.recipe === 'swap-bundle-v1' || producer.recipe === 'smoke-bundle-v1') {
      requireEqual(
        [roles, row.origin, producer.entry],
        [
          ['source-tree', 'dependencies', 'lockfile', 'bun-runtime'],
          'build',
          producer.recipe === 'swap-bundle-v1'
            ? 'tools/tool-remote-scripts/src/swap.ts'
            : 'tools/tool-smoke/src/main.ts',
        ],
        'fixed build recipe',
      );
      if (
        (producer.recipe === 'swap-bundle-v1' && !row.member.endsWith('-swap')) ||
        (producer.recipe === 'smoke-bundle-v1' && !row.member.endsWith('-smoke'))
      )
        return refusePolicy('build member');
    } else {
      const input = producer.inputs.at(0);
      if (input === undefined) return refusePolicy('producer input absent');
      requireEqual(
        [roles, row.origin, producer.entry, input.bytes, input.sha256],
        [
          [producer.recipe === 'runtime-copy-v1' ? 'bun-runtime' : 'configuration'],
          'build',
          null,
          producer.output.bytes,
          producer.output.sha256,
        ],
        'copied producer',
      );
      if (producer.recipe === 'runtime-copy-v1' && row.member !== 'dev-interpreter')
        return refusePolicy('runtime member');
      if (
        producer.recipe === 'configuration-capture-v1' &&
        !['shared-launch-authority', 'shared-restart-authority'].includes(row.member)
      )
        return refusePolicy('configuration member');
    }
  }
  return Object.freeze({ facility, roster, producers: Object.freeze(producers) });
}

import {
  type ChildProcessByStdio,
  type ChildProcessWithoutNullStreams,
  spawn,
} from 'node:child_process';
import {
  type BigIntStats,
  closeSync,
  constants,
  fchmodSync,
  fchownSync,
  fstatSync,
  fsync,
  mkdirSync,
  openSync,
} from 'node:fs';
import {
  type FileHandle,
  lchown,
  lstat,
  open,
  readdir,
  readFile,
  readlink,
  realpath,
  rmdir,
  symlink,
  unlink,
} from 'node:fs/promises';
import type { Readable } from 'node:stream';

import { captureAppliedMigrationSet } from '@wbs/store-sqlite/migration-set';
import { Database } from 'bun:sqlite';

import { inspectDormantDependencies } from '../src/lib/dependency-inventory';
import { assertParticipantImage } from '../src/lib/dependency-participant-images';
import { observeParticipantProcess } from '../src/lib/dependency-participant-process';
import { readParticipantSnapshot } from '../src/lib/dependency-participant-transition';
import { parseDockerInspection } from '../src/lib/docker-inspection-json';
import { EDGE_CONTAINER, envLayout, sourceDevContract } from '../src/lib/env';
import { decodeWriterManifest } from '../src/lib/installed-writers';
import { readFields, readIdentity } from '../src/lib/managed-cohort';
import { readProductHostProc } from '../src/lib/product-host-proc';
import {
  observeSolverCgroup,
  observeSolverProcess,
  parseSolverUnit,
  type SolverUnit,
} from '../src/lib/solver-host';
import {
  isStoppedSolverUnit,
  observeSolverUnit,
  readSolverUnitProjection,
  SOLVER_UNIT_PROPERTIES,
} from '../src/lib/solver-unit-observation';
import { decodeSourceDev, sourceDevIdentity } from '../src/lib/source-dev-cohort';
import { decodeSourceRestorationConfiguration } from '../src/lib/source-restoration-configuration';
import {
  assertSourceLatch,
  assertSourceOutputCoverage,
  assertSourceOutputParents,
  decodeSourceCapture,
  decodeSourceOwnership,
  decodeSourceProfilePacket,
  type SourceCapture,
  type SourceOutputParent,
  type SourceOwnership,
  type SourceProcess,
  type SourceProfilePacket,
} from './source-participant-profile';
import {
  assertSourceArchivePreflight,
  type SourceArchivePreflightBorrow,
} from './source-stageb-archive-preflight';
import { inspectSourceArtifacts, type SourceArtifacts } from './source-stageb-artifacts';
import {
  assertOriginalStaging,
  inspectOriginalStaging,
  type OriginalStagingRetention,
  readOriginalStagedChunk,
} from './source-stageb-builder';
import { inspectSourceInputs, type SourceInputs } from './source-stageb-inputs';
import {
  abandonSourceIntent,
  appendSourceIntent,
  dispatchSourceIntent,
  inspectSourceJournal,
  type RecordedResource,
  recordSourceObservation,
  recordSourceUncertainty,
  type SourceDispatch,
  type SourceJournal,
} from './source-stageb-journal';
import {
  decodeSourceMigrationFrames,
  encodeSourceMigrationFrame,
  type SourceMigrationFrame,
} from './source-stageb-migration-worker';

declare const SOURCE_STAGEB_FIXTURE_AUTHORITY_LITERAL: string;
declare const SOURCE_STAGEB_ROSTER_POLICY_LITERAL: string;
declare const SOURCE_STAGEB_PRODUCER_EVIDENCE_LITERAL: readonly string[];
declare const SOURCE_STAGEB_MIGRATION_WORKER_LITERAL: string;
const facilityLiteral =
  typeof SOURCE_STAGEB_FIXTURE_AUTHORITY_LITERAL === 'undefined'
    ? undefined
    : SOURCE_STAGEB_FIXTURE_AUTHORITY_LITERAL;
const rosterLiteral =
  typeof SOURCE_STAGEB_ROSTER_POLICY_LITERAL === 'undefined'
    ? undefined
    : SOURCE_STAGEB_ROSTER_POLICY_LITERAL;
const producerLiterals =
  typeof SOURCE_STAGEB_PRODUCER_EVIDENCE_LITERAL === 'undefined'
    ? undefined
    : SOURCE_STAGEB_PRODUCER_EVIDENCE_LITERAL;
const workerLiteral =
  typeof SOURCE_STAGEB_MIGRATION_WORKER_LITERAL === 'undefined'
    ? undefined
    : SOURCE_STAGEB_MIGRATION_WORKER_LITERAL;
/** Hashes exact lexical commitments before interpreting any native facility field. @internal */
export function authenticateSourceFixturePolicies(
  inputs: SourceInputs,
  artifacts: SourceArtifacts,
) {
  const inspection = inspectSourceInputs(inputs);
  if (
    facilityLiteral === undefined ||
    rosterLiteral === undefined ||
    producerLiterals === undefined ||
    workerLiteral === undefined
  )
    return refusePolicy('fixed lexical package absent');
  if (
    digest(facilityLiteral) !== inspection.review.fixtureAuthoritySha256 ||
    digest(facilityLiteral) !== inspection.index.fixtureAuthoritySha256 ||
    digest(rosterLiteral) !== inspection.review.rosterPolicySha256 ||
    digest(rosterLiteral) !== inspection.index.rosterPolicySha256
  )
    return refusePolicy('original lexical commitment differs');
  const policy = decodeSourceFixturePolicy(
    Buffer.from(facilityLiteral),
    Buffer.from(rosterLiteral),
    producerLiterals.map((body) => Buffer.from(body)),
  );
  const projection = inspectSourceArtifacts(artifacts);
  requireEqual(
    [policy.facility.sourceSha, policy.facility.workflowSha, policy.facility.nonce],
    [inspection.review.sourceSha, inspection.review.workflowSha, inspection.review.nonce],
    'original input attempt',
  );
  requireEqual(
    [
      policy.facility.selectedColor,
      policy.facility.migration.manifestSha256,
      policy.facility.runtime.sha256,
    ],
    [
      projection.request.prod.backend.color,
      projection.request.migrations.manifestSha256,
      projection.request.solver.bunSha256,
    ],
    'original artifact pins',
  );
  const configuration = inspection.index.artifacts.find(
    (artifact) => artifact.slot === 'configuration',
  );
  // Proof: configuration-pin omission reached the raw native-custody boundary in the genuine public consumer (counter0→1); original policy join configuration RED, exact restore GREEN.
  if (configuration?.sha256 !== policy.facility.configurationSha256)
    return refusePolicy('original configuration artifact pin');
  const expectedImages = [
    {
      role: 'backend',
      reference: projection.request.prod.backend.image,
      imageId: projection.request.migrations.candidateImageId,
    },
    {
      role: 'gateway',
      reference: projection.request.prod.gateway.image,
      imageId: projection.images.gatewayImageId,
    },
    {
      role: 'source',
      reference: projection.request.source.runtimeReference,
      imageId: projection.request.source.pins.runtimeImageId,
    },
    { role: 'caddy', ...projection.images.caddy },
  ];
  for (const expected of expectedImages) {
    const image = policy.facility.images.find((image) => image.role === expected.role);
    if (image === undefined) return refusePolicy('original fixed image role absent');
    // Proof: fixed-image comparison omission reached raw custody before refusal (counter0→1); original policy join backend-imageId RED, exact restore GREEN.
    requireEqual(image, expected, 'original fixed image pin');
  }
  for (const role of ['solver-prod', 'solver-dev'] as const) {
    const image = policy.facility.images.find((image) => image.role === role);
    if (image === undefined) return refusePolicy('original solver image role absent');
    const expected = projection.images.solver.find(
      (expected) => expected.reference === image.reference,
    );
    // Proof: solver-ID comparison omission reached raw custody (counter0→1); original policy join solver-prod-imageId RED, exact restore GREEN.
    if (expected?.imageId !== image.imageId) return refusePolicy('original solver image pin');
  }
  const writers = decodeWriterManifest(
    JSON.parse(projection.request.authorities.writerManifestContents),
  );
  requireEqual(
    [writers.sourceSha, writers.buildSha, writers.buildId],
    [policy.roster.sourceSha, policy.roster.buildSha, policy.roster.buildId],
    'writer identity',
  );
  for (const [index, row] of policy.roster.members.entries()) {
    const writer = writers.members.find((writer) => writer.member === row.member);
    const producer = policy.producers.at(index);
    const payload = projection.members.find((member) => member.path === 'authority/' + row.member);
    if (writer === undefined || producer === undefined || payload === undefined)
      return refusePolicy('writer member absent');
    requireEqual(
      [writer.hostPath, writer.origin, writer.sha256, payload.bytes, payload.sha256, payload.mode],
      [
        row.destination,
        row.origin,
        producer.output.sha256,
        producer.output.bytes,
        producer.output.sha256,
        row.mode,
      ],
      'writer payload provenance',
    );
    for (const input of producer.inputs) {
      if (input.role === 'source-file') {
        const source = projection.members.find((member) => member.path === 'source/' + input.path);
        if (source === undefined) return refusePolicy('named source mapping absent');
        requireEqual(
          [source.bytes, source.sha256, source.mode],
          [input.bytes, input.sha256, row.mode],
          'named source mapping',
        );
      } else if (input.role === 'source-tree' || input.role === 'dependencies') {
        const artifact = inspection.index.artifacts.find(
          (artifact) => artifact.slot === input.role,
        );
        if (artifact === undefined) return refusePolicy('producer artifact absent');
        requireEqual(
          [input.bytes, input.sha256],
          [artifact.bytes, artifact.sha256],
          'producer artifact input',
        );
      } else if (input.role === 'lockfile') {
        const lock = projection.members.find((member) => member.path === 'source/bun.lock');
        if (lock === undefined) return refusePolicy('lockfile absent');
        requireEqual([input.bytes, input.sha256], [lock.bytes, lock.sha256], 'producer lock input');
      } else if (input.role === 'bun-runtime') {
        requireEqual(
          [input.bytes, input.sha256],
          [policy.facility.runtime.bytes, policy.facility.runtime.sha256],
          'producer runtime input',
        );
      }
    }
    requireEqual(producer.execution.toolSha256, policy.facility.runtime.sha256, 'producer tool');
  }
  const worker = Buffer.from(workerLiteral, 'base64');
  if (
    worker.toString('base64') !== workerLiteral ||
    worker.byteLength !== policy.facility.worker.bytes ||
    digest(worker) !== policy.facility.worker.sha256
  )
    return refusePolicy('worker lexical commitment');
  return { ...policy, worker };
}
function refuseConstruction(reason: string): never {
  throw Error('source construction ' + reason);
}
/** Keeps the first failure as cause while retaining a separately failed original-reference close. */
function combineConstructionErrors(
  primary: unknown,
  secondary: unknown,
  message: string,
): AggregateError {
  return new AggregateError([primary, secondary], message, { cause: primary });
}
function normalizeConstructionFailure(failure: unknown): Error {
  return failure instanceof Error
    ? failure
    : Error('source construction non-Error failure', { cause: failure });
}
function sameNode(actual: BigIntStats, original: BigIntStats, metadata = true): void {
  if (
    actual.dev !== original.dev ||
    actual.ino !== original.ino ||
    (actual.mode & 0o170000n) !== (original.mode & 0o170000n) ||
    (metadata &&
      (actual.mode !== original.mode || actual.uid !== original.uid || actual.gid !== original.gid))
  )
    refuseConstruction('original object changed');
}
/** Parses the bounded native bus envelope while rejecting duplicate decoded object keys. */
function readUniqueNativeJSON(text: string): unknown {
  if (text.charCodeAt(0) === 0xfeff || Buffer.byteLength(text) > 65536)
    return refuseConstruction('native bus document bound');
  let position = 0;
  const space = () => {
    while (position < text.length && /[\t\r\n ]/.test(text.charAt(position))) position++;
  };
  const string = (): string => {
    const start = position;
    if (text.charAt(position++) !== '"') return refuseConstruction('native bus string absent');
    for (; position < text.length; position++) {
      const character = text.charAt(position);
      if (character === '\\') {
        position++;
        continue;
      }
      if (character === '"') {
        position++;
        const decoded = parseDockerInspection(text.slice(start, position));
        if (typeof decoded !== 'string') return refuseConstruction('native bus string differs');
        return decoded;
      }
    }
    return refuseConstruction('native bus string unterminated');
  };
  const value = (depth: number): unknown => {
    if (depth > 32) return refuseConstruction('native bus nesting bound');
    space();
    const character = text.charAt(position);
    if (character === '"') return string();
    if (character === '{') {
      position++;
      space();
      const fields: Record<string, unknown> = {};
      if (text.charAt(position) === '}') {
        position++;
        return fields;
      }
      for (;;) {
        space();
        const key = string();
        space();
        if (Object.hasOwn(fields, key) || text.charAt(position++) !== ':')
          return refuseConstruction('native bus duplicate key or separator');
        Object.defineProperty(fields, key, { value: value(depth + 1), enumerable: true });
        space();
        const delimiter = text.charAt(position++);
        if (delimiter === '}') return fields;
        if (delimiter !== ',') return refuseConstruction('native bus object delimiter');
      }
    }
    if (character === '[') {
      position++;
      space();
      const values: unknown[] = [];
      if (text.charAt(position) === ']') {
        position++;
        return values;
      }
      for (;;) {
        if (values.length >= 256) return refuseConstruction('native bus array bound');
        values.push(value(depth + 1));
        space();
        const delimiter = text.charAt(position++);
        if (delimiter === ']') return values;
        if (delimiter !== ',') return refuseConstruction('native bus array delimiter');
      }
    }
    const literal =
      /^(?:null|true|false|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/.exec(
        text.slice(position),
      );
    if (literal === null) return refuseConstruction('native bus scalar differs');
    position += literal[0].length;
    const decoded = parseDockerInspection(literal[0]);
    return decoded;
  };
  const decoded = value(0);
  space();
  if (position !== text.length) return refuseConstruction('native bus trailing document');
  return decoded;
}
interface NativeMember {
  readonly path: string;
  readonly kind: 'directory' | 'file' | 'symlink';
  identity: BigIntStats;
  complete?: boolean;
  readonly bytes?: number;
  readonly sha256?: string;
  readonly target?: string;
}
interface DirectoryScope {
  readonly acquisition: {
    descriptor: number;
    identity: BigIntStats;
    closed: boolean;
    closeFailure?: unknown;
  };
  readonly path: string;
  readonly descriptor: number;
  identity: BigIntStats;
  resource?: RecordedResource;
  readonly members: NativeMember[];
  removed: boolean;
}
interface InstalledFile {
  readonly path: string;
  file: FileHandle;
  descriptor: number;
  identity: BigIntStats;
  bytes: number;
  sha256: string;
  resource?: RecordedResource;
  sidecars?: { readonly path: string; readonly identity: BigIntStats }[];
  isDatabase?: boolean;
  removed: boolean;
}
interface DatabaseLifetime {
  readonly environment: 'prod' | 'dev';
  readonly root: DirectoryScope;
  readonly parent: DirectoryScope;
  readonly leaf: string;
  readonly resource: RecordedResource;
  descriptor:
    | { readonly phase: 'retained' | 'retiring' | 'retired' }
    | { readonly phase: 'close-failed'; readonly failure: unknown };
}
function fsIdentity(identity: BigIntStats, kind: 'directory' | 'file') {
  return {
    kind,
    device: String(identity.dev),
    inode: String(identity.ino),
    uid: Number(identity.uid),
    gid: Number(identity.gid),
    mode: Number(identity.mode & 0o7777n),
  };
}
type NativeChild = ChildProcessWithoutNullStreams | ChildProcessByStdio<null, Readable, Readable>;
function isNativeChildLive(child: NativeChild): boolean {
  return child.exitCode === null && child.signalCode === null;
}
interface NativeStatus {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
}
interface NativeSettlement {
  readonly child: NativeChild;
  readonly transport: 'manager' | 'docker' | 'migration';
  readonly cleanup: boolean;
  readonly requestedArgv: readonly string[];
  readonly closed: Promise<NativeStatus>;
  readonly cutoff: number;
  phase: 'open' | 'closed' | 'settled';
  status?: NativeStatus;
  nativeError?: Error;
  stdout?: Promise<Buffer>;
  stderr?: Promise<Buffer>;
  liveIdentity?: Awaited<ReturnType<SourceFixtureConstruction['observeChild']>>;
}
type ContainerRole = 'backend' | 'gateway' | 'source' | 'caddy';
interface NativeNetwork {
  readonly environment: 'prod' | 'dev';
  readonly id: string;
  resource?: RecordedResource;
  removed: boolean;
}
interface NativeContainer {
  readonly role: ContainerRole;
  readonly id: string;
  readonly created: string;
  resource?: RecordedResource;
  readonly initial: unknown;
  started?: unknown;
  process?: { readonly pid: number; readonly startTime: string; readonly cgroup: string };
  removed: boolean;
}
interface NativeTag {
  readonly imageId: string;
  resource?: RecordedResource;
  removed: boolean;
}
type ManagerAction =
  | {
      readonly kind: 'manager-command';
      readonly operation: 'daemon-reload' | 'enable' | 'restart' | 'stop' | 'disable';
    }
  | { readonly kind: 'manager-absence' }
  | { readonly kind: 'manager-show' }
  | { readonly kind: 'manager-load' }
  | { readonly kind: 'manager-hook'; readonly hook: 'ExecStartPre' | 'ExecStartPost' | 'ExecStop' };
const managerService = 'wbs-solver-supervisor.service';
const managerPrefix = [
  '--reuid=1000',
  '--regid=1000',
  '--clear-groups',
  '--inh-caps=-all',
  '--ambient-caps=-all',
  '--bounding-set=-all',
  '--no-new-privs',
  '--',
] as const;
const managerEnvironment = {
  HOME: '/home/puni1',
  USER: 'puni1',
  LOGNAME: 'puni1',
  XDG_CONFIG_HOME: '/home/puni1/.config',
  XDG_RUNTIME_DIR: '/run/user/1000',
  DBUS_SESSION_BUS_ADDRESS: 'unix:path=/run/user/1000/bus',
  PATH: '/usr/bin:/bin',
  LC_ALL: 'C',
} as const;
const managerExtras = [
  'RuntimeDirectoryMode',
  'RuntimeDirectoryPreserve',
  'RestartUSec',
  'NRestarts',
] as const;
type NativeAction =
  | ManagerAction
  | { readonly kind: 'container-list' }
  | { readonly kind: 'network-list' }
  | { readonly kind: 'container-absence' }
  | { readonly kind: 'network-absence' }
  | { readonly kind: 'entry-container-inspect'; readonly ids: readonly string[] }
  | { readonly kind: 'entry-network-inspect'; readonly ids: readonly string[] }
  | {
      readonly kind: 'image-inspect';
      readonly role: SourceFixtureAuthority['images'][number]['role'];
    }
  | { readonly kind: 'network-create'; readonly environment: 'prod' | 'dev' }
  | { readonly kind: 'network-inspect' | 'network-remove'; readonly original: NativeNetwork }
  | { readonly kind: 'tag-create' | 'tag-inspect' | 'tag-remove' | 'tag-absence' }
  | { readonly kind: 'container-create'; readonly role: ContainerRole }
  | {
      readonly kind:
        | 'container-inspect'
        | 'container-start'
        | 'container-stop'
        | 'container-remove'
        | 'source-policy';
      readonly original: NativeContainer;
    };
const setupOutputs = [
  '.nx',
  'node_modules/.cache',
  'node_modules/.vite',
  'node_modules/.vite-temp',
  'apps/wbs/fe-01/.vite',
  'apps/wbs/mcp-01/src/openapi.json',
] as const;
interface ResetMember {
  readonly relative: string;
  readonly identity: BigIntStats;
  readonly kind: 'file' | 'directory';
  readonly sha256: string | null;
}
type SetupEpoch =
  | { readonly phase: 'A' | 'B' | 'D'; readonly capture: SourceCapture }
  | {
      readonly phase: 'C';
      readonly source: SourceOwnership;
      readonly parents: readonly SourceOutputParent[];
      readonly residue: readonly ResetMember[];
      readonly absenceSha256: string;
    };
/** Original in-flight constructor state; only the guarded builder entry creates it. @internal */
export class SourceFixtureConstruction {
  readonly directories: DirectoryScope[] = [];
  readonly files: InstalledFile[] = [];
  private readonly unpublishedDirectories = new Set<string>();
  private readonly acquiredDirectories: {
    descriptor: number;
    identity?: BigIntStats;
    closed: boolean;
    closeFailure?: unknown;
  }[] = [];
  readonly acquiredFiles: { file: FileHandle; descriptor: number; identity?: BigIntStats }[] = [];
  readonly policy: ReturnType<typeof authenticateSourceFixturePolicies>;
  readonly projection: ReturnType<typeof inspectSourceArtifacts>;
  readonly deadline: number;
  readonly failures: unknown[] = [];
  private readonly pendingDispatches = new Set<SourceDispatch>();
  private readonly settledDispatches = new WeakSet<SourceDispatch>();
  private readonly closingFiles = new WeakMap<FileHandle, Promise<void>>();
  private readonly databases = new Map<InstalledFile, DatabaseLifetime>();
  private readonly databaseReaders = new Set<Database>();
  private hasUnsettledLedgerRead = false;
  private readonly consumedBytes = new Map<string, { bytes: number; sha256: string }>();
  private readonly installedReadbacks = new Map<string, { bytes: number; sha256: string }>();
  readonly children: NativeChild[] = [];
  private readonly nativeSettlements = new Map<NativeChild, NativeSettlement>();
  readonly networks: NativeNetwork[] = [];
  readonly containers: NativeContainer[] = [];
  readonly scopes = new Map<string, DirectoryScope>();
  readonly images = new Map<SourceFixtureAuthority['images'][number]['role'], unknown>();
  tag?: NativeTag;
  private forwardHelpers = 0;
  private cleanupTransports = 0;
  private packet?: SourceProfilePacket;
  /** Original raw unit replies remain retained across metadata GC and any later cleanup refusal. */
  private readonly unitObservations: {
    commands: { requestedArgv: readonly string[]; stdout: string }[];
    effective?: string;
    extras?: readonly string[];
  }[] = [];
  private unitResource?: RecordedResource;
  private unitActive?: SolverUnit;
  private unitProcess?: Awaited<ReturnType<typeof observeSolverProcess>>;
  private unitLink?: { path: string; identity: BigIntStats; resource?: RecordedResource };
  private unitStopped = false;
  private unitStartDispatched = false;
  private unitSocket?: BigIntStats;
  private unitCgroup?: { device: string; inode: string };
  private readonly preusedFiles = new Set<InstalledFile>();
  private unitRemoved = false;
  private unitParents?: Map<string, { identity: BigIntStats; target?: string }>;
  private nativeObservationFds = 0;
  private readonly nativeCustody = new Map<string, { identity: BigIntStats; sha256?: string }>();
  private isConstructing = true;
  private readonly epochs: SetupEpoch[] = [];
  private sourceOwnership?: SourceOwnership;
  private sourceNamespaces?: SourceProcess['namespaces'];
  private sourceCgroup?: string;
  private readonly sourceProcesses = new Map<number, SourceProcess>();
  private readonly sourceTables = new Map<
    string,
    { file: FileHandle; descriptor: number; identity: BigIntStats }
  >();

  private closing?: Promise<void>;
  constructor(
    readonly inputs: SourceInputs,
    readonly artifacts: SourceArtifacts,
    readonly journal: SourceJournal,
    readonly retention: OriginalStagingRetention,
    readonly archive: SourceArchivePreflightBorrow,
  ) {
    assertOriginalStaging(retention);
    this.policy = authenticateSourceFixturePolicies(inputs, artifacts);
    this.projection = inspectSourceArtifacts(artifacts);
    this.deadline = inspectSourceInputs(inputs).originalDeadline;
  }
  private async captureBeforeUse(installed: InstalledFile): Promise<void> {
    if (this.preusedFiles.has(installed)) return;
    if (installed.resource === undefined)
      return refuseConstruction('pre-use original file resource absent');
    const capture = await this.dispatch(installed.resource, 'capture');
    try {
      await this.verifyFile(installed);
      await this.observe(capture, { bytes: installed.bytes, sha256: installed.sha256 });
      this.preusedFiles.add(installed);
    } catch (primary) {
      return await this.uncertainty(capture, primary);
    }
  }
  private async finalContinuity(): Promise<void> {
    await this.checkArchive();
    await this.verifyNativeCustody();
    for (const installed of this.files) {
      await this.captureBeforeUse(installed);
      await this.verifyFile(installed);
    }
    for (const scope of this.directories) {
      if (scope === this.scopes.get('solver-runtime')) await this.verifyRuntime();
      else await this.verifyMembership(scope);
    }
    for (const pin of this.policy.facility.images) {
      const rows = this.nativeArray(
        await this.runNative({ kind: 'image-inspect', role: pin.role }),
      );
      const image = rows.at(0);
      if (rows.length !== 1 || image === undefined)
        return refuseConstruction('final immutable image absent');
      const initial = readFields(this.images.get(pin.role));
      const immutable = (observation: Record<string, unknown>) =>
        Object.fromEntries(
          Object.entries(observation).filter(
            ([name]) => name !== 'RepoTags' && name !== 'Metadata',
          ),
        );
      requireEqual(immutable(image), immutable(initial), 'original immutable image continuity');
    }
    const tag = this.tag;
    if (tag?.resource === undefined)
      return refuseConstruction('original source tag resource absent');
    const tagCapture = await this.dispatch(tag.resource, 'capture');
    try {
      const rows = this.nativeArray(await this.runNative({ kind: 'tag-inspect' }));
      const image = rows.at(0);
      if (rows.length !== 1 || image?.['Id'] !== tag.imageId)
        return refuseConstruction('final source tag binding');
      await this.observe(tagCapture, { imageId: tag.imageId });
    } catch (primary) {
      return await this.uncertainty(tagCapture, primary);
    }
    if (this.unitResource === undefined)
      return refuseConstruction('original unit final resource absent');
    const unitCapture = await this.dispatch(this.unitResource, 'capture');
    try {
      await this.verifyUnitLink();
      const unit = await this.observeUnit();
      await this.retainUnitActive(unit.text);
      await this.observe(unitCapture, { unit: this.unitActive, process: this.unitProcess });
    } catch (primary) {
      return await this.uncertainty(unitCapture, primary);
    }
    const journal = await inspectSourceJournal(this.journal);
    if (
      journal.phase !== 'open' ||
      journal.resources.length > 178 ||
      journal.records.length > 2318 ||
      this.forwardHelpers > 129 ||
      this.pendingDispatches.size !== 0 ||
      this.hasUnsettledNativeChildren()
    )
      return refuseConstruction('final original construction settlement');
    this.check();
  }
  private async assertSolverRolePins(): Promise<void> {
    const member = inspectOriginalStaging(this.retention).members.find(
      (member) => member.path === 'solver/configuration',
    );
    if (
      member?.bytes === undefined ||
      member.sha256 !== this.projection.request.solver.configSha256 ||
      member.bytes > 65536
    )
      return refuseConstruction('original solver config pin absent');
    const bytes = await readOriginalStagedChunk(this.retention, member.path, 0, member.bytes);
    if (bytes.length !== member.bytes || digest(bytes) !== member.sha256)
      return refuseConstruction('original solver config bytes differ');
    const configuration = readFields(
      JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)),
    );
    const images = configuration['images'];
    if (!Array.isArray(images) || images.length !== 2)
      return refuseConstruction('original solver role config absent');
    for (const [index, role] of (['solver-prod', 'solver-dev'] as const).entries()) {
      const rule = readFields(images[index]);
      const image = this.policy.facility.images.find((image) => image.role === role);
      // Proof: role comparison omission admitted otherwise-valid swapped original references to raw custody (counter0→1); original policy join solver-role-swap RED, exact restore GREEN.
      if (image === undefined || rule['solverImage'] !== image.reference)
        return refuseConstruction('original solver role image differs');
    }
  }
  async construct(): Promise<SourceProfilePacket> {
    if (this.packet !== undefined || this.closing !== undefined)
      return refuseConstruction('construction is single use');
    await this.assertSolverRolePins();
    await this.admitCustody();
    await this.captureNativeCustody();
    await this.assertManagerAbsent();
    await this.inventoryNative();
    await this.installFixedFiles();
    for (const installed of this.files) {
      await this.captureBeforeUse(installed);
      if (
        installed.path === '/home/puni1/.local/lib/wbs-solver/bun' ||
        installed.path === '/home/puni1/.local/lib/wbs-solver/solver-supervisor.js'
      )
        await this.retainReadOnlyExecution(installed);
    }
    await this.constructUnit();
    await this.constructDocker();
    await this.collectAndResetSetup();
    await this.finalContinuity();
    await this.retireDatabases();
    const source = this.sourceOwnership;
    if (source === undefined) return refuseConstruction('original source ownership absent');
    const review = inspectSourceInputs(this.inputs).review;
    const configuration = decodeSourceRestorationConfiguration(
      this.projection.configuration.sourceFiles,
      this.projection.configuration.sourceEnvironment,
    );
    this.packet = decodeSourceProfilePacket({
      format: 'isolated-ci-source-profile',
      version: 1,
      source,
      workflowSha: review.workflowSha,
      inputManifestSha256: review.inputManifestSha256,
      recipientFingerprint: review.recipientFingerprint,
      pins: this.projection.request.source.pins,
      configuration,
      openapiSha256: this.projection.openapiSha256,
    });
    this.check();
    this.isConstructing = false;
    return this.packet;
  }
  /** Hashes C's actual stat tuples as JSON primitives while retaining its original native identities privately. */
  private digestSetupEpoch(epoch: SetupEpoch): string {
    const projection =
      epoch.phase === 'C'
        ? {
            ...epoch,
            residue: epoch.residue.map((member) => ({
              ...member,
              identity: fsIdentity(member.identity, member.kind),
            })),
          }
        : epoch;
    return digest(JSON.stringify(projection));
  }
  inspectEvidence() {
    return structuredClone({
      directories: this.directories.map((scope) => ({
        path: scope.path,
        identity: fsIdentity(scope.identity, 'directory'),
        removed: scope.removed,
      })),
      files: this.files.map((file) => ({
        path: file.path,
        identity: fsIdentity(file.identity, 'file'),
        bytes: file.bytes,
        expectedSha256: file.isDatabase === true ? undefined : file.sha256,
        databaseSha256: file.isDatabase === true ? file.sha256 : undefined,
        consumed: this.consumedBytes.get(file.path),
        readback: this.installedReadbacks.get(file.path),
        removed: file.removed,
      })),
      consumed: [...this.consumedBytes],
      readbacks: [...this.installedReadbacks],
      nativeChildren: this.children.length,
      nativeHistory: [...this.nativeSettlements.values()].map((original) => ({
        transport: original.transport,
        phase: original.cleanup ? 'cleanup' : 'forward',
        requestedArgvSha256: digest(JSON.stringify(original.requestedArgv)),
        lifecycle: original.phase,
        spawnPid: original.child.pid,
        liveSample:
          original.liveIdentity === undefined
            ? { state: 'not-observed' }
            : { state: 'observed', identity: original.liveIdentity },
        status:
          original.status === undefined
            ? undefined
            : { code: original.status.code, signal: original.status.signal },
        nativeErrorObserved: original.nativeError !== undefined,
      })),
      forwardHelperCharges: this.forwardHelpers,
      cleanupTransportCharges: this.cleanupTransports,
      networks: this.networks.map((network) => ({
        environment: network.environment,
        id: network.id,
        removed: network.removed,
      })),
      containers: this.containers.map((container) => ({
        role: container.role,
        id: container.id,
        created: container.created,
        removed: container.removed,
      })),
      setupEpochs: this.epochs.map((epoch) => ({
        phase: epoch.phase,
        sha256: this.digestSetupEpoch(epoch),
      })),
    });
  }
  check(): void {
    if (this.isConstructing) assertOriginalStaging(this.retention);
    const inspection = inspectSourceInputs(this.inputs);
    if (inspection.originalDeadline !== this.deadline || performance.now() >= this.deadline)
      refuseConstruction('original cutoff');
  }
  async checkArchive(): Promise<void> {
    this.check();
    await assertSourceArchivePreflight(this.inputs, this.journal, this.archive);
    this.check();
  }
  private async dispatchRequest(
    request: Parameters<typeof appendSourceIntent>[1],
  ): Promise<SourceDispatch> {
    const intent = await appendSourceIntent(this.journal, request);
    try {
      const dispatch = await dispatchSourceIntent(this.journal, intent);
      this.pendingDispatches.add(dispatch);
      return dispatch;
    } catch (primary) {
      try {
        await abandonSourceIntent(this.journal, intent);
      } catch (failure) {
        throw combineConstructionErrors(
          primary,
          failure,
          'source dispatch and unused-intent abandonment failed',
        );
      }
      throw primary;
    }
  }
  async dispatch(
    resource: RecordedResource,
    operation: 'write' | 'capture' | 'remove' | 'stop-join' | 'start',
  ) {
    return await this.dispatchRequest({ operation, resource });
  }
  async observe(dispatch: SourceDispatch, evidence: unknown): Promise<void> {
    const body = JSON.stringify(evidence);
    if (Buffer.byteLength(body) > 1024) refuseConstruction('control evidence bound');
    await recordSourceObservation(this.journal, dispatch, { observationSha256: digest(body) });
    this.pendingDispatches.delete(dispatch);
    this.settledDispatches.add(dispatch);
  }
  private async recordUncertainty(dispatch: SourceDispatch): Promise<void> {
    if (this.settledDispatches.has(dispatch)) return;
    try {
      await recordSourceUncertainty(this.journal, dispatch, 'readback-failed');
    } finally {
      this.pendingDispatches.delete(dispatch);
      this.settledDispatches.add(dispatch);
    }
  }
  private async recordCreation(
    dispatch: SourceDispatch,
    observation: Parameters<typeof recordSourceObservation>[2],
  ) {
    const resource = await recordSourceObservation(this.journal, dispatch, observation);
    this.pendingDispatches.delete(dispatch);
    this.settledDispatches.add(dispatch);
    return resource;
  }
  async uncertainty(dispatch: SourceDispatch, primary: unknown): Promise<never> {
    for (const pending of new Set([dispatch, ...this.pendingDispatches]))
      try {
        // Proof: omitting this publication left J open and admitted a later actual owned mkdir; actual constructor uncertainty RED (laterRefused/laterAbsent false), exact restoration GREEN.
        await this.recordUncertainty(pending);
      } catch (failure) {
        this.failures.push(failure);
      }
    throw primary;
  }
  private closeAcquired(file: FileHandle, identity: BigIntStats): Promise<void> {
    const pending = this.closingFiles.get(file);
    if (pending !== undefined) return pending;
    const acquired = this.acquiredFiles.find((acquired) => acquired.file === file);
    const closing = (async () => {
      if (file.fd !== acquired?.descriptor)
        return refuseConstruction('original acquired close reference refused');
      sameNode(fstatSync(file.fd, { bigint: true }), identity);
      await file.close();
    })();
    this.closingFiles.set(file, closing);
    return closing;
  }
  private openDirectory(path: string): {
    descriptor: number;
    identity: BigIntStats;
    closed: boolean;
    closeFailure?: unknown;
  } {
    const descriptor = openSync(
      path,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    const acquired: {
      descriptor: number;
      identity?: BigIntStats;
      closed: boolean;
      closeFailure?: unknown;
    } = { descriptor, closed: false };
    this.acquiredDirectories.push(acquired);
    try {
      const identity = fstatSync(descriptor, { bigint: true });
      acquired.identity = identity;
      return Object.assign(acquired, { identity });
    } catch (primary) {
      // This synchronous open/stat pair has not yielded or exposed its descriptor; close the original acquisition once.
      try {
        acquired.closed = true;
        closeSync(descriptor);
      } catch (closeFailure) {
        acquired.closeFailure = closeFailure;
        throw combineConstructionErrors(
          primary,
          closeFailure,
          'directory acquisition and close failed',
        );
      }
      throw primary;
    }
  }
  private closeDirectory(acquired: {
    descriptor: number;
    identity?: BigIntStats;
    closed: boolean;
    closeFailure?: unknown;
  }): void {
    if (acquired.closed) {
      if (acquired.closeFailure !== undefined)
        throw normalizeConstructionFailure(acquired.closeFailure);
      return;
    }
    if (!this.acquiredDirectories.includes(acquired) || acquired.identity === undefined)
      return refuseConstruction('original directory acquisition absent');
    sameNode(fstatSync(acquired.descriptor, { bigint: true }), acquired.identity);
    acquired.closed = true;
    try {
      closeSync(acquired.descriptor);
    } catch (cause) {
      acquired.closeFailure = cause;
      throw cause;
    }
  }
  async verifyDirectory(scope: DirectoryScope): Promise<void> {
    if (scope.acquisition.closed)
      return refuseConstruction('original directory descriptor already closed');
    sameNode(fstatSync(scope.descriptor, { bigint: true }), scope.identity);
    sameNode(await lstat(scope.path, { bigint: true }), scope.identity);
  }
  async requireAbsent(path: string): Promise<void> {
    try {
      await lstat(path);
      refuseConstruction('preexisting target');
    } catch (failure) {
      if (!(failure instanceof Error && 'code' in failure && failure.code === 'ENOENT'))
        throw failure;
    }
  }
  async admitCustody(): Promise<void> {
    this.check();
    const staging = inspectOriginalStaging(this.retention);
    const facility = this.policy.facility;
    requireEqual(
      [
        staging.parent,
        String(staging.parentIdentity.dev),
        String(staging.parentIdentity.ino),
        Number(staging.parentIdentity.uid),
        Number(staging.parentIdentity.gid),
        Number(staging.parentIdentity.mode & 0o7777n),
      ],
      [
        facility.coordinator.directory,
        facility.coordinator.device,
        facility.coordinator.inode,
        facility.coordinator.uid,
        facility.coordinator.gid,
        facility.coordinator.mode,
      ],
      'coordinator custody',
    );
    requireEqual(
      digest((await readFile('/etc/machine-id', 'utf8')).trim()),
      facility.machineIdSha256,
      'machine identity',
    );
    requireEqual(
      (await readFile('/proc/sys/kernel/random/boot_id', 'utf8')).trim(),
      facility.bootId,
      'boot identity',
    );
    for (const parent of [...facility.anchors, facility.enablement.parent]) {
      const identity = await lstat(parent.path, { bigint: true });
      if (!identity.isDirectory() || (await realpath(parent.path)) !== parent.path)
        return refuseConstruction('custody parent type');
      requireEqual(
        [
          String(identity.dev),
          String(identity.ino),
          Number(identity.uid),
          Number(identity.gid),
          Number(identity.mode & 0o7777n),
        ],
        [parent.device, parent.inode, parent.uid, parent.gid, parent.mode],
        'custody parent',
      );
    }
    for (const group of facility.groups) {
      const parent = facility.anchors.find((parent) => parent.id === group.anchor);
      if (parent === undefined) return refuseConstruction('custody anchor absent');
      await this.requireAbsent(parent.path + '/' + group.child);
    }
    await this.requireAbsent(facility.coordinator.directory + '/source-stageb-constructor');
    await this.requireAbsent('/home/puni1/.config/systemd/user/wbs-solver-supervisor.service');
    await this.requireAbsent(facility.enablement.parent.path + '/' + facility.enablement.leaf);
    const journal = await inspectSourceJournal(this.journal);
    if (journal.phase !== 'open' || journal.resources.length > 4 || journal.records.length > 32)
      return refuseConstruction('exclusive journal history');
    await this.checkArchive();
  }
  async acquireDirectory(
    path: string,
    mode: number,
    uid: number,
    gid: number,
  ): Promise<DirectoryScope> {
    await this.checkArchive();
    await this.requireAbsent(path);
    const dispatch = await this.dispatchRequest({
      operation: 'create',
      resourceClass: 'directory',
      purpose: 'runtime',
    });
    let scope: DirectoryScope | undefined;
    try {
      this.check();
      mkdirSync(path, { mode: 0o700, recursive: false });
      this.unpublishedDirectories.add(path);
      const acquisition = this.openDirectory(path);
      const { descriptor, identity } = acquisition;
      scope = { path, descriptor, identity, acquisition, members: [], removed: false };
      this.directories.push(scope);
      this.unpublishedDirectories.delete(path);
      sameNode(await lstat(path, { bigint: true }), identity);
      if (!identity.isDirectory()) refuseConstruction('created directory type');
      if (Number(identity.uid) !== uid || Number(identity.gid) !== gid)
        fchownSync(descriptor, uid, gid);
      fchmodSync(descriptor, mode);
      const changed = fstatSync(descriptor, { bigint: true });
      sameNode(changed, identity, false);
      scope.identity = changed;
      scope.acquisition.identity = changed;
      await this.verifyDirectory(scope);
      await new Promise<void>((resolve, reject) => {
        fsync(descriptor, (failure) => {
          if (failure === null) resolve();
          else reject(failure);
        });
      });
      const resource = await this.recordCreation(dispatch, {
        identity: fsIdentity(changed, 'directory'),
        observationSha256: digest('exclusive-directory'),
      });
      if (resource === undefined) return refuseConstruction('directory resource absent');
      scope.resource = resource;
      return scope;
    } catch (primary) {
      return await this.uncertainty(dispatch, primary);
    }
  }
  async acquireFile(
    path: string,
    bytes: number,
    sha256: string,
    mode: number,
    source: (offset: number, maximum: number) => Promise<Uint8Array>,
  ): Promise<InstalledFile> {
    await this.checkArchive();
    await this.requireAbsent(path);
    const owner = [...this.directories]
      .filter((scope) => !scope.removed && path.startsWith(scope.path + '/'))
      .sort((left, right) => right.path.length - left.path.length)
      .at(0);
    const unitParent = this.policy.facility.anchors.find((anchor) => anchor.id === 'user-units');
    if (
      owner === undefined &&
      (unitParent === undefined || path !== unitParent.path + '/wbs-solver-supervisor.service')
    )
      return refuseConstruction('file original parent scope absent');
    const uid = owner === undefined ? unitParent?.uid : Number(owner.identity.uid);
    const gid = owner === undefined ? unitParent?.gid : Number(owner.identity.gid);
    if (uid === undefined || gid === undefined)
      return refuseConstruction('file original owner absent');
    const dispatch = await this.dispatchRequest({
      operation: 'create',
      resourceClass: 'file',
      purpose: 'runtime',
    });
    let installed: InstalledFile | undefined;
    try {
      const file = await open(
        path,
        constants.O_RDWR |
          constants.O_CREAT |
          constants.O_EXCL |
          constants.O_NOFOLLOW |
          constants.O_NONBLOCK,
        0o600,
      );
      const acquired: { file: FileHandle; descriptor: number; identity?: BigIntStats } = {
        file,
        descriptor: file.fd,
      };
      this.acquiredFiles.push(acquired);
      const descriptor = file.fd;
      const identity = fstatSync(descriptor, { bigint: true });
      acquired.identity = identity;
      installed = { path, file, descriptor, identity, bytes, sha256, removed: false };
      this.files.push(installed);
      if (!identity.isFile() || identity.nlink !== 1n) refuseConstruction('created file type');
      sameNode(await lstat(path, { bigint: true }), identity);
      await file.sync();
      const resource = await this.recordCreation(dispatch, {
        identity: fsIdentity(identity, 'file'),
        observationSha256: digest('exclusive-file'),
      });
      if (resource === undefined) return refuseConstruction('file resource absent');
      installed.resource = resource;
    } catch (primary) {
      return await this.uncertainty(dispatch, primary);
    }
    const write = await this.dispatch(installed.resource, 'write');
    try {
      const consumed = createHash('sha256');
      for (let offset = 0; offset < bytes;) {
        this.check();
        await this.verifyFileIdentity(installed);
        const chunk = await source(offset, Math.min(65536, bytes - offset));
        if (chunk.length < 1 || chunk.length > Math.min(65536, bytes - offset))
          refuseConstruction('input chunk bounds');
        consumed.update(chunk);
        for (let written = 0; written < chunk.length;) {
          const accepted = await installed.file.write(
            chunk,
            written,
            chunk.length - written,
            offset + written,
          );
          if (accepted.bytesWritten < 1 || accepted.bytesWritten > chunk.length - written)
            refuseConstruction('file short write');
          written += accepted.bytesWritten;
          this.check();
        }
        offset += chunk.length;
      }
      const consumedSha256 = consumed.digest('hex');
      this.consumedBytes.set(path, { bytes, sha256: consumedSha256 });
      if (consumedSha256 !== sha256) refuseConstruction('installed consumed bytes differ');
      if (installed.identity.uid !== BigInt(uid) || installed.identity.gid !== BigInt(gid))
        await installed.file.chown(uid, gid);
      await installed.file.chmod(mode);
      const changed = await installed.file.stat({ bigint: true });
      sameNode(changed, installed.identity, false);
      if (
        changed.uid !== BigInt(uid) ||
        changed.gid !== BigInt(gid) ||
        Number(changed.mode & 0o7777n) !== mode
      )
        return refuseConstruction('installed file owner publication');
      installed.identity = changed;
      await installed.file.sync();
      await this.verifyFile(installed);
      await this.observe(write, { sha256, bytes, mode });
    } catch (primary) {
      return await this.uncertainty(write, primary);
    }
    const capture = await this.dispatch(installed.resource, 'capture');
    try {
      await this.verifyFile(installed);
      await this.observe(capture, { sha256, bytes });
    } catch (primary) {
      return await this.uncertainty(capture, primary);
    }
    return installed;
  }
  async verifyFileIdentity(installed: InstalledFile): Promise<void> {
    const database = this.databases.get(installed);
    if (database !== undefined && database.descriptor.phase !== 'retained')
      return refuseConstruction('retired database construction access');
    if (installed.file.fd !== installed.descriptor)
      return refuseConstruction('installed descriptor changed');
    const actual = await installed.file.stat({ bigint: true });
    sameNode(actual, installed.identity);
    sameNode(await lstat(installed.path, { bigint: true }), installed.identity);
    if (!actual.isFile() || actual.nlink !== 1n)
      return refuseConstruction('installed file identity');
  }
  async verifyFile(installed: InstalledFile): Promise<void> {
    await this.verifyFileIdentity(installed);
    const before = await installed.file.stat({ bigint: true });
    const hash = createHash('sha256');
    const buffer = Buffer.alloc(65536);
    let offset = 0;
    for (;;) {
      const read = await installed.file.read(
        buffer,
        0,
        Math.min(buffer.length, installed.bytes - offset + 1),
        offset,
      );
      if (read.bytesRead === 0) break;
      offset += read.bytesRead;
      if (offset > installed.bytes) refuseConstruction('installed readback grew');
      hash.update(buffer.subarray(0, read.bytesRead));
    }
    const readbackSha256 = hash.digest('hex');
    this.installedReadbacks.set(installed.path, { bytes: offset, sha256: readbackSha256 });
    if (offset !== installed.bytes || readbackSha256 !== installed.sha256)
      return refuseConstruction('installed independent readback differs');
    const after = await installed.file.stat({ bigint: true });
    sameNode(after, before);
    sameNode(await lstat(installed.path, { bigint: true }), before);
    if (after.mtimeNs !== before.mtimeNs || after.ctimeNs !== before.ctimeNs)
      return refuseConstruction('installed readback drift');
  }

  async populateDirectory(
    scope: DirectoryScope,
    entries: readonly {
      path: string;
      kind: 'directory' | 'file' | 'symlink';
      mode: number;
      bytes?: number;
      sha256?: string;
      staged?: string;
      body?: Uint8Array;
      target?: string;
    }[],
  ): Promise<void> {
    const resource = scope.resource;
    if (resource === undefined) return refuseConstruction('population original directory absent');
    const dispatch = await this.dispatch(resource, 'write');
    try {
      for (const entry of entries) {
        this.check();
        await this.verifyDirectory(scope);
        if (!relative.safeParse(entry.path).success)
          return refuseConstruction('population member path');
        const path = scope.path + '/' + entry.path;
        await this.requireAbsent(path);
        if (entry.kind === 'directory') {
          mkdirSync(path, { mode: 0o700, recursive: false });
          const acquisition = this.openDirectory(path);
          const { descriptor, identity } = acquisition;
          const native: NativeMember = { path: entry.path, kind: 'directory', identity };
          scope.members.push(native);
          let primary: unknown;
          try {
            sameNode(await lstat(path, { bigint: true }), identity);
            if (!identity.isDirectory()) return refuseConstruction('member directory type');
            if (identity.uid !== scope.identity.uid || identity.gid !== scope.identity.gid)
              fchownSync(descriptor, Number(scope.identity.uid), Number(scope.identity.gid));
            fchmodSync(descriptor, entry.mode);
            const changed = fstatSync(descriptor, { bigint: true });
            sameNode(changed, identity, false);
            if (
              changed.uid !== scope.identity.uid ||
              changed.gid !== scope.identity.gid ||
              Number(changed.mode & 0o7777n) !== entry.mode
            )
              return refuseConstruction('member directory owner publication');
            native.identity = changed;
            acquisition.identity = changed;
          } catch (cause) {
            primary = cause;
          }
          try {
            this.closeDirectory(acquisition);
          } catch (closeFailure) {
            if (primary !== undefined)
              throw combineConstructionErrors(
                primary,
                closeFailure,
                'directory population and close failed',
              );
            throw closeFailure;
          }
          if (primary !== undefined) throw normalizeConstructionFailure(primary);
        } else if (entry.kind === 'symlink') {
          if (entry.target === undefined) return refuseConstruction('member symlink target');
          await symlink(entry.target, path);
          const identity = await lstat(path, { bigint: true });
          const native: NativeMember = {
            path: entry.path,
            kind: 'symlink',
            identity,
            target: entry.target,
          };
          scope.members.push(native);
          if (!identity.isSymbolicLink() || (await readlink(path)) !== entry.target)
            return refuseConstruction('member symlink changed');
          if (identity.uid !== scope.identity.uid || identity.gid !== scope.identity.gid) {
            await lchown(path, Number(scope.identity.uid), Number(scope.identity.gid));
            const changed = await lstat(path, { bigint: true });
            sameNode(changed, identity, false);
            if (changed.uid !== scope.identity.uid || changed.gid !== scope.identity.gid)
              return refuseConstruction('member symlink owner publication');
            native.identity = changed;
          }
        } else {
          if (entry.bytes === undefined || entry.sha256 === undefined)
            return refuseConstruction('member file pin');
          const file = await open(
            path,
            constants.O_RDWR |
              constants.O_CREAT |
              constants.O_EXCL |
              constants.O_NOFOLLOW |
              constants.O_NONBLOCK,
            0o600,
          );
          const acquired: { file: FileHandle; descriptor: number; identity?: BigIntStats } = {
            file,
            descriptor: file.fd,
          };
          this.acquiredFiles.push(acquired);
          const identity = fstatSync(file.fd, { bigint: true });
          acquired.identity = identity;
          const native: NativeMember = {
            path: entry.path,
            kind: 'file',
            identity,
            bytes: entry.bytes,
            sha256: entry.sha256,
            complete: false,
          };
          scope.members.push(native);
          let changed = identity;
          let primary: unknown;
          try {
            if (!identity.isFile() || identity.nlink !== 1n)
              return refuseConstruction('member file acquisition');
            const consumed = createHash('sha256');
            for (let offset = 0; offset < entry.bytes;) {
              this.check();
              sameNode(await file.stat({ bigint: true }), changed);
              sameNode(await lstat(path, { bigint: true }), changed);
              const maximum = Math.min(65536, entry.bytes - offset);
              const chunk =
                entry.staged === undefined
                  ? entry.body?.subarray(offset, offset + maximum)
                  : await readOriginalStagedChunk(this.retention, entry.staged, offset, maximum);
              if (chunk === undefined || chunk.length < 1 || chunk.length > maximum)
                return refuseConstruction('member consumed bound');
              consumed.update(chunk);
              for (let written = 0; written < chunk.length;) {
                const accepted = await file.write(
                  chunk,
                  written,
                  chunk.length - written,
                  offset + written,
                );
                if (accepted.bytesWritten < 1 || accepted.bytesWritten > chunk.length - written)
                  return refuseConstruction('member short write');
                written += accepted.bytesWritten;
              }
              offset += chunk.length;
            }
            const consumedSha256 = consumed.digest('hex');
            this.consumedBytes.set(path, { bytes: entry.bytes, sha256: consumedSha256 });
            if (consumedSha256 !== entry.sha256)
              return refuseConstruction('member consumed bytes differ');
            if (identity.uid !== scope.identity.uid || identity.gid !== scope.identity.gid)
              await file.chown(Number(scope.identity.uid), Number(scope.identity.gid));
            await file.chmod(entry.mode);
            changed = await file.stat({ bigint: true });
            sameNode(changed, identity, false);
            if (
              changed.uid !== scope.identity.uid ||
              changed.gid !== scope.identity.gid ||
              Number(changed.mode & 0o7777n) !== entry.mode
            )
              return refuseConstruction('member file owner publication');
            acquired.identity = changed;
            native.identity = changed;
            await file.sync();
            const installed: InstalledFile = {
              path,
              file,
              descriptor: file.fd,
              identity: changed,
              bytes: entry.bytes,
              sha256: entry.sha256,
              removed: false,
            };
            await this.verifyFile(installed);
            native.complete = true;
          } catch (cause) {
            primary = cause;
          }
          try {
            if (file.fd !== acquired.descriptor)
              return refuseConstruction('member close descriptor changed');
            sameNode(fstatSync(file.fd, { bigint: true }), changed);
            await this.closeAcquired(file, changed);
          } catch (closeFailure) {
            if (primary !== undefined)
              throw combineConstructionErrors(
                primary,
                closeFailure,
                'member population and close failed',
              );
            throw closeFailure;
          }
          if (primary !== undefined) throw normalizeConstructionFailure(primary);
        }
      }
      await new Promise<void>((resolve, reject) => {
        fsync(scope.descriptor, (failure) => {
          if (failure === null) resolve();
          else reject(failure);
        });
      });
      await this.verifyDirectory(scope);
      await this.observe(dispatch, {
        members: scope.members.length,
        inventorySha256: digest(
          JSON.stringify(
            scope.members.map((member) => [
              member.path,
              member.kind,
              member.bytes,
              member.sha256,
              member.target,
            ]),
          ),
        ),
      });
    } catch (primary) {
      return await this.uncertainty(dispatch, primary);
    }
    const capture = await this.dispatch(resource, 'capture');
    try {
      await this.verifyMembership(scope);
      await this.observe(capture, { members: scope.members.length });
    } catch (primary) {
      return await this.uncertainty(capture, primary);
    }
  }
  async verifyMembership(
    scope: DirectoryScope,
    requireComplete = true,
    allowedOutputs: readonly string[] = [],
  ): Promise<void> {
    await this.verifyDirectory(scope);
    const expected = new Map(scope.members.map((member) => [member.path, member]));
    const actual = new Set<string>();
    const separate = [
      ...this.files
        .filter((file) => !file.removed)
        .flatMap((file) => [file.path, ...(file.sidecars ?? []).map((sidecar) => sidecar.path)]),
      ...this.directories
        .filter((directory) => directory !== scope && !directory.removed)
        .map((directory) => directory.path),
    ];
    const walk = async (relativePath: string): Promise<void> => {
      for (const name of await readdir(
        scope.path + (relativePath === '' ? '' : '/' + relativePath),
      )) {
        const path = relativePath === '' ? name : relativePath + '/' + name;
        if (allowedOutputs.some((output) => path === output || path.startsWith(output + '/')))
          continue;
        if (separate.includes(scope.path + '/' + path)) continue;
        // Proof: unknown-member omission admitted unexpected tree output to the actual raw collector; unknown-output consumer RED with foreign sentinel intact, exact restoration GREEN.
        const member = expected.get(path);
        if (member === undefined) return refuseConstruction('unknown directory member');
        const location = scope.path + '/' + path;
        const identity = await lstat(location, { bigint: true });
        sameNode(identity, member.identity);
        actual.add(path);
        if (member.kind === 'directory') {
          if (!identity.isDirectory()) return refuseConstruction('member type differs');
          await walk(path);
        } else if (member.kind === 'symlink') {
          if (!identity.isSymbolicLink() || (await readlink(location)) !== member.target)
            return refuseConstruction('member target differs');
        } else {
          if (member.bytes === undefined || member.sha256 === undefined)
            return refuseConstruction('member readback pin absent');
          const file = await open(
            location,
            constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
          );
          const acquired: { file: FileHandle; descriptor: number; identity?: BigIntStats } = {
            file,
            descriptor: file.fd,
          };
          this.acquiredFiles.push(acquired);
          acquired.identity = fstatSync(file.fd, { bigint: true });
          let primary: unknown;
          try {
            sameNode(acquired.identity, member.identity);
            if (member.complete === true)
              await this.verifyFile({
                path: location,
                file,
                descriptor: file.fd,
                identity: member.identity,
                bytes: member.bytes,
                sha256: member.sha256,
                removed: false,
              });
            else if (
              requireComplete ||
              !acquired.identity.isFile() ||
              acquired.identity.nlink !== 1n ||
              acquired.identity.size > BigInt(member.bytes)
            )
              return refuseConstruction('partial member scope refused');
          } catch (cause) {
            primary = cause;
          }
          try {
            if (file.fd !== acquired.descriptor)
              return refuseConstruction('member reader close changed');
            sameNode(fstatSync(file.fd, { bigint: true }), member.identity);
            await this.closeAcquired(file, member.identity);
          } catch (closeFailure) {
            if (primary !== undefined)
              throw combineConstructionErrors(
                primary,
                closeFailure,
                'member read and close failed',
              );
            throw closeFailure;
          }
          if (primary !== undefined) throw normalizeConstructionFailure(primary);
        }
      }
    };
    await walk('');
    if (actual.size !== expected.size) return refuseConstruction('missing directory member');
  }
  async observeChild(
    child: NativeChild,
    expected?: Pick<InstalledFile, 'identity' | 'bytes' | 'sha256'>,
  ) {
    const pid = child.pid;
    if (pid === undefined || !isNativeChildLive(child))
      return refuseConstruction('helper not live');
    const read = async () => {
      const status = await readFile('/proc/' + String(pid) + '/status', 'utf8');
      const stat = await readFile('/proc/' + String(pid) + '/stat', 'utf8');
      const end = stat.lastIndexOf(') ');
      const start = stat
        .slice(end + 2)
        .split(' ')
        .at(19);
      const uid = /^Uid:\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$/m.exec(status);
      const gid = /^Gid:\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$/m.exec(status);
      if (
        end < 1 ||
        start === undefined ||
        !/^[1-9][0-9]*$/.test(start) ||
        uid === null ||
        gid === null ||
        uid.slice(1).some((value) => Number(value) !== process.geteuid?.()) ||
        gid.slice(1).some((value) => Number(value) !== process.getegid?.())
      )
        return refuseConstruction('helper identity');
      return { start, uid: Number(uid[1]), gid: Number(gid[1]) };
    };
    const before = await read();
    const file = await open('/proc/' + String(pid) + '/exe', constants.O_RDONLY);
    const acquired: { file: FileHandle; descriptor: number; identity?: BigIntStats } = {
      file,
      descriptor: file.fd,
    };
    this.acquiredFiles.push(acquired);
    acquired.identity = fstatSync(file.fd, { bigint: true });
    let hash: string | undefined;
    let primary: unknown;
    try {
      if (
        !acquired.identity.isFile() ||
        acquired.identity.size < 1n ||
        acquired.identity.size > 134217728n
      )
        return refuseConstruction('helper executable bound');
      if (expected !== undefined) sameNode(acquired.identity, expected.identity);
      const sha256 = createHash('sha256');
      const buffer = Buffer.alloc(65536);
      let bytes = 0;
      for (;;) {
        const read = await file.read(buffer, 0, buffer.length, bytes);
        if (read.bytesRead === 0) break;
        bytes += read.bytesRead;
        if (bytes > 134217728) return refuseConstruction('helper executable grew');
        sha256.update(buffer.subarray(0, read.bytesRead));
      }
      hash = sha256.digest('hex');
      sameNode(await file.stat({ bigint: true }), acquired.identity);
      requireEqual(await read(), before, 'helper live bracket');
      if (expected !== undefined && (bytes !== expected.bytes || hash !== expected.sha256))
        return refuseConstruction('helper executable differs');
      if (!isNativeChildLive(child))
        return refuseConstruction('helper exited during live observation');
    } catch (cause) {
      primary = cause;
    }
    try {
      if (file.fd !== acquired.descriptor)
        return refuseConstruction('helper executable close unproved');
      sameNode(fstatSync(file.fd, { bigint: true }), acquired.identity);
      await this.closeAcquired(file, acquired.identity);
    } catch (closeFailure) {
      if (primary !== undefined)
        throw combineConstructionErrors(
          primary,
          closeFailure,
          'helper observation and close failed',
        );
      throw closeFailure;
    }
    if (primary !== undefined) throw normalizeConstructionFailure(primary);
    if (hash === undefined) return refuseConstruction('helper executable observation absent');
    return { kind: 'helper' as const, pid, ...before, executableSha256: hash };
  }
  private assertNativeDeadline(): void {
    if (performance.now() >= this.deadline)
      return refuseConstruction('native observation original cutoff');
  }
  private assertNativeMetadata(
    actual: BigIntStats,
    expected: {
      device: string;
      inode: string;
      uid: number;
      gid: number;
      mode: number;
      mtimeNs?: string;
      ctimeNs?: string;
    },
    kind: 'file' | 'directory' | 'socket' | 'symlink',
  ): void {
    const typed =
      kind === 'file'
        ? actual.isFile()
        : kind === 'directory'
          ? actual.isDirectory()
          : kind === 'socket'
            ? actual.isSocket()
            : actual.isSymbolicLink();
    if (!typed) return refuseConstruction('authenticated native object type');
    requireEqual(
      [
        String(actual.dev),
        String(actual.ino),
        Number(actual.uid),
        Number(actual.gid),
        Number(actual.mode & 0o7777n),
      ],
      [expected.device, expected.inode, expected.uid, expected.gid, expected.mode],
      'authenticated native object identity',
    );
    if (expected.mtimeNs !== undefined && String(actual.mtimeNs) !== expected.mtimeNs)
      return refuseConstruction('authenticated native mtime');
    if (expected.ctimeNs !== undefined && String(actual.ctimeNs) !== expected.ctimeNs)
      return refuseConstruction('authenticated native ctime');
  }
  private async openNativeObservation(
    path: string,
    magic = false,
    directory = false,
  ): Promise<{ file: FileHandle; descriptor: number; identity?: BigIntStats }> {
    this.assertNativeDeadline();
    if (this.nativeObservationFds !== 0)
      return refuseConstruction('prior native observation unsettled');
    const file = await open(
      path,
      constants.O_RDONLY |
        constants.O_NONBLOCK |
        (magic ? 0 : constants.O_NOFOLLOW) |
        (directory ? constants.O_DIRECTORY : 0),
    );
    this.nativeObservationFds++;
    const acquired: { file: FileHandle; descriptor: number; identity?: BigIntStats } = {
      file,
      descriptor: file.fd,
    };
    this.acquiredFiles.push(acquired);
    return acquired;
  }
  private async closeNativeObservation(
    acquired: { file: FileHandle; descriptor: number; identity?: BigIntStats },
    fallback?: BigIntStats,
  ): Promise<void> {
    const identity = acquired.identity ?? fallback;
    if (identity === undefined)
      return refuseConstruction('native observation close identity absent');
    await this.closeAcquired(acquired.file, identity);
    if (acquired.file.fd !== -1)
      return refuseConstruction('native observation close not established');
    this.nativeObservationFds--;
  }
  private async readNativeText(path: string, maximum: number): Promise<string> {
    const named = await lstat(path, { bigint: true });
    if (!named.isFile()) return refuseConstruction('native observation is not regular');
    const acquired = await this.openNativeObservation(path);
    let primary: unknown;
    let bytes: Buffer | undefined;
    try {
      const before = fstatSync(acquired.descriptor, { bigint: true });
      acquired.identity = before;
      sameNode(before, named);
      const chunks: Buffer[] = [];
      const buffer = Buffer.alloc(Math.min(65536, maximum + 1));
      let length = 0;
      for (;;) {
        this.assertNativeDeadline();
        const read = await acquired.file.read(
          buffer,
          0,
          Math.min(buffer.length, maximum - length + 1),
          length,
        );
        if (read.bytesRead === 0) break;
        length += read.bytesRead;
        if (length > maximum) return refuseConstruction('native observation byte bound');
        chunks.push(Buffer.from(buffer.subarray(0, read.bytesRead)));
      }
      const after = await acquired.file.stat({ bigint: true });
      sameNode(after, before);
      sameNode(await lstat(path, { bigint: true }), before);
      if (before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs)
        return refuseConstruction('native observation changed during read');
      bytes = Buffer.concat(chunks);
    } catch (cause) {
      primary = cause;
    }
    try {
      await this.closeNativeObservation(acquired, named);
    } catch (secondary) {
      if (primary !== undefined)
        throw combineConstructionErrors(primary, secondary, 'native observation and close failed');
      throw secondary;
    }
    if (primary !== undefined) throw normalizeConstructionFailure(primary);
    if (bytes === undefined) return refuseConstruction('native observation bytes absent');
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  }
  private async readNativeCode(expected: NativeCode, magicPath?: string): Promise<BigIntStats> {
    const named = await lstat(expected.path, { bigint: true });
    this.assertNativeMetadata(named, expected, 'file');
    if (named.size !== BigInt(expected.bytes))
      return refuseConstruction('authenticated native code length');
    if (magicPath !== undefined && (await readlink(magicPath)) !== expected.path)
      return refuseConstruction('authenticated manager executable path');
    const acquired = await this.openNativeObservation(
      magicPath ?? expected.path,
      magicPath !== undefined,
    );
    let primary: unknown;
    let observed: BigIntStats | undefined;
    try {
      const before = fstatSync(acquired.descriptor, { bigint: true });
      acquired.identity = before;
      this.assertNativeMetadata(before, expected, 'file');
      sameNode(before, named);
      if (before.size !== BigInt(expected.bytes))
        return refuseConstruction('authenticated opened code length');
      const hash = createHash('sha256');
      const buffer = Buffer.alloc(65536);
      let length = 0;
      for (;;) {
        this.assertNativeDeadline();
        const maximum = Math.min(buffer.length, expected.bytes - length + 1);
        const read = await acquired.file.read(buffer, 0, maximum, length);
        if (read.bytesRead === 0) break;
        length += read.bytesRead;
        if (length > expected.bytes) return refuseConstruction('authenticated native code grew');
        hash.update(buffer.subarray(0, read.bytesRead));
      }
      if (length !== expected.bytes || hash.digest('hex') !== expected.sha256)
        return refuseConstruction('authenticated native code hash');
      const after = await acquired.file.stat({ bigint: true });
      this.assertNativeMetadata(after, expected, 'file');
      if (after.size !== BigInt(expected.bytes))
        return refuseConstruction('authenticated native code final length');
      this.assertNativeMetadata(await lstat(expected.path, { bigint: true }), expected, 'file');
      if (magicPath !== undefined && (await readlink(magicPath)) !== expected.path)
        return refuseConstruction('authenticated manager executable path changed');
      observed = before;
    } catch (cause) {
      primary = cause;
    }
    try {
      await this.closeNativeObservation(acquired, named);
    } catch (secondary) {
      if (primary !== undefined)
        throw combineConstructionErrors(primary, secondary, 'native code read and close failed');
      throw secondary;
    }
    if (primary !== undefined) throw normalizeConstructionFailure(primary);
    if (observed === undefined)
      return refuseConstruction('authenticated native code observation absent');
    return observed;
  }
  private async verifyNativeResolver(): Promise<void> {
    const native = this.policy.facility.nativeCustody;
    for (const path of native.loaderClosure.absentPaths) await this.requireAbsent(path);
    for (const parent of native.parents) {
      this.assertNativeDeadline();
      this.assertNativeMetadata(await lstat(parent.path, { bigint: true }), parent, 'directory');
      if ((await realpath(parent.path)) !== parent.path)
        return refuseConstruction('native canonical parent resolution');
    }
    for (const link of native.loaderClosure.links) {
      this.assertNativeDeadline();
      this.assertNativeMetadata(await lstat(link.path, { bigint: true }), link, 'symlink');
      if (
        (await readlink(link.path)) !== link.target ||
        (await realpath(link.path)) !== link.resolvedPath
      )
        return refuseConstruction('authenticated native alias resolution');
      const directory = native.parents.find((parent) => parent.path === link.resolvedPath);
      if (directory !== undefined)
        this.assertNativeMetadata(
          await lstat(link.resolvedPath, { bigint: true }),
          directory,
          'directory',
        );
      else {
        const file = [...native.programs, ...native.loaderClosure.files].find(
          (file) => file.path === link.resolvedPath,
        );
        if (file === undefined) return refuseConstruction('native alias file target absent');
        this.assertNativeMetadata(await lstat(file.path, { bigint: true }), file, 'file');
      }
    }
    for (const file of [...native.programs, ...native.loaderClosure.files])
      if ((await realpath(file.path)) !== file.path)
        return refuseConstruction('unlisted native code resolver link');
    for (const endpoint of native.endpoints) {
      this.assertNativeMetadata(await lstat(endpoint.path, { bigint: true }), endpoint, 'socket');
      if ((await realpath(endpoint.path)) !== endpoint.path)
        return refuseConstruction('unlisted native endpoint resolver link');
    }
  }
  private async observeAuthenticatedManager(): Promise<void> {
    const native = this.policy.facility.nativeCustody;
    const manager = native.manager;
    const root = '/proc/' + String(manager.pid);
    const program = native.programs[4];
    const read = async () => {
      const stat = await this.readNativeText(root + '/stat', 65536);
      const end = stat.lastIndexOf(') ');
      const columns = stat.slice(end + 2).split(' ');
      const start = columns.at(19);
      const state = columns.at(0);
      if (
        end < 1 ||
        stat.slice(0, stat.indexOf(' ')) !== String(manager.pid) ||
        start !== manager.startTicks ||
        state === undefined ||
        ['Z', 'X', 'x'].includes(state)
      )
        return refuseConstruction('authenticated manager pid/start/liveness');
      const status = await this.readNativeText(root + '/status', 1048576);
      const values = (name: string) => {
        const line = new RegExp('^' + name + ':[^\\S\\n]*([^\\n]*)$', 'm').exec(status)?.[1];
        if (line === undefined) return refuseConstruction('authenticated manager status field');
        return line.trim() === ''
          ? []
          : line
              .trim()
              .split(/\s+/)
              .map((value) => {
                if (!/^(0|[1-9][0-9]*)$/.test(value))
                  return refuseConstruction('authenticated manager status integer');
                return Number(value);
              });
      };
      requireEqual(values('Uid'), [1000, 1000, 1000, 1000], 'authenticated manager uid');
      requireEqual(values('Gid'), [1000, 1000, 1000, 1000], 'authenticated manager gid');
      requireEqual(
        values('Groups').sort((left, right) => left - right),
        [...manager.supplementaryGroups].sort((left, right) => left - right),
        'authenticated manager supplementary groups',
      );
      const cgroup = await this.readNativeText(root + '/cgroup', 65536);
      if (cgroup !== '0::' + manager.cgroup.path + '\n')
        return refuseConstruction('authenticated manager cgroup');
      return { start, state };
    };
    const before = await read();
    await this.readNativeCode(program, root + '/exe');
    const after = await read();
    requireEqual(after.start, before.start, 'authenticated manager original bracket');
    const group = native.parents.find(
      (parent) => parent.path === '/sys/fs/cgroup' + manager.cgroup.path,
    );
    if (group === undefined) return refuseConstruction('authenticated manager cgroup scope absent');
    this.assertNativeMetadata(await lstat(group.path, { bigint: true }), group, 'directory');
  }
  private async observeNativeCustody(): Promise<
    Map<string, { identity: BigIntStats; sha256?: string }>
  > {
    this.assertNativeDeadline();
    const native = this.policy.facility.nativeCustody;
    requireEqual(
      digest((await this.readNativeText('/etc/machine-id', 4096)).trim()),
      this.policy.facility.machineIdSha256,
      'native original machine',
    );
    requireEqual(
      (await this.readNativeText('/proc/sys/kernel/random/boot_id', 4096)).trim(),
      this.policy.facility.bootId,
      'native original boot',
    );
    await this.verifyNativeResolver();
    const observed = new Map<string, { identity: BigIntStats; sha256?: string }>();
    for (const expected of [...native.programs, ...native.loaderClosure.files])
      observed.set(expected.path, {
        identity: await this.readNativeCode(expected),
        sha256: expected.sha256,
      });
    await this.observeAuthenticatedManager();
    await this.verifyNativeResolver();
    for (const endpoint of native.endpoints) {
      const identity = await lstat(endpoint.path, { bigint: true });
      this.assertNativeMetadata(identity, endpoint, 'socket');
      observed.set(endpoint.path, { identity });
    }
    return observed;
  }
  private async captureNativeCustody(): Promise<void> {
    if (this.nativeCustody.size !== 0) return refuseConstruction('native custody already admitted');
    const observed = await this.observeNativeCustody();
    for (const [path, identity] of observed) this.nativeCustody.set(path, identity);
  }
  private async verifyNativeCustody(): Promise<void> {
    const native = this.policy.facility.nativeCustody;
    const expected = [...native.programs, ...native.loaderClosure.files, ...native.endpoints];
    if (this.nativeCustody.size !== expected.length)
      return refuseConstruction('native custody was not admitted');
    await this.requireAbsent(this.policy.facility.coordinator.directory + '/config.json');
    const observed = await this.observeNativeCustody();
    for (const [path, original] of this.nativeCustody) {
      const current = observed.get(path);
      if (current === undefined) return refuseConstruction('original native observation missing');
      sameNode(current.identity, original.identity);
      requireEqual(current.sha256, original.sha256, 'original native code commitment');
    }
    for (const parent of [
      ...this.policy.facility.anchors,
      this.policy.facility.enablement.parent,
    ]) {
      const identity = await lstat(parent.path, { bigint: true });
      requireEqual(
        [
          String(identity.dev),
          String(identity.ino),
          Number(identity.uid),
          Number(identity.gid),
          Number(identity.mode & 0o7777n),
        ],
        [parent.device, parent.inode, parent.uid, parent.gid, parent.mode],
        'continuous native parent custody',
      );
    }
  }
  private async observeManagerChild(
    child: NativeChild,
    program: string | undefined,
    settling = false,
  ) {
    if (program !== '/usr/bin/systemctl' && program !== '/usr/bin/busctl')
      return refuseConstruction('manager final executable is not closed');
    const pid = child.pid;
    if (pid === undefined) return refuseConstruction('manager spawn identity absent');
    let originalStart: string | undefined;
    const sample = async () => {
      if (!isNativeChildLive(child))
        return refuseConstruction('manager child exited before acknowledgement');
      const status = await readFile('/proc/' + String(pid) + '/status', 'utf8');
      const stat = await readFile('/proc/' + String(pid) + '/stat', 'utf8');
      const end = stat.lastIndexOf(') ');
      const start = stat
        .slice(end + 2)
        .split(' ')
        .at(19);
      if (end < 1 || start === undefined || !/^[1-9][0-9]*$/.test(start))
        return refuseConstruction('manager kernel start absent');
      if (originalStart === undefined) originalStart = start;
      else if (start !== originalStart) return refuseConstruction('manager spawn identity changed');
      return { status, start, executable: await readlink('/proc/' + String(pid) + '/exe') };
    };
    let final: Awaited<ReturnType<typeof sample>> | undefined;
    for (let attempt = 0; attempt < 64; attempt++) {
      if (!settling) this.check();
      const current = await sample();
      if (current.executable === program) {
        final = current;
        break;
      }
    }
    if (final === undefined)
      return refuseConstruction('manager credential transition did not converge');
    const validate = (status: string) => {
      for (const field of ['Uid', 'Gid'])
        if (
          new RegExp('^' + field + ':\\s+1000\\s+1000\\s+1000\\s+1000$', 'm').exec(status) === null
        )
          return refuseConstruction('manager final credentials differ');
      if (!/^Groups:\s*$/m.test(status) || !/^NoNewPrivs:\s+1$/m.test(status))
        return refuseConstruction('manager supplementary authority differs');
      for (const field of ['CapInh', 'CapPrm', 'CapEff', 'CapBnd', 'CapAmb'])
        if (new RegExp('^' + field + ':\\s+0+$', 'm').exec(status) === null)
          return refuseConstruction('manager capabilities differ');
    };
    validate(final.status);
    if (
      (
        await readFile('/proc/' + String(pid) + '/task/' + String(pid) + '/children', 'utf8')
      ).trim() !== ''
    )
      return refuseConstruction('manager transport spawned a descendant');
    const pin = this.nativeCustody.get(program);
    if (pin?.sha256 === undefined)
      return refuseConstruction('manager original executable pin absent');
    const file = await open('/proc/' + String(pid) + '/exe', constants.O_RDONLY);
    const acquired: { file: FileHandle; descriptor: number; identity?: BigIntStats } = {
      file,
      descriptor: file.fd,
    };
    this.acquiredFiles.push(acquired);
    let primary: unknown;
    try {
      acquired.identity = fstatSync(file.fd, { bigint: true });
      sameNode(acquired.identity, pin.identity);
      const hash = createHash('sha256');
      const buffer = Buffer.alloc(65536);
      let offset = 0;
      for (;;) {
        const read = await file.read(buffer, 0, buffer.length, offset);
        if (read.bytesRead === 0) break;
        offset += read.bytesRead;
        if (offset > 134217728) return refuseConstruction('manager executable bound');
        hash.update(buffer.subarray(0, read.bytesRead));
      }
      if (hash.digest('hex') !== pin.sha256 || BigInt(offset) !== pin.identity.size)
        return refuseConstruction('manager executable changed');
      sameNode(await file.stat({ bigint: true }), pin.identity);
      const after = await sample();
      validate(after.status);
      requireEqual(
        [after.start, after.executable],
        [final.start, program],
        'manager final live bracket',
      );
    } catch (cause) {
      primary = cause;
    }
    try {
      await this.closeAcquired(file, pin.identity);
    } catch (closeFailure) {
      if (primary !== undefined)
        throw combineConstructionErrors(
          primary,
          closeFailure,
          'manager observation and close failed',
        );
      throw closeFailure;
    }
    if (primary !== undefined) throw normalizeConstructionFailure(primary);
    if (!isNativeChildLive(child))
      return refuseConstruction('manager child exited during final observation');
    return {
      kind: 'helper' as const,
      pid,
      start: final.start,
      uid: 1000,
      gid: 1000,
      executableSha256: pin.sha256,
    };
  }
  private containerName(role: ContainerRole): string {
    return role === 'backend'
      ? 'be-01-' + this.projection.request.prod.backend.color
      : role === 'gateway'
        ? 'gw-01-' + this.projection.request.prod.gateway.color
        : role === 'source'
          ? sourceDevContract(envLayout('dev')).name
          : EDGE_CONTAINER;
  }
  private invocation(action: NativeAction): readonly string[] {
    const contract = sourceDevContract(envLayout('dev'));
    switch (action.kind) {
      case 'manager-command':
        return [
          '/usr/bin/systemctl',
          '--user',
          '--no-pager',
          '--no-ask-password',
          action.operation,
          ...(action.operation === 'daemon-reload' ? [] : [managerService]),
        ];
      case 'manager-show':
        return [
          '/usr/bin/systemctl',
          '--user',
          '--no-pager',
          '--no-ask-password',
          'show',
          managerService,
          ...[...SOLVER_UNIT_PROPERTIES, ...managerExtras].map(
            (property) => '--property=' + property,
          ),
        ];
      case 'manager-absence':
        return [
          '/usr/bin/busctl',
          '--user',
          '--no-pager',
          '--allow-interactive-authorization=no',
          '--auto-start=no',
          '--json=short',
          'call',
          'org.freedesktop.systemd1',
          '/org/freedesktop/systemd1',
          'org.freedesktop.systemd1.Manager',
          'ListUnitsByPatterns',
          'asas',
          '0',
          '1',
          managerService,
        ];
      case 'manager-load':
        return [
          '/usr/bin/busctl',
          '--user',
          '--no-pager',
          '--allow-interactive-authorization=no',
          '--auto-start=no',
          '--json=short',
          'call',
          'org.freedesktop.systemd1',
          '/org/freedesktop/systemd1',
          'org.freedesktop.systemd1.Manager',
          'LoadUnit',
          's',
          managerService,
        ];
      case 'manager-hook':
        return [
          '/usr/bin/busctl',
          '--user',
          '--no-pager',
          '--allow-interactive-authorization=no',
          '--auto-start=no',
          '--json=short',
          'get-property',
          'org.freedesktop.systemd1',
          '/org/freedesktop/systemd1/unit/wbs_2dsolver_2dsupervisor_2eservice',
          'org.freedesktop.systemd1.Service',
          action.hook,
        ];
      case 'container-absence':
        return ['container', 'ls', '--all', '--no-trunc', '--format', '{{json .}}'];
      case 'network-absence':
        return ['network', 'ls', '--no-trunc', '--format', '{{json .}}'];
      case 'container-list':
        return ['container', 'ls', '--all', '--no-trunc', '--format', '{{json .ID}}'];
      case 'network-list':
        return ['network', 'ls', '--no-trunc', '--format', '{{json .ID}}'];
      case 'entry-container-inspect':
        if (
          action.ids.length < 1 ||
          action.ids.length > 256 ||
          action.ids.some((id) => !/^[a-f0-9]{64}$/.test(id))
        )
          return refuseConstruction('entry container identity bound');
        return ['container', 'inspect', ...action.ids];
      case 'entry-network-inspect':
        if (
          action.ids.length < 1 ||
          action.ids.length > 256 ||
          action.ids.some((id) => !/^[a-f0-9]{64}$/.test(id))
        )
          return refuseConstruction('entry network identity bound');
        return ['network', 'inspect', ...action.ids];
      case 'image-inspect': {
        const image = this.policy.facility.images.find((image) => image.role === action.role);
        if (image === undefined) return refuseConstruction('fixed image role absent');
        return ['image', 'inspect', image.reference];
      }
      case 'network-create':
        return ['network', 'create', '--driver', 'bridge', envLayout(action.environment).network];
      case 'network-inspect':
      case 'network-remove':
        if (!this.networks.includes(action.original) || action.original.removed)
          return refuseConstruction('network original refused');
        return [
          'network',
          action.kind === 'network-inspect' ? 'inspect' : 'rm',
          action.original.id,
        ];
      case 'tag-create':
        return ['image', 'tag', this.projection.request.source.runtimeReference, contract.image];
      case 'tag-absence':
      case 'tag-inspect':
        return ['image', 'inspect', contract.image];
      case 'tag-remove':
        if (this.tag === undefined || this.tag.removed)
          return refuseConstruction('tag original refused');
        return ['image', 'rm', contract.image];
      case 'container-inspect':
      case 'container-start':
      case 'container-stop':
      case 'container-remove':
      case 'source-policy': {
        if (!this.containers.includes(action.original) || action.original.removed)
          return refuseConstruction('container original refused');
        if (action.kind === 'source-policy') {
          if (action.original.role !== 'source') return refuseConstruction('source policy role');
          return ['container', 'update', '--restart=no', action.original.id];
        }
        return [
          'container',
          action.kind === 'container-inspect'
            ? 'inspect'
            : action.kind === 'container-start'
              ? 'start'
              : action.kind === 'container-stop'
                ? 'stop'
                : 'rm',
          ...(action.kind === 'container-stop' ? ['--time', '10'] : []),
          action.original.id,
        ];
      }
      case 'container-create': {
        const role = action.role;
        const common = [
          'container',
          'create',
          '--name',
          this.containerName(role),
          '--restart=unless-stopped',
        ];
        if (role === 'source')
          return [
            ...common,
            '--network',
            envLayout('dev').network,
            '--workdir',
            '/src',
            '--user',
            '1000:1000',
            '--label',
            'com.docker.compose.service=' + contract.service,
            '--label',
            'com.docker.compose.project=' + contract.project,
            ...contract.mounts.flatMap((mount) => [
              '--mount',
              'type=bind,src=' +
                mount.source +
                ',dst=' +
                mount.target +
                (mount.writable ? '' : ',readonly'),
            ]),
            ...this.projection.configuration.sourceEnvironment.flatMap((assignment) => [
              '--env',
              assignment,
            ]),
            contract.image,
            'bun',
            'run',
            'dev',
          ];
        if (role === 'caddy') {
          const image = this.policy.facility.images.find((image) => image.role === 'caddy');
          if (image === undefined) return refuseConstruction('caddy image absent');
          return [
            ...common,
            '--network',
            envLayout('prod').network,
            '--network',
            envLayout('dev').network,
            '--mount',
            'type=bind,src=' + envLayout('prod').root + '/caddy,dst=/etc/caddy,readonly',
            image.reference,
          ];
        }
        const selected =
          role === 'backend'
            ? this.projection.request.prod.backend
            : this.projection.request.prod.gateway;
        return [
          ...common,
          '--network',
          envLayout('prod').network,
          ...(role === 'backend'
            ? [
                '--network-alias',
                'be-01.internal',
                '--mount',
                'type=bind,src=' + envLayout('prod').root + '/data,dst=/data',
                '--mount',
                'type=bind,src=/run/user/1000/wbs-solver,dst=/run/wbs-solver,readonly',
              ]
            : []),
          ...this.projection.configuration.productEnvironment[role].flatMap((assignment) => [
            '--env',
            assignment,
          ]),
          selected.image,
        ];
      }
    }
  }
  private trackNativeChild(
    child: NativeChild,
    transport: 'manager' | 'docker' | 'migration',
    cleanup: boolean,
    requestedArgv: readonly string[],
    cutoff = this.deadline,
  ): NativeSettlement {
    this.children.push(child);
    const terminal = Promise.withResolvers<NativeStatus>();
    const original: NativeSettlement = {
      child,
      transport,
      cleanup,
      requestedArgv: [...requestedArgv],
      phase: 'open',
      closed: terminal.promise,
      cutoff: Math.min(cutoff, this.deadline),
    };
    this.nativeSettlements.set(child, original);
    child.on('error', (failure: Error) => {
      original.nativeError = failure;
      this.failures.push(failure);
    });
    child.once('close', (code: number | null, signal: NodeJS.Signals | null) => {
      original.status = { code, signal };
      original.phase = 'closed';
      terminal.resolve(original.status);
    });
    return original;
  }
  private hasUnsettledNativeChildren(): boolean {
    return this.children.some((child) => this.nativeSettlements.get(child)?.phase !== 'settled');
  }
  /** Error notifications never settle the original close/pipe promises or authorize a numeric-PID fallback. */
  private async settleNativeChild(original: NativeSettlement): Promise<void> {
    if (original.phase === 'settled') return;
    const remaining = original.cutoff - performance.now();
    if (remaining <= 0) {
      this.failures.push(Error('source original native settlement cutoff expired'));
      return;
    }
    if (original.stdout === undefined || original.stderr === undefined) {
      this.failures.push(Error('source actual native pipe acquisition unproved'));
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const cutoff = new Promise<{ kind: 'cutoff' }>((resolve) => {
        timer = setTimeout(() => {
          resolve({ kind: 'cutoff' });
        }, remaining);
      });
      // Proof: omitting original.closed in the compiled copy made 'actual settlement waits for original terminal callback after pipe settlement' return settled/status-absent before the original callback; exact restoration stayed open/pending (ce58dac4 receipt).
      const terminal = Promise.allSettled([original.closed, original.stdout, original.stderr]).then(
        (observations) => ({ kind: 'terminal' as const, observations }),
      );
      const settled = await Promise.race([terminal, cutoff]);
      if (settled.kind === 'cutoff' || performance.now() >= original.cutoff) {
        this.failures.push(Error('source original native settlement cutoff expired'));
        return;
      }
      for (const observation of settled.observations)
        if (observation.status === 'rejected') this.failures.push(observation.reason);
      original.phase = 'settled';
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }
  private async joinNativeChild(original: NativeSettlement): Promise<void> {
    await this.settleNativeChild(original);
    if (original.phase !== 'settled')
      return refuseConstruction('original native close or pipes remain unproved');
  }
  private async runNative(action: NativeAction, cleanup = false): Promise<string> {
    const argv = this.invocation(action);
    const manager = action.kind.startsWith('manager-');
    await this.verifyNativeCustody();
    if (cleanup) {
      if (++this.cleanupTransports > 48) return refuseConstruction('cleanup transport envelope');
    } else {
      await this.checkArchive();
      if (++this.forwardHelpers > 129) return refuseConstruction('forward helper envelope');
    }
    let create: SourceDispatch | undefined;
    let resource: RecordedResource | undefined;
    let capture: SourceDispatch | undefined;
    if (!cleanup)
      create = await this.dispatchRequest({
        operation: 'create',
        resourceClass: 'helper',
        purpose: 'transport',
      });
    let child: NativeChild | undefined;
    let nativeSettlement: NativeSettlement | undefined;
    let joined: Promise<{ code: number | null; signal: NodeJS.Signals | null }> | undefined;
    let stdout: Promise<Buffer> | undefined;
    let stderr: Promise<Buffer> | undefined;
    let identity: Awaited<ReturnType<SourceFixtureConstruction['observeChild']>> | undefined;
    let primary: unknown;
    let output: Buffer | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const commandCutoff = Math.min(
      this.deadline,
      performance.now() + (manager ? 15000 : Number.MAX_SAFE_INTEGER),
    );
    try {
      child = manager
        ? spawn('/usr/bin/setpriv', [...managerPrefix, ...argv], {
            cwd: '/',
            env: managerEnvironment,
            stdio: ['ignore', 'pipe', 'pipe'],
          })
        : spawn('/usr/bin/docker', [...argv], {
            cwd: this.policy.facility.coordinator.directory,
            env: {
              DOCKER_HOST: 'unix:///run/docker.sock',
              DOCKER_CONFIG: this.policy.facility.coordinator.directory,
              LANG: 'C.UTF-8',
              TZ: 'UTC',
            },
            stdio: ['pipe', 'pipe', 'pipe'],
          });
      nativeSettlement = this.trackNativeChild(
        child,
        manager ? 'manager' : 'docker',
        cleanup,
        argv,
        commandCutoff,
      );
      const owned = child;
      joined = nativeSettlement.closed;
      const drain = async (stream: Readable, maximum: number): Promise<Buffer> => {
        let bytes = Buffer.alloc(0);
        for await (const chunk of stream) {
          bytes = Buffer.concat([bytes, Buffer.from(chunk)]);
          if (bytes.length > maximum) return refuseConstruction('native stream bound');
        }
        return bytes;
      };
      stdout = drain(owned.stdout, manager ? 65536 : 4 * 1024 * 1024);
      stderr = drain(owned.stderr, manager ? 65536 : 8192);
      nativeSettlement.stdout = stdout;
      nativeSettlement.stderr = stderr;
      const settled = Promise.all([joined, stdout, stderr]);
      void settled.catch(() => undefined);
      let expire: (cause: Error) => void = () =>
        refuseConstruction('native cutoff continuation absent');
      const expired = new Promise<never>((resolve, reject) => {
        expire = reject;
      });
      void expired.catch(() => undefined);
      owned.once('error', (failure: unknown) => {
        expire(normalizeConstructionFailure(failure));
      });
      timer = setTimeout(
        () => {
          expire(Error('source native original cutoff'));
        },
        Math.max(1, nativeSettlement.cutoff - performance.now()),
      );
      if (owned.stdin !== null) {
        owned.stdin.on('error', (failure) => {
          expire(failure);
        });
        owned.stdin.end();
      }
      if (!cleanup) {
        if (manager) identity = await this.observeManagerChild(owned, argv[0]);
        else {
          const docker = this.nativeCustody.get('/usr/bin/docker');
          if (docker?.sha256 === undefined)
            return refuseConstruction('original Docker executable pin absent');
          identity = await this.observeChild(owned, {
            identity: docker.identity,
            bytes: Number(docker.identity.size),
            sha256: docker.sha256,
          });
        }
        nativeSettlement.liveIdentity = identity;
        if (create === undefined) return refuseConstruction('native create dispatch absent');
        resource = await this.recordCreation(create, {
          identity,
          observationSha256: digest(JSON.stringify(identity)),
        });
        if (resource === undefined) return refuseConstruction('native helper resource absent');
        capture = await this.dispatch(resource, 'capture');
      }
      const [status, bytes, errors] = await Promise.race([settled, expired]);
      if (performance.now() >= nativeSettlement.cutoff)
        return refuseConstruction('native command original cutoff');
      if (action.kind === 'tag-absence') {
        if (
          status.code !== 1 ||
          status.signal !== null ||
          bytes.toString('utf8') !== '[]\n' ||
          errors.toString('utf8') !== 'Error response from daemon: No such image: wbs-dev-src:1\n'
        )
          return refuseConstruction('source tag is not exclusively absent');
      } else if (status.code !== 0 || status.signal !== null || errors.length !== 0)
        return refuseConstruction('native command failed');
      await this.verifyNativeCustody();
      output = bytes;
      if (capture !== undefined) {
        await this.observe(capture, { bytes: bytes.length, sha256: digest(bytes), joined: true });
        capture = undefined;
      }
      if (resource !== undefined) {
        const removal = await this.dispatch(resource, 'remove');
        await this.observe(removal, { joined: true, pipesClosed: true });
      }
      if (!cleanup) this.check();
    } catch (cause) {
      primary = cause;
      const pending = capture ?? (resource === undefined ? create : undefined);
      if (pending !== undefined)
        try {
          await this.recordUncertainty(pending);
        } catch (failure) {
          this.failures.push(failure);
        }
      if (child !== undefined) {
        const owned = child;
        try {
          let stop: SourceDispatch | undefined;
          if (owned.exitCode === null && owned.signalCode === null) {
            const current = manager
              ? await this.observeManagerChild(owned, argv[0], true)
              : await this.observeChild(owned);
            if (nativeSettlement !== undefined) nativeSettlement.liveIdentity = current;
            if (identity !== undefined)
              requireEqual(current, identity, 'native original stop identity');
            if (resource !== undefined)
              try {
                stop = await this.dispatch(resource, 'stop-join');
              } catch (failure) {
                this.failures.push(failure);
              }
            if (!owned.kill('SIGKILL')) return refuseConstruction('native original stop failed');
          }
          if (nativeSettlement === undefined)
            return refuseConstruction('native original settlement reference absent');
          await this.joinNativeChild(nativeSettlement);
          if (stop !== undefined) await this.observe(stop, { joined: true });
          if (resource !== undefined) {
            const removal = await this.dispatch(resource, 'remove');
            await this.observe(removal, { joined: true });
          }
        } catch (failure) {
          this.failures.push(failure);
        }
      }
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      if (nativeSettlement !== undefined) await this.settleNativeChild(nativeSettlement);
    }
    if (primary !== undefined)
      throw new AggregateError([primary, ...this.failures], 'source fixed native command failed', {
        cause: primary,
      });
    if (output === undefined) return refuseConstruction('native output absent');
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(output);
  }
  private nativeArray(text: string): readonly Record<string, unknown>[] {
    const value = parseDockerInspection(text);
    if (!Array.isArray(value) || value.length > 256)
      return refuseConstruction('native array bound');
    return value.map(readFields);
  }
  private async inventoryNative(): Promise<void> {
    await this.runNative({ kind: 'tag-absence' });
    for (const kind of ['container', 'network'] as const) {
      const output = await this.runNative({
        kind: kind === 'container' ? 'container-list' : 'network-list',
      });
      const ids =
        output.trim() === ''
          ? []
          : output
              .trimEnd()
              .split('\n')
              .map((line) => readIdentity(JSON.parse(line)));
      if (ids.length > 256) return refuseConstruction('entry native roster bound');
      const rows =
        ids.length === 0
          ? []
          : this.nativeArray(
              await this.runNative(
                kind === 'container'
                  ? { kind: 'entry-container-inspect', ids }
                  : { kind: 'entry-network-inspect', ids },
              ),
            );
      requireEqual(
        rows.map((row) => readIdentity(row['Id'])).sort(),
        [...ids].sort(),
        'entry full identity roster',
      );
      const reserved =
        kind === 'container'
          ? (['backend', 'gateway', 'source', 'caddy'] as const).map(
              (role) => '/' + this.containerName(role),
            )
          : [envLayout('prod').network, envLayout('dev').network];
      if (rows.some((row) => reserved.includes(String(row['Name']))))
        return refuseConstruction('preexisting native target');
    }
    for (const image of this.policy.facility.images) {
      const rows = this.nativeArray(
        await this.runNative({ kind: 'image-inspect', role: image.role }),
      );
      const observed = rows.at(0);
      if (rows.length !== 1 || observed === undefined)
        return refuseConstruction('immutable image observation');
      requireEqual(observed['Id'], image.imageId, 'immutable image identity');
      const digests = observed['RepoDigests'];
      if (!Array.isArray(digests) || !digests.includes(image.reference))
        return refuseConstruction('immutable repo digest absent');
      this.images.set(image.role, observed);
    }
  }
  private assertUnitAuthority(fields: ReadonlyMap<string, string>): void {
    const expected: Readonly<Record<string, string>> = {
      LoadState: 'loaded',
      Id: managerService,
      Names: managerService,
      FragmentPath: '/home/puni1/.config/systemd/user/' + managerService,
      DropInPaths: '',
      Transient: 'no',
      NeedDaemonReload: 'no',
      Restart: 'always',
      RestartPreventExitStatus: '78',
      KillMode: 'control-group',
      Environment: 'WBS_EDGE_STATE=/home/puni1/wbs/state',
      ExecStartPre: '',
      ExecStartPost: '',
      ExecStop: '',
    };
    for (const [name, value] of Object.entries(expected))
      if (fields.get(name) !== value)
        return refuseConstruction('effective original unit authority differs');
    const executable = (value: string | undefined, path: string, argv: string) => {
      if (value === undefined) return false;
      const match =
        /^\{ path=([^;]+) ; argv\[\]=([^;]+) ; ignore_errors=no ; start_time=\[[^\]\n]*\] ; stop_time=\[[^\]\n]*\] ; pid=[0-9]+ ; code=(?:\(null\)|[a-z-]+) ; status=[0-9]+(?:\/[^ ;}]+)? \}$/.exec(
          value,
        );
      return match?.[1] === path && match[2] === argv;
    };
    const bun = '/home/puni1/.local/lib/wbs-solver/bun';
    if (
      !executable(
        fields.get('ExecStart'),
        bun,
        bun +
          ' /home/puni1/.local/lib/wbs-solver/solver-supervisor.js --config=/home/puni1/.config/wbs-solver/solver-supervisor.json --admission=policy',
      ) ||
      !executable(
        fields.get('ExecStopPost'),
        '/bin/rm',
        '/bin/rm -f /run/user/1000/wbs-solver/supervisor.sock',
      )
    )
      return refuseConstruction('effective original unit execution differs');
  }
  private async observeUnit(
    cleanup = false,
  ): Promise<{ text: string; fields: Map<string, string> }> {
    if (this.unitRemoved) return refuseConstruction('unit observation after definition removal');
    const definition = this.files.find(
      (file) => file.path === '/home/puni1/.config/systemd/user/' + managerService && !file.removed,
    );
    if (definition === undefined) return refuseConstruction('original unit definition absent');
    await this.verifyFile(definition);
    const observation: {
      commands: { requestedArgv: readonly string[]; stdout: string }[];
      effective?: string;
      extras?: readonly string[];
    } = { commands: [] };
    this.unitObservations.push(observation);
    let extra: readonly string[] | undefined;
    const text = await observeSolverUnit(managerService, async (argv) => {
      let action: ManagerAction;
      if (argv[0] === 'systemctl') {
        requireEqual(
          argv,
          [
            'systemctl',
            '--user',
            'show',
            managerService,
            ...SOLVER_UNIT_PROPERTIES.map((property) => '--property=' + property),
          ],
          'shared unit show request',
        );
        action = { kind: 'manager-show' };
      } else if (argv[3] === 'call') {
        requireEqual(
          argv,
          [
            'busctl',
            '--user',
            '--json=short',
            'call',
            'org.freedesktop.systemd1',
            '/org/freedesktop/systemd1',
            'org.freedesktop.systemd1.Manager',
            'LoadUnit',
            's',
            managerService,
          ],
          'shared actual LoadUnit request',
        );
        action = { kind: 'manager-load' };
      } else {
        const hook = argv.at(-1);
        if (hook !== 'ExecStartPre' && hook !== 'ExecStartPost' && hook !== 'ExecStop')
          return refuseConstruction('shared unit hook request');
        requireEqual(
          argv,
          [
            'busctl',
            '--user',
            '--json=short',
            'get-property',
            'org.freedesktop.systemd1',
            '/org/freedesktop/systemd1/unit/wbs_2dsolver_2dsupervisor_2eservice',
            'org.freedesktop.systemd1.Service',
            hook,
          ],
          'shared typed hook request',
        );
        action = { kind: 'manager-hook', hook };
      }
      await this.verifyFile(definition);
      const observed = await this.runNative(action, cleanup);
      observation.commands.push({
        requestedArgv: ['/usr/bin/setpriv', ...managerPrefix, ...this.invocation(action)],
        stdout: observed,
      });
      if (action.kind !== 'manager-show') {
        readUniqueNativeJSON(observed);
        return observed;
      }
      const base: string[] = [];
      const extras = new Map<string, string>();
      const names = new Set<string>();
      for (const row of observed.replace(/\n$/, '').split('\n')) {
        const split = row.indexOf('=');
        const name = row.slice(0, split);
        if (split < 1 || names.has(name))
          return refuseConstruction('effective unit duplicate or malformed property');
        names.add(name);
        if (SOLVER_UNIT_PROPERTIES.includes(name)) base.push(row);
        else if (managerExtras.some((property) => property === name))
          extras.set(name, row.slice(split + 1));
        else return refuseConstruction('effective unit unknown property');
      }
      const current = managerExtras.map((property) => {
        const value = extras.get(property);
        if (value === undefined)
          return refuseConstruction('effective unit missing additional property');
        return value;
      });
      requireEqual(current, ['0750', 'restart', '1s', '0'], 'effective runtime/restart authority');
      if (extra === undefined) extra = current;
      else requireEqual(current, extra, 'effective extra-property bracket');
      return base.join('\n') + '\n';
    });
    await this.verifyFile(definition);
    const fields = readSolverUnitProjection(text);
    this.assertUnitAuthority(fields);
    observation.effective = text;
    observation.extras = extra;
    return { text, fields };
  }
  private matchesUnitScope(path: string): boolean {
    if (
      !path.startsWith('/') ||
      path.includes('\0') ||
      Buffer.byteLength(path) > 4096 ||
      posix.normalize(path) !== path ||
      (path !== '/' && path.endsWith('/'))
    )
      return refuseConstruction('census cgroup path malformed');
    return path.startsWith('/user.slice/') && path.split('/').includes(managerService);
  }
  private readCensusNames(rows: unknown): string[] {
    if (!Array.isArray(rows)) return refuseConstruction('census directory roster absent');
    const names = rows.map((entry: unknown) => {
      if (!(entry instanceof Uint8Array)) return refuseConstruction('census name byte observation');
      const name = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(entry);
      if (name === '' || name === '.' || name === '..' || name.includes('/') || name.includes('\0'))
        return refuseConstruction('census directory name malformed');
      return name;
    });
    requireUnique(names, 'census duplicate names');
    return names.sort();
  }
  private async readCensusDirectory(
    path: string,
    expected?: BigIntStats,
  ): Promise<{
    path: string;
    identity: BigIntStats;
    entries: { name: string; kind: 'file' | 'directory'; identity: BigIntStats }[];
  }> {
    this.assertNativeDeadline();
    if (Buffer.byteLength(path) > 4096 || posix.normalize(path) !== path)
      return refuseConstruction('census directory coordinate');
    const named = await lstat(path, { bigint: true });
    if (!named.isDirectory()) return refuseConstruction('census directory type');
    if (expected !== undefined) sameNode(named, expected);
    const acquired = await this.openNativeObservation(path, false, true);
    let primary: unknown;
    let snapshot:
      | {
          path: string;
          identity: BigIntStats;
          entries: { name: string; kind: 'file' | 'directory'; identity: BigIntStats }[];
        }
      | undefined;
    try {
      const before = fstatSync(acquired.descriptor, { bigint: true });
      acquired.identity = before;
      sameNode(before, named);
      if ((await realpath(path)) !== path)
        return refuseConstruction('census directory not canonical');
      const bound = '/proc/self/fd/' + String(acquired.descriptor);
      const names = this.readCensusNames(await readdir(bound, { encoding: 'buffer' }));
      const entries: { name: string; kind: 'file' | 'directory'; identity: BigIntStats }[] = [];
      for (const name of names) {
        this.assertNativeDeadline();
        const identity = await lstat(bound + '/' + name, { bigint: true });
        if (!identity.isDirectory() && !identity.isFile())
          return refuseConstruction('census unexpected child type');
        entries.push({ name, kind: identity.isDirectory() ? 'directory' : 'file', identity });
      }
      requireEqual(
        this.readCensusNames(await readdir(bound, { encoding: 'buffer' })),
        names,
        'census within-directory membership bracket',
      );
      sameNode(await acquired.file.stat({ bigint: true }), before);
      sameNode(await lstat(path, { bigint: true }), before);
      snapshot = { path, identity: before, entries };
    } catch (cause) {
      primary = cause;
    }
    try {
      await this.closeNativeObservation(acquired, named);
    } catch (secondary) {
      if (primary !== undefined)
        throw combineConstructionErrors(primary, secondary, 'census directory and close failed');
      throw secondary;
    }
    if (primary !== undefined) throw normalizeConstructionFailure(primary);
    if (snapshot === undefined) return refuseConstruction('census directory snapshot absent');
    return snapshot;
  }
  private async readCensusPids(): Promise<number[]> {
    this.assertNativeDeadline();
    const names = this.readCensusNames(await readdir('/proc', { encoding: 'buffer' }));
    const pids: number[] = [];
    for (const name of names) {
      if (!/^[0-9]+$/.test(name)) continue;
      if (!/^[1-9][0-9]*$/.test(name)) return refuseConstruction('census numeric pid malformed');
      const pid = Number(name);
      if (!Number.isSafeInteger(pid) || pid > 4194304)
        return refuseConstruction('census pid bound');
      pids.push(pid);
      if (pids.length > 65536) return refuseConstruction('census pid count bound');
    }
    return pids.sort((left, right) => left - right);
  }
  private parseCensusStat(text: string, pid: number): string {
    const end = text.lastIndexOf(') ');
    const columns = text
      .slice(end + 2)
      .trimEnd()
      .split(' ');
    const start = columns.at(19);
    const state = columns.at(0);
    if (
      end < 1 ||
      text.slice(0, text.indexOf(' ')) !== String(pid) ||
      start === undefined ||
      !/^[1-9][0-9]{0,23}$/.test(start) ||
      state === undefined ||
      !/^[A-Za-z]$/.test(state)
    )
      return refuseConstruction('census proc stat malformed');
    return start;
  }
  private async readCensusProcess(pid: number): Promise<{
    pid: number;
    start: string;
    cgroup: string;
    uids: readonly number[];
    gids: readonly number[];
  }> {
    const root = '/proc/' + String(pid);
    const before = this.parseCensusStat(await this.readNativeText(root + '/stat', 16384), pid);
    const status = await this.readNativeText(root + '/status', 16384);
    const namedPid = /^Pid:[\t ]+([1-9][0-9]*)$/m.exec(status)?.[1];
    if (namedPid !== String(pid)) return refuseConstruction('census status pid mismatch');
    const credentials = (name: string) => {
      const match = new RegExp(
        '^' + name + ':[\\t ]+([0-9]+)[\\t ]+([0-9]+)[\\t ]+([0-9]+)[\\t ]+([0-9]+)$',
        'm',
      ).exec(status);
      if (match === null) return refuseConstruction('census status credentials malformed');
      const values = match.slice(1).map(Number);
      if (values.some((value) => !Number.isSafeInteger(value) || value > 4294967295))
        return refuseConstruction('census status credential bound');
      return values;
    };
    const uids = credentials('Uid');
    const gids = credentials('Gid');
    const rawGroup = await this.readNativeText(root + '/cgroup', 16384);
    const match = /^0::([^\n]+)\n$/.exec(rawGroup);
    const cgroup = match?.[1];
    if (cgroup === undefined) return refuseConstruction('census unified cgroup malformed');
    if (this.matchesUnitScope(cgroup)) return refuseConstruction('matching unit process remains');
    const after = this.parseCensusStat(await this.readNativeText(root + '/stat', 16384), pid);
    if (after !== before) return refuseConstruction('census pid identity changed');
    return { pid, start: before, cgroup, uids, gids };
  }
  private async censusUnitAbsence(): Promise<string> {
    const native = this.policy.facility.nativeCustody;
    const root = '/sys/fs/cgroup/user.slice';
    const expectedRoot = native.parents.find((parent) => parent.path === root);
    const managerParentPath = '/sys/fs/cgroup' + posix.dirname(native.manager.cgroup.path);
    const expectedManager = native.parents.find((parent) => parent.path === managerParentPath);
    if (expectedRoot === undefined || expectedManager === undefined)
      return refuseConstruction('authenticated census roots absent');
    this.assertNativeMetadata(await lstat(root, { bigint: true }), expectedRoot, 'directory');
    this.assertNativeMetadata(
      await lstat(managerParentPath, { bigint: true }),
      expectedManager,
      'directory',
    );
    const snapshots: Awaited<ReturnType<SourceFixtureConstruction['readCensusDirectory']>>[] = [];
    const queue: { path: string; depth: number; identity?: BigIntStats }[] = [
      { path: root, depth: 0 },
    ];
    let entryCount = 0;
    let nameBytes = 0;
    for (let index = 0; index < queue.length; index++) {
      const next = queue.at(index);
      if (next === undefined) return refuseConstruction('census work queue absent');
      if (next.depth > 64) return refuseConstruction('census depth bound');
      const snapshot = await this.readCensusDirectory(next.path, next.identity);
      snapshots.push(snapshot);
      for (const entry of snapshot.entries) {
        entryCount++;
        nameBytes += Buffer.byteLength(entry.name);
        if (entryCount > 8192 || nameBytes > 8388608)
          return refuseConstruction('census directory enumeration bound');
        const path = next.path + '/' + entry.name;
        if (Buffer.byteLength(path) > 4096) return refuseConstruction('census path byte bound');
        if (entry.kind === 'directory') {
          if (this.matchesUnitScope(path.slice('/sys/fs/cgroup'.length)))
            return refuseConstruction('matching unit cgroup remains');
          queue.push({ path, depth: next.depth + 1, identity: entry.identity });
        }
      }
    }
    const pids = await this.readCensusPids();
    const processes: Awaited<ReturnType<SourceFixtureConstruction['readCensusProcess']>>[] = [];
    for (const pid of pids) processes.push(await this.readCensusProcess(pid));
    for (const snapshot of snapshots) {
      const current = await this.readCensusDirectory(snapshot.path, snapshot.identity);
      requireEqual(
        current.entries.map((entry) => [entry.name, entry.kind]),
        snapshot.entries.map((entry) => [entry.name, entry.kind]),
        'census complete directory membership bracket',
      );
      for (const [index, entry] of current.entries.entries()) {
        const original = snapshot.entries.at(index);
        if (original === undefined) return refuseConstruction('census entry bracket absent');
        sameNode(entry.identity, original.identity);
      }
    }
    requireEqual(await this.readCensusPids(), pids, 'census complete pid roster bracket');
    for (const process of processes)
      requireEqual(
        await this.readCensusProcess(process.pid),
        process,
        'census complete process identity bracket',
      );
    this.assertNativeMetadata(await lstat(root, { bigint: true }), expectedRoot, 'directory');
    this.assertNativeMetadata(
      await lstat(managerParentPath, { bigint: true }),
      expectedManager,
      'directory',
    );
    return digest(
      JSON.stringify({
        directories: snapshots.map((snapshot) => ({
          path: snapshot.path,
          identity: fsIdentity(snapshot.identity, 'directory'),
          entries: snapshot.entries.map((entry) => ({
            name: entry.name,
            kind: entry.kind,
            identity: fsIdentity(entry.identity, entry.kind),
          })),
        })),
        processes,
      }),
    );
  }
  private async assertManagerAbsent(cleanup = false): Promise<string> {
    const text = await this.runNative({ kind: 'manager-absence' }, cleanup);
    const observed = readFields(readUniqueNativeJSON(text));
    requireEqual(Object.keys(observed).sort(), ['data', 'type'], 'nonloading manager envelope');
    requireEqual(
      [observed['type'], observed['data']],
      ['a(ssssssouso)', [[]]],
      'nonloading exact-name manager absence',
    );
    await this.requireAbsent('/home/puni1/.config/systemd/user/' + managerService);
    await this.requireAbsent(this.policy.facility.enablement.parent.path + '/' + managerService);
    await this.requireAbsent('/run/user/1000/wbs-solver/supervisor.sock');
    const census = await this.censusUnitAbsence();
    if (this.unitProcess !== undefined) {
      const path = '/proc/' + String(this.unitProcess.pid);
      let exists = true;
      try {
        await lstat(path);
      } catch (cause) {
        if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') exists = false;
        else throw cause;
      }
      if (exists) {
        const current = await this.readCensusProcess(this.unitProcess.pid);
        if (current.start === this.unitProcess.startTime)
          return refuseConstruction('original unit process remains');
      }
      await this.requireAbsent('/sys/fs/cgroup' + this.unitProcess.cgroup);
    }
    await this.verifyNativeCustody();
    await this.requireAbsent('/home/puni1/.config/systemd/user/' + managerService);
    await this.requireAbsent(this.policy.facility.enablement.parent.path + '/' + managerService);
    await this.requireAbsent('/run/user/1000/wbs-solver/supervisor.sock');
    return census;
  }
  private async readUnitParents(): Promise<
    Map<string, { identity: BigIntStats; target?: string }>
  > {
    const anchor = this.policy.facility.anchors.find((anchor) => anchor.id === 'user-units');
    if (anchor === undefined) return refuseConstruction('original unit parent absent');
    const members = new Map<string, { identity: BigIntStats; target?: string }>();
    const link = this.unitLink;
    const walk = async (path: string, depth: number): Promise<void> => {
      if (depth > 8) return refuseConstruction('unit parent census depth');
      for (const name of await readdir(path)) {
        const location = path + '/' + name;
        if (location === link?.path || location === anchor.path + '/' + managerService) continue;
        if (members.size >= 512) return refuseConstruction('unit parent census bound');
        const identity = await lstat(location, { bigint: true });
        const target = identity.isSymbolicLink() ? await readlink(location) : undefined;
        if (
          target !== undefined &&
          (posix.basename(location) === managerService || posix.basename(target) === managerService)
        )
          return refuseConstruction('other unit enablement reference');
        if (!identity.isFile() && !identity.isDirectory() && !identity.isSymbolicLink())
          return refuseConstruction('unit parent member type');
        members.set(location, { identity, ...(target === undefined ? {} : { target }) });
        if (identity.isDirectory()) await walk(location, depth + 1);
      }
    };
    await walk(anchor.path, 0);
    return members;
  }
  private async captureUnitParents(): Promise<void> {
    if (this.unitParents !== undefined) return refuseConstruction('unit parents already captured');
    this.unitParents = await this.readUnitParents();
  }
  private async verifyUnitParents(): Promise<void> {
    const expected = this.unitParents;
    if (expected === undefined) return refuseConstruction('original unit parent census absent');
    const current = await this.readUnitParents();
    requireEqual(
      [...current.keys()].sort(),
      [...expected.keys()].sort(),
      'original unit parent membership',
    );
    for (const [path, member] of current) {
      const original = expected.get(path);
      if (original === undefined) return refuseConstruction('unknown unit parent member');
      sameNode(member.identity, original.identity);
      if (member.target !== original.target)
        return refuseConstruction('unit parent symlink changed');
    }
  }
  private async verifyUnitLink(): Promise<void> {
    const link = this.unitLink;
    if (link === undefined) return refuseConstruction('original enablement link absent');
    sameNode(await lstat(link.path, { bigint: true }), link.identity);
    if ((await readlink(link.path)) !== '/home/puni1/.config/systemd/user/' + managerService)
      return refuseConstruction('original enablement target differs');
    await this.verifyNativeCustody();
    await this.verifyUnitParents();
  }
  private async verifyRuntime(): Promise<void> {
    const runtime = this.scopes.get('solver-runtime');
    if (runtime === undefined || this.unitSocket === undefined)
      return refuseConstruction('original active runtime absent');
    await this.verifyDirectory(runtime);
    requireEqual(
      await readdir(runtime.path),
      ['supervisor.sock'],
      'original active runtime membership',
    );
    sameNode(await lstat(runtime.path + '/supervisor.sock', { bigint: true }), this.unitSocket);
  }
  private async retainUnitActive(text: string): Promise<void> {
    const unit = parseSolverUnit(text, true);
    if (this.unitActive !== undefined)
      requireEqual(unit, this.unitActive, 'original unit invocation/cgroup/pid');
    const process = await observeSolverProcess(unit.pid);
    const participant = await observeParticipantProcess(unit.pid, this.deadline);
    const bun = this.files.find((file) => file.path === '/home/puni1/.local/lib/wbs-solver/bun');
    if (bun === undefined || participant.identity.executable === null)
      return refuseConstruction('original solver executable absent');
    requireEqual(
      [
        participant.executablePath,
        participant.identity.uid,
        participant.identity.startTime,
        participant.identity.cgroup,
        participant.identity.executable.device,
        participant.identity.executable.inode,
        participant.identity.executable.sha256,
      ],
      [
        bun.path,
        1000,
        process.startTime,
        unit.cgroup,
        String(bun.identity.dev),
        String(bun.identity.ino),
        bun.sha256,
      ],
      'original solver kernel executable',
    );
    requireEqual(
      participant.argv,
      [
        bun.path,
        '/home/puni1/.local/lib/wbs-solver/solver-supervisor.js',
        '--config=/home/puni1/.config/wbs-solver/solver-supervisor.json',
        '--admission=policy',
      ],
      'original solver kernel argv',
    );
    if (process.cgroup !== unit.cgroup) return refuseConstruction('unit kernel cgroup differs');
    if (this.unitProcess !== undefined)
      requireEqual(process, this.unitProcess, 'original unit kernel process');
    const group = await observeSolverCgroup(unit.cgroup, false);
    if (!group?.populated) return refuseConstruction('active unit cgroup is not populated');
    if (this.unitCgroup !== undefined)
      requireEqual(
        [group.device, group.inode],
        [this.unitCgroup.device, this.unitCgroup.inode],
        'original solver cgroup inode',
      );
    else this.unitCgroup = { device: group.device, inode: group.inode };
    const runtime = this.scopes.get('solver-runtime');
    if (runtime === undefined) return refuseConstruction('original runtime scope absent');
    await this.verifyDirectory(runtime);
    const socket = await lstat(runtime.path + '/supervisor.sock', { bigint: true });
    if (!socket.isSocket() || socket.uid !== 1000n || socket.gid !== 1000n)
      return refuseConstruction('unit runtime socket differs');
    if (this.unitSocket !== undefined) sameNode(socket, this.unitSocket);
    else this.unitSocket = socket;
    this.unitActive = unit;
    this.unitProcess = process;
  }
  private async constructUnit(): Promise<void> {
    const definition = this.files.find(
      (file) => file.path === '/home/puni1/.config/systemd/user/' + managerService,
    );
    if (definition === undefined) return refuseConstruction('unit definition was not installed');
    const create = await this.dispatchRequest({
      operation: 'create',
      resourceClass: 'unit',
      purpose: 'runtime',
    });
    try {
      await this.runNative({ kind: 'manager-command', operation: 'daemon-reload' });
      const initial = await this.observeUnit();
      parseSolverUnit(initial.text, false);
      this.unitResource = await this.recordCreation(create, {
        identity: {
          kind: 'unit',
          nameSha256: digest(managerService),
          definitionSha256: definition.sha256,
        },
        observationSha256: digest(initial.text),
      });
      if (this.unitResource === undefined)
        return refuseConstruction('unit registration acknowledgement absent');
    } catch (primary) {
      return await this.uncertainty(create, primary);
    }
    await this.captureUnitParents();
    const linkCreate = await this.dispatchRequest({
      operation: 'create',
      resourceClass: 'file',
      purpose: 'runtime',
    });
    try {
      const path = this.policy.facility.enablement.parent.path + '/' + managerService;
      await this.requireAbsent(path);
      await symlink(definition.path, path);
      const identity = await lstat(path, { bigint: true });
      this.unitLink = { path, identity };
      if (!identity.isSymbolicLink() || (await readlink(path)) !== definition.path)
        return refuseConstruction('exclusive unit link differs');
      this.unitLink.resource = await this.recordCreation(linkCreate, {
        identity: fsIdentity(identity, 'file'),
        observationSha256: digest(definition.path),
      });
      if (this.unitLink.resource === undefined)
        return refuseConstruction('unit link acknowledgement absent');
    } catch (primary) {
      return await this.uncertainty(linkCreate, primary);
    }
    const enable = await this.dispatch(this.unitResource, 'write');
    try {
      await this.runNative({ kind: 'manager-command', operation: 'enable' });
      const enabled = await this.observeUnit();
      parseSolverUnit(enabled.text, false);
      await this.verifyUnitLink();
      await this.observe(enable, {
        definitionSha256: definition.sha256,
        effectiveSha256: digest(enabled.text),
      });
    } catch (primary) {
      return await this.uncertainty(enable, primary);
    }
    const link = this.unitLink;
    if (link.resource === undefined)
      return refuseConstruction('original unit link resource absent');
    const linkCapture = await this.dispatch(link.resource, 'capture');
    try {
      await this.verifyUnitLink();
      await this.observe(linkCapture, { targetSha256: digest(definition.path) });
    } catch (primary) {
      return await this.uncertainty(linkCapture, primary);
    }
    const start = await this.dispatch(this.unitResource, 'start');
    try {
      this.unitStartDispatched = true;
      await this.runNative({ kind: 'manager-command', operation: 'restart' });
      let ready = false;
      for (let sample = 0; sample < 8; sample++) {
        const current = await this.observeUnit();
        const state = current.fields.get('ActiveState');
        const substate = current.fields.get('SubState');
        if (state === 'active' && substate === 'running') {
          await this.retainUnitActive(current.text);
          ready = true;
          break;
        }
        if (
          state !== 'activating' ||
          !['start', 'start-pre', 'start-post', 'auto-restart'].includes(substate ?? '')
        )
          return refuseConstruction('unit readiness failed');
        if (
          current.fields.get('Result') !== 'success' ||
          current.fields.get('ExecMainStatus') !== '0'
        )
          return refuseConstruction('unit readiness execution failed');
      }
      if (!ready) return refuseConstruction('unit readiness did not converge');
      await this.observe(start, { unit: this.unitActive, process: this.unitProcess });
    } catch (primary) {
      return await this.uncertainty(start, primary);
    }
  }
  private async installFixedFiles(): Promise<void> {
    const facility = this.policy.facility;
    const staged = inspectOriginalStaging(this.retention).members;
    const sourceEntries = staged
      .filter((member) => member.path === 'source' || member.path.startsWith('source/'))
      .map((member) => ({
        ...member,
        path: 'src' + member.path.slice('source'.length),
        staged: member.path,
      }));
    const caddyDestinations = {
      root: 'Caddyfile',
      redaction: 'log-redact.caddy',
      prod: 'site.caddy',
      dev: 'site-dev.caddy',
    };
    const prodEntries: {
      path: string;
      kind: 'directory' | 'file' | 'symlink';
      mode: number;
      bytes?: number;
      sha256?: string;
      staged?: string;
    }[] = [
      { path: 'bin', kind: 'directory', mode: 493 },
      { path: 'state', kind: 'directory', mode: 493 },
      { path: 'state/dependency-artifacts', kind: 'directory', mode: 448 },
      { path: 'caddy', kind: 'directory', mode: 448 },
    ];
    for (const [role, leaf] of Object.entries(caddyDestinations)) {
      const member = staged.find((member) => member.path === 'caddy/' + role);
      if (member === undefined) return refuseConstruction('staged caddy member absent');
      prodEntries.push({ ...member, path: 'caddy/' + leaf, staged: member.path });
    }
    for (const group of facility.groups) {
      const anchor = facility.anchors.find((anchor) => anchor.id === group.anchor);
      if (anchor === undefined) return refuseConstruction('fixed anchor absent');
      const scope = await this.acquireDirectory(
        anchor.path + '/' + group.child,
        group.mode,
        group.uid,
        group.gid,
      );
      this.scopes.set(group.id, scope);
      await this.populateDirectory(
        scope,
        group.id === 'prod'
          ? prodEntries
          : group.id === 'dev'
            ? [
                { path: 'bin', kind: 'directory', mode: 493 },
                { path: 'state', kind: 'directory', mode: 493 },
                ...sourceEntries,
              ]
            : [],
      );
    }
    const control = await this.acquireDirectory(
      facility.coordinator.directory + '/source-stageb-constructor',
      448,
      facility.coordinator.uid,
      facility.coordinator.gid,
    );
    this.scopes.set('control', control);
    await this.populateDirectory(control, []);
    for (const environment of ['prod', 'dev'] as const) {
      const storeDirectory = await this.acquireDirectory(
        envLayout(environment).root + '/data',
        448,
        1000,
        1000,
      );
      this.scopes.set('data-' + environment, storeDirectory);
      await this.populateDirectory(storeDirectory, []);
    }
    const envelope = await this.acquireDirectory(facility.migration.envelope, 448, 1000, 1000);
    this.scopes.set('migration', envelope);
    await this.populateDirectory(
      envelope,
      staged
        .filter((member) => member.path.startsWith('migration/'))
        .map((member) => ({
          ...member,
          path: member.path.slice('migration/'.length),
          staged: member.path,
        })),
    );
    for (const row of this.policy.roster.members) {
      const member = staged.find((member) => member.path === 'authority/' + row.member);
      if (member?.bytes === undefined || member.sha256 === undefined)
        return refuseConstruction('writer staged bytes absent');
      await this.acquireFile(
        row.destination,
        member.bytes,
        member.sha256,
        row.mode,
        (offset, maximum) => readOriginalStagedChunk(this.retention, member.path, offset, maximum),
      );
    }
    const solverPaths = {
      bun: '/home/puni1/.local/lib/wbs-solver/bun',
      bundle: '/home/puni1/.local/lib/wbs-solver/solver-supervisor.js',
      configuration: '/home/puni1/.config/wbs-solver/solver-supervisor.json',
      unit: '/home/puni1/.config/systemd/user/wbs-solver-supervisor.service',
    };
    for (const [role, path] of Object.entries(solverPaths)) {
      const member = staged.find((member) => member.path === 'solver/' + role);
      if (member?.bytes === undefined || member.sha256 === undefined)
        return refuseConstruction('solver staged bytes absent');
      await this.acquireFile(
        path,
        member.bytes,
        member.sha256,
        role === 'bun' || role === 'bundle' ? 493 : role === 'unit' ? 420 : 384,
        (offset, maximum) => readOriginalStagedChunk(this.retention, member.path, offset, maximum),
      );
    }
    const runtimePin = staged.find((member) => member.path === 'solver/bun');
    if (runtimePin?.bytes === undefined || runtimePin.sha256 === undefined)
      return refuseConstruction('migration runtime pin absent');
    const runtime = await this.acquireFile(
      control.path + '/bun',
      runtimePin.bytes,
      runtimePin.sha256,
      320,
      (offset, maximum) =>
        readOriginalStagedChunk(this.retention, runtimePin.path, offset, maximum),
    );
    const worker = await this.acquireFile(
      control.path + '/migration-worker.mjs',
      this.policy.worker.byteLength,
      facility.worker.sha256,
      320,
      (offset, maximum) => Promise.resolve(this.policy.worker.subarray(offset, offset + maximum)),
    );
    for (const environment of ['prod', 'dev'] as const) {
      const job = await this.acquireDirectory(
        control.path + '/migration-' + environment,
        448,
        facility.coordinator.uid,
        facility.coordinator.gid,
      );
      this.scopes.set('job-' + environment, job);
      await this.populateDirectory(job, [
        { path: 'copy', kind: 'directory', mode: 448 },
        { path: 'sqlite', kind: 'directory', mode: 448 },
      ]);
      const store = facility.migration.databases.find((store) => store.environment === environment);
      if (store === undefined) return refuseConstruction('fixed store path absent');
      const database = await this.acquireFile(store.path, 0, digest(''), 384, () =>
        Promise.resolve(Buffer.alloc(0)),
      );
      const parent = this.scopes.get('data-' + environment);
      const root = this.scopes.get(environment);
      if (parent === undefined || root === undefined || database.resource === undefined)
        return refuseConstruction('database original retirement parents absent');
      const originalResource = database.resource;
      this.databases.set(database, {
        environment,
        root,
        parent,
        leaf: posix.basename(store.path),
        resource: database.resource,
        descriptor: { phase: 'retained' },
      });
      await this.runMigration(environment, control, job, database, runtime, worker, envelope);
      if (database.resource !== originalResource)
        return refuseConstruction('database handoff original differs');
      const handoff = await this.dispatch(database.resource, 'write');
      const original = database.identity;
      if (original.uid !== 1000n || original.gid !== 1000n) await database.file.chown(1000, 1000);
      await database.file.chmod(384);
      const changed = await database.file.stat({ bigint: true });
      sameNode(changed, original, false);
      database.identity = changed;
      await this.verifyFileIdentity(database);
      await this.observe(handoff, { uid: 1000, gid: 1000, mode: 384 });
      const capture = await this.dispatch(database.resource, 'capture');
      await this.verifyFileIdentity(database);
      await this.observe(capture, {
        ledger: digest(JSON.stringify(this.projection.migrations.migrations)),
        dormant: true,
      });
    }
  }
  private async inspectContainer(
    original: NativeContainer,
    running?: boolean,
    cleanup = false,
  ): Promise<Record<string, unknown>> {
    const rows = this.nativeArray(
      await this.runNative({ kind: 'container-inspect', original }, cleanup),
    );
    const observed = rows.at(0);
    if (rows.length !== 1 || observed === undefined)
      return refuseConstruction('single original container readback');
    requireEqual(
      [observed['Id'], observed['Created']],
      [original.id, original.created],
      'original container binding',
    );
    const snapshot = readParticipantSnapshot(observed);
    const state = readFields(observed['State']);
    if (running !== undefined && state['Running'] !== running)
      return refuseConstruction('container running state differs');
    if (original.role === 'source') {
      const member = decodeSourceDev(observed, envLayout('dev'));
      requireEqual(
        member.image,
        this.projection.request.source.pins.runtimeImageId,
        'source runtime image',
      );
      requireEqual(
        member.config['Env'],
        this.projection.configuration.sourceEnvironment,
        'source exact environment',
      );
      if (original.started !== undefined)
        requireEqual(
          sourceDevIdentity(member),
          sourceDevIdentity(decodeSourceDev(original.started, envLayout('dev'))),
          'source original continuity',
        );
    } else if (original.role === 'backend' || original.role === 'gateway') {
      const image = this.images.get(original.role);
      if (image === undefined) return refuseConstruction('original immutable product image absent');
      const selected =
        original.role === 'backend'
          ? this.projection.request.prod.backend
          : this.projection.request.prod.gateway;
      const pin = this.policy.facility.images.find((image) => image.role === original.role);
      if (pin === undefined) return refuseConstruction('product image pin absent');
      assertParticipantImage(snapshot, [image], {
        role: original.role,
        reference: selected.image,
        imageId: pin.imageId,
        sourceSha: this.projection.request.owner.sha,
        backendColor: this.projection.request.prod.backend.color,
        dataDirectory: envLayout('prod').root + '/data',
      });
      requireEqual(
        readFields(observed['Config'])['Env'],
        this.projection.configuration.productEnvironment[original.role],
        'product exact environment',
      );
    } else {
      const pin = this.policy.facility.images.find((image) => image.role === 'caddy');
      if (pin === undefined) return refuseConstruction('ingress pin absent');
      requireEqual(observed['Image'], pin.imageId, 'ingress image');
      const mounts = observed['Mounts'];
      if (!Array.isArray(mounts) || mounts.length !== 1)
        return refuseConstruction('ingress fixed mount roster');
      const mount = readFields(mounts[0]);
      requireEqual(
        [mount['Type'], mount['Source'], mount['Destination'], mount['RW']],
        ['bind', envLayout('prod').root + '/caddy', '/etc/caddy', false],
        'ingress readonly directory',
      );
      const networks = readFields(readFields(observed['NetworkSettings'])['Networks']);
      requireEqual(
        Object.keys(networks).sort(),
        [envLayout('prod').network, envLayout('dev').network].sort(),
        'ingress two networks',
      );
    }
    return observed;
  }
  private async constructDocker(): Promise<void> {
    for (const environment of ['prod', 'dev'] as const) {
      const create = await this.dispatchRequest({
        operation: 'create',
        resourceClass: 'network',
        purpose: 'transport',
      });
      try {
        const id = readIdentity(
          (await this.runNative({ kind: 'network-create', environment })).trim(),
        );
        const original: NativeNetwork = { environment, id, removed: false };
        this.networks.push(original);
        const rows = this.nativeArray(await this.runNative({ kind: 'network-inspect', original }));
        const observed = rows.at(0);
        if (rows.length !== 1 || observed === undefined)
          return refuseConstruction('network create readback');
        requireEqual(
          [observed['Id'], observed['Name'], observed['Driver'], observed['Scope']],
          [id, envLayout(environment).network, 'bridge', 'local'],
          'network create binding',
        );
        original.resource = await this.recordCreation(create, {
          identity: { kind: 'network', id },
          observationSha256: digest(JSON.stringify(observed)),
        });
        if (original.resource === undefined)
          return refuseConstruction('network original resource absent');
        const capture = await this.dispatch(original.resource, 'capture');
        const repeated = this.nativeArray(
          await this.runNative({ kind: 'network-inspect', original }),
        );
        requireEqual(repeated, rows, 'fresh network capture');
        await this.observe(capture, { id, sha256: digest(JSON.stringify(repeated)) });
      } catch (primary) {
        return await this.uncertainty(create, primary);
      }
    }
    const tagCreate = await this.dispatchRequest({
      operation: 'create',
      resourceClass: 'image-tag',
      purpose: 'source',
    });
    try {
      await this.runNative({ kind: 'tag-absence' });
      await this.runNative({ kind: 'tag-create' });
      const rows = this.nativeArray(await this.runNative({ kind: 'tag-inspect' }));
      const observed = rows.at(0);
      if (rows.length !== 1 || observed === undefined)
        return refuseConstruction('source tag readback');
      requireEqual(
        observed['Id'],
        this.projection.request.source.pins.runtimeImageId,
        'owned tag image',
      );
      const tags = observed['RepoTags'];
      if (!Array.isArray(tags) || !tags.includes(sourceDevContract(envLayout('dev')).image))
        return refuseConstruction('owned tag binding absent');
      const original: NativeTag = {
        imageId: this.projection.request.source.pins.runtimeImageId,
        removed: false,
      };
      this.tag = original;
      original.resource = await this.recordCreation(tagCreate, {
        identity: {
          kind: 'image-tag',
          tagSha256: digest(sourceDevContract(envLayout('dev')).image),
          imageId: original.imageId,
        },
        observationSha256: digest(JSON.stringify(observed)),
      });
      if (original.resource === undefined) return refuseConstruction('tag resource absent');
    } catch (primary) {
      return await this.uncertainty(tagCreate, primary);
    }
    for (const role of ['backend', 'gateway', 'source', 'caddy'] as const) {
      const create = await this.dispatchRequest({
        operation: 'create',
        resourceClass: 'container',
        purpose: role === 'source' ? 'source' : role === 'caddy' ? 'ingress' : role,
      });
      try {
        const id = readIdentity((await this.runNative({ kind: 'container-create', role })).trim());
        const pending: NativeContainer = {
          role,
          id,
          created: 'pending',
          initial: null,
          removed: false,
        };
        this.containers.push(pending);
        const rows = this.nativeArray(
          await this.runNative({ kind: 'container-inspect', original: pending }),
        );
        const observed = rows.at(0);
        if (rows.length !== 1 || observed === undefined)
          return refuseConstruction('container create acknowledgement');
        const created = observed['Created'];
        if (typeof created !== 'string' || !Number.isFinite(Date.parse(created)))
          return refuseConstruction('container creation stamp absent');
        const original: NativeContainer = { role, id, created, initial: observed, removed: false };
        this.containers[this.containers.length - 1] = original;
        this.verifyContainerObservation(original, observed, false);
        original.resource = await this.recordCreation(create, {
          identity: { kind: 'container', id, imageId: readFields(observed)['Image'] },
          observationSha256: digest(JSON.stringify(observed)),
        });
        if (original.resource === undefined)
          return refuseConstruction('container original resource absent');
        const capture = await this.dispatch(original.resource, 'capture');
        await this.inspectContainer(original, false);
        await this.observe(capture, { id });
        const start = await this.dispatch(original.resource, 'start');
        try {
          await this.runNative({ kind: 'container-start', original });
          const running = await this.inspectContainer(original, true);
          original.started = running;
          const pid = readFields(running['State'])['Pid'];
          if (typeof pid !== 'number' || pid < 1)
            return refuseConstruction('container kernel pid absent');
          original.process = await observeSolverProcess(pid);
          await this.observe(start, { id, startedSha256: digest(JSON.stringify(running)) });
        } catch (primary) {
          return await this.uncertainty(start, primary);
        }
        if (role !== 'source') {
          const runningCapture = await this.dispatch(original.resource, 'capture');
          const running = await this.inspectContainer(original, true);
          await this.observe(runningCapture, { id, sha256: digest(JSON.stringify(running)) });
        }
        if (role === 'source') {
          this.sourceOwnership = decodeSourceOwnership({
            format: 'isolated-ci-owned-source',
            version: 1,
            id,
            name: 'wbs-dev-src',
            created,
            imageId: this.projection.request.source.pins.runtimeImageId,
            reference: this.projection.request.source.runtimeReference,
            nonce: inspectSourceInputs(this.inputs).review.nonce,
            sourceSha: this.projection.request.owner.sha,
            manifestSha256: this.projection.request.source.pins.manifestSha256,
            dependencySha256: this.projection.dependencySha256,
            configurationSha256: this.projection.request.source.pins.environmentSha256,
          });
        }
      } catch (primary) {
        return await this.uncertainty(create, primary);
      }
    }
  }
  private verifyContainerObservation(
    original: NativeContainer,
    observed: Record<string, unknown>,
    running: boolean,
  ): void {
    requireEqual(
      [observed['Id'], observed['Created'], observed['Name']],
      [original.id, original.created, '/' + this.containerName(original.role)],
      'created original binding',
    );
    const state = readFields(observed['State']);
    if (state['Running'] !== running) return refuseConstruction('created lifecycle differs');
    if (original.role === 'source') decodeSourceDev(observed, envLayout('dev'));
    else readParticipantSnapshot(observed);
  }
  private async captureSetupEpoch(
    phase: 'A' | 'B' | 'C' | 'D',
    original: NativeContainer,
  ): Promise<SetupEpoch> {
    if (
      original.role !== 'source' ||
      original.resource === undefined ||
      this.sourceOwnership === undefined
    )
      return refuseConstruction('original setup source absent');
    const expected = ['A', 'B', 'C', 'D'][this.epochs.length];
    if (phase !== expected) return refuseConstruction('setup epoch order');
    const dispatch = await this.dispatch(original.resource, 'capture');
    try {
      const native = await this.inspectContainer(original, phase === 'A' || phase === 'B');
      const member = decodeSourceDev(native, envLayout('dev'));
      const running = member.state['Running'];
      const initPid = member.state['Pid'];
      if (typeof running !== 'boolean' || typeof initPid !== 'number')
        return refuseConstruction('setup kernel anchor malformed');
      const processes = await this.censusSource(running, initPid);
      const outputs = await this.collectOutputs();
      let epoch: SetupEpoch;
      if (phase === 'C') {
        if (running || initPid !== 0)
          return refuseConstruction('stopped residue source not terminal');
        const first = this.epochs.at(0);
        if (first?.phase !== 'A') return refuseConstruction('original running parents absent');
        assertSourceOutputParents(first.capture.outputParents, outputs.parents);
        epoch = {
          phase: 'C',
          source: this.sourceOwnership,
          parents: outputs.parents,
          residue: outputs.residue,
          absenceSha256: digest(
            JSON.stringify({
              processes,
              source: member.id,
              namespaces: this.sourceNamespaces,
              tables: [...this.sourceTables.keys()],
            }),
          ),
        };
      } else {
        const init = running ? processes.find((process) => process.pid === initPid) : undefined;
        if (running && init === undefined) return refuseConstruction('complete source init absent');
        if (phase === 'D' && (outputs.residue.length !== 0 || outputs.absent.length !== 6))
          return refuseConstruction('post-reset residue remains');
        const capture = decodeSourceCapture(
          {
            format: 'isolated-ci-source-capture',
            version: 1,
            source: this.sourceOwnership,
            running,
            initPid,
            initStart: init?.start ?? '0',
            namespaces: running ? this.sourceNamespaces : null,
            processes,
            outputParents: outputs.parents,
            outputs: outputs.outputs,
          },
          this.sourceOwnership,
        );
        if (capture.running !== (phase !== 'D'))
          return refuseConstruction('setup phase running separation');
        assertSourceOutputCoverage(capture, this.projection.openapiSha256);
        const first = this.epochs.at(0);
        if (first?.phase === 'A') {
          assertSourceOutputParents(first.capture.outputParents, capture.outputParents);
          if (phase === 'B') assertSourceLatch(first.capture, capture);
        }
        epoch = { phase, capture };
      }
      this.epochs.push(epoch);
      await this.observe(dispatch, { phase, sha256: this.digestSetupEpoch(epoch) });
      return epoch;
    } catch (primary) {
      return await this.uncertainty(dispatch, primary);
    }
  }
  private async collectAndResetSetup(): Promise<void> {
    const source = this.containers.find((container) => container.role === 'source');
    if (source?.resource === undefined) return refuseConstruction('owned setup source absent');
    const policy = await this.dispatch(source.resource, 'write');
    try {
      await this.runNative({ kind: 'source-policy', original: source });
      // C05's independent full readback is distinct from the later C06/A capture.
      const updated = await this.inspectContainer(source, true);
      const member = decodeSourceDev(updated, envLayout('dev'));
      requireEqual(
        member.host['RestartPolicy'],
        { Name: 'no', MaximumRetryCount: 0 },
        'source policy acknowledgement',
      );
      await this.observe(policy, {
        id: source.id,
        policySha256: digest(JSON.stringify(member.host['RestartPolicy'])),
      });
    } catch (primary) {
      return await this.uncertainty(policy, primary);
    }
    await this.captureSetupEpoch('A', source);
    await this.captureSetupEpoch('B', source);
    const stop = await this.dispatch(source.resource, 'stop-join');
    try {
      await this.runNative({ kind: 'container-stop', original: source });
      const stopped = await this.inspectContainer(source, false);
      await this.censusSource(false, 0);
      await this.observe(stop, { id: source.id, stoppedSha256: digest(JSON.stringify(stopped)) });
    } catch (primary) {
      return await this.uncertainty(stop, primary);
    }
    const stopped = await this.captureSetupEpoch('C', source);
    if (stopped.phase !== 'C') return refuseConstruction('stopped residue phase absent');
    const scope = this.scopes.get('dev');
    if (scope?.resource === undefined)
      return refuseConstruction('reset original source scope absent');
    const reset = await this.dispatch(scope.resource, 'write');
    try {
      await this.censusSource(false, 0);
      await this.verifyMembership(
        scope,
        true,
        setupOutputs.map((path) => 'src/' + path),
      );
      const fresh = await this.collectOutputs();
      requireEqual(fresh.parents, stopped.parents, 'reset original output parents');
      requireEqual(
        fresh.residue.map((member) => [
          member.relative,
          String(member.identity.dev),
          String(member.identity.ino),
          member.kind,
          member.sha256,
        ]),
        stopped.residue.map((member) => [
          member.relative,
          String(member.identity.dev),
          String(member.identity.ino),
          member.kind,
          member.sha256,
        ]),
        'reset original residue',
      );
      for (const member of [...stopped.residue].reverse()) {
        if (
          !setupOutputs.some(
            (root) => member.relative === root || member.relative.startsWith(root + '/'),
          )
        )
          return refuseConstruction('reset fixed output scope');
        const path = scope.path + '/src/' + member.relative;
        sameNode(await lstat(path, { bigint: true }), member.identity);
        if (member.kind === 'directory') await rmdir(path);
        else await unlink(path);
      }
      for (const path of setupOutputs) await this.requireAbsent(scope.path + '/src/' + path);
      await this.verifyMembership(scope);
      await this.observe(reset, { removed: stopped.residue.length });
    } catch (primary) {
      return await this.uncertainty(reset, primary);
    }
    await this.captureSetupEpoch('D', source);
  }
  private async readNamespaces(pid: number): Promise<SourceProcess['namespaces']> {
    const namespaces = { pid: '', net: '', mnt: '' };
    for (const kind of ['pid', 'net', 'mnt'] as const) {
      const link = await readlink('/proc/' + String(pid) + '/ns/' + kind);
      if (!new RegExp('^' + kind + ':\\[[1-9][0-9]*\\]$').test(link))
        return refuseConstruction('source namespace malformed');
      namespaces[kind] = link;
    }
    return namespaces;
  }
  private async readProcessStatus(pid: number) {
    const status = await readProductHostProc(
      '/proc/' + String(pid) + '/status',
      1048576,
      this.deadline,
    );
    const parse = (name: string, count?: number) => {
      const line = new RegExp('^' + name + ':\\s+([0-9\\s]+)$', 'm').exec(status)?.[1];
      if (line === undefined) return refuseConstruction('source status field absent');
      const values = line
        .trim()
        .split(/\s+/)
        .map((value) => Number(value));
      if (
        values.length < 1 ||
        (count !== undefined && values.length !== count) ||
        values.some((value) => !Number.isSafeInteger(value) || value < 0)
      )
        return refuseConstruction('source status field malformed');
      return values;
    };
    const inner = parse('NSpid');
    const innerPid = inner.at(-1);
    if (innerPid === undefined || innerPid < 1)
      return refuseConstruction('source inner pid absent');
    return { uids: parse('Uid', 4), gids: parse('Gid', 4), innerPid };
  }
  private async sourceListeners(pid: number): Promise<SourceProcess['listeners']> {
    const descriptors = await readdir('/proc/' + String(pid) + '/fd');
    if (descriptors.length > 4096) return refuseConstruction('source fd roster bound');
    const sockets = new Map<string, number[]>();
    for (const descriptor of descriptors) {
      if (!/^(0|[1-9][0-9]*)$/.test(descriptor))
        return refuseConstruction('source descriptor malformed');
      const link = await readlink('/proc/' + String(pid) + '/fd/' + descriptor);
      const inode = /^socket:\[([1-9][0-9]*)\]$/.exec(link)?.[1];
      if (inode !== undefined) {
        const found = sockets.get(inode);
        if (found === undefined) sockets.set(inode, [Number(descriptor)]);
        else found.push(Number(descriptor));
      }
    }
    const listeners: SourceProcess['listeners'][number][] = [];
    for (const [table, family] of [
      ['tcp', 'ipv4'],
      ['tcp6', 'ipv6'],
    ] as const) {
      const text = await readProductHostProc(
        '/proc/' + String(pid) + '/net/' + table,
        4194304,
        this.deadline,
      );
      const lines = text.trimEnd().split('\n');
      if (!lines[0]?.includes('local_address') || lines.length > 32769)
        return refuseConstruction('source listener table malformed');
      for (const line of lines.slice(1)) {
        const fields = line.trim().split(/\s+/);
        const endpoint = fields.at(1);
        const state = fields.at(3);
        const inode = fields.at(9);
        if (
          endpoint === undefined ||
          state === undefined ||
          inode === undefined ||
          fields.length < 10
        )
          return refuseConstruction('source listener row malformed');
        if (state !== '0A' || !sockets.has(inode)) continue;
        const match = /^([A-F0-9]+):([A-F0-9]{4})$/.exec(endpoint);
        const host = match?.[1];
        const port = match?.[2];
        if (host === undefined || port === undefined)
          return refuseConstruction('source listener endpoint malformed');
        let address: string;
        if (family === 'ipv4') {
          if (host.length !== 8) return refuseConstruction('source IPv4 malformed');
          address = Buffer.from(host, 'hex').reverse().join('.');
        } else {
          if (host.length !== 32) return refuseConstruction('source IPv6 malformed');
          let network = '';
          for (let index = 0; index < 32; index += 8)
            network += Buffer.from(host.slice(index, index + 8), 'hex')
              .reverse()
              .toString('hex');
          const groups = network.match(/.{4}/g);
          if (groups === null) return refuseConstruction('source IPv6 groups absent');
          address = new URL('http://[' + groups.join(':') + ']').hostname.slice(1, -1);
        }
        const owned = sockets.get(inode);
        if (owned === undefined) return refuseConstruction('source socket binding absent');
        for (const descriptor of owned)
          listeners.push({ family, address, port: Number.parseInt(port, 16), inode, descriptor });
      }
    }
    if (listeners.length > 64) return refuseConstruction('source listener bound');
    return listeners;
  }
  private async collectProcess(pid: number): Promise<SourceProcess> {
    const first = await observeParticipantProcess(pid, this.deadline);
    const status = await this.readProcessStatus(pid);
    const namespaces = await this.readNamespaces(pid);
    const stat = await readProductHostProc(
      '/proc/' + String(pid) + '/stat',
      1048576,
      this.deadline,
    );
    const ending = stat.lastIndexOf(') ');
    const fields = stat.slice(ending + 2).split(' ');
    const parentPid = Number(fields.at(1));
    if (ending < 1 || !Number.isSafeInteger(parentPid) || parentPid < 1)
      return refuseConstruction('source ancestry malformed');
    const parent = await readProductHostProc(
      '/proc/' + String(parentPid) + '/stat',
      1048576,
      this.deadline,
    );
    const parentEnd = parent.lastIndexOf(') ');
    const parentStart = parent
      .slice(parentEnd + 2)
      .split(' ')
      .at(19);
    if (parentEnd < 1 || parentStart === undefined || !/^[1-9][0-9]*$/.test(parentStart))
      return refuseConstruction('source parent identity malformed');
    const listeners = await this.sourceListeners(pid);
    requireEqual(
      await observeParticipantProcess(pid, this.deadline),
      first,
      'source complete process bracket',
    );
    requireEqual(await this.readNamespaces(pid), namespaces, 'source namespace bracket');
    requireEqual(await this.readProcessStatus(pid), status, 'source status bracket');
    if (first.identity.executable === null || first.identity.cwd === null)
      return refuseConstruction('source executable identity absent');
    return {
      pid,
      innerPid: status.innerPid,
      parentPid,
      parentStart,
      start: first.identity.startTime,
      uids: status.uids,
      gids: status.gids,
      cgroup: first.identity.cgroup,
      namespaces,
      argv: first.argv,
      cwd: first.identity.cwd,
      executablePath: first.executablePath,
      executable: first.identity.executable,
      listeners,
    };
  }
  private async retainSourceTables(init: SourceProcess): Promise<void> {
    if (this.sourceTables.size !== 0) {
      if (this.sourceTables.size !== 2)
        return refuseConstruction('source namespace tables incomplete');
      return;
    }
    for (const name of ['tcp', 'tcp6']) {
      const file = await open(
        '/proc/' + String(init.pid) + '/net/' + name,
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      );
      const acquired: { file: FileHandle; descriptor: number; identity?: BigIntStats } = {
        file,
        descriptor: file.fd,
      };
      this.acquiredFiles.push(acquired);
      acquired.identity = fstatSync(file.fd, { bigint: true });
      this.sourceTables.set(name, { file, descriptor: file.fd, identity: acquired.identity });
      requireEqual(
        await this.readNamespaces(init.pid),
        init.namespaces,
        'retained listener namespace',
      );
      const observed = await observeParticipantProcess(init.pid, this.deadline);
      if (observed.identity.startTime !== init.start)
        return refuseConstruction('retained listener original init changed');
    }
  }
  private async assertSourceListenersAbsent(): Promise<void> {
    if (this.sourceTables.size !== 2)
      return refuseConstruction('original listener table lifetime absent');
    for (const table of this.sourceTables.values()) {
      if (table.file.fd !== table.descriptor)
        return refuseConstruction('listener table original descriptor changed');
      sameNode(await table.file.stat({ bigint: true }), table.identity);
      const chunks: Buffer[] = [];
      const buffer = Buffer.alloc(65536);
      let offset = 0;
      for (;;) {
        const read = await table.file.read(buffer, 0, buffer.length, offset);
        if (read.bytesRead === 0) break;
        offset += read.bytesRead;
        if (offset > 4194304) return refuseConstruction('retained listener table bound');
        chunks.push(Buffer.from(buffer.subarray(0, read.bytesRead)));
        this.check();
      }
      const lines = new TextDecoder('utf-8', { fatal: true })
        .decode(Buffer.concat(chunks))
        .trimEnd()
        .split('\n');
      if (!lines[0]?.includes('local_address') || lines.length > 32769)
        return refuseConstruction('retained listener table malformed');
      for (const line of lines.slice(1)) {
        const fields = line.trim().split(/\s+/);
        if (fields.length < 10) return refuseConstruction('retained listener row malformed');
        if (fields.at(3) === '0A') return refuseConstruction('original listener remains live');
      }
      sameNode(await table.file.stat({ bigint: true }), table.identity);
    }
  }
  private async censusSource(running: boolean, initPid: number): Promise<SourceProcess[]> {
    let namespaces = this.sourceNamespaces;
    let cgroup = this.sourceCgroup;
    if (running) {
      const init = await this.collectProcess(initPid);
      await this.retainSourceTables(init);
      namespaces = init.namespaces;
      cgroup = init.cgroup;
      if (this.sourceNamespaces !== undefined)
        requireEqual(namespaces, this.sourceNamespaces, 'original source namespaces');
      this.sourceNamespaces = namespaces;
      this.sourceCgroup = cgroup;
    }
    if (namespaces === undefined || cgroup === undefined)
      return refuseConstruction('original source process scope absent');
    const names = (await readdir('/proc')).filter((name) => /^[1-9][0-9]*$/.test(name));
    if (names.length > 65536) return refuseConstruction('host process enumeration bound');
    const processes: SourceProcess[] = [];
    for (const name of names) {
      this.check();
      const pid = Number(name);
      const observed = await this.readNamespaces(pid);
      const group = (
        await readProductHostProc('/proc/' + name + '/cgroup', 1048576, this.deadline)
      ).trim();
      if (!group.startsWith('0::/') || group.includes('\n'))
        return refuseConstruction('source process cgroup unsupported');
      const inNamespace =
        observed.pid === namespaces.pid ||
        observed.net === namespaces.net ||
        observed.mnt === namespaces.mnt;
      const inGroup = group.slice(3) === cgroup || group.slice(3).startsWith(cgroup + '/');
      if (!inNamespace && !inGroup) continue;
      const process = await this.collectProcess(pid);
      requireEqual(process.namespaces, namespaces, 'source census namespace coherence');
      if (process.cgroup !== cgroup && !process.cgroup.startsWith(cgroup + '/'))
        return refuseConstruction('source census cgroup drift');
      processes.push(process);
      if (processes.length > 256) return refuseConstruction('source process census bound');
    }
    processes.sort((left, right) => left.pid - right.pid);
    if (running && !processes.some((process) => process.pid === initPid && process.innerPid === 1))
      return refuseConstruction('source init census absent');
    if (!running) {
      if (processes.length !== 0) return refuseConstruction('source process scope remains live');
      await this.assertSourceListenersAbsent();
    }
    if (running) {
      for (const process of processes) this.sourceProcesses.set(process.pid, process);
    }
    return processes;
  }
  private async collectOutputs() {
    const scope = this.scopes.get('dev');
    if (scope === undefined) return refuseConstruction('original dev scope absent');
    await this.verifyMembership(
      scope,
      true,
      setupOutputs.map((path) => 'src/' + path),
    );
    const parents: SourceOutputParent[] = [];
    for (const relative of [
      'src',
      'src/node_modules',
      'src/apps/wbs/fe-01',
      'src/apps/wbs/mcp-01/src',
    ]) {
      const original = scope.members.find((member) => member.path === relative);
      if (original?.kind !== 'directory')
        return refuseConstruction('original output parent absent');
      // Proof: parent-binding omission admitted real same-path parent replacement after the initial member walk; replaced-parent consumer RED with foreign sentinel intact, exact restoration GREEN.
      const identity = await lstat(scope.path + '/' + relative, { bigint: true });
      sameNode(identity, original.identity);
      const members = await readdir(scope.path + '/' + relative);
      if (
        members.length > 8192 ||
        members.some(
          (name) => name === '.' || name === '..' || name.includes('/') || name.includes('\0'),
        )
      )
        return refuseConstruction('output parent census bound');
      parents.push({
        path: '/src' + relative.slice(3),
        device: String(identity.dev),
        inode: String(identity.ino),
        mode: Number(identity.mode & 0o7777n),
        members: members.sort(),
      });
    }
    const residue: ResetMember[] = [];
    const absent: string[] = [];
    let bytes = 0;
    const walk = async (relative: string): Promise<void> => {
      this.check();
      const location = scope.path + '/src/' + relative;
      const identity = await lstat(location, { bigint: true });
      // Proof: output-type omission admitted actual symlink residue as raw output evidence; symlink-output consumer RED while the foreign target survived, exact restoration GREEN.
      if (
        identity.isSymbolicLink() ||
        (!identity.isDirectory() && !identity.isFile()) ||
        (identity.isFile() && identity.nlink !== 1n)
      )
        return refuseConstruction('unsupported setup output type');
      if (residue.length >= 8192) return refuseConstruction('setup output membership bound');
      let sha256: string | null = null;
      if (identity.isFile()) {
        if (identity.size > 536870912n) return refuseConstruction('setup output file bound');
        bytes += Number(identity.size);
        if (bytes > 17179869184) return refuseConstruction('setup output aggregate bound');
        const file = await open(
          location,
          constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
        );
        const acquired: { file: FileHandle; descriptor: number; identity?: BigIntStats } = {
          file,
          descriptor: file.fd,
        };
        this.acquiredFiles.push(acquired);
        acquired.identity = fstatSync(file.fd, { bigint: true });
        sameNode(acquired.identity, identity);
        const hash = createHash('sha256');
        const buffer = Buffer.alloc(65536);
        let offset = 0;
        for (;;) {
          const read = await file.read(buffer, 0, buffer.length, offset);
          if (read.bytesRead === 0) break;
          offset += read.bytesRead;
          if (offset > Number(identity.size)) return refuseConstruction('setup output grew');
          hash.update(buffer.subarray(0, read.bytesRead));
          this.check();
        }
        if (offset !== Number(identity.size)) return refuseConstruction('setup output truncated');
        sha256 = hash.digest('hex');
        sameNode(await file.stat({ bigint: true }), identity);
        sameNode(await lstat(location, { bigint: true }), identity);
        await this.closeAcquired(file, identity);
      }
      residue.push({
        relative,
        identity,
        kind: identity.isDirectory() ? 'directory' : 'file',
        sha256,
      });
      if (identity.isDirectory())
        for (const name of await readdir(location)) {
          if (name === '.' || name === '..' || name.includes('/') || name.includes('\0'))
            return refuseConstruction('setup output name');
          await walk(relative + '/' + name);
        }
    };
    for (const relative of setupOutputs) {
      try {
        await lstat(scope.path + '/src/' + relative);
      } catch (failure) {
        if (failure instanceof Error && 'code' in failure && failure.code === 'ENOENT') {
          absent.push(relative);
          continue;
        }
        throw failure;
      }
      await walk(relative);
    }
    const outputs = residue.map((member) => ({
      path: '/src/' + member.relative,
      kind: member.kind,
      mode: Number(member.identity.mode & 0o7777n),
      sha256: member.sha256,
    }));
    if (Buffer.byteLength(JSON.stringify({ parents, outputs })) > 8 * 1024 * 1024)
      return refuseConstruction('setup census representation bound');
    return { parents, residue, outputs, absent };
  }
  private async assertOriginalProcessGone(original: NativeContainer): Promise<void> {
    if (original.process === undefined) return;
    try {
      const observed = await observeSolverProcess(original.process.pid);
      if (observed.startTime === original.process.startTime)
        return refuseConstruction('original container process remains live');
    } catch (failure) {
      if (failure instanceof Error && 'code' in failure && failure.code === 'ENOENT') return;
      // The observer intentionally wraps malformed/missing procfs. Independently distinguish actual absence without converting unreadable state to absence.
      try {
        await lstat('/proc/' + String(original.process.pid));
      } catch (absence) {
        if (absence instanceof Error && 'code' in absence && absence.code === 'ENOENT') return;
        throw absence;
      }
      throw failure;
    }
  }
  private async disposeUnit(): Promise<void> {
    if (this.unitRemoved) return;
    const resource = this.unitResource;
    if (resource === undefined) {
      if (this.unitLink !== undefined || this.unitActive !== undefined)
        return refuseConstruction('unpublished unit acquisition retained');
      return;
    }
    const definition = this.files.find(
      (file) => file.path === '/home/puni1/.config/systemd/user/' + managerService && !file.removed,
    );
    if (definition?.resource === undefined)
      return refuseConstruction('unit cleanup original definition resource absent');
    let current: SourceDispatch | undefined;
    let runtimeRemoval: SourceDispatch | undefined;
    const runtime = this.scopes.get('solver-runtime');
    try {
      current = await this.dispatch(resource, 'capture');
      const before = await this.observeUnit(true);
      if (
        (this.unitActive !== undefined || this.unitStartDispatched) &&
        before.fields.get('ActiveState') === 'active'
      )
        await this.retainUnitActive(before.text);
      else if (this.unitActive !== undefined && !this.unitStopped)
        return refuseConstruction('unit stopped outside original lifecycle');
      else if (!this.unitStartDispatched) parseSolverUnit(before.text, false);
      await this.observe(current, { effectiveSha256: digest(before.text) });
      current = undefined;
      const link = this.unitLink;
      if (link !== undefined) {
        if (link.resource === undefined)
          return refuseConstruction('unpublished original link retained');
        const capture = await this.dispatch(link.resource, 'capture');
        try {
          await this.verifyUnitLink();
          await this.observe(capture, { targetSha256: digest(definition.path) });
        } catch (primary) {
          return await this.uncertainty(capture, primary);
        }
      }
      if (runtime !== undefined && !runtime.removed && this.unitActive !== undefined) {
        if (runtime.resource === undefined)
          return refuseConstruction('runtime cleanup original resource absent');
        const capture = await this.dispatch(runtime.resource, 'capture');
        await this.verifyDirectory(runtime);
        const names = await readdir(runtime.path);
        requireEqual(names, ['supervisor.sock'], 'original runtime membership');
        if (this.unitSocket === undefined)
          return refuseConstruction('original runtime socket absent');
        sameNode(await lstat(runtime.path + '/supervisor.sock', { bigint: true }), this.unitSocket);
        await this.observe(capture, { socketInode: String(this.unitSocket.ino) });
        runtimeRemoval = await this.dispatch(runtime.resource, 'remove');
      }
      current = await this.dispatch(resource, 'stop-join');
      await this.runNative({ kind: 'manager-command', operation: 'stop' }, true);
      const stopped = await this.observeUnit(true);
      if (!isStoppedSolverUnit(stopped.fields))
        return refuseConstruction('original unit stop did not settle');
      parseSolverUnit(stopped.text, false);
      if (this.unitProcess !== undefined) {
        try {
          await lstat('/proc/' + String(this.unitProcess.pid));
          const current = await this.readCensusProcess(this.unitProcess.pid);
          if (current.start === this.unitProcess.startTime)
            return refuseConstruction('original solver process remains');
        } catch (cause) {
          if (!(cause instanceof Error && 'code' in cause && cause.code === 'ENOENT')) throw cause;
        }
        const group = await observeSolverCgroup(this.unitProcess.cgroup, true);
        if (group?.populated === true)
          return refuseConstruction('original solver cgroup remains populated');
      }
      await this.requireAbsent('/run/user/1000/wbs-solver/supervisor.sock');
      this.unitStopped = true;
      if (runtimeRemoval !== undefined && runtime !== undefined) {
        await this.requireAbsent(runtime.path);
        sameNode(fstatSync(runtime.descriptor, { bigint: true }), runtime.identity);
        this.closeDirectory(runtime.acquisition);
        runtime.removed = true;
        await this.observe(runtimeRemoval, { absent: true, socketAbsent: true });
        runtimeRemoval = undefined;
      }
      await this.observe(current, {
        effectiveSha256: digest(stopped.text),
        originalProcessesGone: true,
        socketAbsent: true,
      });
      current = undefined;
      current = await this.dispatch(resource, 'remove');
      let linkRemoval: SourceDispatch | undefined;
      if (link !== undefined) {
        if (link.resource === undefined)
          return refuseConstruction('original link removal resource absent');
        await this.verifyUnitLink();
        linkRemoval = await this.dispatch(link.resource, 'remove');
      }
      const definitionRemoval = await this.dispatch(definition.resource, 'remove');
      await this.runNative({ kind: 'manager-command', operation: 'disable' }, true);
      if (link !== undefined) {
        await this.requireAbsent(link.path);
        await this.verifyNativeCustody();
        await this.verifyUnitParents();
        if (linkRemoval === undefined)
          return refuseConstruction('original link removal dispatch absent');
        await this.observe(linkRemoval, { absent: true, parentUnchanged: true });
      }
      const disabled = await this.observeUnit(true);
      parseSolverUnit(disabled.text, false);
      await this.verifyFile(definition);
      await unlink(definition.path);
      await this.requireAbsent(definition.path);
      await this.verifyClosedFile(definition);
      definition.removed = true;
      await this.runNative({ kind: 'manager-command', operation: 'daemon-reload' }, true);
      const absenceSha256 = await this.assertManagerAbsent(true);
      await this.verifyUnitParents();
      this.unitRemoved = true;
      await this.observe(definitionRemoval, { absent: true });
      await this.observe(current, {
        registrationAbsent: true,
        absenceSha256,
        originalProcessesGone: true,
        socketAbsent: true,
      });
      current = undefined;
    } catch (primary) {
      if (runtimeRemoval !== undefined)
        try {
          await this.recordUncertainty(runtimeRemoval);
        } catch (failure) {
          this.failures.push(failure);
        }
      if (current !== undefined) return await this.uncertainty(current, primary);
      throw primary;
    }
  }
  private async disposeContainers(): Promise<void> {
    const failures: unknown[] = [];
    const removals = new Map<NativeContainer, SourceDispatch>();
    for (const original of [...this.containers].reverse()) {
      if (original.removed) continue;
      const resource = original.resource;
      if (resource === undefined) {
        failures.push(Error('unpublished container native cleanup unproved'));
        continue;
      }
      let current: SourceDispatch | undefined;
      try {
        current = await this.dispatch(resource, 'capture');
        const before = await this.inspectContainer(original, undefined, true);
        await this.observe(current, { id: original.id, sha256: digest(JSON.stringify(before)) });
      } catch (primary) {
        failures.push(primary);
        if (current !== undefined)
          try {
            await this.recordUncertainty(current);
          } catch (failure) {
            failures.push(failure);
          }
      }
      current = undefined;
      try {
        current = await this.dispatch(resource, 'stop-join');
        try {
          await this.runNative({ kind: 'container-stop', original }, true);
        } catch (primary) {
          failures.push(primary);
        }
        const stopped = await this.inspectContainer(original, false, true);
        if (readFields(stopped['State'])['Pid'] !== 0)
          return refuseConstruction('stopped container pid remains');
        await this.assertOriginalProcessGone(original);
        if (original.role === 'source') await this.censusSource(false, 0);
        await this.observe(current, {
          id: original.id,
          stoppedSha256: digest(JSON.stringify(stopped)),
        });
        current = undefined;
        current = await this.dispatch(resource, 'remove');
        removals.set(original, current);
        await this.runNative({ kind: 'container-remove', original }, true);
      } catch (primary) {
        failures.push(primary);
        if (current !== undefined)
          try {
            await this.recordUncertainty(current);
          } catch (failure) {
            failures.push(failure);
          }
      }
    }
    if (removals.size !== 0) {
      try {
        const text = await this.runNative({ kind: 'container-absence' }, true);
        const rows =
          text.trim() === ''
            ? []
            : text
                .trimEnd()
                .split('\n')
                .map((line) => readFields(JSON.parse(line)));
        if (rows.length > 256) return refuseConstruction('container absence roster bound');
        for (const [original, dispatch] of removals) {
          if (this.settledDispatches.has(dispatch)) continue;
          if (
            rows.some(
              (row) =>
                row['ID'] === original.id || row['Names'] === this.containerName(original.role),
            )
          ) {
            await this.recordUncertainty(dispatch);
            failures.push(Error('original container absence unproved'));
          } else {
            await this.observe(dispatch, { id: original.id, absent: true });
            original.removed = true;
          }
        }
      } catch (primary) {
        failures.push(primary);
        for (const dispatch of removals.values())
          try {
            await this.recordUncertainty(dispatch);
          } catch (failure) {
            failures.push(failure);
          }
      }
    }
    if (failures.length !== 0)
      throw new AggregateError(failures, 'source original container cleanup unproved');
  }
  private async disposeNetworksAndTag(): Promise<void> {
    const failures: unknown[] = [];
    const networkRemovals = new Map<NativeNetwork, SourceDispatch>();
    for (const original of [...this.networks].reverse()) {
      if (original.removed) continue;
      const resource = original.resource;
      if (resource === undefined) {
        failures.push(Error('unpublished network cleanup unproved'));
        continue;
      }
      let current: SourceDispatch | undefined;
      try {
        current = await this.dispatch(resource, 'capture');
        const rows = this.nativeArray(
          await this.runNative({ kind: 'network-inspect', original }, true),
        );
        const network = rows.at(0);
        if (rows.length !== 1 || network === undefined)
          return refuseConstruction('original network readback absent');
        requireEqual(
          [network['Id'], network['Name']],
          [original.id, envLayout(original.environment).network],
          'network cleanup original identity',
        );
        if (Object.keys(readFields(network['Containers'])).length !== 0)
          return refuseConstruction('network users remain');
        await this.observe(current, { id: original.id });
        current = undefined;
        current = await this.dispatch(resource, 'remove');
        networkRemovals.set(original, current);
        await this.runNative({ kind: 'network-remove', original }, true);
      } catch (primary) {
        failures.push(primary);
        if (current !== undefined)
          try {
            await this.recordUncertainty(current);
          } catch (failure) {
            failures.push(failure);
          }
      }
    }
    if (networkRemovals.size !== 0) {
      try {
        const text = await this.runNative({ kind: 'network-absence' }, true);
        const rows =
          text.trim() === ''
            ? []
            : text
                .trimEnd()
                .split('\n')
                .map((line) => readFields(JSON.parse(line)));
        if (rows.length > 256) return refuseConstruction('network absence roster bound');
        for (const [original, dispatch] of networkRemovals) {
          if (this.settledDispatches.has(dispatch)) continue;
          if (
            rows.some(
              (row) =>
                row['ID'] === original.id ||
                row['Name'] === envLayout(original.environment).network,
            )
          ) {
            await this.recordUncertainty(dispatch);
            failures.push(Error('network absence unproved'));
          } else {
            await this.observe(dispatch, { id: original.id, absent: true });
            original.removed = true;
          }
        }
      } catch (primary) {
        failures.push(primary);
        for (const dispatch of networkRemovals.values())
          try {
            await this.recordUncertainty(dispatch);
          } catch (failure) {
            failures.push(failure);
          }
      }
    }
    const tag = this.tag;
    if (tag !== undefined && !tag.removed) {
      if (tag.resource === undefined) failures.push(Error('unpublished tag cleanup unproved'));
      else {
        let current: SourceDispatch | undefined;
        try {
          current = await this.dispatch(tag.resource, 'capture');
          const rows = this.nativeArray(await this.runNative({ kind: 'tag-inspect' }, true));
          const image = rows.at(0);
          if (rows.length !== 1 || image === undefined)
            return refuseConstruction('original tag cleanup readback');
          requireEqual(image['Id'], tag.imageId, 'original tag cleanup image');
          await this.observe(current, { imageId: tag.imageId });
          current = undefined;
          current = await this.dispatch(tag.resource, 'remove');
          await this.runNative({ kind: 'tag-remove' }, true);
          const absent = this.nativeArray(
            await this.runNative({ kind: 'image-inspect', role: 'source' }, true),
          );
          const borrowed = absent.at(0);
          if (absent.length !== 1 || borrowed?.['Id'] !== tag.imageId)
            return refuseConstruction('borrowed image preservation');
          const tags = borrowed['RepoTags'];
          if (!Array.isArray(tags) || tags.includes(sourceDevContract(envLayout('dev')).image))
            return refuseConstruction('owned tag absence unproved');
          await this.observe(current, { imageId: tag.imageId, tagAbsent: true });
          tag.removed = true;
        } catch (primary) {
          failures.push(primary);
          if (current !== undefined)
            try {
              await this.recordUncertainty(current);
            } catch (failure) {
              failures.push(failure);
            }
        }
      }
    }
    if (failures.length !== 0)
      throw new AggregateError(failures, 'source native original cleanup unproved');
  }
  async retainReadOnlyExecution(installed: InstalledFile): Promise<void> {
    await this.verifyFile(installed);
    const info = await readFile('/proc/self/fdinfo/' + String(installed.descriptor), 'utf8');
    const flags = /^flags:\s+([0-7]+)$/m.exec(info)?.[1];
    if (flags === undefined) return refuseConstruction('execution reference flags absent');
    if ((Number.parseInt(flags, 8) & 3) === constants.O_RDONLY) return;
    const file = await open(
      installed.path,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    const acquired: { file: FileHandle; descriptor: number; identity?: BigIntStats } = {
      file,
      descriptor: file.fd,
    };
    this.acquiredFiles.push(acquired);
    acquired.identity = fstatSync(file.fd, { bigint: true });
    sameNode(acquired.identity, installed.identity);
    sameNode(await lstat(installed.path, { bigint: true }), installed.identity);
    if (installed.file.fd !== installed.descriptor)
      return refuseConstruction('execution writer reference changed');
    sameNode(fstatSync(installed.file.fd, { bigint: true }), installed.identity);
    await this.closeAcquired(installed.file, installed.identity);
    installed.file = file;
    installed.descriptor = file.fd;
    await this.verifyFile(installed);
  }
  async runMigration(
    environment: 'prod' | 'dev',
    control: DirectoryScope,
    job: DirectoryScope,
    database: InstalledFile,
    runtime: InstalledFile,
    worker: InstalledFile,
    envelope: DirectoryScope,
  ): Promise<void> {
    await this.checkArchive();
    await this.captureBeforeUse(runtime);
    await this.captureBeforeUse(worker);
    await this.verifyDirectory(control);
    await this.verifyDirectory(job);
    await this.retainReadOnlyExecution(runtime);
    await this.retainReadOnlyExecution(worker);
    await this.verifyFileIdentity(database);
    if (
      !this.directories.includes(control) ||
      !this.directories.includes(job) ||
      !this.directories.includes(envelope) ||
      !this.files.includes(database) ||
      !this.files.includes(runtime) ||
      !this.files.includes(worker) ||
      job.path !== control.path + '/migration-' + environment ||
      runtime.path !== control.path + '/bun' ||
      worker.path !== control.path + '/migration-worker.mjs'
    )
      return refuseConstruction('migration original scope');
    await this.verifyDirectory(envelope);
    for (const suffix of ['-wal', '-shm', '-journal'])
      await this.requireAbsent(database.path + suffix);
    if (database.resource === undefined || job.resource === undefined)
      return refuseConstruction('migration original resource absent');
    if (++this.forwardHelpers > 129) return refuseConstruction('forward helper envelope');
    const create = await this.dispatchRequest({
      operation: 'create',
      resourceClass: 'helper',
      purpose: 'runtime',
    });
    let child: ChildProcessWithoutNullStreams | undefined;
    let nativeSettlement: NativeSettlement | undefined;
    let helper: RecordedResource | undefined;
    let start: SourceDispatch | undefined;
    let dbWrite: SourceDispatch | undefined;
    let jobWrite: SourceDispatch | undefined;
    let joined: Promise<{ code: number | null; signal: NodeJS.Signals | null }> | undefined;
    let stdout: Promise<Buffer> | undefined;
    let stderr: Promise<Buffer> | undefined;
    let actualIdentity: Awaited<ReturnType<SourceFixtureConstruction['observeChild']>> | undefined;
    const permission: { hasReceivedFrame: boolean; isReadyVerified: boolean } = {
      hasReceivedFrame: false,
      isReadyVerified: false,
    };
    let isPermissionStarted = false;
    let primary: unknown;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      this.check();
      child = spawn(runtime.path, ['--no-env-file', 'run', worker.path, environment], {
        cwd: job.path,
        env: {
          WBS_ENV: environment,
          TMPDIR: job.path + '/copy',
          SQLITE_TMPDIR: job.path + '/sqlite',
          BUN_RUNTIME_TRANSPILER_CACHE_PATH: '0',
          LANG: 'C.UTF-8',
          TZ: 'UTC',
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      nativeSettlement = this.trackNativeChild(child, 'migration', false, [
        runtime.path,
        '--no-env-file',
        'run',
        worker.path,
        environment,
      ]);
      const owned = child;
      joined = nativeSettlement.closed;
      let readyResolve: (frame: SourceMigrationFrame) => void = () =>
        refuseConstruction('ready continuation absent');
      let readyReject: (failure: unknown) => void = () =>
        refuseConstruction('ready rejection absent');
      const ready = new Promise<SourceMigrationFrame>((resolve, reject) => {
        readyResolve = resolve;
        readyReject = reject;
      });
      const drain = async (
        stream: Readable,
        maximum: number,
        controlStream = false,
      ): Promise<Buffer> => {
        let bytes = Buffer.alloc(0);
        try {
          for await (const chunk of stream) {
            bytes = Buffer.concat([bytes, Buffer.from(chunk)]);
            if (bytes.length > maximum) return refuseConstruction('migration stream bound');
            if (controlStream && !permission.hasReceivedFrame && bytes.length >= 4) {
              const length = bytes.readUInt32BE();
              if (length < 1 || length > 1024)
                return refuseConstruction('migration ready frame bound');
              if (bytes.length >= length + 4) {
                const frame = decodeSourceMigrationFrames(bytes.subarray(0, length + 4)).at(0);
                if (frame === undefined) return refuseConstruction('migration ready absent');
                permission.hasReceivedFrame = true;
                readyResolve(frame);
              }
            }
          }
          if (controlStream && !permission.hasReceivedFrame)
            return refuseConstruction('migration ready EOF');
          return bytes;
        } catch (failure) {
          if (controlStream && !permission.hasReceivedFrame) readyReject(failure);
          throw failure;
        }
      };
      stdout = drain(owned.stdout, 2056, true);
      stderr = drain(owned.stderr, 8192);
      nativeSettlement.stdout = stdout;
      nativeSettlement.stderr = stderr;
      const streamFailure = Promise.all([stdout, stderr]).then(() => undefined);
      void streamFailure.catch(() => undefined);
      let cutoffFailure: Error | undefined;
      let expire: (failure: Error) => void = () => refuseConstruction('cutoff rejection absent');
      const expired = new Promise<never>((resolve, reject) => {
        expire = reject;
      });
      void expired.catch(() => undefined);
      owned.stdin.on('error', (failure) => {
        readyReject(failure);
      });
      owned.once('error', (failure) => {
        readyReject(failure);
      });
      timer = setTimeout(
        () => {
          cutoffFailure = Error('source migration parent cutoff');
          expire(cutoffFailure);
          readyReject(cutoffFailure);
        },
        Math.max(1, this.deadline - performance.now()),
      );
      const first = await Promise.race([ready, expired]);
      requireEqual(
        first,
        { version: 1, nonce: this.policy.facility.nonce, environment, phase: 'ready' },
        'migration readiness',
      );
      permission.isReadyVerified = true;
      actualIdentity = await this.observeChild(owned, runtime);
      nativeSettlement.liveIdentity = actualIdentity;
      requireEqual(
        await readlink('/proc/' + String(actualIdentity.pid) + '/cwd'),
        job.path,
        'migration cwd',
      );
      const command = await readFile('/proc/' + String(actualIdentity.pid) + '/cmdline');
      requireEqual(
        command.toString().split('\0').filter(Boolean),
        [runtime.path, '--no-env-file', 'run', worker.path, environment],
        'migration argv',
      );
      helper = await this.recordCreation(create, {
        identity: actualIdentity,
        observationSha256: digest(JSON.stringify(actualIdentity)),
      });
      if (helper === undefined) return refuseConstruction('migration helper resource absent');
      start = await this.dispatch(helper, 'start');
      dbWrite = await this.dispatch(database.resource, 'write');
      jobWrite = await this.dispatch(job.resource, 'write');
      await this.checkArchive();
      await this.verifyFileIdentity(database);
      await this.verifyFile(runtime);
      await this.verifyFile(worker);
      const inspection = inspectSourceInputs(this.inputs);
      const remainingMs = Math.floor(Math.min(120000, this.deadline - performance.now()));
      if (remainingMs < 1) return refuseConstruction('migration grant cutoff');
      const permit = encodeSourceMigrationFrame({
        version: 1,
        nonce: inspection.review.nonce,
        environment,
        phase: 'migrate',
        sourceSha: inspection.review.sourceSha,
        workflowSha: inspection.review.workflowSha,
        inputManifestSha256: inspection.review.inputManifestSha256,
        migrationManifestSha256: this.policy.facility.migration.manifestSha256,
        remainingMs,
        notAfter: inspection.review.notAfter,
      });
      isPermissionStarted = true;
      await new Promise<void>((resolve, reject) =>
        owned.stdin.end(permit, (failure?: Error | null) => {
          if (failure === undefined || failure === null) resolve();
          else reject(failure);
        }),
      );
      const [status, output, errors] = await Promise.race([
        Promise.all([joined, stdout, stderr]),
        expired,
      ]);
      if (
        status.code !== 0 ||
        status.signal !== null ||
        errors.length !== 0 ||
        cutoffFailure !== undefined
      )
        return refuseConstruction('migration child settlement');
      requireEqual(
        decodeSourceMigrationFrames(output),
        [
          first,
          {
            version: 1,
            nonce: inspection.review.nonce,
            environment,
            phase: 'complete',
            migrationManifestSha256: this.policy.facility.migration.manifestSha256,
          },
        ],
        'migration terminal protocol',
      );
      this.check();
      await this.verifyFileIdentity(database);
      const capture = this.captureDatabaseLedger(database, environment, envelope);
      requireEqual(capture.pending, [], 'migration pending ledger');
      requireEqual(
        capture.applied,
        this.projection.migrations.migrations.map((row) => ({
          name: row.name,
          hash: row.migration.sha256,
        })),
        'migration complete ledger',
      );
      this.inspectDormantDatabase(database);
      await this.retainDatabaseSidecars(database);
      for (const leaf of ['copy', 'sqlite'])
        if ((await readdir(job.path + '/' + leaf)).length !== 0)
          return refuseConstruction('migration scratch residue');
      const identity = await database.file.stat({ bigint: true });
      sameNode(identity, database.identity);
      database.identity = identity;
      database.bytes = Number(identity.size);
      const bytes = await readFile(database.path);
      database.sha256 = digest(bytes);
      database.isDatabase = true;
      await this.verifyFile(database);
      await this.observe(dbWrite, { ledgerSha256: digest(JSON.stringify(capture)), dormant: true });
      dbWrite = undefined;
      await this.observe(jobWrite, { scratchEmpty: true });
      jobWrite = undefined;
      await this.observe(start, { settled: true, outputSha256: digest(output) });
      start = undefined;
      const removal = await this.dispatch(helper, 'remove');
      await this.observe(removal, { joined: true, pipesClosed: true });
      this.check();
    } catch (cause) {
      primary = cause;
      for (const pending of [start, dbWrite, jobWrite])
        if (pending !== undefined)
          try {
            await this.recordUncertainty(pending);
          } catch (failure) {
            this.failures.push(failure);
          }
      if (helper === undefined)
        try {
          await this.recordUncertainty(create);
        } catch (failure) {
          this.failures.push(failure);
        }
      if (child !== undefined) {
        const owned = child;
        try {
          if (
            !permission.hasReceivedFrame &&
            !isPermissionStarted &&
            !owned.stdin.writableEnded &&
            !owned.stdin.destroyed
          )
            owned.stdin.end();
          // Proof: persistent raw proc-status failure left the actual Ready worker and all pipes live; actual parent permission-pipe consumer RED, original EOF settlement GREEN.
          if (permission.isReadyVerified && !isPermissionStarted) {
            let stop: SourceDispatch | undefined;
            if (helper !== undefined)
              try {
                stop = await this.dispatch(helper, 'stop-join');
              } catch (failure) {
                this.failures.push(failure);
              }
            if (!owned.stdin.writableEnded && !owned.stdin.destroyed) owned.stdin.end();
            if (nativeSettlement === undefined)
              return refuseConstruction('before-grant original join absent');
            await this.joinNativeChild(nativeSettlement);
            if (stop !== undefined)
              await this.observe(stop, {
                joined: true,
                pipesClosed: true,
                permissionWithheld: true,
              });
          } else if (owned.exitCode === null && owned.signalCode === null) {
            const current = await this.observeChild(owned, runtime);
            if (nativeSettlement !== undefined) nativeSettlement.liveIdentity = current;
            if (actualIdentity !== undefined)
              requireEqual(current, actualIdentity, 'migration original stop identity');
            let stop: SourceDispatch | undefined;
            if (helper !== undefined)
              try {
                stop = await this.dispatch(helper, 'stop-join');
              } catch (failure) {
                this.failures.push(failure);
              }
            if (!owned.kill('SIGKILL')) return refuseConstruction('migration original stop failed');
            if (nativeSettlement === undefined) return refuseConstruction('migration join absent');
            await this.joinNativeChild(nativeSettlement);
            if (stop !== undefined) await this.observe(stop, { joined: true });
          } else {
            if (nativeSettlement === undefined) return refuseConstruction('migration join absent');
            await this.joinNativeChild(nativeSettlement);
          }
          if (helper !== undefined) {
            const removal = await this.dispatch(helper, 'remove');
            await this.observe(removal, { joined: true });
          }
        } catch (failure) {
          this.failures.push(failure);
        }
      }
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      if (nativeSettlement !== undefined) await this.settleNativeChild(nativeSettlement);
    }
    if (primary !== undefined)
      throw new AggregateError([primary, ...this.failures], 'source migration failed', {
        cause: primary,
      });
  }
  async retainDatabaseSidecars(database: InstalledFile): Promise<void> {
    if (!this.files.includes(database) || database.resource === undefined)
      return refuseConstruction('database original scope absent');
    const observed: { path: string; identity: BigIntStats }[] = [];
    for (const suffix of ['-wal', '-shm', '-journal']) {
      const path = database.path + suffix;
      let identity: BigIntStats;
      try {
        identity = await lstat(path, { bigint: true });
      } catch (failure) {
        if (failure instanceof Error && 'code' in failure && failure.code === 'ENOENT') continue;
        throw failure;
      }
      if (
        !identity.isFile() ||
        identity.nlink !== 1n ||
        identity.size > 268435456n ||
        identity.uid !== database.identity.uid ||
        identity.gid !== database.identity.gid
      )
        return refuseConstruction('database sidecar scope');
      const file = await open(
        path,
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      );
      const acquired: { file: FileHandle; descriptor: number; identity?: BigIntStats } = {
        file,
        descriptor: file.fd,
      };
      this.acquiredFiles.push(acquired);
      acquired.identity = fstatSync(file.fd, { bigint: true });
      sameNode(acquired.identity, identity);
      sameNode(await lstat(path, { bigint: true }), identity);
      await this.closeAcquired(file, identity);
      observed.push({ path, identity });
    }
    if (database.sidecars !== undefined)
      requireEqual(
        observed.map((sidecar) => [
          sidecar.path,
          String(sidecar.identity.dev),
          String(sidecar.identity.ino),
        ]),
        database.sidecars.map((sidecar) => [
          sidecar.path,
          String(sidecar.identity.dev),
          String(sidecar.identity.ino),
        ]),
        'database original sidecars',
      );
    database.sidecars = observed;
  }
  private hasUnsettledDatabaseReaders(): boolean {
    return this.databaseReaders.size !== 0 || this.hasUnsettledLedgerRead;
  }
  private captureDatabaseLedger(
    database: InstalledFile,
    environment: 'prod' | 'dev',
    envelope: DirectoryScope,
  ) {
    if (this.hasUnsettledLedgerRead)
      return refuseConstruction('prior database ledger reader settlement unproved');
    this.hasUnsettledLedgerRead = true;
    const capture = captureAppliedMigrationSet(database.path, envelope.path + '/drizzle', {
      target: environment,
      attempt: this.policy.facility.nonce,
      candidate: this.projection.request.owner.sha,
    });
    this.hasUnsettledLedgerRead = false;
    return capture;
  }
  private inspectDormantDatabase(database: InstalledFile): void {
    const connection = new Database(database.path, { readonly: true, create: false });
    this.databaseReaders.add(connection);
    try {
      inspectDormantDependencies(connection);
    } finally {
      connection.close();
      this.databaseReaders.delete(connection);
    }
  }
  private async verifyDatabaseParents(original: DatabaseLifetime): Promise<string> {
    if (
      this.scopes.get(original.environment) !== original.root ||
      this.scopes.get('data-' + original.environment) !== original.parent ||
      original.parent.path !== original.root.path + '/data' ||
      !/^[A-Za-z0-9_.-]+$/.test(original.leaf)
    )
      return refuseConstruction('database original parent relation');
    await this.verifyDirectory(original.root);
    await this.verifyDirectory(original.parent);
    sameNode(
      await lstat('/proc/self/fd/' + String(original.root.descriptor) + '/data', { bigint: true }),
      original.parent.identity,
    );
    return '/proc/self/fd/' + String(original.parent.descriptor) + '/' + original.leaf;
  }
  /** Retires only original DB references after the last construction readback, under exclusive original parent custody. */
  private async retireDatabases(): Promise<void> {
    this.check();
    if (
      this.databases.size !== 2 ||
      this.pendingDispatches.size !== 0 ||
      this.hasUnsettledNativeChildren() ||
      this.hasUnsettledDatabaseReaders() ||
      this.nativeObservationFds !== 0
    )
      return refuseConstruction('database retirement internal settlement');
    const envelope = this.scopes.get('migration');
    if (envelope === undefined) return refuseConstruction('database original envelope absent');
    await this.verifyDirectory(envelope);
    for (const [database, original] of this.databases) {
      if (
        !this.files.includes(database) ||
        database.resource !== original.resource ||
        database.isDatabase !== true ||
        database.removed ||
        original.descriptor.phase !== 'retained' ||
        database.path !== original.parent.path + '/' + original.leaf
      )
        return refuseConstruction('database original retirement membership');
      const bound = await this.verifyDatabaseParents(original);
      await this.verifyFile(database);
      const capture = this.captureDatabaseLedger(database, original.environment, envelope);
      requireEqual(capture.pending, [], 'database retirement pending ledger');
      requireEqual(
        capture.applied,
        this.projection.migrations.migrations.map((row) => ({
          name: row.name,
          hash: row.migration.sha256,
        })),
        'database retirement original ledger',
      );
      this.inspectDormantDatabase(database);
      await this.retainDatabaseSidecars(database);
      await this.verifyFile(database);
      sameNode(await lstat(bound, { bigint: true }), database.identity);
      await this.verifyDatabaseParents(original);
      const family = [
        database.identity,
        ...(database.sidecars ?? []).map((sidecar) => sidecar.identity),
      ];
      for (const acquired of this.acquiredFiles) {
        if (acquired.file === database.file || acquired.file.fd < 0) continue;
        const observed = fstatSync(acquired.file.fd, { bigint: true });
        if (
          family.some((identity) => observed.dev === identity.dev && observed.ino === identity.ino)
        )
          return refuseConstruction('additional constructor database family reference');
      }
      original.descriptor = { phase: 'retiring' };
      try {
        await this.closeAcquired(database.file, database.identity);
        if (database.file.fd !== -1)
          return refuseConstruction('database original descriptor close unproved');
        original.descriptor = { phase: 'retired' };
      } catch (failure) {
        original.descriptor = { phase: 'close-failed', failure };
        throw failure;
      }
    }
    if (
      [...this.databases].some(
        ([database, original]) =>
          original.descriptor.phase !== 'retired' || database.file.fd !== -1,
      ) ||
      this.hasUnsettledDatabaseReaders()
    )
      return refuseConstruction('database retirement incomplete');
    this.check();
  }
  private async removeDatabaseSidecars(
    database: InstalledFile,
    original: DatabaseLifetime,
  ): Promise<void> {
    const bound = await this.verifyDatabaseParents(original);
    const surviving: { path: string; identity: BigIntStats }[] = [];
    for (const suffix of ['-wal', '-shm', '-journal']) {
      let current: BigIntStats;
      try {
        current = await lstat(bound + suffix, { bigint: true });
      } catch (failure) {
        if (failure instanceof Error && 'code' in failure && failure.code === 'ENOENT') continue;
        throw failure;
      }
      const retained = database.sidecars?.find(
        (sidecar) => sidecar.path === database.path + suffix,
      );
      if (retained === undefined) return refuseConstruction('unowned database sidecar retained');
      sameNode(current, retained.identity);
      if (!current.isFile() || current.nlink !== 1n)
        return refuseConstruction('original database sidecar type or links');
      surviving.push({ path: bound + suffix, identity: retained.identity });
    }
    for (const sidecar of surviving) {
      await this.verifyDatabaseParents(original);
      sameNode(await lstat(sidecar.path, { bigint: true }), sidecar.identity);
      await unlink(sidecar.path);
      await this.requireAbsent(sidecar.path);
    }
  }
  /** Borrows a retired main file only inside its original pending F05 removal; construction hashes remain historical. */
  private async removeRetiredDatabase(
    database: InstalledFile,
    original: DatabaseLifetime,
  ): Promise<void> {
    if (
      this.databases.get(database) !== original ||
      database.resource !== original.resource ||
      original.descriptor.phase !== 'retired' ||
      database.file.fd !== -1 ||
      database.path !== original.parent.path + '/' + original.leaf ||
      this.hasUnsettledDatabaseReaders()
    )
      return refuseConstruction('retired database cleanup original relation');
    this.assertNativeDeadline();
    const bound = await this.verifyDatabaseParents(original);
    const file = await open(
      bound,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    const acquired: { file: FileHandle; descriptor: number; identity?: BigIntStats } = {
      file,
      descriptor: file.fd,
    };
    this.acquiredFiles.push(acquired);
    let primary: unknown;
    try {
      const opened = fstatSync(acquired.descriptor, { bigint: true });
      acquired.identity = opened;
      sameNode(opened, database.identity);
      if (!opened.isFile() || opened.nlink !== 1n)
        return refuseConstruction('retired database cleanup type or links');
      sameNode(await lstat(bound, { bigint: true }), database.identity);
      sameNode(await lstat(database.path, { bigint: true }), database.identity);
      await this.removeDatabaseSidecars(database, original);
      await this.verifyDatabaseParents(original);
      const before = await file.stat({ bigint: true });
      sameNode(before, database.identity);
      if (before.nlink !== 1n) return refuseConstruction('retired database cleanup link drift');
      sameNode(await lstat(bound, { bigint: true }), database.identity);
      await unlink(bound);
      await this.requireAbsent(bound);
      await this.requireAbsent(database.path);
      const after = await file.stat({ bigint: true });
      sameNode(after, database.identity);
      if (after.nlink !== 0n) return refuseConstruction('retired database cleanup alias remains');
      await this.verifyDatabaseParents(original);
    } catch (failure) {
      primary = failure;
    }
    try {
      await this.closeAcquired(file, acquired.identity ?? database.identity);
      if (file.fd !== -1) return refuseConstruction('retired database borrowed close unproved');
    } catch (secondary) {
      if (primary !== undefined)
        throw combineConstructionErrors(
          primary,
          secondary,
          'database cleanup and borrowed close failed',
        );
      throw secondary;
    }
    if (primary !== undefined) throw normalizeConstructionFailure(primary);
  }
  close(): Promise<void> {
    if (this.closing !== undefined) return this.closing;
    this.closing = this.dispose();
    return this.closing;
  }
  private async dispose(): Promise<void> {
    const failures: unknown[] = [];
    for (const original of this.nativeSettlements.values()) await this.settleNativeChild(original);
    if (this.hasUnsettledNativeChildren())
      throw new AggregateError(
        [...this.failures],
        'source original child or pipe settlement unproved',
      );
    // Proof: real mode000/EACCES after mkdir left the original inode present while close resolved; actual directory open failure RED, retained unpublished-acquisition refusal GREEN.
    for (const path of this.unpublishedDirectories)
      failures.push(
        Error('source construction unpublished directory acquisition retained: ' + path),
      );
    for (const pending of this.pendingDispatches)
      try {
        await this.recordUncertainty(pending);
      } catch (failure) {
        failures.push(failure);
      }
    try {
      await this.disposeContainers();
    } catch (failure) {
      failures.push(failure);
    }
    try {
      await this.disposeUnit();
    } catch (failure) {
      failures.push(failure);
    }
    if (this.unitResource !== undefined && !this.unitRemoved)
      throw new AggregateError(
        [...failures, ...this.failures],
        'original solver lifecycle remains; dependent filesystem retained',
      );
    if (this.containers.some((container) => !container.removed))
      throw new AggregateError(
        [...failures, ...this.failures],
        'source native users remain; dependent filesystem retained',
      );
    if (this.hasUnsettledNativeChildren())
      throw new AggregateError(
        [...failures, ...this.failures],
        'source native child settlement unproved',
      );
    if (this.hasUnsettledDatabaseReaders())
      throw new AggregateError(
        [...failures, ...this.failures],
        'database reader settlement unproved',
      );
    for (const original of this.databases.values())
      if (original.descriptor.phase === 'close-failed') failures.push(original.descriptor.failure);
    for (const installed of [...this.files].reverse()) {
      if (installed.removed) continue;
      try {
        const database = this.databases.get(installed);
        if (database !== undefined && database.descriptor.phase !== 'retained') {
          if (database.descriptor.phase !== 'retired')
            return refuseConstruction('database descriptor settlement unproved');
          await this.verifyDatabaseParents(database);
          const removal = await this.dispatch(database.resource, 'remove');
          try {
            await this.removeRetiredDatabase(installed, database);
            installed.removed = true;
            await this.observe(removal, { absent: true, borrowedReferenceClosed: true });
          } catch (primary) {
            await this.uncertainty(removal, primary);
          }
          continue;
        }
        await this.verifyFileIdentity(installed);
        const resource = installed.resource;
        if (resource === undefined)
          return refuseConstruction(
            'unpublished file cleanup requires original acquisition settlement',
          );
        const removal = await this.dispatch(resource, 'remove');
        try {
          for (const sidecar of installed.sidecars ?? []) {
            sameNode(await lstat(sidecar.path, { bigint: true }), sidecar.identity);
            await unlink(sidecar.path);
            await this.requireAbsent(sidecar.path);
          }
          await unlink(installed.path);
          await this.requireAbsent(installed.path);
          await this.verifyClosedFile(installed);
          installed.removed = true;
          await this.observe(removal, { absent: true });
        } catch (primary) {
          await this.uncertainty(removal, primary);
        }
      } catch (failure) {
        failures.push(failure);
      }
    }
    try {
      await this.disposeNetworksAndTag();
    } catch (failure) {
      failures.push(failure);
    }
    for (const scope of [...this.directories].reverse()) {
      if (scope.removed) continue;
      try {
        await this.verifyMembership(scope, false);
        const resource = scope.resource;
        if (resource === undefined)
          return refuseConstruction(
            'unpublished directory cleanup requires original acquisition settlement',
          );
        const capture = await this.dispatch(resource, 'capture');
        await this.observe(capture, { members: scope.members.length });
        const removal = await this.dispatch(resource, 'remove');
        try {
          for (const member of [...scope.members].reverse()) {
            const location = scope.path + '/' + member.path;
            sameNode(await lstat(location, { bigint: true }), member.identity);
            if (member.kind === 'directory') await rmdir(location);
            else await unlink(location);
          }
          if ((await readdir(scope.path)).length !== 0)
            return refuseConstruction('directory cleanup residue');
          sameNode(fstatSync(scope.descriptor, { bigint: true }), scope.identity);
          sameNode(await lstat(scope.path, { bigint: true }), scope.identity);
          await rmdir(scope.path);
          sameNode(fstatSync(scope.descriptor, { bigint: true }), scope.identity);
          this.closeDirectory(scope.acquisition);
          scope.removed = true;
          await this.requireAbsent(scope.path);
          await this.observe(removal, { absent: true });
        } catch (primary) {
          await this.uncertainty(removal, primary);
        }
      } catch (failure) {
        failures.push(failure);
      }
    }
    for (const acquired of this.acquiredFiles) {
      if (acquired.file.fd < 0) continue;
      try {
        if (acquired.file.fd !== acquired.descriptor || acquired.identity === undefined)
          return refuseConstruction('acquired file close unproved');
        sameNode(fstatSync(acquired.file.fd, { bigint: true }), acquired.identity);
        await this.closeAcquired(acquired.file, acquired.identity);
      } catch (failure) {
        failures.push(failure);
      }
    }
    for (const acquired of this.acquiredDirectories)
      try {
        this.closeDirectory(acquired);
      } catch (failure) {
        failures.push(failure);
      }
    // Proof: omitting this.failures from the compiled cleanup verdict made the actual ENOENT case lose both the original error and pipe errors; exact restoration retained them (a4d065c6 receipt).
    if (failures.length !== 0 || this.failures.length !== 0)
      throw new AggregateError(
        [...failures, ...this.failures],
        'source construction cleanup unproved',
      );
  }
  private async verifyClosedFile(installed: InstalledFile): Promise<void> {
    if (installed.file.fd !== installed.descriptor)
      return refuseConstruction('original close descriptor differs');
    sameNode(fstatSync(installed.file.fd, { bigint: true }), installed.identity);
    await this.closeAcquired(installed.file, installed.identity);
  }
}
