# Registry storage operations

The language of bounded image storage, its observations and operational incidents.
This glossary describes concepts; behavior and activation evidence live in the specs and runbooks.

## Language

**Registry pressure report**:
An observation of registry capacity and write-fence state from one completed pressure check.
_Avoid_: alert, WBS capacity report, newly polled success

**Registry pressure episode**:
A continuous pressure or write-fencing condition that has not yet been followed by a normal, unfenced observation. Warning, cleanup-request and cutoff occurrences can belong to the same episode.
_Avoid_: delivery attempt, alert, report epoch

**Registry alert**:
An incident about registry pressure, blocked writes or maintenance that requires a notification to the configured destination. It remains the same incident when the measured condition later changes.
_Avoid_: toast, pressure report, delivery receipt

**Registry alert acknowledgement**:
The selected notification provider's positive response to one specific registry alert submission.
_Avoid_: observed channel receipt, human read, process exit success

**Registry alert uncertainty**:
An alert outcome for which submission or acknowledgement durability cannot establish whether the destination accepted the notification.
_Avoid_: rejection, acknowledgement, absence of a message

**Registry backup budget**:
The maximum combined size of stored backup files, including retained object versions and uploaded multipart parts. Provider billing overhead and minimum billable object sizes are outside this measure.
_Avoid_: billing limit, host filesystem capacity, logical snapshot size

**Registry backup reservation**:
The fixed byte and metadata obligation held for one bounded backup operation before its storage additions. Unreconciled uncertainty remains part of that obligation.
_Avoid_: free space, logical snapshot size, caller allowance

**Registry backup write debit**:
The durable spent portion of a backup reservation for one possible storage addition, including an addition whose acknowledgement was lost.
_Avoid_: confirmed usage, reclaimed capacity, command completion
