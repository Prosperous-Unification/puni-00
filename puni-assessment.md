# PUNI client delivery readiness assessment — scope

## 1. Purpose and boundaries

Define an assessment of what PUNI can reliably deliver for three client requests,
what requires manual or custom work, and what blocks repeatable delivery. This
document defines the scope and expected assessment outputs; it contains no findings
or readiness judgments.

Assess each client request separately, supported by a shared capability assessment.
Compare intended behavior in prior plans, documentation, and artifacts with actual
code and infrastructure. Evaluate both initial delivery and ongoing operation.

Infrastructure is part of the deliverable. Tool choices belong beneath the
capabilities they support: fleet management is broader than Ansible, and application
scaling is broader than adding k3s nodes.

The future assessment must identify supported workload types, operating environments,
service targets, and exclusions. This scope does not authorize infrastructure changes,
deployments, recovery drills, or implementation of identified improvements.

## 2. Client journeys

For each journey, define acceptance criteria, required inputs, ownership, elapsed time,
manual effort, and the evidence needed to establish readiness.

| Client request                            | Journey to assess                                                                                                                                                                                                    |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Launch a new application                  | Intake and requirements → repository and environments → build and deploy → domain, TLS, and authentication → monitoring and recovery → handover and ongoing operation                                                |
| Scale an existing application             | Baseline performance and cost → identify bottlenecks → onboard or integrate the existing stack → change application or infrastructure capacity → verify improvement, compatibility, and recovery → ongoing operation |
| Set up a personal assistant with OpenClaw | Define useful tasks → provision → connect accounts and tools → configure permissions and approval boundaries → verify tasks → monitor cost and behavior → update, recover, and offboard                              |

## 3. Delivery and ownership models

Assess applicability and readiness across:

- Shared PUNI hosting and shared platform services.
- Dedicated client environments operated by PUNI.
- Client-owned infrastructure, including integration with an existing stack.
- Combinations of shared services and client-specific deployments.

For each capability, distinguish reuse of code, deployment automation, and running
services from configuration, adaptation, and bespoke development. Identify who owns
accounts, infrastructure, information, credentials, upgrades, incident response, and
handover or exit. Include isolation requirements and the effect one client's load or
failure can have on others.

## 4. Capability assessment

### Infrastructure and fleet lifecycle

- **Cloud resources and provisioning:** repeatable creation, adoption, change, and
  removal of resources; Hetzner node kinds and AWS resources; account boundaries,
  infrastructure state, and drift. Include Terragrunt's intended and actual role.
- **Node fleet management:** inventory, ownership, roles, enrollment, configuration,
  drift reconciliation, patching, reboots, credential rotation, capacity, draining,
  repair, replacement, recovery, and retirement. Cover standalone hosts, k3s servers
  and workers, and client-owned nodes, regardless of whether Ansible manages them.
- **Safe fleet operations:** staged rollout, bounded concurrency, partial failures,
  resumability, maintenance coordination, and audit records.
- **Cluster and application platform:** k3s setup and upgrades, networking, DNS, TLS,
  ingress/Caddy, storage, registry, secrets, and other deployment dependencies. Define
  a supported service contract and measurable onboarding time and manual effort.

### Security and client isolation

- Authentication, authorization, least privilege, client separation, and access revocation.
- Secrets storage and rotation, patching, auditability, and client offboarding.
- Abuse protection and rate limiting, with explicit attack scenarios, traffic levels,
  protection boundaries, and acceptable degradation.
- Assistant tool permissions, approvals, private information boundaries, and spending limits.

### Availability, operations, and recovery

- Application availability targets, resource requests and limits, health detection,
  actionable alerts, incident ownership, and operator runbooks.
- Node, workload, dependency, and control-plane failures; maintenance and upgrades;
  certificate renewal and other recurring operational work.
- Scheduled backups, retention and cleanup, protected backup storage, restore procedures,
  and evidence of successful restoration. Define recovery time and acceptable data loss.

### Capacity and application scaling

- Fleet capacity and the process for adding Hetzner nodes.
- Workload placement, replicas, and resource contention.
- Application bottlenecks, database and storage limits, and stateful workload constraints.
- Load baselines and evidence that scaling improves the client journey within its cost
  and reliability targets.

### Observability and measurement

- **Application and infrastructure health:** availability, errors, latency, throughput,
  saturation, capacity, backup outcomes, and recovery time.
- **Agent and assistant activity:** LLM sessions, tool calls, failures, latency, usage,
  and inference cost, correlated with application and audit logs where applicable.
- **Change delivery:** lead time from accepted request to production, deployment
  frequency, accepted changes, review and merge delay, gate duration and queue time,
  change failure rate, rework, and recovery time after failed changes.
- Metric definitions, collection points, ownership, dashboards, alert thresholds,
  retention, access, and attribution by client, application, environment, or change.

### Change quality and delivery speed

- Automated tests and meaningful failure proofs; backward-compatible application,
  API, and database changes.
- Code modularity, readable implementation, concise and complete documentation,
  and usable planning, specification, review, and verification artifacts.
- Coordination and integration of parallel agent work. Evaluate whether more agents
  increase accepted delivery throughput without increasing failures or rework, using
  the criteria in Agent swarm organization.

### Agent swarm organization

Assess how the agents that develop and operate PUNI are coordinated, because
development scalability depends on it: more agents must raise accepted delivery
throughput without raising failures, rework, cost, or operator attention. Use the
seven questions from Josh Rosen's
[Supervisors vs. Swarms](https://x.com/JoshARosen/status/2111110576369737745)
(2026-10-16) as the criteria, and for each one record who decides, where the
decision is stored, and what evidence shows it holds under concurrency.

| Criterion                  | What the assessment must establish                                                                                                                                                                                                 |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Delegation and handoffs    | Whether work moves between agents by delegation with a result returned, by handoff, or by a graph that code advances; whether a change request opens a new revision or a back-edge; whether any agent-to-agent transfer is logged. |
| Locus of control           | Whether an LLM, application code, or a person chooses the next step; whether the chooser is a bottleneck or a single point of failure; how two coordinators on one store are fenced.                                               |
| Sequential and parallel    | What can run concurrently, what fan-in waits for, how dependencies between parallel branches are expressed, and what caps concurrency on each host.                                                                                |
| Context policy             | What a first attempt receives, what a retry receives, what a reviewer receives, and whether any agent inherits another agent's transcript.                                                                                         |
| Identity and authority     | Which identity each attempt acts under in WBS, GitHub, and the hosts; which credentials an attempt's process can reach; whether a worker can mark its own work done; how nested subagents are bounded and attributed.              |
| Deciding when work is done | Who decides that a step and a work item are complete; whether an agent's own finish signal authorizes anything; what caps revisions, retries, steps, and token spend; what happens at each cap.                                    |
| Verification               | Where review, verification, and human approval sit in the flow; whether they are structural steps or optional behavior; whether a second model or a tool, not the author, performs them.                                           |

Prior intent to trace: the Twilight agentic workflows change
(`openspec/changes/twilight-agentic-workflows`, pull request #601, assumptions
A1 to A11), ADR 0056, and the WBS project "Agentic workflows — WBS, CTT and portable
persistence" (dev WBS, id `eeb8e50a-6ee6-49e4-a533-e10b1e29939d`). That plan answers
the criteria with code-driven control, WBS as the state of the job, isolated
per-attempt context, and structural verification. It also records four open items
the assessment must check rather than assume: per-class context policy for retries
(I1.05), bounds and usage attribution for nested harness subagents (I2.10), worker
authority scoping with credentials held only by the coordinator (I3.05), and
work-item-level termination through a revision cap and a token budget (S7a.06).
Evidence for this capability is the measured delivery metrics in Observability and
measurement under growing agent concurrency, not the existence of the plan.

### CI/CD

Assess the path from commit through verified production deployment for each applicable
client journey and delivery model.

- Repository onboarding and reusable pipeline configuration.
- Build, test, security, and quality gates; required checks and enforcement before merge.
- Reproducible builds, artifact creation, versioning, provenance, registry management,
  and traceability from the tested revision to the deployed artifact.
- Environment configuration, secrets, and promotion to production.
- Deployment strategies, canary applicability, backward-compatible database migrations,
  health checks, post-deployment verification, and rollback.
- Pipeline permissions, runner isolation, concurrency, partial failures, and recovery
  from interrupted or failed builds and deployments.
- Pipeline duration, queue time, deployment frequency, and pipeline and deployment
  failure rates, using the definitions and ownership in Observability and measurement.

### Reusable features and modules

- Plug-and-play authentication, including Auth0 and other supported authentication methods.
- Configuration, integration contracts, authorization boundaries, documentation,
  versioning, upgrades, and adoption in a second application as evidence of reuse.
- Other existing reusable capabilities relevant to the three client journeys, with
  a clear boundary between shared modules and application-specific behavior.

### Assistant operations

- OpenClaw installation, configuration, account and tool connections, and task acceptance.
- Ongoing supervision, updates, failure handling, backup and recovery of configuration
  and state, and transfer or removal of the assistant.
- Apply the shared security, observability, fleet, and cost criteria to this journey.

### Cost and operator effort

- Infrastructure, storage, traffic, inference, and tooling costs attributable to each client.
- Onboarding time, recurring maintenance, manual interventions, support effort, and
  cost changes as applications, clients, or agent concurrency grow.

## 5. Evidence and gaps

Use [the platform map](docs/platform-map.md) as an inventory starting point. Trace
capabilities to prior plans, ADRs, OpenSpec specifications and changes, runbooks,
verification records, code, tests, deployment configuration, and actual infrastructure.
Link existing knowledge rather than duplicating it.

For each capability, the future assessment should record:

| Field                           | Required content                                                                                       |
| ------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Outcome and acceptance criteria | What must be possible and how success is measured                                                      |
| Applicability                   | Client journeys, delivery models, and responsible owners                                               |
| Prior intent                    | Linked plans, decisions, contracts, and artifacts                                                      |
| Implementation state            | What exists in code and configuration, and where it is deployed                                        |
| Verification evidence           | Source, date, revision or environment, demonstrated behavior, and limits of the proof                  |
| Reconciliation                  | Where intent, documentation, code, and deployed infrastructure agree, diverge, or have been superseded |
| Gap and consequence             | Missing capability or evidence, manual work, dependencies, and affected client journeys                |
| Next action                     | Smallest useful action and the evidence required to close the gap                                      |

Keep implementation state separate from verification. Distinguish documented intent,
code inspection, automated tests, local or synthetic exercises, and live operational
evidence. An existing tool or a checked task does not establish operational readiness.
Unknown, unavailable, stale, and unverified evidence must remain explicit; do not
count them as passing. State any checks not performed and why.

## 6. Prioritized actions — expected assessment output

The eventual assessment should prioritize gaps by the client journeys they block,
operational impact, dependencies, effort, and expected benefit. Each proposed action
should identify an owner and completion evidence. Separate implementation work,
operational activation, verification, and documentation reconciliation so that a
missing proof is not mistaken for a missing implementation.

No findings, scores, or action priorities are assigned in this scope document.
