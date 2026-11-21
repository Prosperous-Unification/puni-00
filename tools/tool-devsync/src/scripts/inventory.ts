import type { Consumer, Runtime } from './model';

export interface Declaration {
  readonly id: string;
  readonly digest: string;
  readonly runtime: Runtime;
  readonly owner: string;
  readonly callers: readonly string[];
  readonly replacement: string;
  readonly verification: string;
  readonly disposition: 'active' | 'historical';
  readonly clientExposure:
    | { readonly kind: 'internal' }
    | { readonly kind: 'client'; readonly command: readonly string[] };
}
export interface Inventory {
  readonly scope: 'entrypoint-package-nx-github-compose-docker';
  readonly entries: readonly Declaration[];
  readonly compliance:
    | { readonly kind: 'bun-compatible' }
    | { readonly kind: 'remaining'; readonly consumers: readonly string[] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
  );
}
function requireRecord(value: unknown, context: string): Record<string, unknown> {
  // Proof: c31c-inventory-record-shape; injected if (!isRecord(value)) throw new Error('script inventory requires an object: ' + context); → if (false) throw new Error('disabled record boundary'); failed `refuses non-JSON envelope objects even when they carry otherwise valid fields`; restoration passed. Date carrying complete valid envelope tests JSON record authority; no separate null/array primitive coverage claim.
  if (!isRecord(value)) throw new Error('script inventory requires an object: ' + context);
  return value;
}
function requireKeys(
  record: Record<string, unknown>,
  keys: readonly string[],
  context: string,
): void {
  for (const key of Object.keys(record))
    // Proof: c31c-inventory-closed-properties; injected if (!keys.includes(key)) → if (false) failed `refuses missing unknown or malformed inventory envelope {"schemaVersion":1,"entries":[],"accepted":true}`; restoration passed. Unknown accepted envelope property is otherwise complete and admits. Shared key guard applies other records, but this row is envelope evidence only.
    if (!keys.includes(key))
      throw new Error('script inventory has an unsupported property: ' + context + ' ' + key);
}
function requireText(value: unknown, context: string): string {
  // Proof: c31c-inventory-nonempty-text; injected if (typeof value !== 'string' || value.trim() === '') → if (false) failed `refuses missing required declaration owner` and 3 other named controls; restoration passed. Shared nonempty-text boundary; actual owner/replacement/verification empty controls and whitespace owner. Do not multiply into independent per-field guards.
  if (typeof value !== 'string' || value.trim() === '')
    throw new Error('script inventory requires nonempty ' + context);
  return value;
}
function requireStrings(value: unknown, context: string, allowsEmpty: boolean): readonly string[] {
  if (!Array.isArray(value)) throw new Error('script inventory requires an array: ' + context);
  const entries = value.map((entry: unknown) => requireText(entry, context));
  if (!allowsEmpty && entries.length === 0)
    throw new Error('script inventory requires nonempty ' + context);
  return entries;
}
function readRuntime(value: unknown): Runtime {
  switch (value) {
    case 'bun':
    case 'node':
    case 'shell':
    case 'python':
    case 'external':
    case 'unknown':
      return value;
    default:
      // Proof: c31c-inventory-runtime-roster; injected throw new Error('script inventory runtime is unsupported'); → return 'unknown'; failed `rejects unsupported runtime labels even for an opaque historical candidate`; restoration passed. Opaque historical candidate has no observed runtime fence to mask unsupported label admission.
      throw new Error('script inventory runtime is unsupported');
  }
}
function readClientExposure(value: unknown): Declaration['clientExposure'] {
  const record = requireRecord(value, 'clientExposure');
  if (record['kind'] === 'internal') {
    requireKeys(record, ['kind'], 'internal clientExposure');
    return { kind: 'internal' };
  }
  // Proof: c31c-inventory-client-kind; injected if (record['kind'] !== 'client') → if (false) failed `refuses unknown client exposure kinds rather than interpreting them as clients`; restoration passed. Otherwise valid unknown-kind record would be interpreted as client.
  if (record['kind'] !== 'client')
    throw new Error('script inventory clientExposure kind is unsupported');
  requireKeys(record, ['kind', 'command'], 'client clientExposure');
  const command = requireStrings(record['command'], 'client command', false);
  // Proof: c31c-inventory-client-root; injected if (command.at(0) !== 'puni') throw new Error('script inventory client commands must use puni'); → void command; failed `requires client routes to name the PUNI root and keeps them separate from installed execution proof`; restoration passed. Metadata root qualification only, not installed grammar, routing, or runtime execution proof.
  if (command.at(0) !== 'puni') throw new Error('script inventory client commands must use puni');
  return { kind: 'client', command };
}
function readDeclaration(value: unknown): Declaration {
  const record = requireRecord(value, 'declaration');
  requireKeys(
    record,
    [
      'id',
      'digest',
      'runtime',
      'owner',
      'callers',
      'replacement',
      'verification',
      'disposition',
      'clientExposure',
    ],
    'declaration',
  );
  const id = requireText(record['id'], 'id'),
    digest = requireText(record['digest'], 'digest'),
    disposition = record['disposition'];
  // Proof: c31c-inventory-digest-syntax; injected if (!/^[0-9a-f]{64}$/u.test(digest)) → if (false) failed `classifies malformed digests before comparing their execution identity`; restoration passed. Diagnostic ordering only: later actual digest comparison still refuses malformed digest.
  if (!/^[0-9a-f]{64}$/u.test(digest))
    throw new Error('script inventory digest must be SHA256: ' + id);
  // Proof: c31c-inventory-disposition; injected if (disposition !== 'active' && disposition !== 'historical') → if (false) failed `does not create a broad frozen-solver exemption from a declaration label`; restoration passed. Unsupported frozen label falls into active branch and returns remaining under mutation; no application-level solver exemption.
  if (disposition !== 'active' && disposition !== 'historical')
    throw new Error('script inventory disposition is unsupported: ' + id);
  return {
    id,
    digest,
    disposition,
    runtime: readRuntime(record['runtime']),
    owner: requireText(record['owner'], 'owner'),
    callers: requireStrings(record['callers'], 'callers', true),
    replacement: requireText(record['replacement'], 'replacement'),
    verification: requireText(record['verification'], 'verification'),
    clientExposure: readClientExposure(record['clientExposure']),
  };
}

/** Only captured program edges are callers; metadata dependencies confer no execution authority. */
function readProgramCallers(
  consumer: Consumer,
  consumers: readonly Consumer[],
): readonly Consumer[] {
  if (consumer.kind !== 'entrypoint') return [];
  return consumers.filter((candidate) =>
    candidate.targets.some(
      (target) =>
        // Proof: c31c-inventory-program-caller-edge; injected target.kind === 'file' && target.usage === 'program' && target.path === consumer.source, → false, failed `reconciles exact discovered identities with caller evidence and required ownership metadata`; restoration passed. Successful real program caller graph must survive; dropping all program edges incorrectly refuses. Does not independently prove usage exclusion against metadata edges.
        // Proof: c31c-inventory-metadata-caller-exclusion; injected target.kind === 'file' && target.usage === 'program' && target.path === consumer.source, → target.kind === 'file' && target.path === consumer.source, failed `does not treat configuration references as program callers for an independently executable candidate`; restoration passed. A metadata file has independent entrypoint evidence, but the metadata use edge still confers no program-caller authority.
        target.kind === 'file' && target.usage === 'program' && target.path === consumer.source,
    ),
  );
}
function readExpectedRuntime(
  consumer: Consumer,
  consumers: readonly Consumer[],
  callers: readonly Consumer[],
): Runtime | undefined {
  if (consumer.observedRuntime !== 'unknown') return consumer.observedRuntime;
  const observations =
    consumer.kind === 'entrypoint'
      ? callers.map((caller) => caller.observedRuntime)
      : consumer.targets
          .filter((target) => target.kind === 'file' && target.usage === 'program')
          .flatMap((target) =>
            consumers
              .filter(
                (candidate) => candidate.kind === 'entrypoint' && candidate.source === target.path,
              )
              .map((candidate) => candidate.observedRuntime),
          );
  const known = [...new Set(observations.filter((runtime) => runtime !== 'unknown'))];
  // Proof: c31c-inventory-runtime-conflict; injected known.length > 1 → false failed `refuses conflicting observed runtimes for the same opaque captured program`; restoration passed. Conflict rejection is format/observation integrity; a weakened inventory can still report the actual Node caller as remaining conversion.
  if (known.length > 1)
    throw new Error('script inventory runtime observations conflict: ' + consumer.id);
  return known.at(0);
}

/**
 * Reconcile an external version1 declaration envelope against independently discovered sites.
 * Exact execution digests, real caller edges and observed runtimes cannot be replaced by declared
 * approval. Unknown/stale/duplicate/changed/unresolved sites refuse. Historical disposition applies
 * only to unreferenced file candidates; metadata cannot make active fields or shipped clients historical.
 * The returned compliance describes these discovered families only, not generated/remote/infra coverage.
 * Compose and Docker execution remain unresolved pending image/build/mount qualification.
 * Client command metadata is not proof that a typed route or installed implementation exists.
 */
export function checkInventory(consumers: readonly Consumer[], input: unknown): Inventory {
  const envelope = requireRecord(input, 'envelope');
  requireKeys(envelope, ['schemaVersion', 'entries'], 'envelope');
  // Proof: c31c-inventory-version; injected if (envelope['schemaVersion'] !== 1) → if (false) failed `refuses missing unknown or malformed inventory envelope {"schemaVersion":2,"entries":[]}`; restoration passed. Complete empty schemaVersion2 envelope admits when version guard removed; malformed sibling cases can retain later refusal.
  if (envelope['schemaVersion'] !== 1)
    throw new Error('script inventory schemaVersion is unsupported');
  const entries = envelope['entries'];
  if (!Array.isArray(entries)) throw new Error('script inventory entries must be an array');
  const declarations = entries.map((entry: unknown) => readDeclaration(entry)),
    byId = new Map<string, Declaration>();
  for (const declaration of declarations) {
    // Proof: c31c-inventory-duplicate-declaration; injected if (byId.has(declaration.id)) → if (false) failed `refuses stale and duplicate declaration identities`; restoration passed. Duplicate equivalent declaration otherwise overwrites map; stale first subcase remains independently refused.
    if (byId.has(declaration.id))
      throw new Error('script inventory has duplicate declaration: ' + declaration.id);
    byId.set(declaration.id, declaration);
  }
  const discovered = new Map<string, Consumer>();
  for (const consumer of consumers) {
    // Proof: c31c-inventory-duplicate-discovery; injected if (discovered.has(consumer.id)) → if (false) failed `refuses duplicate discovered consumer identities rather than reconciling only the final copy`; restoration passed. Diagnostic/order only: removing duplicate discovery admission still reaches the caller-evidence refusal; no successful acceptance is claimed.
    if (discovered.has(consumer.id))
      throw new Error('script inventory has duplicate discovered consumer: ' + consumer.id);
    discovered.set(consumer.id, consumer);
  }
  for (const declaration of declarations)
    // Proof: c31c-inventory-stale-declaration; injected if (!discovered.has(declaration.id)) → if (false) failed `refuses stale and duplicate declaration identities`; restoration passed. Extra declaration with valid remaining metadata is otherwise admitted.
    if (!discovered.has(declaration.id))
      throw new Error('script inventory declaration is stale: ' + declaration.id);
  const remaining: string[] = [];
  for (const consumer of consumers) {
    const declaration = byId.get(consumer.id);
    // Proof: c31c-inventory-unclassified; injected if (declaration === undefined) → if (false) failed `refuses a newly discovered executable absent from the declarations`; restoration passed. Explicit unclassified diagnostic: unguarded subsequent declaration.digest still throws, so not independent admission.
    if (declaration === undefined)
      throw new Error('script inventory consumer is unclassified: ' + consumer.id);
    // Proof: c31c-inventory-execution-digest; injected if (consumer.digest !== declaration.digest) → if (false) failed `refuses changed captured program bytes even when the invoking command body is unchanged`; restoration passed. Actual changed program bytes with unchanged invocation; valid old digest must not admit new source.
    if (consumer.digest !== declaration.digest)
      throw new Error('script inventory execution identity changed: ' + consumer.id);
    // Proof: c31c-inventory-unresolved; injected if (consumer.resolution.kind === 'unresolved') → if (false) failed `does not let declarations bless wrappers ignored targets or other unresolved execution boundaries` and 1 other named controls; restoration passed. Known Bun interpreter with ignored target is otherwise valid and reaches erroneous admission when the consumer-resolution guard is removed. Wrapper control separately pins the consumer diagnostic while a later runtime refusal remains.
    if (consumer.resolution.kind === 'unresolved')
      throw new Error(
        'script inventory consumer is unresolved: ' +
          consumer.id +
          ': ' +
          consumer.resolution.reason,
      );
    const callers = readProgramCallers(consumer, consumers),
      expectedCallers =
        consumer.kind === 'entrypoint' ? callers.map((caller) => caller.id).sort() : [consumer.id];
    // Proof: c31c-inventory-caller-evidence; injected if (JSON.stringify([...declaration.callers].sort()) !== JSON.stringify(expectedCallers)) → if (false) failed `refuses arbitrary or missing caller claims instead of treating nonempty strings as proof`; restoration passed. The first failure admits an arbitrary command caller. The later omitted program-caller assertion is not reached.
    if (JSON.stringify([...declaration.callers].sort()) !== JSON.stringify(expectedCallers))
      throw new Error('script inventory caller evidence differs: ' + consumer.id);
    if (declaration.disposition === 'historical') {
      if (
        // Proof: c31c-inventory-historical-active; injected consumer.kind !== 'entrypoint' || callers.length !== 0 || declaration.clientExposure.kind === 'clien → declaration.clientExposure.kind === 'client' failed `does not permit historical classification for an active field or referenced program`; restoration passed. The first failure is historical admission of an active command field. The later referenced-program loop iteration is not reached.
        consumer.kind !== 'entrypoint' ||
        // Proof: c31c-inventory-historical-client; injected || declaration.clientExposure.kind === 'client' →  failed `refuses historical client exposure even when no captured caller references the specimen`; restoration passed. Unreferenced file is otherwise valid historical specimen; client exposure alone prevents exemption.
        callers.length !== 0 ||
        declaration.clientExposure.kind === 'client'
      )
        throw new Error(
          'script inventory historical disposition cannot hide active execution: ' + consumer.id,
        );
      if (
        // Proof: c31c-inventory-historical-runtime; injected consumer.observedRuntime !== 'unknown' && declaration.runtime !== consumer.observedRuntime → false failed `requires historical runtime metadata to agree with the observed shebang`; restoration passed. An unreferenced historical Node-shebang file cannot be relabeled Bun; no active-execution authority is involved.
        consumer.observedRuntime !== 'unknown' &&
        declaration.runtime !== consumer.observedRuntime
      )
        throw new Error(
          'script inventory historical runtime disagrees with observed bytes: ' + consumer.id,
        );
      // Proof: c31c-inventory-historical-exemption; injected continue; } const observed = readExpectedRuntime → // historical exemption disabled } const observed = readExpectedRuntime failed `allows an explicitly historical unreferenced executable without converting its specimen bytes`; restoration passed. Known historical Node specimen should not appear as active remaining conversion; no rewriting specimen bytes.
      continue;
    }
    const observed = readExpectedRuntime(consumer, consumers, callers);
    if (observed === undefined)
      throw new Error('script inventory active runtime is unresolved: ' + consumer.id);
    // Proof: c31c-inventory-runtime-agreement; injected if (declaration.runtime !== observed) → if (false) failed `does not allow a declaration to relabel observed Node execution as Bun`; restoration passed. Observed Node runtime may still appear as remaining but cannot be mislabeled as Bun in accepted declarations.
    if (declaration.runtime !== observed)
      throw new Error(
        'script inventory declared runtime disagrees with observation: ' + consumer.id,
      );
    // Proof: c31c-inventory-remaining-classification; injected if (observed !== 'bun' && observed !== 'external') remaining.push(consumer.id); → void observed; failed `catalogues known Node execution while retaining the remaining Bun conversion sites`; restoration passed. Known Node sites must remain visible as conversion work; initial-family scope only.
    if (observed !== 'bun' && observed !== 'external') remaining.push(consumer.id);
  }
  return {
    scope: 'entrypoint-package-nx-github-compose-docker',
    entries: [...declarations].sort((left, right) =>
      left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
    ),
    compliance:
      remaining.length === 0
        ? { kind: 'bun-compatible' }
        : { kind: 'remaining', consumers: remaining.sort() },
  };
}
