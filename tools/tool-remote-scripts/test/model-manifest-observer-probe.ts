import { lstat, mkdtemp, open } from 'node:fs/promises';

/** Already-evaluated named imports exercise Bun's live module replacement boundary. */
export const importedFilesystem = () => ({ lstat, mkdtemp, open });

/** An inert module export exercises the same captured-function wrapper as the model child. */
export function constructProbe(
  token: object,
  ordinal: number,
  refusal: Error,
  refuseAt: number,
): Promise<object> {
  return ordinal === refuseAt ? Promise.reject(refusal) : Promise.resolve(token);
}
