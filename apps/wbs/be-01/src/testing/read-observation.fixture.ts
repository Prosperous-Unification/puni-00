import { openReadOnlyConnection } from '@wbs/store-sqlite/db';

/**
 * Observes actual production pooled loans through the physical Drizzle forwarding boundary.
 * A loan is observed on its first property access; physical allocation is a separate lifetime.
 * Release is established only by the production loan's exact property-access refusal.
 */
export function trackReadObservations(open = openReadOnlyConnection) {
  const readConnections = new Set<object>();
  let physicalOpen = 0;
  let physicalOpened = 0;
  function isReleased(loan: object): boolean {
    try {
      Reflect.get(loan, 'run');
      return false;
    } catch (failure) {
      // Proof: catching every error as expiry failed the unrelated-access owner (2026-10-29).
      if (
        failure instanceof Error &&
        failure.message === 'a pooled read connection was used after its release'
      )
        return true;
      throw failure;
    }
  }
  const connectionIdentities: ReadonlySet<unknown> = readConnections;
  const probe = {
    readConnections: connectionIdentities,
    get borrowed() {
      return [...readConnections].filter((loan) => !isReleased(loan)).length;
    },
    get observations() {
      return readConnections.size;
    },
    get released() {
      return [...readConnections].filter(isReleased).length;
    },
    get physicalOpen() {
      return physicalOpen;
    },
    get physicalOpened() {
      return physicalOpened;
    },
    beforeRead: (): void => undefined,
    onReleased: (): void => undefined,
    openConnection: (filename: string) => {
      let statement = '';
      const connection = open(filename, {
        logQuery(query) {
          statement = query;
          // Proof: removing beforeRead missed both actual local deletions before aggregation (2026-10-29).
          if (query.trim().toUpperCase() === 'BEGIN DEFERRED') probe.beforeRead();
        },
      });
      physicalOpen++;
      physicalOpened++;
      const db = new Proxy(connection.db, {
        get(target, key, receiver: object): unknown {
          // pool.isInTransaction reads the physical wrapper itself, never a loan.
          if (receiver !== db) readConnections.add(receiver);
          const member: unknown = Reflect.get(target, key, receiver);
          if (key === 'run' && typeof member === 'function')
            return (...parameters: Parameters<typeof target.run>) => {
              statement = '';
              // Proof: physical-target binding let a retained run execute after loan release;
              // the actual-receiver owner first failed, then passed with this forwarding (2026-10-29).
              const executed: unknown = Reflect.apply(member, receiver, parameters);
              // Proof: omitting refusal admitted the missing-instrumentation owner (2026-10-29).
              if (statement === '') throw new Error('read statement observation was lost');
              const control = statement.trim().toUpperCase();
              // Proof: queuing in the pre-execution logger failed only the COMMIT-rejection owner.
              if (control === 'COMMIT' || control === 'ROLLBACK')
                queueMicrotask(() => {
                  // Proof: omitting the real observeCommitted release failed this exact-loan oracle.
                  if (receiver === db || !isReleased(receiver))
                    throw new Error('completed read did not release its actual pooled loan');
                  // Proof: omitting this callback lost disabled/draining and saved-plan reauthorization faults.
                  probe.onReleased();
                });
              return executed;
            };
          return member;
        },
      });
      return {
        db,
        close() {
          connection.close();
          physicalOpen--;
        },
      };
    },
  };
  return probe;
}
