import { installTenantFixtureOwnership } from './edge-init-owner-mock';

const root = process.env['EDGE_INIT_RECOVERY_OWNER_ROOT'];
if (root === undefined || !/^\/tmp\/edge-init-recovery-chain-[^/]+$/.test(root))
  throw new Error('isolated recovery owner root missing');
const fault = process.env['EDGE_INIT_RECOVERY_OWNER_FAULT'];
if (fault !== undefined && fault !== 'receipt-directory-owner-mismatch')
  throw new Error('isolated recovery owner fault unknown');
await installTenantFixtureOwnership(root, fault);
