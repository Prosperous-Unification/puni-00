import { readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';

import { parseOrThrow, type } from '@shared/validation';

import { hashBytes } from '../evidence/content-manifest';
import { RelocationRefusal } from './relocation-refusal';
import { hashTrustedModules } from './trusted-modules';

const Sha256 = /^[0-9a-f]{64}$/;
/** Proof: optional fields and widened value types fail the named toolkit descriptor requirement/value tests. */
const descriptorFields = {
  tag: 'string>=1',
  sourceRevision: /^[0-9a-f]{40}$/,
  bunVersion: 'string>=1',
  trustedNodeModules: 'string[]',
  trustedNodeModulesIdentity: Sha256,
} as const;
/** Proof: each optional role and each ignored extra role fails its version's typed schema-refusal test. */
const legacyRoles = type({
  'launcher.sh': Sha256,
  'snapshotter.ts': Sha256,
  'validator.mjs': Sha256,
  'prepare-activation.mjs': Sha256,
  'prepare-relocation-activation.mjs': Sha256,
}).onUndeclaredKey('reject');
const bunRoles = type({
  'launcher.mjs': Sha256,
  'snapshotter.ts': Sha256,
  'validator.mjs': Sha256,
  'prepare-activation.mjs': Sha256,
  'prepare-relocation-activation.mjs': Sha256,
}).onUndeclaredKey('reject');
/** Proof: widening either version or ignoring its unknown fields fails the corresponding layout's schema test. */
const ToolkitDescriptor = type({ ...descriptorFields, schemaVersion: '1', roles: legacyRoles })
  .onUndeclaredKey('reject')
  .or(type({ ...descriptorFields, schemaVersion: '2', roles: bunRoles }).onUndeclaredKey('reject'));

interface ToolkitFields {
  readonly directory: string;
  readonly tag: string;
  readonly sourceRevision: string;
  readonly digest: string;
  readonly bunVersion: string;
  readonly trustedNodeModules: readonly string[];
}

export interface LegacyToolkit extends ToolkitFields {
  readonly schemaVersion: 1;
  readonly roleBytes: Readonly<Record<keyof typeof legacyRoles.infer, Uint8Array>>;
}

export interface BunToolkit extends ToolkitFields {
  readonly schemaVersion: 2;
  readonly roleBytes: Readonly<Record<keyof typeof bunRoles.infer, Uint8Array>>;
}

/** Compatibility name retained for existing legacy producers until their coordinated switch. */
export type Toolkit = LegacyToolkit;

/** Verified original bytes, independent from the runtime allowed to execute them. */
export type VerifiedToolkit = LegacyToolkit | BunToolkit;

/**
 * Verify the descriptor's closed versioned roles and runtime closure using the original bytes.
 * Historical schema1 supports the pre-migration five-role, closure-bound profile. Earlier
 * four-role or closure-unbound descriptors remain unsupported; extra role-map keys now refuse.
 * Verification does not require the current Bun to match the build runtime.
 * @throws when the descriptor, any role or the closure is missing, malformed or altered.
 */
export function verifyToolkit(directory: string): VerifiedToolkit {
  const canonical = realpathSync(directory);
  const descriptorBytes = readFileSync(join(canonical, 'toolkit.json'));
  // Proof: disabling fatal UTF-8 admits a replacement character and fails the invalid-UTF-8 test.
  const descriptor = parseOrThrow(
    ToolkitDescriptor,
    JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(descriptorBytes)) as unknown,
  );
  const common = {
    'snapshotter.ts': readRole(canonical, 'snapshotter.ts', descriptor.roles['snapshotter.ts']),
    'validator.mjs': readRole(canonical, 'validator.mjs', descriptor.roles['validator.mjs']),
    'prepare-activation.mjs': readRole(
      canonical,
      'prepare-activation.mjs',
      descriptor.roles['prepare-activation.mjs'],
    ),
    'prepare-relocation-activation.mjs': readRole(
      canonical,
      'prepare-relocation-activation.mjs',
      descriptor.roles['prepare-relocation-activation.mjs'],
    ),
  };
  const version =
    descriptor.schemaVersion === 1
      ? {
          schemaVersion: 1 as const,
          roleBytes: {
            ...common,
            'launcher.sh': readRole(canonical, 'launcher.sh', descriptor.roles['launcher.sh']),
          },
        }
      : {
          schemaVersion: 2 as const,
          roleBytes: {
            ...common,
            'launcher.mjs': readRole(canonical, 'launcher.mjs', descriptor.roles['launcher.mjs']),
          },
        };
  const closure = join(canonical, 'trusted-node-modules');
  const closureIdentity = hashTrustedModules(closure);
  // Proof: forcing this refusal false copied an altered `typescript/package.json` out of the
  // toolkit into the consumer's archive as the validator's runtime; `SHA256SUMS` lists no file
  // below `trusted-node-modules`, so nothing else in the chain would have noticed. The negative
  // expected this message and received a prepared, self-certified activation at exit 0.
  // Proof: disabling this comparison admitted altered arktype/out/index.d.ts bytes through
  // the installed external extraction command; the vendor-corruption negative observed exit 0.
  if (closureIdentity !== descriptor.trustedNodeModulesIdentity) {
    throw new RelocationRefusal(
      'R19',
      `toolkit runtime closure differs from toolkit.json: ${closureIdentity} != ${descriptor.trustedNodeModulesIdentity}`,
    );
  }
  return {
    ...version,
    bunVersion: descriptor.bunVersion,
    directory: canonical,
    tag: descriptor.tag,
    sourceRevision: descriptor.sourceRevision,
    digest: hashBytes(descriptorBytes),
    trustedNodeModules: descriptor.trustedNodeModules,
  };
}

function readRole(
  directory: string,
  role: keyof LegacyToolkit['roleBytes'] | keyof BunToolkit['roleBytes'],
  expected: string,
): Uint8Array {
  let bytes: Uint8Array;
  try {
    bytes = readFileSync(join(directory, role));
  } catch (cause) {
    // Proof: renaming the installed validator made the packed-install negative observe a raw
    // ENOENT until this boundary named the unreadable toolkit role the operator must restore.
    throw new RelocationRefusal('R19', `toolkit role is unreadable: ${role}`, { cause });
  }
  // Proof: forcing this refusal false prepared an activation whose `launcher.sh` had been
  // replaced after packing while `toolkit.json` still named the reviewed digest; the altered-role
  // negative expected this message and received a prepared activation at exit 0. The packaged
  // executable negative also appends bytes to its installed `validator.mjs` and reaches this
  // refusal before resolving the deliberately unknown candidate commit.
  if (hashBytes(bytes) !== expected) {
    throw new RelocationRefusal(
      'R19',
      `toolkit role differs from toolkit.json: ${role} (${hashBytes(bytes)} != ${expected})`,
    );
  }
  return bytes;
}

function assertRuntime(toolkit: VerifiedToolkit): void {
  // Proof: forcing this refusal false prepared an activation whose Bun was not the one that built
  // the toolkit's `validator.mjs`, so the bundle digest the consumer binds could not be reproduced
  // by its own runner; the drifted-toolkit negative expected this message and received a prepared
  // activation at exit 0.
  if (toolkit.bunVersion !== Bun.version) {
    throw new RelocationRefusal(
      'R19',
      `toolkit was built with another Bun: ${toolkit.bunVersion} != ${Bun.version}`,
    );
  }
}

/** Transitional legacy execution reader; removed when its existing producers switch together. */
export function readToolkit(directory: string): LegacyToolkit {
  const toolkit = verifyToolkit(directory);
  // Proof: bypassing this guard admits a schema2 toolkit and fails the legacy-reader separation test.
  if (toolkit.schemaVersion !== 1)
    throw new RelocationRefusal('R19', 'legacy execution requires toolkit schema 1');
  assertRuntime(toolkit);
  return toolkit;
}

/**
 * Require the supported Bun execution format and exact runtime after original-byte verification.
 * @throws when historical bytes are requested for execution or the current runtime differs.
 */
export function readBunToolkit(directory: string): BunToolkit {
  const toolkit = verifyToolkit(directory);
  // Proof: bypassing this guard admits schema1 pinned to today's Bun; matching-runtime refusal fails.
  if (toolkit.schemaVersion !== 2)
    throw new RelocationRefusal('R19', 'Bun execution requires toolkit schema 2');
  assertRuntime(toolkit);
  return toolkit;
}
