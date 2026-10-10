import {
  openConnection,
  SqliteBrowserCredentialRevocations,
  WriteCoordinator,
} from '@wbs/store-sqlite';

const argumentsOfWriter = process.argv.slice(2);
if (argumentsOfWriter.length !== 4)
  throw new Error('browser revocation writer needs path, user, digest and expiry');
const [databasePath, userId, digest, expiresAt] = argumentsOfWriter;

const connection = openConnection(databasePath);
try {
  await new SqliteBrowserCredentialRevocations(connection.db, new WriteCoordinator()).revoke(
    { kind: 'native', userId, digest, expiresAt: Number(expiresAt) },
    Date.now(),
  );
} finally {
  connection.close();
}
