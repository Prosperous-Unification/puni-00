import { expect, it } from 'bun:test';

import { assertFirstStartPolicies } from './first-start-policies';
const deny = {
  kind: 'NetworkPolicy',
  metadata: { name: 'default-deny', namespace: 'wbs-solver' },
  spec: { podSelector: {}, policyTypes: ['Ingress', 'Egress'] },
};
const writer = {
  kind: 'NetworkPolicy',
  metadata: { name: 'wbs-backend-writers', namespace: 'wbs-solver' },
  spec: {
    podSelector: { matchLabels: { 'puni.dev/writes': 'fenced' } },
    policyTypes: ['Ingress'],
    ingress: [{ from: [{}] }],
  },
};
const expected = [deny, writer];
for (const fault of [
  'none',
  'extra-allow',
  'open-writer',
  'missing-deny',
  'selected-backend',
  'changed-deny',
] as const) {
  it(`complete backend policy inventory ${fault === 'none' ? 'admits' : 'refuses'} ${fault}`, () => {
    const policies = structuredClone(expected);
    const labels: Record<string, string> = { 'app.kubernetes.io/name': 'wbs-backend' };
    if (fault === 'extra-allow')
      policies.push({
        ...writer,
        metadata: { ...writer.metadata, name: 'rogue' },
        spec: { ...writer.spec, podSelector: { matchLabels: { 'puni.dev/writes': 'fenced' } } },
      });
    if (fault === 'open-writer') Object.assign(policies[1].spec, { podSelector: {} });
    if (fault === 'missing-deny') policies.shift();
    if (fault === 'selected-backend') labels['puni.dev/writes'] = 'fenced';
    if (fault === 'changed-deny') Object.assign(policies[0].spec, { ingress: [{}] });
    const check = () => {
      assertFirstStartPolicies({ items: policies }, expected, labels);
    };
    if (fault === 'none') expect(check).not.toThrow();
    else expect(check).toThrow();
  });
}
