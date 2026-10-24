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
  'abbreviation edit',
];
const receipts: { fault: string; exit: number; assertion: string[] }[] = [];
const faults = [
  {
    label: 'persistence',
    path: 'libs/wbs/adapters/store-sqlite/src/project.ts',
    from: 'if (abbreviation !== undefined) writeProjectAbbreviation(tx, id, abbreviation);',
    to: 'if (abbreviation !== undefined) void abbreviation;',
    assertions: ['toEqual', 'NAV_NEW2', 'NAV_OLD'],
  },
  {
    label: 'stable-link',
    path: 'apps/wbs/fe-01/src/components/wbs/dependency-navigation.tsx',
    from: 'project: captured.endpoint.projectId,',
    to: 'project: captured.projectAbbreviation,',
    assertions: ['Expected:', 'Received:', 'NAV_OLD', 'expect(href).toBe'],
  },
  {
    label: 'focus',
    path: 'apps/wbs/fe-01/src/components/wbs/wbs-table.tsx',
    from: '    if (id === null) {\n      const row = flat.find((candidate) => candidate.id === linkedWorkItem);',
    to: '    if (id === null) return;\n    if (id === null) {\n      const row = flat.find((candidate) => candidate.id === linkedWorkItem);',
    assertions: ['toBeFocused', 'Name of 010'],
  },
];
for (const fault of faults) {
  const path = `${root}/${fault.path}`;
  const original = readFileSync(path);
  const source = original.toString('utf8');
  assert.equal(source.split(fault.from).length, 2, `${fault.label} anchor must be unique`);
  const descriptor = openSync(`${evidence}/${fault.label}-negative.log`, 'w');
  let child: ReturnType<typeof Bun.spawn> | undefined;
  const restore = () => {
    writeFileSync(path, original);
  };
  const cancel = () => {
    child?.kill();
    restore();
    process.exit(130);
  };
  process.once('SIGINT', cancel);
  process.once('SIGTERM', cancel);
  try {
    writeFileSync(path, source.replace(fault.from, fault.to));
    child = Bun.spawn(command, {
      cwd: root,
      env: { ...process.env, NX_DAEMON: 'false', NX_ISOLATE_PLUGINS: 'false' },
      stdout: descriptor,
      stderr: descriptor,
    });
    const exit = await child.exited;
    assert.equal(exit, 1, `${fault.label} must fail the real browser target`);
    const output = readFileSync(`${evidence}/${fault.label}-negative.log`, 'utf8');
    for (const assertion of fault.assertions)
      assert(output.includes(assertion), `${fault.label} missing intended assertion: ${assertion}`);
    assert(output.includes('1 failed'), 'must execute the intended browser test');
    receipts.push({ fault: fault.label, exit, assertion: fault.assertions });
    console.log(`${fault.label}: intended browser failure observed`);
  } finally {
    restore();
    closeSync(descriptor);
    process.removeListener('SIGINT', cancel);
    process.removeListener('SIGTERM', cancel);
  }
  assert(readFileSync(path).equals(original), `${fault.label} exact source restoration`);
}
writeFileSync(`${evidence}/mutations.json`, `${JSON.stringify(receipts, null, 2)}\n`);
