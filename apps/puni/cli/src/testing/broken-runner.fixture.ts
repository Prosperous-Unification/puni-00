import { mock } from 'bun:test';

await mock.module('@optique/run', () => ({
  run(_parser: unknown, options: { onExit(code: number): never }) {
    return options.onExit(1);
  },
}));
