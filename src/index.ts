/**
 * Main entry point for MCPilot
 */

export {
  LogLevel,
  SessionManager,
  RoleManager,
} from "./services/session/index.ts";

export type { SessionState } from "./interfaces/base/state.ts";
export type { ResponseContent } from "./interfaces/base/response.ts";

export type {
  Message,
  MessageType,
  Response,
  ResponseWithSessionMetadata,
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

// Tool system
export { ToolHandler } from "./services/tools/tool-handler.ts";

// Role and MCP Configuration
export type { RoleConfig } from "./interfaces/config/types.ts";
export type { McpServerConfig } from "./services/config/mcp-schema.ts";
