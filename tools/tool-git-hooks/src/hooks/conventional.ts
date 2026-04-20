import { readFile } from 'node:fs/promises';

const CONVENTIONAL = /^(feat|fix|chore|refactor|test|docs|build|ci|perf|revert)(\([^)]+\))?!?: .+/m;

export function isConventional(msg: string): boolean {
  const firstLine = msg.split('\n').find((l) => l.trim().length > 0) ?? '';
  return CONVENTIONAL.test(firstLine);
}

async function main(): Promise<void> {
  const msgFile = process.argv[2];
  if (!msgFile) {
    console.error('[tool-git-hooks] commit-msg file path required');
    process.exit(2);
  }
  const msg = await readFile(msgFile, 'utf8');
  if (!isConventional(msg)) {
    console.error(
      '[tool-git-hooks] commit message must follow Conventional Commits ' +
        '(type(scope)?: subject). Got:\n' +
        msg.split('\n')[0],
    );
    process.exit(1);
  }
}

if (import.meta.main) {
  void main();
}
