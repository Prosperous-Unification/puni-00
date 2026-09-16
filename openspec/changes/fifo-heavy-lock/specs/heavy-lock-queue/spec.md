## ADDED Requirements

### Requirement: Waiters take the heavy lock in arrival order

A run that cannot claim the heavy lock SHALL enqueue a ticket naming its pid, lane label, command
and start time, and SHALL claim the lock only while no live ticket that arrived earlier is queued.
A run that claims the lock SHALL delete its own ticket.

#### Scenario: A faster-polling waiter arrives second

- **WHEN** a holder is running, waiter A enqueues, and waiter B enqueues a second later with a
  shorter poll interval
- **THEN** A runs its command before B does, although B polls the released lock first

#### Scenario: A run takes a free lock

- **WHEN** nothing holds the lock and no ticket is queued
- **THEN** the run claims it without waiting and leaves neither its ticket nor the lock behind

### Requirement: A dead waiter never holds the queue

A ticket whose pid no longer exists SHALL be removed by whichever run sees it first, naming the
ticket on stderr, and a waiter SHALL remove its own ticket when it exits, is interrupted or is
terminated.

#### Scenario: A waiter is killed while queued

- **WHEN** a ticket that arrived earlier names a pid that has exited
- **THEN** the next run removes that ticket, names it on stderr, and takes the lock rather than
  queueing behind a process that will never release it

### Requirement: The queue reports who holds the lock and who waits

`bin/with-heavy-lock.sh status` SHALL print the holder's pid and lane label and then every queued
ticket oldest first with its pid, lane label and age in seconds. Every run that claims the lock
SHALL print how many whole seconds it waited and how many tickets were ahead of it when it
enqueued, including when it waited for none. The h2puni gate SHALL label its lane with the commit
it gates.

#### Scenario: Two waiters are queued behind a holder

- **WHEN** status runs while one run holds the lock and two runs wait
- **THEN** it prints the holder's pid and label first, then the two waiters oldest first, one line
  each, and exits 0

#### Scenario: A gate queues behind another holder

- **WHEN** the gate takes the lock after waiting for a holder
- **THEN** it reports its wait in whole seconds before it reports the commit it runs on

### Requirement: Unknown queue state refuses rather than guessing

A run SHALL refuse with exit 70, naming the path, when the queue directory cannot be read or
written, and when a queued name is not `<nanoseconds>-<pid>`. A run SHALL refuse with exit 70 when
no nanosecond clock is available, rather than enqueue a ticket that cannot be ordered.

#### Scenario: The queue directory is unreadable

- **WHEN** the queue directory exists but the run cannot read or write it
- **THEN** the run refuses with exit 70 naming that directory, instead of reading an empty queue
  and claiming the lock out of order

#### Scenario: An unorderable name sits in the queue

- **WHEN** the queue holds a name that is not `<nanoseconds>-<pid>`
- **THEN** the run refuses with exit 70 naming it, instead of treating it as a dead ticket and
  deleting it

#### Scenario: The lock directory cannot be read by status

- **WHEN** status finds a lock directory whose holder or label it cannot read
- **THEN** it refuses with exit 70 naming the file, instead of reporting a lock with no holder
