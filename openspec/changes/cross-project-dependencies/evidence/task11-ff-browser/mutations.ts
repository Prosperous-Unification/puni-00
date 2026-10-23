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
  'desktop FF edit persists identity',
];
const receipts: { fault: string; exit: number; assertion: string }[] = [];
const faults = [
  {
    label: 'serialization',
    path: 'apps/wbs/fe-01/src/components/wbs/dependency-navigation.tsx',
    change(source: string) {
      return source.replace(
        'void onSave(type, chosenSuccessor.endpoint, chosenSource?.endpoint)',
        "void onSave('FS', chosenSuccessor.endpoint, chosenSource?.endpoint)",
      );
    },
    assertions: ['FF serialization', '"type": "FF"', '"type": "FS"'],
  },
  {
    label: 'storage',
    path: 'libs/wbs/adapters/store-sqlite/src/typed-dependency.ts',
    change(source: string) {
      return source.replace(
        'tx.update(externalDependency)\n            .set({\n              ...mapStoredColumns(row),',
        "tx.update(externalDependency)\n            .set({\n              ...mapStoredColumns({ ...row, type: 'FS' }),",
      );
    },
    assertions: ['persisted FF tuple', '"type": "FF"', '"type": "FS"'],
  },
  {
    label: 'finish',
    path: 'libs/wbs/domain/domain/src/execution-eligibility.ts',
    change(source: string) {
      return source.replace(
        'if (!predecessor.facts.done) successor.finishBlockers.push(blocker);',
        'if (!predecessor.facts.done) continue;',
      );
    },
    assertions: ['FF blocks finish before completion', '"canFinish": false', '"canFinish": true'],
  },
  {
    label: 'start',
    path: 'libs/wbs/domain/domain/src/execution-eligibility.ts',
    change(source: string) {
      return source.replace(
        'if (!predecessor.facts.done) successor.finishBlockers.push(blocker);',
        'if (!predecessor.facts.done) successor.startBlockers.push(blocker);',
      );
    },
    assertions: ['FF permits start before completion', '"canStart": true', '"canStart": false'],
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
    void (async () => {
      if (child !== undefined) {
        process.kill(-child.pid, 'SIGTERM');
        await child.exited;
      }
      restoreSource();
      process.exit(130);
    })();
  };
  process.once('SIGINT', cancelRun);
  process.once('SIGTERM', cancelRun);
  try {
    writeFileSync(path, changed);
    child = Bun.spawn(command, {
      cwd: root,
      detached: true,
      env: { ...process.env, NX_DAEMON: 'false', NX_ISOLATE_PLUGINS: 'false' },
      stdout: descriptor,
      stderr: descriptor,
    });
    const exit = await child.exited;
    assert.equal(exit, 1, `${fault.label} must fail through the actual Nx target`);
    const output = readFileSync(logPath, 'utf8');
    // Each receipt requires the selected assertion after accepted FF editing; setup failures do not count.
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
