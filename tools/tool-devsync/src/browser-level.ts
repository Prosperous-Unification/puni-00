import { createBrowserRuntime } from '@puni/dash/browser-level';

import { createSourceTestLevelContext } from './source-test-level-context';

type Runtime = ReturnType<typeof createBrowserRuntime>;
export function assertClean(
  ...arguments_: Parameters<Runtime['assertClean']>
): ReturnType<Runtime['assertClean']> {
  return createBrowserRuntime(createSourceTestLevelContext()).assertClean(...arguments_);
}
export function decodeBrowserText(
  ...arguments_: Parameters<Runtime['decodeBrowserText']>
): ReturnType<Runtime['decodeBrowserText']> {
  return createBrowserRuntime(createSourceTestLevelContext()).decodeBrowserText(...arguments_);
}
export function parseJson(
  ...arguments_: Parameters<Runtime['parseJson']>
): ReturnType<Runtime['parseJson']> {
  return createBrowserRuntime(createSourceTestLevelContext()).parseJson(...arguments_);
}
export async function run(
  ...arguments_: Parameters<Runtime['run']>
): Promise<Awaited<ReturnType<Runtime['run']>>> {
  return await createBrowserRuntime(createSourceTestLevelContext()).run(...arguments_);
}
export async function browserServedFiles(
  ...arguments_: Parameters<Runtime['browserServedFiles']>
): Promise<Awaited<ReturnType<Runtime['browserServedFiles']>>> {
  return await createBrowserRuntime(createSourceTestLevelContext()).browserServedFiles(
    ...arguments_,
  );
}
export function validatedPortShift(
  ...arguments_: Parameters<Runtime['validatedPortShift']>
): ReturnType<Runtime['validatedPortShift']> {
  return createBrowserRuntime(createSourceTestLevelContext()).validatedPortShift(...arguments_);
}
export function runtimeEnvironment(
  ...arguments_: Parameters<Runtime['runtimeEnvironment']>
): ReturnType<Runtime['runtimeEnvironment']> {
  return createBrowserRuntime(createSourceTestLevelContext()).runtimeEnvironment(...arguments_);
}
export async function assertBrowserInputs(
  ...arguments_: Parameters<Runtime['assertBrowserInputs']>
): Promise<Awaited<ReturnType<Runtime['assertBrowserInputs']>>> {
  await createBrowserRuntime(createSourceTestLevelContext()).assertBrowserInputs(...arguments_);
}
export async function withBrowserInvocation(
  ...arguments_: Parameters<Runtime['withBrowserInvocation']>
): Promise<Awaited<ReturnType<Runtime['withBrowserInvocation']>>> {
  await createBrowserRuntime(createSourceTestLevelContext()).withBrowserInvocation(...arguments_);
}
export async function publishBrowserBundle(
  ...arguments_: Parameters<Runtime['publishBrowserBundle']>
): Promise<Awaited<ReturnType<Runtime['publishBrowserBundle']>>> {
  return await createBrowserRuntime(createSourceTestLevelContext()).publishBrowserBundle(
    ...arguments_,
  );
}
export async function readBrowserPublication(
  ...arguments_: Parameters<Runtime['readBrowserPublication']>
): Promise<Awaited<ReturnType<Runtime['readBrowserPublication']>>> {
  return await createBrowserRuntime(createSourceTestLevelContext()).readBrowserPublication(
    ...arguments_,
  );
}
export function assertBrowserCommand(
  ...arguments_: Parameters<Runtime['assertBrowserCommand']>
): ReturnType<Runtime['assertBrowserCommand']> {
  createBrowserRuntime(createSourceTestLevelContext()).assertBrowserCommand(...arguments_);
}
export async function runBrowserLevel(
  ...arguments_: Parameters<Runtime['runBrowserLevel']>
): Promise<Awaited<ReturnType<Runtime['runBrowserLevel']>>> {
  await createBrowserRuntime(createSourceTestLevelContext()).runBrowserLevel(...arguments_);
}

if (import.meta.main) {
  const mode = process.argv[2];
  if (mode !== 'ordinary' && mode !== 'packaged' && mode !== 'portable')
    throw new Error('Browser level requires ordinary, packaged or portable mode');
  await runBrowserLevel(process.cwd(), mode);
}
