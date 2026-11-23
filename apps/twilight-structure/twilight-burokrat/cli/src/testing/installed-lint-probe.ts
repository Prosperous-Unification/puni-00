import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { createInstalledLintFixture } from './installed-lint-fixtures';

/** A test-owned executable boundary around the actual reusable facade and native output owners. */
export function writeInstalledLintProbe(
  fixture: ReturnType<typeof createInstalledLintFixture>,
  channel: 'stdout' | 'stderr',
): string {
  const preload = join(fixture.root, 'observe-launcher.mjs');
  writeFileSync(
    preload,
    'import{writeFileSync}from"node:fs";writeFileSync(' +
      JSON.stringify(join(fixture.root, 'launcher.pid')) +
      ',String(process.pid));',
  );
  const configuration = {
    installedDirectory: fixture.installedDirectory,
    callerDirectory: fixture.root,
    runtime: fixture.context.runtime,
    activationRoot: fixture.archive,
    scratchDirectory: fixture.scratch,
    request: fixture.invocation.request,
    preload,
    channel,
    progress: join(fixture.root, 'parent-write.json'),
  };
  const program = [
    'import { Buffer } from "node:buffer";',
    'import { writeFileSync } from "node:fs";',
    'import { executeLint } from ' +
      JSON.stringify(new URL('../runtime-facade.ts', import.meta.url).href) +
      ';',
    'import { createLintInterrupts } from ' +
      JSON.stringify(new URL('../lint-interrupts.ts', import.meta.url).href) +
      ';',
    'import { createLintOutputs } from ' +
      JSON.stringify(new URL('../lint-output.ts', import.meta.url).href) +
      ';',
    'import { createLaunch } from ' +
      JSON.stringify(import.meta.resolve('@shared/bun-startup')) +
      ';',
    'const fixture=' + JSON.stringify(configuration) + ';',
    'const interrupts=createLintInterrupts();',
    'const outputs=createLintOutputs({stdout:()=>Bun.stdout.writer(),stderr:()=>Bun.stderr.writer(),subscribeInterrupts:interrupts.subscribe});',
    'let started=0;let finished=0;',
    'function observe(channel){return async bytes=>{if(channel===fixture.channel){started++;writeFileSync(fixture.progress,JSON.stringify({started,finished}));}const written=await outputs[channel](bytes);if(channel===fixture.channel&&written.kind==="written"){finished++;writeFileSync(fixture.progress,JSON.stringify({started,finished}));}return written;};}',
    'let status=1;',
    'async function report(cause){status=1;try{await outputs.reportDiagnostic(Buffer.from("owned installed parent: "+(cause instanceof Error?cause.message:String(cause))+"\\n"));}catch{status=1;}}',
    'try{status=await executeLint(fixture.request,{...fixture,trustedNodeModules:undefined,required:false,launch(entrypoint){const argv=createLaunch(process.execPath,entrypoint);return[...argv.slice(0,-1),"--preload",fixture.preload,entrypoint];},stdout:observe("stdout"),stderr:observe("stderr"),reportDiagnostic:outputs.reportDiagnostic,subscribeInterrupts:interrupts.subscribe});}catch(cause){await report(cause);}',
    'try{outputs.dispose();}catch(cause){await report(cause);}try{interrupts.dispose();}catch(cause){await report(cause);}',
    'process.exit(status);',
  ].join('\n');
  const path = join(fixture.root, 'installed-parent-probe.mjs');
  writeFileSync(path, program);
  return path;
}
