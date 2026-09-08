# Twilight feasibility and viability questions

Prepared 2026-09-08 as the third pass of the Twilight efficiency grill. These
questions extend, rather than repeat, questions 1–120. They test whether the
proposed plan can be executed, operated and abandoned safely by its personal
operator. The answer session must use only the hash-pinned review packet and
must give each question one resolution: `Keep`, `Strengthen`, `Add later` or
`Reject`.

## Bootstrap and critical path

121. Is the delivery plan free of circular prerequisites, including the workflow compiler, the runtime that consumes its output, and the verification tooling that checks it?
122. Can Task 1 prove durable restart without depending on the yet-unbuilt production control plane or worker pool?
123. Are the highest-risk external integrations—ACP, LangGraph persistence, K3s, OIDC and provider usage reporting—probed before large dependent implementation investments?
124. Is one-coordinator SQLite a viable first durable store under the concurrency and recovery load M1 actually proposes?
125. Does M1 depend on hardware, credentials, quotas, DNS or provider access that the plan has not made an explicit readiness gate?
126. Can one personal operator realistically supply every human decision, review, staging and production acceptance step without becoming an unmeasured critical-path bottleneck?
127. Does putting the always-available secretary in Task 15 delay the first personally useful assistant-to-production loop too far?
128. Can Task 8 be called the first useful factory run without implying that branch dev, staging, production and secretary delivery are already complete?
129. Are the implementation tasks decomposed finely enough to execute with TDD and review checkpoints, or do any still conceal multi-week integration batches?
130. Can the plan be called viable without an elapsed-time or cost estimate for implementing the personal phase itself?
131. Does the plan define evidence-based pause, pivot or abandonment criteria if the factory costs more to build or operate than the work it accelerates?

## Operations and recovery

132. Is backup and restore of Twilight's own durable store required before any production delivery depends on it?
133. Are recovery-point and recovery-time expectations explicit enough for a one-operator personal system?
134. Can credentials, signing keys and provider grants be rotated or revoked without silently authorizing stale in-flight work?
135. Is a single K3s server/control-plane node an acceptable first failure domain, and is its loss modeled rather than disguised as high availability?
136. If OpenClaw or the secretary is unavailable, can already-authorized Twilight work still be inspected, controlled and recovered through FE or MCP?
137. Can the coordinator, database schema, workflow definitions and worker images be upgraded without making durable in-flight runs unreadable or unrecoverable?
138. Is durable-record and evidence retention bounded before Task 16's searchable corpus ceiling becomes relevant?
139. Can telemetry, evidence storage or the driver view fail without either blocking essential recovery or falsely reporting a healthy run?
140. Does a provider or regional outage have a modeled operator action that preserves authority and accounting instead of silently falling back?
141. Are lease, timeout and approval-expiry decisions safe under clock skew between the coordinator, workers and external providers?
142. Can an uncertain external effect retain resource holds forever, and if not, who may resolve or abandon it under what evidence?
143. Are crashed Jobs, namespaces, worktrees, volumes and branch environments reconciled and reclaimed without deleting evidence needed for recovery?
144. Are worker images and runtime dependencies pinned, provenance-checked and rebuildable enough to make a historical attempt reproducible?
145. Are build, browser and integration slots measured early enough to reveal that one host—not model capacity—is the actual throughput ceiling?

## Repository and release integration

146. Can Twilight preserve unrelated human edits and dirty client-repository state while planning, composing and publishing changes?
147. Is the proposed planning-commit transaction boundary sufficient when WBS state, Git refs and Twilight durable state cannot commit atomically?
148. Is the prerequisite for the Backlog/WBS cutover observable and enforceable, or can Task 10 start while the named refout refactors are incomplete?
149. Does the planning-storage migration avoid an indefinite dual-editor or dual-write period with conflicting authorities?
150. Is the clean-client fixture representative enough to support portability claims without hiding authentication, repository size or policy differences?
151. Does the plan handle client repositories outside the puni-00 monorepo without importing its local Nx, Bun or documentation conventions as universal requirements?
152. Is there one explicit compatibility matrix for control plane, workflow schema, execution profile, client adapter and worker image revisions?

## Personal viability and acceptance

153. Is there useful personal value before the complete Task 15 secretary integration, or is the operator asked to finish the factory before receiving assistance?
154. Can the operator stop, pause, inspect and recover a run from an accessible control surface when the preferred UI path is broken?
155. Are notifications for decisions, cap pressure, stuck recovery and production readiness bounded and actionable rather than another dashboard the operator must poll?
156. Is accessibility part of personal-phase acceptance for the FE's decision and emergency-control paths?
157. Does exposing every supported policy dimension create configuration overload, and if so, does the product distinguish safe defaults from advanced controls?
158. Are audit and session-content retention defaults operationally affordable and reviewable before the first personal production outcome?
159. Does customer-scale readiness remain genuinely deferred, or do organization, isolation and packaging abstractions impose material personal-phase cost without an immediate invariant?
160. Are the proposed M1 and personal-phase acceptance proofs bounded enough in runtime, spend and operator attention to run repeatedly after meaningful changes?
