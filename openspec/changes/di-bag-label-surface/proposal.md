# DI Bag label surface

The module label agreement check infers a sealed module's label from private binding-name prefixes. An unlabelled module can forge that prefix in a key or borrow it from a labelled child. This leaves WBS `cc9361f6` open and requires every module to retain a private binding solely so the check can read a prefix.

Adopt `di-bag` 0.5.1. Read the exact label from each scanned module's `moduleLabel` getter, after DI Bag validates that the export is a module. When only a container is available, attribute bindings by `moduleInstallationId` and `moduleInstallations`; preserve the parent relation and do not infer origin from slashes. A fully exported or empty module may satisfy label agreement.

The module roots and location-derived identifier convention remain the same. Capacity's own private-binding tests continue to enforce its contract. This change does not require a new provider, alter service lifetimes, or reserve `/` in keys or labels.
