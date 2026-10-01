import { createHash } from 'node:crypto';

import {
  openConnection,
  SqliteBrowserCredentialRevocations,
  SqliteOrganizationSelection,
  WriteCoordinator,
} from '@wbs/store-sqlite';
import { decodeJwt } from 'jose';

import {
  organizationCookieBinding,
  organizationCookieCarrier,
} from '../runtime/organization-cookie';
import { organizationSelection } from '../runtime/organization-selection';
import { TEST_JWT_KEY } from './auth-fixture';

const argumentsOfReader = process.argv.slice(2);
if (argumentsOfReader.length !== 4)
  throw new Error('browser revocation reader needs path, user, token and selection cookie');
const [databasePath, userId, token, pair] = argumentsOfReader;
const claims = decodeJwt(token);
if (typeof claims.exp !== 'number') throw new Error('test credential has no expiry');
const carrier = organizationCookieCarrier(new Headers({ cookie: pair }));
if (carrier.kind !== 'present') throw new Error('test selection cookie is malformed');

const connection = openConnection(databasePath);
try {
  const composition = organizationSelection(
    new SqliteOrganizationSelection(connection.db),
    organizationCookieBinding(TEST_JWT_KEY),
    new SqliteBrowserCredentialRevocations(connection.db, new WriteCoordinator()),
  );
  const bound = await composition.activeOrganizationOf({
    id: userId,
    organizationBinding: {
      credential: {
        kind: 'native',
        userId,
        digest: createHash('sha256').update(token, 'utf8').digest('hex'),
        expiresAt: claims.exp * 1000,
      },
      cookie: carrier.value,
    },
  });
  process.stdout.write(String(bound));
} finally {
  connection.close();
}
