## Problem

Three hosted `tool-fleet` jobs on Ubuntu 24.04 lost runner communication before their final verdict. The failures leave the cause unresolved. The Fleet leaf needs a distinct stock hosted platform to attempt the complete suite.

## Outcome

Qualify the Fleet leaf on Ubuntu 26.04 x64 with CPython 3.14.10 from the pinned setup action. The other heavy leaves and six static Python jobs retain their Ubuntu 24.04 and CPython 3.14.4 pins. Adoption requires a successful Fleet leaf, all required hosted checks, and the full canonical gate on the exact new source.

## Scope

Use the existing heavy matrix and conditional pins. Preserve its workload, finite budgets, native provisioning and isolation, solver lock, diagnostics and required verdicts. Resolving the prior losses, changing runner providers or credentials, porting native software and modifying application behavior are outside this change.
