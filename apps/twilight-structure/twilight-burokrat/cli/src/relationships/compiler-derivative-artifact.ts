import { createHash } from 'node:crypto';

import { hashCanonical } from '../evidence/content-manifest';
import {
  compilerDerivativeLoaderPolicy,
  compilerDerivativeManifest,
  inputSha256,
  licenseSha256,
  noticeSha256,
  outputSha256,
} from '../packaging/compiler-derivative-pins';

const memberNames = ['LICENSE.txt', 'NOTICE', 'compiler.cjs', 'manifest.json'] as const;
type MemberName = (typeof memberNames)[number];

/** Exact raw artifact members; caller views are copied, never retained as authority. */
export type CompilerDerivativeMembers = Readonly<Record<MemberName, Uint8Array>>;

/** Finite positive safe-integer allowances; owned bytes charge copies and every load cumulatively. */
export interface CompilerDerivativeLimits {
  readonly maximumMemberBytes: number;
  readonly maximumTotalBytes: number;
  readonly maximumOwnedBytes: number;
  readonly maximumLoadMilliseconds: number;
}

declare const CompilerDerivativeBrand: unique symbol;
/** Only exact registered objects own bytes; structural brands grant no authority. */
export interface CompilerDerivative {
  readonly [CompilerDerivativeBrand]: true;
}

/** Raw-byte and execution-policy identities; this grants no complete runtime authentication. */
export interface CompilerDerivativeProvenance {
  readonly schemaVersion: 1;
  readonly kind: 'typescript-compiler-derivative';
  readonly runtimeTrust: 'unverified';
  readonly compilerArtifactIdentity: string;
  readonly compilerExecutionIdentity: string;
  readonly loaderPolicyIdentity: string;
  readonly members: readonly Readonly<{ path: MemberName; identity: string; byteLength: number }>[];
}
interface OwnedDerivative {
  readonly members: CompilerDerivativeMembers;
  readonly limits: CompilerDerivativeLimits;
  readonly provenance: CompilerDerivativeProvenance;
  allocatedBytes: number;
}
const derivatives = new WeakMap<CompilerDerivative, OwnedDerivative>();
const digest = (bytes: Uint8Array | string): string =>
  createHash('sha256').update(bytes).digest('hex');
const expected = Object.freeze({
  'LICENSE.txt': licenseSha256,
  NOTICE: noticeSha256,
  'compiler.cjs': outputSha256,
  'manifest.json': digest(compilerDerivativeManifest),
});

const memberLengths = Object.freeze({
  'LICENSE.txt': 9197,
  NOTICE: 37980,
  'compiler.cjs': 9144652,
  'manifest.json': 526,
});
// Proof: each of four path/hash/length substitutions loses the independent literal vector;
// independent array/child freeze omissions lose `compiled member metadata` immutability.
const memberContract = Object.freeze(
  memberNames.map((path) =>
    Object.freeze({ path, identity: expected[path], byteLength: memberLengths[path] }),
  ),
);

/** Returns the frozen four-member compiled contract without acquiring bytes or executable authority. */
export function listCompilerDerivativeMembers(): readonly Readonly<{
  path: MemberName;
  identity: string;
  byteLength: number;
}>[] {
  return memberContract;
}

function readOwnedDerivative(artifact: CompilerDerivative): OwnedDerivative {
  // Proof: removing the private lookup refusal lost forged/copied/proxy ownership errors before token reads.
  const owned = derivatives.get(artifact);
  if (owned === undefined) throw new Error('compiler derivative ownership differs');
  return owned;
}

/**
 * Owns the exact four raw members after strict key/pin checks and pre-allocation budgeting.
 * Captures incoming references, lengths and limits once. Nothing is registered on failure.
 * @throws Error for mismatched members, invalid limits, exhausted allowances or altered bytes.
 */
// Proof: narrowing this production input to never failed the API diagnostic at real capture callers.
export function captureCompilerDerivative(
  members: CompilerDerivativeMembers,
  suppliedLimits: CompilerDerivativeLimits,
): CompilerDerivative {
  // Proof: rereading supplied limits lost the capture-once getter control.
  const limits = Object.freeze({
    maximumMemberBytes: suppliedLimits.maximumMemberBytes,
    maximumTotalBytes: suppliedLimits.maximumTotalBytes,
    maximumOwnedBytes: suppliedLimits.maximumOwnedBytes,
    maximumLoadMilliseconds: suppliedLimits.maximumLoadMilliseconds,
  });
  for (const [name, allowance] of Object.entries(limits)) {
    // Proof: removing integer validation admitted maximumLoadMilliseconds=1.5.
    if (!Number.isSafeInteger(allowance) || allowance <= 0)
      throw new Error(`compiler derivative ${name} must be a positive safe integer`);
  }
  const keys = Reflect.ownKeys(members);
  // Proof: removing exact key membership admitted extra string/symbol members.
  if (keys.length !== memberNames.length || memberNames.some((name) => !keys.includes(name)))
    throw new Error('compiler derivative members differ');
  const captured = memberNames.map((path) => {
    // Proof: a second member read lost the once-only incoming getter control.
    const bytes = members[path];
    // Proof: removing the byte-view guard lost the member-specific non-byte refusal.
    if (!(bytes instanceof Uint8Array)) throw new Error(`compiler derivative ${path} is not bytes`);
    // Proof: a second length read lost the byte-length getter control.
    const byteLength = bytes.byteLength;
    // Proof: removing length validation reached allocation instead of the invalid-length refusal.
    if (!Number.isSafeInteger(byteLength) || byteLength < 0)
      throw new Error(`compiler derivative ${path} length differs`);
    return { path, bytes, byteLength };
  });
  let total = 0;
  for (const { byteLength } of captured) {
    // Proof: removing each allowance independently reached the forbidden allocation sentinel.
    if (byteLength > limits.maximumMemberBytes)
      throw new Error('compiler derivative maximumMemberBytes exceeded');
    // Proof: removing total-byte admission reached the forbidden allocation sentinel.
    if (byteLength > limits.maximumTotalBytes - total)
      throw new Error('compiler derivative maximumTotalBytes exceeded');
    // Proof: removing owned-byte admission reached the forbidden allocation sentinel.
    if (byteLength > limits.maximumOwnedBytes - total)
      throw new Error('compiler derivative maximumOwnedBytes exceeded');
    total += byteLength;
  }
  const copies = captured.map(({ path, bytes, byteLength }) => {
    // Proof: retaining caller views lost actual compilation after caller mutation.
    const copy = new Uint8Array(byteLength);
    copy.set(bytes);
    return [path, copy] as const;
  });
  // The exact closed key vector above makes this record complete; no caller objects survive.
  const ownedMembers = Object.fromEntries(copies) as CompilerDerivativeMembers;
  // Proof: removing member-array freeze lost the independent immutable-provenance assertion.
  const records = Object.freeze(
    memberNames.map((path) => {
      const bytes = ownedMembers[path];
      const identity = digest(bytes);
      // Proof: bypassing each member pin independently admitted its altered bytes; bypassing only
      // manifest pin admitted semantically equal reformatted JSON, defeating the raw-encoding oracle.
      if (identity !== expected[path]) throw new Error(`compiler derivative ${path} differs`);
      // Proof: removing tuple freeze lost the immutable member-record assertion.
      return Object.freeze({ path, identity, byteLength: bytes.byteLength });
    }),
  );
  // Proof: upstream omission changed the canonical identity. Each unique preimage-only member
  // omission preserved all four published tuples, then failed the independent artifact digest oracle.
  const compilerArtifactIdentity = hashCanonical({
    kind: 'typescript-compiler-derivative',
    schemaVersion: 1,
    upstreamIdentity: inputSha256,
    members: records,
  });
  const loaderPolicyIdentity = digest(compilerDerivativeLoaderPolicy);
  // Proof: removing provenance freeze lost the immutable-provenance assertion.
  const provenance: CompilerDerivativeProvenance = Object.freeze({
    schemaVersion: 1,
    kind: 'typescript-compiler-derivative',
    runtimeTrust: 'unverified',
    compilerArtifactIdentity,
    loaderPolicyIdentity,
    // Proof: omitting loader identity or substituting version lost the canonical execution identity.
    compilerExecutionIdentity: hashCanonical({
      kind: 'typescript-compiler-execution',
      schemaVersion: 1,
      artifactIdentity: compilerArtifactIdentity,
      compilerVersion: '6.0.3',
      loaderPolicyIdentity,
    }),
    members: records,
  });
  // The private ownership map, not this nominal brand, authenticates every later use.
  // Proof: removing capability freeze lost its exact frozen-token assertion.
  const artifact = Object.freeze({}) as CompilerDerivative;
  derivatives.set(artifact, { members: ownedMembers, limits, provenance, allocatedBytes: total });
  return artifact;
}

/** Returns immutable metadata only after exact private ownership lookup; reads no token properties. */
export function readCompilerDerivativeProvenance(
  artifact: CompilerDerivative,
): CompilerDerivativeProvenance {
  return readOwnedDerivative(artifact).provenance;
}

/**
 * Authenticated immutable-source bridge for Dash effect composition; no writable bytes or compiler escape.
 * Yields the original decoded string and captured load ceiling after exact ownership and staging charge.
 * Reads no clock, loads no VM and accepts no replacement namespace.
 * Reserves four executable byte lengths for UTF-16 decode and Script staging before decoding.
 * Charges persist across failed and successful loads; VM-internal code/AST/heap is not counted.
 * Full parser process settlement is a separate mandatory boundary.
 * @throws Error before decode when cumulative owned allowance is exhausted.
 */
export function withCompilerDerivativeSource<T>(
  artifact: CompilerDerivative,
  consume: (source: string, maximumLoadMilliseconds: number) => T,
): T {
  const owned = readOwnedDerivative(artifact);
  const executable = owned.members['compiler.cjs'];
  // Proof: omitting staging admission lost the one-less and post-failure cumulative refusal.
  if (
    executable.byteLength > Math.floor((owned.limits.maximumOwnedBytes - owned.allocatedBytes) / 4)
  )
    throw new Error('compiler derivative maximumOwnedBytes exceeded');
  // Proof: omitting this charge let the callback-failed load reset its lifetime allowance.
  owned.allocatedBytes += executable.byteLength * 4;
  const source = new TextDecoder('utf-8', { fatal: true }).decode(executable);
  return consume(source, owned.limits.maximumLoadMilliseconds);
}
