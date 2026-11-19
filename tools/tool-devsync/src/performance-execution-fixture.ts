import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export type BuildMode = 'success' | 'failure' | 'pending';
export interface ExecutionFixture {
  readonly parent: string;
  readonly root: string;
  readonly policy: string;
  readonly trace: string;
  readonly phases: string;
  readonly shift: number;
  readonly environment: Record<string, string>;
}
const declarationPath = 'apps/wbs/fe-01/playwright.performance.cases.json';
const configPath = 'apps/wbs/fe-01/playwright.performance.config.ts';
const selectedCase = {
  caseId: 'paint-ready', fixture: 'apps/wbs/fe-01/e2e-performance/paint.perf.spec.ts',
  titlePath: ['Paint', 'records readiness'], measurement: 'paint-ready', unit: 'ms',
  operator: 'lte', threshold: 200,
};
function digest(bytes: string): string {
  return createHash('sha256').update(bytes).digest('hex');
}
function canonical(bytes: unknown): string {
  return `${JSON.stringify(bytes, (_key, value: unknown) =>
    value !== null && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0))
      : value)}\n`;
}
async function portIsFree(port: number): Promise<boolean> {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', (cause: NodeJS.ErrnoException) => {
      if (cause.code === 'EADDRINUSE') resolve(false);
      else reject(cause);
    });
    server.listen(port, '127.0.0.1', () => server.close(cause => cause ? reject(cause) : resolve(true)));
  });
}
async function chooseShift(): Promise<number> {
  for (let shift = 6200; shift < 8200; shift += 100) {
    if ((await Promise.all([3100, 3200, 4200].map(base => portIsFree(base + shift)))).every(Boolean)) return shift;
  }
  throw new Error('No free Performance execution fixture shift');
}
function commitFixture(root: string): void {
  for (const arguments_ of [['init', '-q'], ['config', 'user.name', 'Performance fixture'],
    ['config', 'user.email', 'performance@example.invalid'], ['add', '.'], ['commit', '-qm', 'actual performance execution fixture']]) {
    const command = Bun.spawnSync(['git', '-C', root, ...arguments_], { stdout: 'pipe', stderr: 'pipe' });
    if (command.exitCode !== 0) throw new Error(`Fixture Git ${arguments_[0]} failed: ${command.stderr.toString()}`);
  }
}
/**
 * Actual committed candidate, real Vite and Playwright; Node-name alias is explicit dependency emulation.
 * The generated describe callback uses a block to retain the candidate callsite under Bun.
 * The concise implicit-return callback was observed in raw discovery with its nested test
 * attributed to Playwright's internal describe body; report/source path guards stay strict.
 */
export async function createExecutionFixture(mode: BuildMode): Promise<ExecutionFixture> {
  const parent = await mkdtemp(join(tmpdir(), 'puni-performance-runtime-first-'));
  // A failed acquisition is deliberately retained; the error names its owned namespace.
  try {
    const root = join(parent, 'candidate');
    const phases = join(parent, 'phases.jsonl');
    const trace = join(parent, 'spawn.jsonl');
    const bin = join(parent, 'bin');
    await mkdir(bin);
    await symlink(process.execPath, join(bin, 'bun'));
    await symlink(process.execPath, join(bin, 'node'));
    const toolRoot = join(import.meta.dir, '../../..');
    await mkdir(join(root, 'apps/wbs/fe-01/e2e-performance'), { recursive: true });
    await mkdir(join(root, 'tools/dev'), { recursive: true });
    await writeFile(join(root, '.gitignore'), 'tmp/\nnode_modules\ntest-results/\nplaywright-report/\ndist/\n');
    await writeFile(join(root, 'tools/dev/setup.ts'), 'export {};\n');
    for (const app of ['be-01', 'gw-01']) {
      await mkdir(join(root, 'apps/wbs', app), { recursive: true });
      await mkdir(join(root, 'apps/wbs', app, 'src'));
      await writeFile(join(root, 'apps/wbs', app, 'src/main.ts'),
        `Bun.serve({port:Number(process.env.PORT),fetch(){return new Response('ready')}});\n`);
    }
    for (const filename of ['ordinary-servers-cli.ts', 'playwright.ordinary-servers.ts']) {
      await copyFile(join(toolRoot, 'apps/wbs/fe-01', filename), join(root, 'apps/wbs/fe-01', filename));
    }
    await writeFile(join(root, 'apps/wbs/fe-01/index.html'), '<!doctype html><title>Performance fixture</title><div>ready</div>\n');
    const phase = `const phase=(name)=>appendFileSync(${JSON.stringify(phases)},JSON.stringify({phase:name,pid:process.pid,ppid:process.ppid,execPath:process.execPath})+'\\n');`;
    await writeFile(join(root, 'apps/wbs/fe-01/vite.config.ts'),
      `import {appendFileSync} from 'node:fs';\nimport {defineConfig} from 'vite';\n${phase}\nlet wrote=false;\nexport default defineConfig({preview:{port:Number(process.env.PORT),host:'localhost',strictPort:true},plugins:[{name:'actual-fixture-phases',async buildStart(){phase('build-start');${mode === 'failure' ? "throw new Error('controlled Vite build failure');" : mode === 'pending' ? 'await new Promise(resolve=>setTimeout(resolve,180000));' : ''}},writeBundle(){wrote=true},closeBundle(){if(wrote)phase('build-complete')}},{name:'actual-fixture-preview',configurePreviewServer(){phase('preview-start')}}]});\n`);
    const config = `import {defineConfig} from '@playwright/test';\nexport default defineConfig({testDir:'./e2e-performance',testMatch:/.*\\.perf\\.spec\\.ts/,projects:[{name:'chromium'}],workers:1,retries:0,timeout:30000});\n`;
    await writeFile(join(root, configPath), config);
    await writeFile(join(root, selectedCase.fixture),
      `import {test} from '@playwright/test';\ntest.describe('Paint',()=>{test('records readiness',async({},testInfo)=>{await testInfo.attach('puni.performance.observation.v1',{body:JSON.stringify({schemaVersion:1,caseId:'paint-ready',measurement:'paint-ready',unit:'ms',value:180}),contentType:'application/json'});});});\n`);
    await writeFile(join(root, declarationPath), JSON.stringify({schemaVersion:1,config:configPath,project:'chromium',cases:[selectedCase]}));
    commitFixture(root);
    const packageRecord: unknown = JSON.parse(await readFile(join(toolRoot, 'node_modules/playwright/package.json'), 'utf8'));
    if (packageRecord === null || typeof packageRecord !== 'object' || !('version' in packageRecord) || typeof packageRecord.version !== 'string' || packageRecord.version === '') throw new Error('Actual Playwright package version is absent');
    const policy = join(parent, 'policy.json');
    const ruleIds = ['F1','F7','INV-CLASSIFY','JOB-CATALOGUE','K2','K3','K4','K5','K6','MOD-DIRECT-ENTRIES','MOD-INDEX','MOD-LAYOUT','PERF-THRESHOLD','REL-EXTRACT','SPEC-SCENARIOS'];
    await writeFile(policy, JSON.stringify({schemaVersion:1,policyId:'scratch-performance-run',ruleModes:ruleIds.map(ruleId=>({ruleId,mode:'enforce'})),performance:{acceptedDeclarationSchema:1,declarationPath,config:configPath,configDigest:digest(config),project:'chromium',runnerVersion:packageRecord.version,reviewedCases:[{caseId:'paint-ready',caseDigest:digest(canonical({schemaVersion:1,kind:'performance-case',record:selectedCase}))}]}}));
    const shift = await chooseShift();
    const path = process.env['PATH'];
    const home = process.env['HOME'];
    if (path === undefined || path === '' || home === undefined || home === '') throw new Error('Performance fixture requires actual PATH and HOME');
    return {parent,root,policy,trace,phases,shift,environment:{PATH:`${bin}:${path}`,HOME:home,TMPDIR:tmpdir(),LANG:'C.UTF-8',CI:'1',E2E_PORT_SHIFT:String(shift)}};
  } catch (cause) {
    throw new Error(`Performance fixture acquisition failed; retained ${parent}`, {cause});
  }
}
export function fixtureHasCurrent(fixture: ExecutionFixture): boolean {
  return existsSync(join(fixture.root, 'tmp/junit/wbs-fe-01.performance.current.json'));
}
