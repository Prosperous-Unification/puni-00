## ADDED Requirements

### Requirement: DNS runtime and declarations are release-owned inputs

The finite trusted declaration roots SHALL explicitly include the locked dns-packet and @types/dns-packet packages. Package, toolkit and relocation producers SHALL use the existing dependency closure to include @leichtgewicht/ip-codec transitively. Candidate imports SHALL NOT enroll additional roots.

#### Scenario: Supported DNS closure is complete and finite

- **GIVEN** the reviewed DNS runtime and type packages in the locked installation
- **WHEN** the shared trusted closure is derived
- **THEN** both explicit roots and the declared transitive codec dependency are included
- **AND** unrelated installed packages are excluded

### Requirement: Installed extraction resolves public DNS surfaces

Installed relationship extraction SHALL resolve real named and type imports from dns-packet, preserve the local codec module augmentation and public DNS declarations, and succeed without candidate node_modules or source-workspace access.

#### Scenario: Real DNS imports and augmentation are preserved

- **GIVEN** a committed candidate importing decode, name, question, Question and DecodedPacket with the existing codec augmentation shape
- **WHEN** the installed package extracts its public relationships outside the source checkout
- **THEN** extraction succeeds and includes the DNS import and public DNS declaration closure

#### Scenario: Required type root is omitted from an otherwise authenticated package

- **GIVEN** a rebuilt package containing the DNS runtime but omitting @types/dns-packet
- **WHEN** the same installed consumer extracts its relationships
- **THEN** the required compiler declaration checks refuse extraction rather than accepting an untyped public DNS surface

#### Scenario: Copied DNS declarations are missing or corrupted

- **GIVEN** the installed package authenticates its complete reviewed closure
- **WHEN** copied @types/dns-packet is removed or its declaration bytes are changed
- **THEN** toolkit verification refuses without a successful report
- **AND** restoring the exact bytes restores the original successful report
