import type { PlanCommandPorts, PlanCommands } from './contract';

/**
 * Binds the plan's commands to one project over the routes it was handed.
 *
 * Each member looks its route up **when it is called**: the routes object is
 * the one HTTP client, and a suite that records or replaces one of its methods
 * after the table is drawn must still see every request. Arguments are passed
 * on as they came, so a call that leaves an optional one out leaves it out.
 */
// @capability wbs-table-modules
export function createPlanCommands({ projectId, routes }: PlanCommandPorts): PlanCommands {
  return {
    undo: (...rest) => routes.undo(projectId, ...rest),
    redo: (...rest) => routes.redo(projectId, ...rest),
    // Proof: on 2026-09-24, wrapping the route's promise in another (`.then((plan) => plan)`)
    // failed `sends every project command to the project it was bound to, with the rest as
    // given` with `exportPlan: expected Promise{…} to be Promise{…}`.
    exportPlan: (...rest) => routes.exportPlan(projectId, ...rest),
    setEstimateMethod: (...rest) => routes.setEstimateMethod(projectId, ...rest),
    setEstimateArithmetic: (...rest) => routes.setEstimateArithmetic(projectId, ...rest),
    setDepReach: (...rest) => routes.setDepReach(projectId, ...rest),
    setOptimizationSettings: (...rest) => routes.setOptimizationSettings(projectId, ...rest),
    retryOptimization: (...rest) => routes.retryOptimization(projectId, ...rest),
    setStartDate: (...rest) => routes.setStartDate(projectId, ...rest),
    setTeamCapacity: (...rest) => routes.setTeamCapacity(projectId, ...rest),
    setPriorityBands: (...rest) => routes.setPriorityBands(projectId, ...rest),
    addStep: (...rest) => routes.addStep(projectId, ...rest),
    renameStep: (...rest) => routes.renameStep(projectId, ...rest),
    removeStep: (...rest) => routes.removeStep(projectId, ...rest),
    createWorkItem: (...rest) => routes.createWorkItem(projectId, ...rest),
    arrangeBySchedule: (...rest) => routes.arrangeBySchedule(projectId, ...rest),
    // Proof: on 2026-09-24, sending `freezeProject` to the `unfreezeProject` route here failed
    // `sends every project command to the project it was bound to, with the rest as given`: the
    // calls received `unfreezeProject` where `freezeProject` was expected.
    // Proof: on 2026-09-24, binding the route when the commands were built
    // (`routes.freezeProject.bind(routes, projectId)`) failed `reaches each route when it is
    // called, not when the commands were built` with `expected [ 'patch:w1' ] to deeply equal
    // [ 'freeze:p1', 'patch:w1' ]`: the replaced route never heard the call.
    freezeProject: (...rest) => routes.freezeProject(projectId, ...rest),
    unfreezeProject: (...rest) => routes.unfreezeProject(projectId, ...rest),
    // Proof: on 2026-09-24, handing `patchWorkItem` the project in place of the work item failed
    // `passes every work-item command through unchanged, leaving out what the caller left out`:
    // the route received `p1` where `w1` was expected.
    patchWorkItem: (...args) => routes.patchWorkItem(...args),
    // Proof: on 2026-09-24, passing `setStatus` all four parameters by name, so a left-out
    // `factStart` arrived as `undefined`, failed `passes every work-item command through unchanged,
    // leaving out what the caller left out`: the recorded call gained a trailing `undefined`.
    setStatus: (...args) => routes.setStatus(...args),
    assignPerson: (...args) => routes.assignPerson(...args),
    moveWorkItem: (...args) => routes.moveWorkItem(...args),
    duplicateWorkItem: (...args) => routes.duplicateWorkItem(...args),
    removeWorkItem: (...args) => routes.removeWorkItem(...args),
    setEstimate: (...args) => routes.setEstimate(...args),
    clearEstimate: (...args) => routes.clearEstimate(...args),
    unfreezeWorkItem: (...args) => routes.unfreezeWorkItem(...args),
    addDependency: (...args) => routes.addDependency(...args),
    removeDependency: (...args) => routes.removeDependency(...args),
    addTeam: (...args) => routes.addTeam(...args),
    addService: (...args) => routes.addService(...args),
    addWorkItemType: (...args) => routes.addWorkItemType(...args),
    addTag: (...args) => routes.addTag(...args),
    addPerson: (...args) => routes.addPerson(...args),
  };
}
