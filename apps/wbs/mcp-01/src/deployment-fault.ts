/**
 * A fault of this deployment, never a client's refusal: a missing or wrong
 * service secret, an answer be-01 is not modeled to give, or two activation
 * markers that disagree. It is reported through mcp-01's redacting logger and
 * the client is answered `502 server_error` (`wbs-mcp-agent-surface` M3, M13).
 */
export class McpDeploymentFault extends Error {}

/** Reports one {@link McpDeploymentFault}, redacting the deployment's secrets, as `main.ts` composes it. */
export type DeploymentFaultReporter = (fault: McpDeploymentFault) => void;
