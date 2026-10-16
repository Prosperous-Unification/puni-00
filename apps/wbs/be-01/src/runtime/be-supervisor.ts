/** A terminal background failure, retaining the original thrown cause. */
export interface BackgroundFailure {
  readonly cause: unknown;
}

/** Observers are called synchronously, including when failure was already latched. */
export interface BackgroundFailureSource {
  current(): BackgroundFailure | undefined;
  observe(observer: (failure: BackgroundFailure) => void): void;
}

/** Latches the first terminal failure before notifying process ownership. */
export function createBackgroundFailure(): {
  source: BackgroundFailureSource;
  report(cause: unknown): void;
} {
  let failure: BackgroundFailure | undefined;
  const observers = new Set<(failure: BackgroundFailure) => void>();
  return {
    source: {
      current: () => failure,
      observe: (observer) => {
        // Proof: omitting registration left `a later background failure`
        // without a disposal call; omitting the immediate notification left
        // `already-latched failure` without one.
        observers.add(observer);
        if (failure !== undefined) observer(failure);
      },
    },
    report: (cause) => {
      // Proof: removing this guard made `latches the first failure` receive
      // and retain the later cause instead of reporting the first once.
      if (failure !== undefined) return;
      failure = { cause };
      for (const observer of observers) observer(failure);
    },
  };
}

interface SupervisedBe {
  readonly backgroundFailure: BackgroundFailureSource;
  stop(): Promise<void>;
}

interface SupervisionEffects {
  exit(code: 0 | 1): void;
  report(cause: unknown): void;
}

/**
 * Shares one disposal across signals and terminal background failure. Failure
 * observed before disposal settles wins over a clean signal exit. The promise
 * is installed before calling stop so synchronous failure cannot reenter it.
 */
export function superviseBe(
  running: SupervisedBe,
  effects: SupervisionEffects,
): {
  stop(): Promise<void>;
} {
  let stopping: Promise<void> | undefined;
  const stop = (): Promise<void> => {
    // Proof: removing memoization made `shares repeated signal shutdown`
    // return different promises and dispose twice.
    if (stopping !== undefined) return stopping;
    const completion = Promise.withResolvers<undefined>();
    // Proof: moving this below disposal made `reentrant failure during stop`
    // invoke disposal twice.
    stopping = completion.promise;
    const dispose = async () => {
      let failed = false;
      try {
        // Proof: removing await made `shares repeated signal shutdown`
        // exit before the held disposal settled.
        await running.stop();
      } catch (cause) {
        failed = true;
        effects.report(cause);
      }
      // Proof: ignoring disposal failure made `disposal rejection` exit 0;
      // ignoring the latched outcome made `background failure wins` exit 0.
      effects.exit(failed || running.backgroundFailure.current() !== undefined ? 1 : 0);
    };
    void dispose().then(() => {
      completion.resolve(undefined);
    }, completion.reject);
    return stopping;
  };
  running.backgroundFailure.observe((failure) => {
    effects.report(failure.cause);
    // Proof: omitting this call left `a later background failure` with zero
    // disposal calls instead of initiating terminal shutdown.
    void stop();
  });
  return { stop };
}
