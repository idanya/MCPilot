/**
 * Main entry point for MCPilot
 */

import { LogLevel } from "./interfaces/base/session.js";
import { MCPilotError } from "./interfaces/error/types.js";
import { SessionManager } from "./services/session/index.js";
import { ProviderFactory } from "./providers/provider-factory.js";
import { ILLMProvider } from "./interfaces/llm/provider.js";
import { MCPilotConfig } from "./interfaces/config/types.js";

// Core exports - only export the runCLI function, not the class itself
// export { runCLI } from './cli/index.js';

// Session management
export {
  SessionManager,
  ContextManager,
  LogManager,
  LogLevel,
} from "./services/session/index.js";

export type { SessionState } from "./interfaces/base/state.js";

export type {
  Message,
  MessageType,
  Context,
  Response,
  ResponseType,
} from "./services/session/index.js";

// Provider system
export {
  BaseLLMProvider,
  ProviderFactory,
  OpenAIProvider,
  AnthropicProvider,
  LocalProvider,
  ProviderType,
} from "./providers/index.js";

export type { ProviderConfig } from "./providers/index.js";

// Error handling
export { MCPilotError, ErrorSeverity } from "./interfaces/error/types.js";

// MCP entities
export type {
  McpConnection,
  McpConfig,
  McpTool,
  McpResource,
  McpServer,
  ConnectionStatus,
} from "./entities/mcp.js";

// Configuration types
export type {
  OpenAIConfig,
  AnthropicConfig,
  LocalConfig,
  ProviderConfigMap,
} from "./providers/provider-config.js";

// Create a new session
export const createSession = async (options: {
  model?: string;
  contextSize?: number;
  maxQueueSize?: number;
  logDirectory?: string;
  logLevel?: LogLevel;
  provider: ILLMProvider;  // Make provider required
}) => {
  const config: MCPilotConfig = {
    providers: {
      default: { model: options.model || 'default-model' }
    },
    session: {
      logDirectory: options.logDirectory || "./logs",
      contextSize: options.contextSize || 4096,
      maxQueueSize: options.maxQueueSize || 100,
      defaultProvider: 'default'
    },
    logging: {
      level: (options.logLevel?.toString() || 'INFO') as 'DEBUG' | 'INFO' | 'WARN' | 'ERROR',
      format: 'json'
    },
    mcp: {
      servers: {}
    }
  };

  const manager = new SessionManager(config, options.provider);

  if (options.logLevel) {
    manager.setLogLevel(options.logLevel);
  }

  const session = manager.createSession();
  return manager;
};

// Resume an existing session
export const resumeSession = async (
  logPath: string,
  options: { provider: ILLMProvider }  // Make provider required
) => {
  const config: MCPilotConfig = {
    providers: {
      default: { model: 'default-model' }
    },
    session: {
      logDirectory: "./logs",
      contextSize: 4096,
      maxQueueSize: 100,
      defaultProvider: 'default'
    },
    logging: {
      level: 'INFO',
      format: 'json'
    },
    mcp: {
      servers: {}
    }
  };

  const manager = new SessionManager(config, options.provider);
  manager.resumeSession(logPath);
  return manager;
};

// Create provider factory
export const createProviderFactory = () => {
  return new ProviderFactory();
};

// Default error handler
export const defaultErrorHandler = (error: Error | MCPilotError) => {
  if (error instanceof MCPilotError) {
    console.error(`MCPilot Error: ${error.message} (${error.code})`);
    if (error.details) {
      console.error("Details:", error.details);
    }
  } else {
    console.error("Unexpected error:", error);
  }
};

// Version information
export const VERSION = "0.1.0";
