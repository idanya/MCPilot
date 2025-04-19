/**
 * Main entry point for MCPilot
 */

export { LogLevel, SessionManager } from "./services/session/index.ts";

export type { SessionState } from "./interfaces/base/state.ts";

export type {
  Message,
  MessageType,
  Response,
  ResponseType,
} from "./services/session/index.ts";

// Provider system
export {
  AnthropicProvider,
  OpenAIProvider,
  ProviderFactory,
  ProviderType,
} from "./providers/index.ts";

export type { ProviderConfig } from "./providers/index.ts";

// Error handling
export { ErrorSeverity, MCPilotError } from "./interfaces/error/types.ts";

// MCP entities
export type {
  ConnectionStatus,
  McpConfig,
  McpConnection,
  McpResource,
  McpServer,
  McpTool,
} from "./services/mcp/types.ts";

// Configuration types
export type {
  AnthropicConfig,
  OpenAIConfig,
  ProviderConfigMap,
} from "./providers/provider-config.ts";

export { ConfigLoader } from "./services/config/config-loader.ts";
