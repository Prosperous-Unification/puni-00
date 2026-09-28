// A dry run of task 2.4's organization selection over an explicit database
// copy: for every local user, whether a browser session would have to
// onboard or choose among its memberships, and the activation marker. Opens
// the file read-only, so the copy is left byte for byte as it was.
//
//   DB_PATH=/path/to/copy.db bun run src/organization-selection-preview-cli.ts
//
// Prints one JSON document on stdout. A missing file, a broken marker or a
// malformed membership role fails with a non-zero exit instead of a report.
import { openReadOnlyConnection } from '@wbs/store-sqlite/db';
import { previewOrganizationSelection } from '@wbs/store-sqlite/organization-selection-preview';

const dbPath = process.env['DB_PATH'];
if (dbPath === undefined || dbPath === '') throw new Error('DB_PATH must be set');

const connection = openReadOnlyConnection(dbPath);
try {
  console.log(JSON.stringify(previewOrganizationSelection(connection.db), null, 2));
} finally {
  connection.close();
}
