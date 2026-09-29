import { READINESSES } from '@wbs/domain';

/**
 * The readinesses this release reads, for the production swap guard
 * (`readinessKindsCommand` in tool-remote-scripts). A release without this CLI
 * reads none, so the swap refuses it over any stored readiness.
 */
console.log(JSON.stringify(READINESSES));
