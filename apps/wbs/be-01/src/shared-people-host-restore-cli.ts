import { restoreSharedPeopleOnHost } from './shared-people-host-restore';

const args = process.argv.slice(2);
const backup = args.at(0);
const references = args.slice(1);
const operations = references.filter((argument) => argument.startsWith('--operation='));
const approvals = references.filter((argument) => argument.startsWith('--approval='));
// Proof: bypassing argument validation lost usage refusals for missing file, actor assertions and malformed references.
if (
  backup === undefined ||
  backup === '' ||
  operations.length > 1 ||
  references.length !== operations.length + approvals.length ||
  references.some((argument) => argument.endsWith('='))
)
  throw new Error(
    'usage: shared-people-host-restore-cli.ts <backup-file> [--operation=<id>] [--approval=<id> ...]',
  );
const operation = operations.at(0);
const count = await restoreSharedPeopleOnHost(
  {
    backup,
    ...(operation === undefined ? {} : { operationId: operation.slice('--operation='.length) }),
    approvalIds: approvals.map((argument) => argument.slice('--approval='.length)),
  },
  {
    database: '/home/puni1/wbs/data/wbs.db',
    lock: '/home/puni1/wbs/state/deploy.lock',
    docker: 'docker',
  },
);
console.log(
  `shared people restore: ${String(count.organizations)} organizations, ${String(count.ranks)} ranks`,
);
