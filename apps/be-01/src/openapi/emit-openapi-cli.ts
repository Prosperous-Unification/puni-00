/**
 * Rewrites the committed OpenAPI document from the routes be-01 actually serves.
 *
 *     bun apps/be-01/src/openapi/emit-openapi-cli.ts
 *
 * Run it after adding, moving or annotating a route. `openapi-document.test.ts`
 * fails until you do, which is the whole point of committing the file: a document
 * that rots is worse than none, because a caller reads it as current.
 *
 * The app is `testApp()` — the test doubles from `src/testing`, and that is not
 * a shortcut: route registration touches no service. The same fixture builds
 * the app `openapi-document.test.ts` compares this file against, which is the
 * point of it being a fixture. A double passed to one and not the other is a
 * document that fails its own freshness check for a reason neither file says.
 *
 * In `src` beside `migrate-cli.ts` rather than in `apps/be-01/tools`, which is
 * outside both of be-01's tsconfigs and outside its lint: the file that writes a
 * committed artifact is the last one that should be unchecked. The cost is that
 * `src/testing` is imported from a non-test file, which nothing else in `src`
 * does; the fixtures are already compiled by `tsconfig.lib.json`, and nothing
 * reaches this module from `main.ts`, so what ships is unchanged.
 */
import { writeFileSync } from 'node:fs';

import { testApp } from '../testing/app-fixture';
import { documentFromApp, OPENAPI_DOCUMENT_FILE, serialiseDocument } from './document-from-app';

/**
 * Guarded rather than bare, unlike `migrate-cli.ts`: an import of this module
 * writes a file, and `migrate-cli.ts`'s worst case is a missing `DB_PATH`.
 * `doc-caps.ts` is the house pattern for a script that must not act on import.
 */
if (import.meta.main) {
  const app = testApp();
  writeFileSync(OPENAPI_DOCUMENT_FILE, serialiseDocument(await documentFromApp(app)), 'utf8');
  console.log(`wrote ${OPENAPI_DOCUMENT_FILE}`);
}
