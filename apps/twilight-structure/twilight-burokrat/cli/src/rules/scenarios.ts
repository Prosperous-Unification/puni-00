import { extractScenarioHeadings } from './scenario-headings';

/** A scenario's append-only provenance event. The first event reserves its ID forever. */
export type ScenarioEvent =
  | {
      readonly kind: 'import' | 'allocate';
      readonly id: string;
      readonly source: string;
      readonly title: string;
    }
  | {
      readonly kind: 'split';
      readonly id: string;
      readonly source: string;
      readonly title: string;
      readonly predecessor: string;
    }
  | {
      readonly kind: 'rename';
      readonly id: string;
      readonly priorTitle: string;
      readonly title: string;
      readonly priorRevision: string;
    }
  | { readonly kind: 'retire'; readonly id: string };

export interface ScenarioJournal {
  readonly schemaVersion: 1;
  readonly events: readonly ScenarioEvent[];
}

export interface ScenarioIdentity {
  readonly id: string;
  readonly source: string;
  readonly title: string;
  readonly predecessor?: string;
  readonly active: boolean;
}

export interface ScenarioProposal {
  readonly specMarkdown: string;
  readonly events: readonly ScenarioEvent[];
  readonly journal: ScenarioJournal;
}

const identifiedTitle = /^\[([A-Z][A-Z0-9-]*-\d{3,})\] (.+)$/;

function capabilityOf(source: string): string {
  const parts = source.split('/');
  // Proof: with this guard disabled, the direct importer accepted
  // openspec/specs/example/not-spec.md and returned an EXAMPLE-001 event; its negative failed.
  // The production CLI also rejects the same source at its SourcePath boundary.
  if (parts.at(-1) !== 'spec.md' || parts.length < 3 || !source.startsWith('openspec/')) {
    throw new Error(`scenario source must be an OpenSpec spec.md path: ${source}`);
  }
  const capability = parts.at(-2);
  // Proof: disabling this guard made the direct importer process
  // openspec/specs/Bad/spec.md and fail later with an unrelated ID mismatch.
  if (capability === undefined || !/^[a-z][a-z0-9-]*$/.test(capability)) {
    throw new Error(`scenario source has no capability: ${source}`);
  }
  return capability;
}

function prefixOf(source: string): string {
  return capabilityOf(source).toUpperCase();
}

function headingsOf(specMarkdown: string): readonly { title: string; id?: string }[] {
  const titles = extractScenarioHeadings(specMarkdown).map((heading) => heading.title);
  // Proof: disabling this guard made production `scenario import` exit 0 for a
  // specification with no scenario headings; its CLI negative expected exit 1.
  if (titles.length === 0) throw new Error('specification has no scenario headings');
  const seen = new Set<string>();
  return titles.map((title) => {
    const match = identifiedTitle.exec(title);
    if (match === null) return { title };
    const id = match[1];
    // Proof: two headings with the already-imported EXAMPLE-001 made production `scenario
    // import` and `scenario validate` exit 0 before this guard; the CLI negative now exits 1.
    if (seen.has(id)) throw new Error(`duplicate scenario identifier: ${id}`);
    seen.add(id);
    return { id, title: match[2] };
  });
}

/** Derives the sole mutable view from the append-only journal; retired IDs remain present. */
export function deriveScenarioIndex(
  journal: ScenarioJournal,
): ReadonlyMap<string, ScenarioIdentity> {
  const index = new Map<string, ScenarioIdentity>();
  for (const event of journal.events) {
    if (event.kind === 'import' || event.kind === 'allocate' || event.kind === 'split') {
      // Proof: disabling this guard made the production CLI's schema-valid duplicate-event
      // negative lose the "malformed scenario journal" boundary and fail its assertion.
      if (index.has(event.id))
        throw new Error(`scenario identifier was already reserved: ${event.id}`);
      const expectedPrefix = `${prefixOf(event.source)}-`;
      // Proof: removing the numeric suffix check let EXAMPLE-DETAIL-001 pass the
      // example namespace guard and fail later at provenance; disabling the title-shape
      // check similarly let a newline-bearing event title pass journal decoding.
      if (
        !event.id.startsWith(expectedPrefix) ||
        !/^\d{3,}$/.test(event.id.slice(expectedPrefix.length)) ||
        !identifiedTitle.test(`[${event.id}] ${event.title}`)
      ) {
        throw new Error(`scenario identifier does not match ${event.source}: ${event.id}`);
      }
      if (event.kind === 'split') {
        const predecessor = index.get(event.predecessor);
        // Proof: disabling each unknown, inactive or foreign predecessor predicate
        // made its named production `scenario allocate --predecessor` negative exit 0.
        if (
          predecessor === undefined ||
          !predecessor.active ||
          predecessor.source !== event.source
        ) {
          throw new Error(`unknown or inactive scenario predecessor: ${event.predecessor}`);
        }
      }
      index.set(event.id, {
        id: event.id,
        source: event.source,
        title: event.title,
        ...(event.kind === 'split' ? { predecessor: event.predecessor } : {}),
        active: true,
      });
      continue;
    }
    const current = index.get(event.id);
    // Proof: disabling this guard made a second retirement pass journal decoding;
    // the CLI negative then failed at the later provenance error.
    if (!current?.active) throw new Error(`unknown or inactive scenario: ${event.id}`);
    if (event.kind === 'rename') {
      // Proof: disabling this guard made a rename with the wrong prior title pass
      // journal decoding; its CLI negative failed at later provenance validation.
      if (event.priorTitle !== current.title) {
        throw new Error(`scenario rename requires exact prior title and revision: ${event.id}`);
      }
      index.set(event.id, { ...current, title: event.title });
    } else {
      index.set(event.id, { ...current, active: false });
    }
  }
  return index;
}

/** Imports hand-written IDs unchanged before provenance enforcement. */
export function importScenarioIdentifiers(
  journal: ScenarioJournal,
  source: string,
  specMarkdown: string,
): ScenarioJournal {
  const index = deriveScenarioIndex(journal);
  const events: ScenarioEvent[] = [];
  for (const scenario of headingsOf(specMarkdown)) {
    if (scenario.id === undefined) continue;
    if (index.has(scenario.id)) {
      const current = index.get(scenario.id);
      // Proof: disabling this guard made production `scenario import` exit 0 for
      // both a foreign source and a retired EXAMPLE-001; two CLI negatives failed.
      if (current?.source !== source || current.title !== scenario.title || !current.active) {
        throw new Error(`scenario identifier already reserved elsewhere: ${scenario.id}`);
      }
      continue;
    }
    events.push({ kind: 'import', id: scenario.id, source, title: scenario.title });
  }
  const imported = { schemaVersion: 1, events: [...journal.events, ...events] } as const;
  deriveScenarioIndex(imported);
  return imported;
}

/** Fails when an identified heading has no current allocation record. Legacy unlabelled headings remain visible migration debt. */
export function validateScenarioProvenance(
  journal: ScenarioJournal,
  source: string,
  specMarkdown: string,
): readonly string[] {
  const index = deriveScenarioIndex(journal);
  const unidentified: string[] = [];
  for (const scenario of headingsOf(specMarkdown)) {
    if (scenario.id === undefined) {
      unidentified.push(scenario.title);
      continue;
    }
    const current = index.get(scenario.id);
    // Proof: disabling this guard made production `scenario validate` exit 0 for
    // foreign source, different title and retired-ID fixtures; three CLI negatives failed.
    if (
      current === undefined ||
      !current.active ||
      current.source !== source ||
      current.title !== scenario.title
    ) {
      throw new Error(`scenario identifier lacks current allocator provenance: ${scenario.id}`);
    }
  }
  return unidentified;
}

/** Proposes deterministic identifiers and an updated journal without writing either artifact. */
export function proposeScenarioAllocation(
  journal: ScenarioJournal,
  source: string,
  specMarkdown: string,
  predecessors: Readonly<Partial<Record<string, string>>> = {},
): ScenarioProposal {
  const index = deriveScenarioIndex(journal);
  const prefix = prefixOf(source);
  const numbered = [...index.keys()]
    // Proof: removing the numeric suffix filter made the production foreign-predecessor
    // negative fail with EXAMPLE-NaN before the predecessor guard.
    .filter((id) => id.startsWith(`${prefix}-`) && /^\d{3,}$/.test(id.slice(prefix.length + 1)))
    .map((id) => Number(id.slice(prefix.length + 1)));
  let ordinal = Math.max(0, ...numbered);
  const events: ScenarioEvent[] = [];
  const insertions: { offset: number; id: string }[] = [];
  for (const { title, titleStart } of extractScenarioHeadings(specMarkdown)) {
    if (identifiedTitle.test(title)) continue;
    ordinal += 1;
    const id = `${prefix}-${String(ordinal).padStart(3, '0')}`;
    // Proof: without an own-key lookup, production `scenario allocate` treated the ordinary
    // heading `constructor` as Object's inherited function and failed with unknown predecessor.
    const predecessor = Object.hasOwn(predecessors, title) ? predecessors[title] : undefined;
    const event: ScenarioEvent =
      predecessor === undefined
        ? { kind: 'allocate', id, source, title }
        : { kind: 'split', id, source, title, predecessor };
    events.push(event);
    insertions.push({ offset: titleStart, id });
  }
  // Proof: disabling this guard made production `scenario allocate` exit 0 for a spec
  // containing only an identified heading; its CLI negative expected exit 1.
  if (events.length === 0) throw new Error(`no unidentified scenarios in ${source}`);
  const proposal = { schemaVersion: 1, events: [...journal.events, ...events] } as const;
  deriveScenarioIndex(proposal);
  let updated = specMarkdown;
  for (const { offset, id } of insertions.reverse()) {
    updated = `${updated.slice(0, offset)}[${id}] ${updated.slice(offset)}`;
  }
  validateScenarioProvenance(proposal, source, updated);
  return { specMarkdown: updated, events, journal: proposal };
}
