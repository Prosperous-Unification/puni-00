import type { DirectoryStore, MeasureAdded, MeasureWritten } from '@wbs/core';
import { type MeasureDefinition, SEEDED_MEASURE_DEFINITIONS } from '@wbs/domain';

/**
 * The organizations this memory source holds and each one's measure
 * definitions (`wbs-measure-budgets` D1), by organization id. SQLite holds the
 * organizations in `organization` and the definitions in `measure`; here an
 * organization exists from the moment {@link seedMemoryOrganization} seeds it.
 */
export interface MemoryMeasureDefinitionTables {
  readonly organizations: Map<string, { legacy: boolean; measures: MeasureDefinition[] }>;
}

export function memoryMeasureDefinitionTables(): MemoryMeasureDefinitionTables {
  return { organizations: new Map() };
}

/**
 * Adds an organization with its five seeded definitions: the memory twin of an
 * `organization` insert and its `organization_seed_measures` trigger. Seeded
 * ids are `<organization>:<key>`, opaque like SQLite's random ones.
 *
 * @throws when the organization exists, or a second one would be legacy
 * (`organization_one_legacy`).
 */
export function seedMemoryOrganization(
  tables: MemoryMeasureDefinitionTables,
  organizationId: string,
  legacy: boolean,
): void {
  if (tables.organizations.has(organizationId))
    throw new Error(`organization ${organizationId} already exists`);
  if (legacy && [...tables.organizations.values()].some((each) => each.legacy))
    throw new Error('a second legacy organization breaks organization_one_legacy');
  tables.organizations.set(organizationId, {
    legacy,
    measures: SEEDED_MEASURE_DEFINITIONS.map((fields) => ({
      id: `${organizationId}:${fields.key}`,
      ...fields,
    })),
  });
}

function heldIn(tables: MemoryMeasureDefinitionTables, organizationId: string) {
  const held = tables.organizations.get(organizationId);
  // SQLite's foreign key refuses a definition of no organization the same way.
  if (held === undefined) throw new Error(`organization ${organizationId} does not exist`);
  return held;
}

/**
 * The measure definition methods of the memory directory, keeping the
 * guarantees SQLite's indexes and trigger keep: one key and one scheduling
 * measure per organization, and a key that never changes.
 *
 * Proof: with the scheduling test removed from `admit`, the memory
 * certification's `directory.addMeasure:index-backstop` stored a second
 * scheduling measure (and `directory.patchMeasure:scoped-key-frozen` made
 * `tokens` schedule work); with the key test removed, the first case stored a
 * second `gpu_minutes`; with the stored key no longer kept on patch, the patch
 * case renamed `tokens` to `llm_tokens`; watched 2026-10-23.
 */
export function memoryMeasureDefinitions(
  tables: MemoryMeasureDefinitionTables,
): Pick<
  DirectoryStore,
  | 'legacyOrganizationId'
  | 'listMeasures'
  | 'addMeasure'
  | 'patchMeasure'
  | 'usageOfMeasure'
  | 'removeMeasure'
> {
  /** Why `candidate` cannot stand beside `others`, as SQLite's indexes would answer. */
  const admit = (
    others: readonly MeasureDefinition[],
    candidate: MeasureDefinition,
  ): 'measure_key_taken' | 'second_scheduling_measure' | null => {
    if (others.some((each) => each.key === candidate.key)) return 'measure_key_taken';
    if (candidate.schedulesWork && others.some((each) => each.schedulesWork))
      return 'second_scheduling_measure';
    return null;
  };
  return {
    legacyOrganizationId() {
      const legacy = [...tables.organizations].find(([, each]) => each.legacy);
      return Promise.resolve(legacy === undefined ? null : legacy[0]);
    },
    listMeasures(organizationId) {
      const held = tables.organizations.get(organizationId)?.measures ?? [];
      return Promise.resolve(
        [...held].sort((left, right) =>
          left.order !== right.order
            ? left.order - right.order
            : left.key < right.key
              ? -1
              : left.key > right.key
                ? 1
                : 0,
        ),
      );
    },
    addMeasure(organizationId, measure) {
      const held = heldIn(tables, organizationId);
      const refused = admit(held.measures, measure);
      let added: MeasureAdded = { ok: true, measure: { ...measure } };
      if (refused === null) held.measures.push({ ...measure });
      else added = { ok: false, reason: refused };
      return Promise.resolve(added);
    },
    patchMeasure(organizationId, next) {
      const held = tables.organizations.get(organizationId);
      const index = held?.measures.findIndex((each) => each.id === next.id) ?? -1;
      const stored = held?.measures[index];
      if (held === undefined || stored === undefined)
        return Promise.resolve<MeasureWritten>({ ok: false, reason: 'not_found' });
      const others = held.measures.filter((each) => each.id !== next.id);
      // The key never changes, whatever `next` carries: the trigger's guarantee.
      const written = { ...next, key: stored.key };
      if (admit(others, written) === 'second_scheduling_measure')
        return Promise.resolve<MeasureWritten>({
          ok: false,
          reason: 'second_scheduling_measure',
        });
      held.measures[index] = written;
      return Promise.resolve<MeasureWritten>({ ok: true, measure: { ...written } });
    },
    usageOfMeasure() {
      return Promise.resolve({ references: 0 });
    },
    removeMeasure(organizationId, measureId) {
      const held = tables.organizations.get(organizationId);
      const index = held?.measures.findIndex((each) => each.id === measureId) ?? -1;
      if (held === undefined || index < 0)
        return Promise.resolve({ ok: false, reason: 'not_found' } as const);
      held.measures.splice(index, 1);
      return Promise.resolve({ ok: true } as const);
    },
  };
}
