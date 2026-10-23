import { strict as assert } from 'node:assert';
import { closeSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../../../', import.meta.url));
const evidence = import.meta.dirname;
const command = [
  'bunx',
  'nx',
  'run',
  'wbs-fe-01:e2e-cross-project',
  '--skip-nx-cache',
  '--',
  '--grep',
  'phone alphabetical discovery',
];
const receipts: { fault: string; exit: number; assertion: string }[] = [];
const faults = [
  {
    label: 'step',
    path: 'libs/wbs/adapters/store-sqlite/src/typed-dependency.ts',
    change(source: string) {
      const start = source.indexOf('  async add(row: StoredTypedDependency');
      const finish = source.indexOf('  async update(', start);
      assert(start >= 0 && finish > start, 'external add section must exist');
      const section = source
        .slice(start, finish)
        .replaceAll(
          '...mapStoredColumns(row),',
          "...mapStoredColumns({ ...row, predecessor: { projectId: row.predecessor.projectId, workItemId: row.predecessor.workItemId, scope: 'whole' } }),",
        );
      return source.slice(0, start) + section + source.slice(finish);
    },
    assertions: ['Error: expect(received).toEqual(expected)', 'predecessor_scope', 'whole', 'node'],
  },
  {
    label: 'discovery',
    path: 'apps/wbs/fe-01/src/components/wbs/use-dependency-search.ts',
    change(source: string) {
      return source.replace(
        'const eligible = active && (scoped !== null || /^[A-Za-z]/.test(token));',
        'const eligible = active && scoped !== null;',
      );
    },
    assertions: [
      'Error: expect(locator).toBeVisible() failed',
      "name: 'Project AXX - A', exact: true",
      'Error: element(s) not found',
    ],
  },
  {
    label: 'owner',
    path: 'libs/wbs/adapters/store-sqlite/src/typed-dependency.ts',
    change(source: string) {
      const start = source.indexOf('  async add(row: StoredTypedDependency');
      const finish = source.indexOf('  async update(', start);
      assert(start >= 0 && finish > start, 'external add section must exist');
      const section = source
        .slice(start, finish)
        .replaceAll(
          '...mapStoredColumns(row),',
          '...mapStoredColumns({ ...row, predecessor: row.successor, successor: row.predecessor }),',
        )
        .replace(
          'predecessorProjectId: row.predecessor.projectId,',
          'predecessorProjectId: row.successor.projectId,',
        )
        .replace(
          'successorProjectId: row.successor.projectId,',
          'successorProjectId: row.predecessor.projectId,',
        );
      return source.slice(0, start) + section + source.slice(finish);
    },
    assertions: [
      'Error: expect(received).toHaveLength(expected)',
      'Expected length: 1',
      'Received length: 0',
      'expect(rows).toHaveLength(1)',
    ],
  },
];

for (const fault of faults) {
  const path = `${root}/${fault.path}`;
  const original = readFileSync(path);
  const changed = fault.change(original.toString('utf8'));
  assert.notEqual(changed, original.toString('utf8'), `${fault.label} fault must apply`);
  const logPath = `${evidence}/${fault.label}-negative.log`;
  const descriptor = openSync(logPath, 'w');
  const restoreSource = () => {
    writeFileSync(path, original);
  };
  let child: ReturnType<typeof Bun.spawn> | undefined;
  const cancelRun = () => {
    child?.kill();
    restoreSource();
    process.exit(130);
  };
  process.once('SIGINT', cancelRun);
  process.once('SIGTERM', cancelRun);
  try {
    writeFileSync(path, changed);
    child = Bun.spawn(command, {
      cwd: root,
      env: { ...process.env, NX_DAEMON: 'false', NX_ISOLATE_PLUGINS: 'false' },
      stdout: descriptor,
      stderr: descriptor,
    });
    const exit = await child.exited;
    assert.equal(exit, 1, `${fault.label} must fail through the actual Nx target`);
    const output = readFileSync(logPath, 'utf8');
    // Proof: stored-node widening, discovery removal and reversed ownership each reached their named phone assertion.
    for (const assertion of fault.assertions) {
      assert(output.includes(assertion), `${fault.label} missing intended failure: ${assertion}`);
    }
    assert(output.includes('1 failed'), `${fault.label} must execute the browser case`);
    receipts.push({ fault: fault.label, exit, assertion: fault.assertions.join('; ') });
    console.log(`${fault.label}: exit ${String(exit)}, intended browser assertion observed`);
  } finally {
    restoreSource();
    closeSync(descriptor);
    process.removeListener('SIGINT', cancelRun);
    process.removeListener('SIGTERM', cancelRun);
  }
  assert(readFileSync(path).equals(original), `${fault.label} source must be restored exactly`);
}
writeFileSync(`${evidence}/mutations.json`, `${JSON.stringify(receipts, null, 2)}\n`);
