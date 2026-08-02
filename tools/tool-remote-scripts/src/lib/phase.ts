import type { Phase } from './state';
import { isPhase } from './state';

export async function writePhase(path: string, phase: Phase): Promise<void> {
  await Bun.write(path, `${phase}\n`);
}

export async function readPhase(path: string): Promise<Phase | null> {
  const f = Bun.file(path);
  if (!(await f.exists())) return null;
  const raw = (await f.text()).trim();
  if (!isPhase(raw)) throw new Error(`unrecognised phase marker: ${raw}`);
  return raw;
}
