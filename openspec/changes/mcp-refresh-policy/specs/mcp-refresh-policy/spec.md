## ADDED Requirements

### Requirement: Explicit family authority

MCP SHALL distinguish an unbound epoch-0 legacy family from organization-bound or unsupported family authority. Without an authoritative organization reader, bound or unsupported families SHALL be refused on all refresh paths before returning an upstream credential or contacting a provider.

#### Scenario: Fresh bound family without authority

- **GIVEN** a durable organization-bound family with an unexpired provider token and no authoritative reader
- **WHEN** automatic caller resolution, forced session refresh or token-endpoint refresh runs
- **THEN** it refuses without provider contact, successor credentials or upstream token disclosure

### Requirement: Continuous binding

Consent, authorization code, grant, family, session and be-01 delegation SHALL bind one stable user, organization, issuer-subject pair, client and credential epoch. Scopes SHALL only narrow. Client arguments SHALL NOT establish organization authority.

#### Scenario: Substituted binding or widened scope

- **WHEN** any stage substitutes organization, user, issuer, subject, client or epoch, disagrees with its family, or widens scope
- **THEN** refresh and tool dispatch refuse and no successor credential is usable

### Requirement: Current organization policy on every path

Before provider work or a fresh-token return, every refresh path SHALL check current membership, verified binding, enforced SSO and session policy using shared credential-rule semantics. be-01 SHALL independently refuse unauthorized final use and refresh retry.

#### Scenario: Membership loss with fresh provider token

- **GIVEN** membership was removed while a provider access token remains fresh
- **WHEN** any refresh path or subsequent tool use runs
- **THEN** it refuses and dispatches no tool or successor credential

### Requirement: Trusted distinct authentication times

Policy evaluation SHALL retain separately trusted `openedAt` and `reauthenticatedAt`, preserving unknown as unknown. Refresh SHALL NOT replace either time with token issuance or refresh completion. A configured bound SHALL admit equality and refuse one millisecond beyond; unknown corresponding time SHALL refuse.

#### Scenario: Unknown and exact boundary times

- **GIVEN** a configured maximum-session or reauthentication bound
- **WHEN** its trusted time is unknown, exactly at the bound, or one millisecond beyond it
- **THEN** evaluation respectively refuses, admits, and refuses according to `credentialRuleRefusal`

### Requirement: Recheck after asynchronous refresh

MCP SHALL recheck current authority after provider work or rival lease completion and before publishing credentials or dispatching a tool. Policy tightening, binding change or membership loss SHALL prevent publication and dispatch.

#### Scenario: Policy tightens while provider is held

- **GIVEN** a provider refresh is held after initial policy admission
- **WHEN** an administrator tightens policy or removes membership before provider completion
- **THEN** completion yields no usable successor, delegation or tool call

### Requirement: Preserve rotation and distinguish outages

Refresh SHALL preserve reuse revocation, scope narrowing, single provider lease and atomic successor consumption. Modeled authority/provider outages SHALL remain distinguishable from policy denial and SHALL NOT grant authority. Unexpected trusted-state failures SHALL throw.

#### Scenario: Replay races a held refresh

- **WHEN** a consumed refresh token is replayed while another refresh is held
- **THEN** its family is revoked and the held operation cannot publish a usable successor

#### Scenario: Authority unavailable

- **WHEN** the authority reader reports a modeled outage
- **THEN** no credentials or tools are released and the caller receives an unavailable outcome distinct from policy refusal
