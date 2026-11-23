import { createBrowserRuntime, monotonicClock } from '@puni/dash/browser-level';

import { createSourceTestLevelContext } from './source-test-level-context';

type Runtime = ReturnType<typeof createBrowserRuntime>;

function createSourceBrowserRuntime(): Runtime {
  return createBrowserRuntime(createSourceTestLevelContext(monotonicClock()));
}
export function assertClean(
  ...arguments_: Parameters<Runtime['assertClean']>
): ReturnType<Runtime['assertClean']> {
  return createSourceBrowserRuntime().assertClean(...arguments_);
}
export function decodeBrowserText(
  ...arguments_: Parameters<Runtime['decodeBrowserText']>
): ReturnType<Runtime['decodeBrowserText']> {
  return createSourceBrowserRuntime().decodeBrowserText(...arguments_);
}
export function parseJson(
  ...arguments_: Parameters<Runtime['parseJson']>
): ReturnType<Runtime['parseJson']> {
  return createSourceBrowserRuntime().parseJson(...arguments_);
}
export async function run(
  ...arguments_: Parameters<Runtime['run']>
): Promise<Awaited<ReturnType<Runtime['run']>>> {
  return await createSourceBrowserRuntime().run(...arguments_);
}
export async function browserServedFiles(
  ...arguments_: Parameters<Runtime['browserServedFiles']>
): Promise<Awaited<ReturnType<Runtime['browserServedFiles']>>> {
  return await createSourceBrowserRuntime().browserServedFiles(...arguments_);
}
export function validatedPortShift(
  ...arguments_: Parameters<Runtime['validatedPortShift']>
): ReturnType<Runtime['validatedPortShift']> {
  return createSourceBrowserRuntime().validatedPortShift(...arguments_);
}
export function runtimeEnvironment(
  ...arguments_: Parameters<Runtime['runtimeEnvironment']>
): ReturnType<Runtime['runtimeEnvironment']> {
  return createSourceBrowserRuntime().runtimeEnvironment(...arguments_);
}
export async function assertBrowserInputs(
  ...arguments_: Parameters<Runtime['assertBrowserInputs']>
): Promise<Awaited<ReturnType<Runtime['assertBrowserInputs']>>> {
  await createSourceBrowserRuntime().assertBrowserInputs(...arguments_);
}
export async function withBrowserInvocation(
  ...arguments_: Parameters<Runtime['withBrowserInvocation']>
): Promise<Awaited<ReturnType<Runtime['withBrowserInvocation']>>> {
  await createSourceBrowserRuntime().withBrowserInvocation(...arguments_);
}
export async function publishBrowserBundle(
  ...arguments_: Parameters<Runtime['publishBrowserBundle']>
): Promise<Awaited<ReturnType<Runtime['publishBrowserBundle']>>> {
  return await createSourceBrowserRuntime().publishBrowserBundle(...arguments_);
}
export async function readBrowserPublication(
  ...arguments_: Parameters<Runtime['readBrowserPublication']>
): Promise<Awaited<ReturnType<Runtime['readBrowserPublication']>>> {
  return await createSourceBrowserRuntime().readBrowserPublication(...arguments_);
}
export function assertBrowserCommand(
  ...arguments_: Parameters<Runtime['assertBrowserCommand']>
): ReturnType<Runtime['assertBrowserCommand']> {
  createSourceBrowserRuntime().assertBrowserCommand(...arguments_);
}
export async function runBrowserLevel(
  ...arguments_: Parameters<Runtime['runBrowserLevel']>
): Promise<Awaited<ReturnType<Runtime['runBrowserLevel']>>> {
  await createSourceBrowserRuntime().runBrowserLevel(...arguments_);
}

if (import.meta.main) {
  const mode = process.argv[2];
  if (mode !== 'ordinary' && mode !== 'packaged' && mode !== 'portable')
    throw new Error('Browser level requires ordinary, packaged or portable mode');
  await runBrowserLevel(process.cwd(), mode);
}
