const root = import.meta.dir;
const modelPath = `${root}/model.js`;
const original = await Bun.file(modelPath).text();
const faults = [
  {
    name: 'remove-list-guard',
    from: "if (!Array.isArray(records)) throw new Error('attempt list required');",
    to: '',
    pattern: 'invalid, duplicate',
  },
  {
    name: 'remove-finite-instant-guard',
    from: '!Number.isFinite(milliseconds)',
    to: 'false',
    pattern: 'invalid, duplicate',
  },
  {
    name: 'shift-anchor',
    from: 'start: anchor - fraction * span',
    to: 'start: anchor - fraction * span + span * 0.1',
    pattern: 'elapsed geometry',
  },
  {
    name: 'merge-repeated-attempts',
    from: 'return records.map((record)',
    to: 'return records.filter((record, index) => records.findIndex((peer) => peer.packet === record.packet && peer.slice === record.slice) === index).map((record)',
    pattern: 'repeated slices',
  },
  {
    name: 'parse-local-as-UTC',
    from: 'Date.parse(value)',
    to: 'Date.parse(value.replace(/[+-]\\d{2}:\\d{2}$/, "Z"))',
    pattern: 'explicit timezone',
  },
  {
    name: 'hide-enlarged-hit-target',
    from: 'return attempts.filter((attempt)',
    to: 'return attempts.slice(0, 1).filter((attempt)',
    pattern: 'repeated slices',
  },
  {
    name: 'default-missing-endpoint',
    from: 'record.end === null ? null :',
    to: 'record.end === null ? start :',
    pattern: 'zero duration',
  },
  {
    name: 'remove-duplicate-guard',
    from: "if (identities.has(record.id)) throw new Error('duplicate attempt');",
    to: '',
    pattern: 'invalid, duplicate',
  },
  {
    name: 'remove-reversed-guard',
    from: "if (end !== null && end < start) throw new Error('reversed endpoints');",
    to: '',
    pattern: 'invalid, duplicate',
  },
  {
    name: 'remove-identity-guard',
    from: "typeof record[key] !== 'string' || !record[key]",
    to: 'false',
    pattern: 'invalid, duplicate',
  },
  {
    name: 'remove-calendar-guard',
    from: 'new Date(`${dateOnly}T00:00:00Z`).toISOString().slice(0, 10) !== dateOnly',
    to: 'false',
    pattern: 'invalid, duplicate',
  },
  {
    name: 'allow-unzoned-local',
    from: '(?:Z|[+-]\\d{2}:\\d{2})$',
    to: '(?:Z|[+-]\\d{2}:\\d{2})?$',
    pattern: 'explicit timezone',
  },
];
const evidence = [];
try {
  for (const fault of faults) {
    if (!original.includes(fault.from)) throw new Error(`fault anchor absent: ${fault.name}`);
    await Bun.write(modelPath, original.replace(fault.from, fault.to));
    const execution = Bun.spawn(
      ['bun', 'test', `${root}/model.test.ts`, '--test-name-pattern', fault.pattern],
      { stdout: 'pipe', stderr: 'pipe' },
    );
    const [stdout, stderr, code] = await Promise.all([
      new Response(execution.stdout).text(),
      new Response(execution.stderr).text(),
      execution.exited,
    ]);
    const output = `${stdout}${stderr}`
      .replaceAll(root, '<experiment>')
      .replaceAll(process.cwd(), '<checkout>');
    await Bun.write(`${root}/evidence/proof-${fault.name}.txt`, output);
    if (code !== 1 || !output.includes('(fail)'))
      throw new Error(`fault did not produce a failed test: ${fault.name} (${String(code)})`);
    evidence.push({ fault: fault.name, test: fault.pattern, exit: code });
    console.log(`${fault.name}: observed exit ${String(code)}`);
    await Bun.write(modelPath, original);
  }
} finally {
  await Bun.write(modelPath, original);
}
if (process.argv.includes('--browser')) {
  const appPath = `${root}/app.js`;
  const app = await Bun.file(appPath).text();
  try {
    if (!app.includes('syncZoomControls();')) throw new Error('fit sync fault anchor absent');
    await Bun.write(appPath, app.replace('syncZoomControls();', ''));
    const execution = Bun.spawn(['bun', `${root}/browser.ts`], { stdout: 'pipe', stderr: 'pipe' });
    const [stdout, stderr, code] = await Promise.all([
      new Response(execution.stdout).text(),
      new Response(execution.stderr).text(),
      execution.exited,
    ]);
    const output = `${stdout}${stderr}`
      .replaceAll(root, '<experiment>')
      .replaceAll(process.cwd(), '<checkout>');
    await Bun.write(`${root}/evidence/proof-disable-fit-sync.txt`, output);
    if (code !== 1 || !output.includes('fit-all discrete display is stale'))
      throw new Error('fit sync fault did not fail browser regression');
    evidence.push({
      fault: 'disable-fit-sync',
      test: 'fit-all discrete display is stale',
      exit: code,
    });
    console.log('disable-fit-sync: observed exit 1');
  } finally {
    await Bun.write(appPath, app);
  }
}
await Bun.write(
  `${root}/evidence/proofs.json`,
  JSON.stringify(
    { observed: evidence, restored: (await Bun.file(modelPath).text()) === original },
    null,
    2,
  ) + '\n',
);
