import type { DirectoryService, DirectoryServiceOptions } from './directory.resource';

/**
 * What a host must supply to install {@link directoryModule}.
 *
 * Exactly {@link DirectoryServiceOptions}, unchanged by the move: the
 * directory store of the one scope being installed over, the broadcaster and
 * the clock. `servicesOver` supplies the store of each admitted scope, so one
 * installation never outlives the scope it was built over.
 *
 * **No K6 debt; K4 support and K2 debt disclosed.** Directory is a resource:
 * it imports the domain library, repository ports and no other resource. It
 * still imports two support files from `service/`, `clean-name.ts` and
 * `directory-usage.ts`, which the backend module map moves to the domain
 * library (task 6.1); until then that is a resource reading application-ring
 * support rather than the domain. Delivery's and features' side is not closed
 * either: `http/directory.routes.ts`, `http/project.routes.ts`, Plan import's
 * `plan-import.feature.ts` and `service/plan-commands.ts` still name
 * `DirectoryService` directly, the direct resource dependency (K2) the map
 * lists under its composition hazards. Tracked under task 7.4 of
 * `openspec/changes/adopt-di-composition/tasks.md`.
 */
export type DirectoryRequirements = DirectoryServiceOptions;

/** What installing {@link directoryModule} adds to a host graph. */
export interface DirectoryExports {
  readonly directory: DirectoryService;
}

/**
 * The DI Bag label this module's private bindings are named under.
 *
 * `application` is the ring, matching every earlier core module; the wiki
 * module identifier is `module.application.directory` and the label drops the
 * `module.` prefix.
 */
export const DIRECTORY_LABEL = 'application.directory';
