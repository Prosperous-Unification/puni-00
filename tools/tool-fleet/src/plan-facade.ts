/**
 * The only fleet capability Twilight Dash may reach: enrollment planning.
 * `@tools/fleet-plan` resolves here, not to `cli.ts`, so `runApply` and the other commands stay
 * out of Dash's type and module surface.
 */
export { runPlan } from './cli';
