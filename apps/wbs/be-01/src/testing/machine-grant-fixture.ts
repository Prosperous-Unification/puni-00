import { loadMcpServiceSettings, type McpServiceSettings } from '../config';

/** The authorization server tests configure: `WBS_MCP_AUTHORIZATION_SERVER`, and the audience root. */
export const TEST_MCP_AUTHORIZATION_SERVER = 'https://wbs.example/mcp/oauth';

/**
 * be-01's machine grant settings as tests configure them (`wbs-mcp-agent-surface`
 * M3, M14), in the environment shape the activation CLI and `loadConfig` read:
 * activation refuses without them, and an activated store refuses to boot.
 * Fixed placeholder values, never a deployment's.
 */
export const TEST_MACHINE_GRANT_ENV: Readonly<Record<string, string>> = {
  MCP_BE_INTERNAL_SECRET: 'mcp-secret-0123456789abcdefghijklmn',
  WBS_MACHINE_GRANT_SIGNING_KEY_CURRENT: 'grant-key-g-0123456789abcdefghijklmn',
  WBS_MCP_AUTHORIZATION_SERVER: TEST_MCP_AUTHORIZATION_SERVER,
};

/** {@link TEST_MACHINE_GRANT_ENV} as `BootOptions.mcpService`, for boots of activated stores. */
export const TEST_MCP_SERVICE_SETTINGS: McpServiceSettings =
  loadMcpServiceSettings(TEST_MACHINE_GRANT_ENV);
