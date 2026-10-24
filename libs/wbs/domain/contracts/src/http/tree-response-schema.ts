import type { StandardSchemaV1 } from '@ark/schema';

import type { SchemaShape } from './schema-shape';
import type { WorkItemTree } from './work-item-response';

/**
 * Checks tree-specific runtime relations after structural decoding. The unchanged
 * JSON descriptor describes structure; Standard Schema additionally binds terminal
 * questions to their captured siblings and requires coherent connected comparisons.
 * Local reads retain their historical comparison compatibility.
 */
export function treeResponseSchema<T extends WorkItemTree>(shape: SchemaShape<T>): SchemaShape<T> {
  const standard = shape.validator['~standard'];
  return {
    ...shape,
    validator: {
      '~standard': {
        ...standard,
        async validate(value: unknown) {
          const checked = await standard.validate(value);
          if (checked.issues !== undefined) return checked;
          const issues = checkOptimization(checked.value);
          return issues.length === 0 ? checked : { issues };
        },
      },
    },
  };
}

function checkOptimization(tree: WorkItemTree): StandardSchemaV1.Issue[] {
  const optimization = tree.optimization;
  if (optimization?.scope === undefined) return [];
  const issues: StandardSchemaV1.Issue[] = [];
  const { scope } = optimization;
  for (const objective of ['pri', 'time'] as const) {
    const variant = optimization.variants[objective];
    const path = ['optimization', 'variants', objective];
    if (variant.state === 'boundary-infeasible') {
      const { question } = variant.certificate;
      const expected = {
        projectId: scope.projectId,
        objective,
        inputHash: optimization.inputHash,
        contractVersion: optimization.contractVersion,
        budgetMs: optimization.budgetMs,
        quantum: scope.quantum,
        wireVersion: scope.wireVersion,
        stageBytes: scope.boundary.canonical,
      };
      // Proof: bypassing each of the eight fields independently made its
      // `connected terminal rejects semantic question mismatch` generated-client
      // test return success for the altered projected certificate (2026-10-22).
      for (const field of [
        'projectId',
        'objective',
        'inputHash',
        'contractVersion',
        'budgetMs',
        'quantum',
        'wireVersion',
        'stageBytes',
      ] as const) {
        if (question[field] !== expected[field]) {
          issues.push({
            message: `Terminal question ${field} differs from captured optimization`,
            path: [...path, 'certificate', 'question', field],
          });
        }
      }
    }
    const isReady = variant.state === 'ready';
    // Proof: removing this guard independently admitted ready-finish and
    // nonready-finish projected payloads in the generated client (2026-10-22).
    if ((optimization.finishDays[objective] !== undefined) !== isReady) {
      issues.push({
        message: 'Finish must be present exactly for ready objectives',
        path: ['optimization', 'finishDays', objective],
      });
    }
    // Proof: removing this guard independently admitted ready-order and
    // nonready-order projected payloads in the generated client (2026-10-22).
    if ((optimization.sameOrderAsFast[objective] !== undefined) !== isReady) {
      issues.push({
        message: 'Order must be present exactly for ready objectives',
        path: ['optimization', 'sameOrderAsFast', objective],
      });
    }
  }
  // Proof: bypassing this guard admitted displayed Pri with a pending variant
  // in `connected comparisons reject semantic mismatch: displayed` (2026-10-22).
  if (
    optimization.displayed !== 'fast' &&
    optimization.variants[optimization.displayed].state !== 'ready'
  ) {
    issues.push({
      message: 'Displayed objective must be ready',
      path: ['optimization', 'displayed'],
    });
  }
  return issues;
}
