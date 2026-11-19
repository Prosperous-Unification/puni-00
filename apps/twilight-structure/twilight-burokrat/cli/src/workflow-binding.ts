import {
  parseWorkflowBindingRequest,
  type WorkflowBindingRequest,
  workflowBindingUsage,
} from './workflow-binding-parser';
export { workflowBindingUsage } from './workflow-binding-parser';
import { acceptWorkflowBinding, checkWorkflowBinding } from './contracts/validate-workflow-binding';
import {
  decodeWorkflowBinding,
  listBindingPromptPaths,
  type ValidatedBinding,
  WorkflowBindingError,
} from './contracts/workflow-binding';
import {
  acceptManifestBinding,
  checkManifestBinding,
  decodeManifestBinding,
  decodeStepManifest,
  type ValidatedManifestBinding,
} from './contracts/workflow-manifest';
import {
  readManifestDocument,
  readWorkflowDocument,
  readWorkflowPrompts,
  readWorkflowRoot,
} from './workflow-binding-files';

/** Reads a legacy version1 binding and original prompt bytes with its exact existing acceptance contract. */
export function readWorkflowBinding(
  repositoryRoot: string,
  file: string,
  projectSteps: readonly string[],
): ValidatedBinding {
  const root = readWorkflowRoot(repositoryRoot);
  const checked = checkWorkflowBinding(
    decodeWorkflowBinding(readWorkflowDocument(root, file)),
    projectSteps,
  );
  return acceptWorkflowBinding(
    checked,
    readWorkflowPrompts(root, listBindingPromptPaths(checked.binding)),
  );
}

/** Validates an explicit project/revision manifest entirely offline, before reading declared prompt bytes. */
export function readManifestWorkflowBinding(
  repositoryRoot: string,
  file: string,
  manifestFile: string,
): ValidatedManifestBinding {
  const root = readWorkflowRoot(repositoryRoot);
  const binding = decodeManifestBinding(readWorkflowDocument(root, file));
  const manifest = decodeStepManifest(readManifestDocument(root, manifestFile));
  const checked = checkManifestBinding(binding, manifest);
  return acceptManifestBinding(checked, readWorkflowPrompts(root, listBindingPromptPaths(binding)));
}

/** Parses through the same Optique grammar as root dispatch, before any file reads. */
export function runWorkflowBindingCommand(args: readonly string[], repositoryRoot: string): string {
  const parsed = parseWorkflowBindingRequest(args);
  if (!parsed.success)
    throw new WorkflowBindingError('invalid_arguments', 'arguments', workflowBindingUsage);
  return validateWorkflowBinding(parsed.value, repositoryRoot);
}

/** Validates one already parsed applicability source entirely offline. */
export function validateWorkflowBinding(
  request: WorkflowBindingRequest,
  repositoryRoot: string,
): string {
  return request.catalogue.kind === 'manifest'
    ? readManifestWorkflowBinding(repositoryRoot, request.file, request.catalogue.file)
        .bindingDigest
    : readWorkflowBinding(repositoryRoot, request.file, request.catalogue.steps).bindingDigest;
}
