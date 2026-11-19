import type { HistoryStores, TransactionalStores } from '@wbs/core';

/** Writer authority is a source lifetime capability, outside CRUD store conformance. */
export type PortName =
  Exclude<keyof TransactionalStores, 'externalDependencyAuthoring'> | keyof HistoryStores;

export const PORT_NAMES = [
  'workPackages',
  'spaces',
  'workPackageRanks',
  'accessDecisions',
  'users',
  'directory',
  'organizationLimits',
  'capacity',
  'resourceCapacity',
  'priorityBands',
  'settings',
  'calendarMarkers',
  'eventLog',
  'planEvents',
  'stepCatalogue',
  'steps',
  'workItems',
  'estimates',
  'actuals',
  'measures',
  'measureEstimates',
  'budgets',
  'progress',
  'attempts',
  'blockages',
  'stepParallels',
  'runtimeCommands',
  'claims',
  'demands',
  'dependencies',
  'typedDependencies',
  'subtrees',
  'journal',
  'savedPlans',
  'savedPlanCapture',
  'livePlans',
] as const satisfies readonly PortName[];

export const CASE_MANIFEST = {
  livePlans: ['livePlans.read:legacy-and-absence'],
  workPackages: [
    'workPackages.create:steps',
    'workPackages.update:scope',
    'workPackages.recordOpen:reader-order',
  ],
  spaces: ['spaces.create:scoped-round-trip'],
  workPackageRanks: ['workPackageRanks.orderIn:scoped-move'],
  accessDecisions: ['accessDecisions.effectiveRoleAt:grant-reaches-package'],
  users: [
    'users.create:unique-name',
    'users.find:identity',
    'users.resolveOidcIdentity:issuer-subject',
    'users.resolveOidcIdentity:verified-conflict',
  ],
  directory: [
    'directory.addTag',
    'directory.assign:unknown_person',
    'directory.assign:scope-replace-clear',
    'directory.patchTeam:atomic-refusal',
    'directory.patchPerson:account-binding',
    'directory.patchPerson:owned-binding',
    'directory.removePerson:claims-in-use',
    'directory.removePerson:delegated-claims',
    'directory.addResource:taken',
    'directory.setResourceProvider:unknown-and-clear',
    'directory.setDirectoryCapacity:state-clear-remove',
    'directory.removeResource:in-use-cascade',
    'directory.listMeasures:seeded-per-organization',
    'directory.addMeasure:index-backstop',
    'directory.patchMeasure:scoped-key-frozen',
    'directory.patchMeasure:shape-frozen',
    'directory.removeMeasure:scoped',
    'directory.usageOfMeasure:facts',
    'directory.usageOfMeasure:estimates',
    'directory.usageOfMeasure:budgets',
  ],
  organizationLimits: [
    'organizationLimits.readAgentPersonCap:organization-scope',
    'organizationLimits.readConcurrentClaimCap:bound-triples',
    'organizationLimits.readCapacityCap:per-resource-except-work-package',
  ],
  capacity: [
    'capacity.set:work-package-team-key',
    'capacity.set:clear',
    'capacity.set:missing-reference',
  ],
  resourceCapacity: [
    'resourceCapacity.set:stated-zero-cleared',
    'resourceCapacity.set:missing-reference',
  ],
  priorityBands: [
    'priorityBands.listFor:defaults',
    'priorityBands.replace:whole-work-package',
    'priorityBands.replace:missing-work-package',
  ],
  settings: [
    'settings.readTarget:actual-chain-and-scope',
    'settings.capture:inherited-and-detached',
    'settings.write:refusal-and-clear',
    'settings.packageIds:descendants-and-touch',
  ],
  calendarMarkers: [
    'calendarMarkers.listFor:total-order',
    'calendarMarkers.write:work-package-scope',
  ],
  eventLog: [
    'eventLog.recordEvent',
    'eventLog.rangeSince',
    'eventLog.pruneBeyond',
    'eventLog.pruneBeyond:empty-sequence',
  ],
  planEvents: [
    'planEvents.listFor:filters-order',
    'planEvents.listFor:batches-limit',
    'planEvents.pruneOlderThan:strict-cutoff',
  ],
  stepCatalogue: [
    'stepCatalogue.defineAndBindStep:project-empty-materialization',
    'stepCatalogue.bindStep:scope-union-and-type-key',
    'stepCatalogue.defineAndBindStep:modeled-refusals-atomic',
    'stepCatalogue.defineAndBindStep:nan-default-atomic',
    'stepCatalogue.defineAndBindStep:range-default-atomic',
    'stepCatalogue.defineAndBindStep:precision-default-atomic',
    'stepCatalogue.write:queued-input-retention',
    'stepCatalogue.read:detached-nested-values',
    'stepCatalogue.lifetime:borrowed-settlement',
    'stepCatalogue.lifetime:source-close',
    'stepCatalogue.unbindStep:estimate-refusal-and-preview',
    'stepCatalogue.unbindStep:safe-preview-apply-retains-values',
    'stepCatalogue.unbindStep:redundant-binding-keeps-protected-node',
    'stepCatalogue.unbindStep:201-pairs-cap-and-order',
    'stepCatalogue.unbindStep:borrowed-preview-keeps-unrelated-commit',
    'stepCatalogue.unbindStep:borrowed-refusal-keeps-unrelated-commit',
    'stepCatalogue.factWrite:estimate-after-unbind',
    'stepCatalogue.factWrite:borrowed-estimate-refusal-keeps-commit',
    'stepCatalogue.factWrite:subtree-estimate-after-unbind',
    'stepCatalogue.factWrite:borrowed-subtree-refusal-keeps-commit',
    'stepCatalogue.factWrite:queued-estimate-input-retention',
    'stepCatalogue.unbindStep:queued-mode-retention',
    'stepCatalogue.unbindStep:borrowed-expiry',
    'stepCatalogue.unbindStep:detached-refusal',
    'stepCatalogue.unbindStep:source-close',
    'stepCatalogue.factRead:estimate-catalogue-order',
    'stepCatalogue.factRead:targeted-estimate-catalogue-order',
    'stepCatalogue.factWrite:estimate-target-types',
    'stepCatalogue.factWrite:borrowed-target-types-keep-commit',
    'stepCatalogue.factWrite:target-public-source-close',
    'stepCatalogue.factWrite:target-borrowed-after-commit',
    'stepCatalogue.factWrite:target-plain-repair-expiry',
    'stepCatalogue.factRead:work-package-catalogue-values',
    'stepCatalogue.factRead:estimate-borrowed-expiry',
    'stepCatalogue.factRead:estimate-public-source-close',
    'stepCatalogue.factRead:actual-current-order',
    'stepCatalogue.factRead:actual-targeted-order',
    'stepCatalogue.factRead:actual-malformed-value',
    'stepCatalogue.factRead:actual-unresolved-type',
    'stepCatalogue.factRead:progress-current-order',
    'stepCatalogue.factRead:progress-targeted-order',
    'stepCatalogue.factRead:progress-malformed-time',
    'stepCatalogue.factRead:progress-unresolved-type',
    'stepCatalogue.factRead:actual-borrowed-expiry',
    'stepCatalogue.factRead:actual-public-source-close',
    'stepCatalogue.factRead:progress-borrowed-expiry',
    'stepCatalogue.factRead:progress-public-source-close',
    'stepCatalogue.factRead:measures-current-tuples',
    'stepCatalogue.factRead:measures-targeted-tuples',
    'stepCatalogue.factRead:measure-estimates-current-tuples',
    'stepCatalogue.factRead:attempts-current-tuples',
    'stepCatalogue.factRead:attempts-targeted-tuples',
    'stepCatalogue.factRead:issued-counter-selection',
    'stepCatalogue.factWrite:subtree-queued-payload-retention',
    'stepCatalogue.factWrite:subtree-borrowed-expiry',
    'stepCatalogue.factWrite:subtree-public-source-close',
    'stepCatalogue.unbindStep:parent-allocator-delete-unbind-revival',
    'stepCatalogue.unbindStep:sibling-parent-allocator-not-global-veto',
    'stepCatalogue.unbindStep:foreign-parent-allocator-not-global-veto',
    'stepCatalogue.factRead:issued-parent-allocator-retention',
    'stepCatalogue.pointWrite:actual-unknown',
    'stepCatalogue.pointWrite:actual-untyped',
    'stepCatalogue.pointWrite:actual-conflict',
    'stepCatalogue.pointWrite:actual-parent',
    'stepCatalogue.pointWrite:progress-unknown',
    'stepCatalogue.pointWrite:progress-untyped',
    'stepCatalogue.pointWrite:progress-conflict',
    'stepCatalogue.pointWrite:progress-parent',
    'stepCatalogue.pointWrite:measure-unknown',
    'stepCatalogue.pointWrite:measure-untyped',
    'stepCatalogue.pointWrite:measure-conflict',
    'stepCatalogue.pointWrite:measure-parent',
    'stepCatalogue.factWrite:subtree-actual-refusal',
    'stepCatalogue.factWrite:borrowed-subtree-actual-refusal',
    'stepCatalogue.factWrite:subtree-progress-refusal',
    'stepCatalogue.factWrite:borrowed-subtree-progress-refusal',
    'stepCatalogue.factWrite:subtree-measure-refusal',
    'stepCatalogue.factWrite:borrowed-subtree-measure-refusal',
  ],
  steps: ['steps.add', 'steps.rename', 'steps.rename:unknown'],
  workItems: [
    'workItems.listByIds:labels-scope',
    'workItems.listPlacements:source-order',
    'workItems.insert:respace',
    'workItems.patch:refusal-atomic',
    'workItems.move:parent-position',
    'workItems.remove:promotion',
    'workItems.setFrozenNumbers:clear',
  ],
  estimates: [
    'estimates.listByWorkItems:scope-order',
    'estimates.listPlacements:source-order',
    'estimates.set',
    'estimates.set:replace',
    'estimates.set:unknown_step',
    'estimates.remove',
    'estimates.moveAll:ownership',
  ],
  actuals: [
    'actuals.listPlacements:source-order',
    'actuals.listByWorkItems:scope-order',
    'actuals.set:replace',
    'actuals.remove:pair',
    'actuals.moveAll:ownership',
    'actuals.set:unknown_step',
  ],
  measures: [
    'measures.listPlacements:source-order',
    'measures.listByWorkItems:scope-order',
    'measures.set:metric-key',
    'measures.remove:metric-key',
    'measures.moveAll:all-metrics',
    'measures.set:unknown_step',
    'measures.set:alias-one-row',
    'measures.set:defined-key',
    'measures.set:legacy-estimate-replaces-trio',
    'measures.set:basis',
  ],
  measureEstimates: [
    'measureEstimates.set:defined-key',
    'measureEstimates.set:three-point-clears-flag',
    'measureEstimates.moveAll:every-key',
    'measureEstimates.set:basis',
  ],
  budgets: ['budgets.set:defined-key', 'budgets.set:replace-remove'],
  progress: [
    'progress.listPlacements:source-order',
    'progress.listByWorkItems:scope-order',
    'progress.set:replace',
    'progress.remove:absence',
    'progress.moveAll:ownership',
    'progress.set:unknown_step',
  ],
  attempts: [
    'attempts.start:number-and-running',
    'attempts.start:never-reuses',
    'attempts.moveAll:ownership',
    'attempts.moveAll:issued',
  ],
  blockages: ['blockages.set:read-remove'],
  // Proof: family removed; complete-source inventory assertion failed (source-inventory.txt), 2026-10-15.
  stepParallels: ['stepParallels.set:sparse-replace-remove'],
  runtimeCommands: ['runtimeCommands.write:permanent-history'],
  claims: [
    'claims.add:taken-stated-remove',
    'claims.listStampedByWorkPackage:write-instant',
    'claims.remove:delegated-cascade',
    'claims.moveAll:in-place',
    'claims.lease:write-renew-expire',
    'claims.observeWorkPackage:legacy-observation',
    'claims.lease:revoked-instant-read',
    'claims.lease:run-scoped',
    'claims.occupancy:hold-read-cascade',
    'claims.occupancy:organization-scope',
  ],
  demands: ['demands.set:replace-clear-scope', 'demands.set:missing-reference'],
  dependencies: [
    'dependencies.listByWorkItems:incident-scope',
    'dependencies.add:idempotent-pair',
    'dependencies.remove:pair',
    'dependencies.removeAllFor:touching-set',
  ],
  typedDependencies: ['typedDependencies.write:identity-and-bulk'],
  subtrees: ['subtrees.insertSubtree:complete-copy', 'subtrees.insertSubtree:late-failure'],
  journal: [
    'journal.append:history-atomic',
    'journal.append:account-redo-depth',
    'journal.append:acting-person-stacks',
    'journal.flip:preconditions',
    'journal.appendEvent:history-only',
  ],
  savedPlans: [
    'savedPlans.write:bytes-and-bodies',
    'savedPlans.write:quota-refusal',
    'savedPlans.write:quota-window',
    'savedPlans.touch:principals-scope',
    'savedPlans.write:late-body-failure',
  ],
  savedPlanCapture: [
    'savedPlanCapture.readPlanInput:complete',
    'savedPlanCapture.readPlanInput:coherent-interleave',
    'savedPlanCapture.readPlanInput:missing-work-package',
    'savedPlanCapture.readPlanInput:detached',
  ],
} as const satisfies Record<PortName, readonly string[]>;

export const SUPPLEMENTAL_CASE_MANIFEST = {
  common: ['history.batch:independent-commit', 'history.batch:independent-rollback'],
  immediateBusy: ['history.batch:busy-does-not-wait'],
  independentWrite: ['history.batch:interleaved-success-survives'],
} as const;

export type FamilyCaseId = (typeof CASE_MANIFEST)[PortName][number];
export type SupplementalCaseId =
  (typeof SUPPLEMENTAL_CASE_MANIFEST)[keyof typeof SUPPLEMENTAL_CASE_MANIFEST][number];
export type CaseId = FamilyCaseId | SupplementalCaseId;
export type CaseFamily = PortName | 'history';
export type HistoryAdmission = 'immediate-busy' | 'independent-write';

export interface ExpectedCase {
  readonly family: CaseFamily;
  readonly caseId: CaseId;
}

export interface CaseLifecycle {
  readonly fixtureId: string;
  assert(): Promise<void>;
  close(): Promise<void>;
}

export interface CaseRegistration {
  readonly family: CaseFamily;
  readonly caseId: CaseId;
  openAndRun?(): Promise<CaseLifecycle>;
}

/** Keeps the catalog coupled to the port composition at its type boundary. */
export function defineCaseManifest<
  Transactional extends TransactionalStores,
  History extends HistoryStores,
>(manifest: Record<keyof Transactional | keyof History, readonly string[]>) {
  return manifest;
}

/** The exact cases one source admission mechanism must execute. */
export function expectedCasesFor(admission: HistoryAdmission): readonly ExpectedCase[] {
  const familyCases = PORT_NAMES.flatMap((family) =>
    CASE_MANIFEST[family].map((caseId) => ({ family, caseId })),
  );
  const mechanismCases =
    admission === 'immediate-busy'
      ? SUPPLEMENTAL_CASE_MANIFEST.immediateBusy
      : SUPPLEMENTAL_CASE_MANIFEST.independentWrite;
  return [
    ...familyCases,
    ...SUPPLEMENTAL_CASE_MANIFEST.common.map((caseId) => ({ family: 'history' as const, caseId })),
    ...mechanismCases.map((caseId) => ({ family: 'history' as const, caseId })),
  ];
}
