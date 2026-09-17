# Fleet site inputs

`site-inputs.schema.json` is the complete input contract for a site. The checked-in local profile uses isolated fixture values and is runnable without production credentials. Production apply requires a separate schema-valid input file supplied outside Git with real cloud project/network IDs, SSH CIDRs and key fingerprints, host allocations, API endpoint, DNS names and ownership, registry, SOPS references, object-store endpoints and failure domains, and alert destination.

Missing production input blocks only production planning/apply. No tool substitutes local values, empty collections, discovered defaults, or environment-wide host lists for it.
