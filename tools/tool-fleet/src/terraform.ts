export interface TerraformStateIdentity {
  readonly lineage: string;
  readonly serial: number;
}

export interface ReviewedTerraformPlan {
  readonly terraformVersion: string;
  readonly addresses: readonly string[];
}

export interface ProvisioningInstance {
  readonly instanceId: string;
  readonly nodeId: string;
  readonly operationId: string;
  readonly state: 'running' | 'pending-deletion';
}

export type ProvisioningReconciliation =
  { readonly kind: 'create' } | { readonly kind: 'import'; readonly instanceId: string };

/** Enumerate the only Terraform addresses a single-node provisioning plan may change. */
export function provisioningTerraformAddresses(
  nodeId: string,
  clusterId: string,
): readonly string[] {
  const node = JSON.stringify(nodeId);
  const cluster = JSON.stringify(clusterId);
  return [
    `hcloud_network.cluster[${cluster}]`,
    `hcloud_network_subnet.cluster[${cluster}]`,
    `hcloud_firewall.cluster[${cluster}]`,
    `hcloud_primary_ip.node[${node}]`,
    `hcloud_server.node[${node}]`,
    `hcloud_server_network.node[${node}]`,
    `hcloud_volume.retained[${node}]`,
    `hcloud_volume_attachment.retained[${node}]`,
  ];
}

/** Converge a response-lost create only through the exact operation ownership labels. */
export function reconcileProvisioningOwnership(
  nodeId: string,
  operationId: string,
  instances: readonly ProvisioningInstance[],
): ProvisioningReconciliation {
  const named = instances.filter((instance) => instance.nodeId === nodeId);
  if (named.length === 0) return { kind: 'create' };
  if (named.length > 1) {
    // Proof: the response-lost adapter negative injects two operation-owned instances and refuses
    // before either can be imported or a third server can be purchased.
    throw new Error(`Duplicate ownership labels for logical node ${nodeId}`);
  }
  const instance = named[0];
  if (instance.operationId !== operationId) {
    // Proof: the same-name response-lost negative supplies a different operation label and refuses
    // rather than taking over or creating another server.
    throw new Error(`Logical node ${nodeId} belongs to a different operation`);
  }
  if (instance.state === 'pending-deletion') {
    throw new Error(`Logical node ${nodeId} is pending deletion`);
  }
  return { kind: 'import', instanceId: instance.instanceId };
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}

/** Decode the remote-state identity bound to a reviewed operation. */
export function decodeTerraformStateIdentity(input: unknown): TerraformStateIdentity {
  if (
    !isRecord(input) ||
    typeof input['lineage'] !== 'string' ||
    input['lineage'].length === 0 ||
    typeof input['serial'] !== 'number' ||
    !Number.isSafeInteger(input['serial']) ||
    input['serial'] < 0
  ) {
    // Proof: an empty lineage and negative serial fail the production decoder before planning.
    throw new Error('Terraform state identity is malformed');
  }
  return { lineage: input['lineage'], serial: input['serial'] };
}

/** Refuse destructive, replacement, or unreviewed resource changes in Terraform show JSON. */
export function decodeTerraformPlan(
  input: unknown,
  allowedAddresses: readonly string[],
  expectedOwnership?: { readonly nodeId: string; readonly operationId: string },
): ReviewedTerraformPlan {
  if (
    !isRecord(input) ||
    typeof input['terraform_version'] !== 'string' ||
    !Array.isArray(input['resource_changes'])
  ) {
    throw new Error('Terraform plan JSON is malformed');
  }
  const allowed = new Set(allowedAddresses);
  const addresses: string[] = [];
  let foundOwnedServer = expectedOwnership === undefined;
  for (const changeInput of input['resource_changes']) {
    if (!isRecord(changeInput) || typeof changeInput['address'] !== 'string') {
      throw new Error('Terraform resource change is malformed');
    }
    const change = changeInput['change'];
    const actions = isRecord(change) ? change['actions'] : undefined;
    if (!Array.isArray(actions) || !actions.every((action) => typeof action === 'string')) {
      throw new Error(`Terraform actions are malformed for ${changeInput['address']}`);
    }
    if (
      !allowed.has(changeInput['address']) ||
      actions.includes('delete') ||
      actions.some((action) => !['create', 'update', 'no-op', 'read'].includes(action))
    ) {
      // Proof: the production plan decoder rejects an injected volume deletion outside the
      // reviewed address closure before a saved plan can reach apply.
      throw new Error(
        `Terraform plan contains an unreviewed or destructive change: ${changeInput['address']}`,
      );
    }
    if (
      expectedOwnership !== undefined &&
      changeInput['address'] === `hcloud_server.node[${JSON.stringify(expectedOwnership.nodeId)}]`
    ) {
      const after = isRecord(change) ? change['after'] : undefined;
      const labels = isRecord(after) ? after['labels'] : undefined;
      if (
        !isRecord(labels) ||
        labels['puni-logical-node'] !== expectedOwnership.nodeId ||
        labels['puni-operation'] !== expectedOwnership.operationId
      ) {
        // Proof: the wrong-operation saved-plan negative reaches neither Terraform apply nor import.
        throw new Error('Terraform server ownership labels differ from the reviewed operation');
      }
      foundOwnedServer = true;
    }
    addresses.push(changeInput['address']);
  }
  if (!foundOwnedServer) throw new Error('Terraform plan is missing the operation-owned server');
  return { terraformVersion: input['terraform_version'], addresses };
}

/** Build the only Terraform command sequence accepted by the fleet adapter. */
export function planTerraformCommands(
  terraformRoot: string,
  savedPlanPath: string,
): readonly (readonly string[])[] {
  if (terraformRoot.length === 0 || savedPlanPath.length === 0) {
    throw new Error('Terraform root and saved plan path are required');
  }
  return [
    ['init', '-input=false', '-lockfile=readonly'],
    ['validate', '-json'],
    ['plan', '-input=false', '-lock=true', `-out=${savedPlanPath}`],
    ['show', '-json', savedPlanPath],
    ['apply', '-input=false', '-lock=true', savedPlanPath],
  ];
}
