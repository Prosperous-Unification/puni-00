import { checkCandidate, identifyCandidate } from './rules/check';

const command = process.argv.at(2);
const repository = process.argv.at(3);
const revision = process.argv.at(4);
if (
  repository === undefined ||
  revision === undefined ||
  !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(revision)
)
  throw new Error('Performance judge requires an addressed committed candidate');
if (command === 'identity' && process.argv.length === 5) {
  process.stdout.write(
    JSON.stringify(identifyCandidate(repository, { kind: 'committed', revision })) + '\n',
  );
} else if (command === 'performance' && (process.argv.length === 6 || process.argv.length === 7)) {
  const rulePolicyPath = process.argv.at(5);
  if (rulePolicyPath === undefined || rulePolicyPath.trim() === '')
    throw new Error('Performance judge requires an explicit external policy');
  const performanceEvidencePath = process.argv.at(6);
  const verdict = checkCandidate({
    repository,
    candidate: { kind: 'committed', revision },
    rulePolicyPath,
    ruleId: 'PERF-THRESHOLD',
    ...(performanceEvidencePath === undefined ? {} : { performanceEvidencePath }),
  });
  process.stdout.write(JSON.stringify(verdict) + '\n');
  if (!verdict.allowed) process.exitCode = 1;
} else
  throw new Error('Performance judge accepts only its closed identity or performance operation');
