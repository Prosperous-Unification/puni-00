import type { ProviderAdapter } from './configuration';
import {
  type ComputeProvider,
  type Measure,
  type Measurement,
  MEASURES,
  type NotImplemented,
} from './provider';

/**
 * The `kubernetes` stub (`compute-providers` P9): it claims every measure and runs, and every
 * method answers `not_implemented`. Its listener is never called, since it starts no run. The
 * loader refuses an instance of it `provider_not_implemented` before `open`, so a reporter never
 * reaches these methods.
 */
class KubernetesStub implements ComputeProvider {
  public readonly kind = 'kubernetes';
  public readonly capabilities = { measures: new Set<Measure>(MEASURES), runs: true };

  public constructor(public readonly instanceId: string) {}

  public observe(_binding: unknown, now: number): Promise<Measurement> {
    return Promise.resolve({ kind: 'not_implemented', observedAt: now });
  }

  public run(): Promise<NotImplemented> {
    return Promise.resolve({ kind: 'not_implemented' });
  }

  public onRunChange(): () => void {
    return () => undefined;
  }
}

/**
 * The `kubernetes` adapter, a stub: `isStub` makes the loader refuse its instances by name. It reads
 * no kube context or namespace; the instance's settings beyond its id are not consulted.
 */
export function kubernetesStubAdapter(): ProviderAdapter {
  return {
    isStub: true,
    measures: new Set<Measure>(MEASURES),
    open: (settings) => Promise.resolve(new KubernetesStub(settings.instanceId)),
  };
}
