import { isReservedStepCode } from '@wbs/domain';

import type { TransactionalStores } from '../../ports/stores';
import type { WriteStamp } from '../../ports/write-stamp';
import { authorize } from '../../service/authorize';
import type { PreparedStep } from './import-values';
import type { ImportAuthority } from './imported-plan.resource';

export type ImportCatalogueRefusal =
  | {
      readonly ok: false;
      readonly code: 'unknown_step_codes';
      readonly codes: readonly string[];
    }
  | {
      readonly ok: false;
      readonly code: 'retired_step_codes';
      readonly codes: readonly string[];
    }
  | {
      readonly ok: false;
      readonly code: 'forbidden';
      readonly permission: 'project.manage_settings';
      readonly path: '';
      readonly detail: null;
    }
  | {
      readonly ok: false;
      readonly code: 'not_found' | 'source_refused';
      readonly path: string;
      readonly detail: string | null;
    };

interface SelectedStep extends PreparedStep {
  readonly id: string;
}

export type ImportStepResolution =
  | ImportCatalogueRefusal
  | {
      readonly ok: true;
      readonly stepIds: ReadonlyMap<string, string>;
      readonly workPackageIds: readonly string[];
    };

/**
 * Catalogue reconciliation and initial package values share the import's actual
 * admitted Source loan. File ids never become definition ids, and a detached
 * mapping grants no authority to mutate another package or resurrect retirement.
 */
export class ImportedSteps {
  #selection: readonly SelectedStep[] | null = null;

  constructor(
    private readonly stores: () => Pick<
      TransactionalStores,
      'stepCatalogue' | 'accessDecisions' | 'workPackages'
    >,
    private readonly authority: Pick<ImportAuthority, 'access' | 'project' | 'assertActive'>,
  ) {}

  /** Resolves active codes and authors only missing project defaults under current scope permission. */
  async resolve(
    steps: readonly PreparedStep[],
    defineMissing: boolean,
    stamp: WriteStamp,
    newId: () => string,
  ): Promise<ImportStepResolution> {
    this.authority.assertActive();
    const retained = structuredClone(steps);
    const ordered = retained.toSorted(
      (left, right) =>
        left.position - right.position ||
        (left.fileId < right.fileId ? -1 : left.fileId > right.fileId ? 1 : 0),
    );
    const { organizationId, projectId } = this.authority.project.chain;
    const catalogue = await this.stores().stepCatalogue.readCatalogue(organizationId);
    this.authority.assertActive();
    // Proof: catalogue fault omission lost this named absence diagnostic in both actual Sources (catalogue-import-fault-catalogue-v1); diagnostic evidence only.
    if (catalogue === null) throw new Error('admitted import catalogue is absent');
    const retired = await this.stores().stepCatalogue.readRetiredCodes(organizationId);
    this.authority.assertActive();
    // Proof: removing this guard silently accepted missing retirement evidence in both actual Sources (catalogue-import-retirement-fault-retirement-absence-v2).
    if (retired === null) throw new Error('admitted import retirement catalogue is absent');
    const reserved = new Set(retired);
    const retiredSteps = ordered.filter((step) => reserved.has(step.code));
    // Proof: removing this refusal lost SC25 for both opt-in modes in both Sources (catalogue-import-retirement-fault-retirement-v2); lower namespace protection remains.
    if (retiredSteps.length > 0)
      return {
        ok: false,
        code: 'retired_step_codes',
        codes: retiredSteps.map((step) => step.code),
      };
    const manifest = await this.stores().stepCatalogue.readManifest(organizationId, projectId);
    this.authority.assertActive();
    // Proof: manifest fault omission lost this named absence diagnostic in both actual Sources (catalogue-import-fault-manifest-v1); diagnostic evidence only.
    if (manifest === null) throw new Error('admitted import project manifest is absent');
    const byCode = new Map(
      catalogue.definitions.map((definition) => [definition.code, definition]),
    );
    const unknown = ordered.filter((step) => !byCode.has(step.code));
    // Proof: removing this refusal imported unknown codes without opt-in in both actual Sources (catalogue-import-fault-unknown-v1).
    if (unknown.length > 0 && !defineMissing)
      return { ok: false, code: 'unknown_step_codes', codes: unknown.map((step) => step.code) };
    const defaults = new Set(manifest.default);
    if (
      ordered.some((step) => !defaults.has(step.code)) &&
      this.authority.access.kind === 'scoped'
    ) {
      const decision = await authorize(
        this.stores().accessDecisions,
        this.authority.access.principal,
        this.authority.project,
        'project.manage_settings',
      );
      this.authority.assertActive();
      // Proof: removing this refusal admitted the mounted importer without project settings permission (catalogue-import-fault-permission-v1).
      if (!decision.ok)
        return decision.reason === 'not_found'
          ? { ok: false, code: 'not_found', path: 'projectId', detail: null }
          : {
              ok: false,
              code: 'forbidden',
              permission: 'project.manage_settings',
              path: '',
              detail: null,
            };
    }
    const own = catalogue.bindings
      .filter((binding) => binding.scopeKind === 'project' && binding.scopeId === projectId)
      .toSorted(
        (left, right) =>
          left.position - right.position ||
          (left.bindingId < right.bindingId ? -1 : left.bindingId > right.bindingId ? 1 : 0),
      );
    const ownOrder = own.map((binding) => binding.bindingId);
    let position = own.reduce((highest, binding) => Math.max(highest, binding.position), 0);
    const selection: SelectedStep[] = [];
    const affected = new Set<string>();
    for (const step of ordered) {
      let definition = byCode.get(step.code);
      if (!defaults.has(step.code)) {
        const nextPosition = position + 10;
        // Proof: disabling compaction refused valid maximum-rank imports in both actual Sources (catalogue-import-fault-overflow-v1).
        const compact = !Number.isSafeInteger(nextPosition);
        const binding = {
          bindingId: newId(),
          scopeKind: 'project' as const,
          scopeId: projectId,
          workItemTypeId: null,
          position: compact ? 0 : nextPosition,
        };
        if (definition === undefined) {
          // Proof: omission leaked the lower authoring exception instead of the modeled refusal in both Sources (catalogue-import-fault-reserved-v1); lower protection stays active.
          if (isReservedStepCode(step.code))
            return {
              ok: false,
              code: 'source_refused',
              path:
                'steps[' +
                String(retained.findIndex((selected) => selected.fileId === step.fileId)) +
                '].code',
              detail: 'reserved_code',
            };
          const defined = await this.stores().stepCatalogue.defineAndBindStep(
            organizationId,
            {
              id: newId(),
              code: step.code,
              name: step.name,
              position: step.position,
              defaultEstimateUnit: step.estimateUnit,
              defaultAllowancePercent: step.allowancePercent,
            },
            binding,
            stamp,
          );
          this.authority.assertActive();
          if (!defined.ok)
            return {
              ok: false,
              code: 'source_refused',
              path:
                'steps[' +
                String(retained.findIndex((selected) => selected.fileId === step.fileId)) +
                ']',
              detail: defined.reason,
            };
          definition = defined.definition;
          for (const id of defined.workPackageIds) affected.add(id);
        } else {
          const bound = await this.stores().stepCatalogue.bindStep(
            organizationId,
            { ...binding, stepId: definition.id },
            stamp,
          );
          this.authority.assertActive();
          if (!bound.ok)
            return {
              ok: false,
              code: 'source_refused',
              path:
                'steps[' +
                String(retained.findIndex((selected) => selected.fileId === step.fileId)) +
                ']',
              detail: bound.reason,
            };
          for (const id of bound.workPackageIds) affected.add(id);
        }
        ownOrder.push(binding.bindingId);
        if (compact) {
          const reordered = await this.stores().stepCatalogue.reorderBindings(
            organizationId,
            { scopeKind: 'project', scopeId: projectId },
            ownOrder,
            stamp,
          );
          this.authority.assertActive();
          if (!reordered.ok)
            return { ok: false, code: 'source_refused', path: 'steps', detail: reordered.reason };
          for (const id of reordered.workPackageIds) affected.add(id);
        }
        position = compact ? ownOrder.length * 10 : nextPosition;
      }
      if (definition === undefined) throw new Error('resolved import definition is absent');
      selection.push({ ...step, id: definition.id });
    }
    this.#selection = selection;
    return {
      ok: true,
      stepIds: new Map(selection.map((step) => [step.fileId, step.id])),
      workPackageIds: [...affected].sort(),
    };
  }

  /** Sets file-authored values only after actual catalogue birth, before the first imported fact. */
  async initialize(workPackageId: string, stamp: WriteStamp): Promise<void> {
    this.authority.assertActive();
    const selection = this.#selection;
    if (selection === null) throw new Error('import step reconciliation is missing');
    const current = await this.stores().workPackages.stepsOf(workPackageId);
    this.authority.assertActive();
    const values = new Map(current.map((step) => [step.id, step]));
    for (const step of selection) {
      const initial = values.get(step.id);
      // Proof: omission lost this named missing-value diagnostic in both actual Sources (catalogue-import-fault-birth-values-v1); diagnostic evidence only.
      if (initial === undefined) throw new Error('import birth lacks a resolved step value');
      // Proof: dropping initialization left definition units on the imported package in both Sources (catalogue-import-fault-unit-value-v1).
      if (initial.estimateUnit !== step.estimateUnit) {
        const written = await this.stores().workPackages.setStepUnit(
          workPackageId,
          step.id,
          step.estimateUnit,
          stamp,
        );
        this.authority.assertActive();
        // Proof: ignoring the injected unit refusal lost this failure in both actual Sources (catalogue-import-fault-unit-refusal-v1).
        if (!written.ok) throw new Error('new import package unit refused: ' + written.reason);
      }
      if (initial.allowancePercent !== step.allowancePercent) {
        const written = await this.stores().workPackages.setStepAllowance(
          workPackageId,
          step.id,
          step.allowancePercent,
          stamp,
        );
        this.authority.assertActive();
        // Proof: ignoring the injected allowance refusal lost this failure in both actual Sources (catalogue-import-fault-allowance-refusal-v1).
        if (!written.ok) throw new Error('new import package allowance refused: ' + written.reason);
      }
    }
  }
}
