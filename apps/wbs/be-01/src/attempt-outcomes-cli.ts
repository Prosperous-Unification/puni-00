import { ATTEMPT_OUTCOMES } from '@wbs/domain';

/**
 * The attempt outcomes this release reads, for the production swap guard
 * (`attemptOutcomesCommand` in tool-remote-scripts). A release without this CLI
 * reads none, so the swap refuses it over any ended attempt.
 */
console.log(JSON.stringify(ATTEMPT_OUTCOMES));
