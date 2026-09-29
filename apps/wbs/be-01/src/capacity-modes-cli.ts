import { CAPACITY_MODES } from '@wbs/core/ports/project-store';

/**
 * The capacity modes this release reads, for the production swap guard
 * (`capacityModesCommand` in tool-remote-scripts). A release without this CLI
 * reads none, so the swap refuses it while any organization is shared.
 */
console.log(JSON.stringify(CAPACITY_MODES));
