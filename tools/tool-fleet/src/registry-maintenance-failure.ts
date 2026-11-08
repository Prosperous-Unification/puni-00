/** Public fixed refusal code contains no token, provider credential, Kubernetes body or dependency diagnostic. It never certifies cleanup or permits serving. */
export class RegistryMaintenanceRefusal extends Error {
  constructor(readonly code: 'backup-budget-unavailable' | 'recovery-target-unenrolled') {
    super(code);
  }
}
