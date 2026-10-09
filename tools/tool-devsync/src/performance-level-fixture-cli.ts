import { runPerformanceLevel } from './performance-level';

const candidateRoot = process.argv.at(2);
const selectedPolicy = process.argv.at(3);
const encodedDescriptors = process.argv.at(4);
if (candidateRoot === undefined || selectedPolicy === undefined || encodedDescriptors === undefined)
  throw new Error('Performance fixture supervisor requires root, policy and descriptors');

// Test harness boundary: the only producer is performance-level.test.ts in its parent process.
const descriptors =
  encodedDescriptors === '-'
    ? undefined
    : (JSON.parse(Buffer.from(encodedDescriptors, 'base64url').toString('utf8')) as {
        command: string;
        cwd: string;
        url: string;
        env: Record<string, string>;
      }[]);

await runPerformanceLevel(
  candidateRoot,
  selectedPolicy === '-' ? undefined : selectedPolicy,
  descriptors,
);
