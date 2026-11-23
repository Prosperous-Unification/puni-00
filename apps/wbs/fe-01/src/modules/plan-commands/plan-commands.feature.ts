import type { PlanCommandPorts, PlanCommands } from './contract';

/**
 * Binds the plan's commands to one work package over the routes it was handed.
 *
 * Each member looks its route up **when it is called**: the routes object is
 * the one HTTP client, and a suite that records or replaces one of its methods
 * after the table is drawn must still see every request. Arguments are passed
 * on as they came, so a call that leaves an optional one out leaves it out.
 */
// @capability wbs-table-modules
export function createPlanCommands({ workPackageId, routes }: PlanCommandPorts): PlanCommands {
  // Proof: restoring renameStep here failed the actual bound-command surface case in package-step-values-surface.test.tsx.
  return {
    undo: (...rest) => routes.undo(workPackageId, ...rest),
    redo: (...rest) => routes.redo(workPackageId, ...rest),
    // Proof: on 2026-09-24, wrapping the route's promise in another (`.then((plan) => plan)`)
    // failed `sends every workPackage command to the workPackage it was bound to, with the rest as
    // given` with `exportPlan: expected Promise{…} to be Promise{…}`.
    exportPlan: (...rest) => routes.exportPlan(workPackageId, ...rest),
    readClaimHistory: (...rest) => routes.readClaimHistory(workPackageId, ...rest),
    setEstimateMethod: (...rest) => routes.setEstimateMethod(workPackageId, ...rest),
    setEstimateArithmetic: (...rest) => routes.setEstimateArithmetic(workPackageId, ...rest),
    setDepReach: (...rest) => routes.setDepReach(workPackageId, ...rest),
    setOptimizationSettings: (...rest) => routes.setOptimizationSettings(workPackageId, ...rest),
    retryOptimization: (...rest) => routes.retryOptimization(workPackageId, ...rest),
    setStartDate: (...rest) => routes.setStartDate(workPackageId, ...rest),
    setTimezone: (...rest) => routes.setTimezone(workPackageId, ...rest),
    setTeamCapacity: (...rest) => routes.setTeamCapacity(workPackageId, ...rest),
    setPriorityBands: (...rest) => routes.setPriorityBands(workPackageId, ...rest),
    setStepUnit: (...rest) => routes.setStepUnit(workPackageId, ...rest),
    setStepAllowance: (...rest) => routes.setStepAllowance(workPackageId, ...rest),
    createWorkItem: (...rest) => routes.createWorkItem(workPackageId, ...rest),
    arrangeBySchedule: (...rest) => routes.arrangeBySchedule(workPackageId, ...rest),
    // Proof: on 2026-09-24, sending `freezeWorkPackage` to the `unfreezeWorkPackage` route here failed
    // `sends every workPackage command to the workPackage it was bound to, with the rest as given`: the
    // calls received `unfreezeWorkPackage` where `freezeWorkPackage` was expected.
    // Proof: on 2026-09-24, binding the route when the commands were built
    // (`routes.freezeWorkPackage.bind(routes, workPackageId)`) failed `reaches each route when it is
    // called, not when the commands were built` with `expected [ 'patch:w1' ] to deeply equal
    // [ 'freeze:p1', 'patch:w1' ]`: the replaced route never heard the call.
    freezeWorkPackage: (...rest) => routes.freezeWorkPackage(workPackageId, ...rest),
    unfreezeWorkPackage: (...rest) => routes.unfreezeWorkPackage(workPackageId, ...rest),
    addTypedDependency: (...rest) => routes.addTypedDependency(workPackageId, ...rest),
    updateTypedDependency: (...rest) => routes.updateTypedDependency(workPackageId, ...rest),
    removeTypedDependency: (...rest) => routes.removeTypedDependency(workPackageId, ...rest),
    readResources: (...rest) => routes.readResources(workPackageId, ...rest),
    setDemands: (...rest) => routes.setDemands(workPackageId, ...rest),
    // Proof: on 2026-09-24, handing `patchWorkItem` the work package in place of the work item failed
    // `passes every work-item command through unchanged, leaving out what the caller left out`:
    // the route received `p1` where `w1` was expected.
    patchWorkItem: (...args) => routes.patchWorkItem(...args),
    // Proof: on 2026-09-24, passing `setStatus` all four parameters by name, so a left-out
    // `factStart` arrived as `undefined`, failed `passes every work-item command through unchanged,
    // leaving out what the caller left out`: the recorded call gained a trailing `undefined`.
    setStatus: (...args) => routes.setStatus(...args),
    setProgress: (...args) => routes.setProgress(...args),
    clearProgress: (...args) => routes.clearProgress(...args),
    setStepBlocked: (...args) => routes.setStepBlocked(...args),
    startAttempt: (...args) => routes.startAttempt(...args),
    endAttempt: (...args) => routes.endAttempt(...args),
    removeAttempt: (...args) => routes.removeAttempt(...args),
    listTimezones: (...args) => routes.listTimezones(...args),
    assignPerson: (...args) => routes.assignPerson(...args),
    moveWorkItem: (...args) => routes.moveWorkItem(...args),
    duplicateWorkItem: (...args) => routes.duplicateWorkItem(...args),
    removeWorkItem: (...args) => routes.removeWorkItem(...args),
    setEstimate: (...args) => routes.setEstimate(...args),
    clearEstimate: (...args) => routes.clearEstimate(...args),
    listMeasures: (...args) => routes.listMeasures(...args),
    setMeasureEstimate: (...args) => routes.setMeasureEstimate(...args),
    clearMeasureEstimate: (...args) => routes.clearMeasureEstimate(...args),
    setMeasure: (...args) => routes.setMeasure(...args),
    clearMeasure: (...args) => routes.clearMeasure(...args),
    setBudget: (...args) => routes.setBudget(...args),
    clearBudget: (...args) => routes.clearBudget(...args),
    unfreezeWorkItem: (...args) => routes.unfreezeWorkItem(...args),
    claimWorkItem: (...args) => routes.claimWorkItem(...args),
    releaseWorkItem: (...args) => routes.releaseWorkItem(...args),
    addDependency: (...args) => routes.addDependency(...args),
    removeDependency: (...args) => routes.removeDependency(...args),
    addTeam: (...args) => routes.addTeam(...args),
    addService: (...args) => routes.addService(...args),
    addWorkItemType: (...args) => routes.addWorkItemType(...args),
    addTag: (...args) => routes.addTag(...args),
    addPerson: (...args) => routes.addPerson(...args),
  };
}
