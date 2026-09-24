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
    freezeProject: (...rest) => routes.freezeProject(projectId, ...rest),
    unfreezeProject: (...rest) => routes.unfreezeProject(projectId, ...rest),
    patchWorkItem: (...args) => routes.patchWorkItem(...args),
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
