/**
 * Main entry point for MCPilot
 */

import { LogLevel } from "./interfaces/base/session.ts";
import { MCPilotConfig } from "./interfaces/config/types.ts";
import { MCPilotError } from "./interfaces/error/types.ts";
import { ILLMProvider } from "./interfaces/llm/provider.ts";
import { ProviderFactory } from "./providers/provider-factory.ts";
import { createLogger, logger } from "./services/logger/index.ts";
import { SessionManager } from "./services/session/index.ts";

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

// Create a new session
export const createSession = async (options: {
  model?: string;
  contextSize?: number;
  maxQueueSize?: number;
  logDirectory?: string;
  logLevel?: LogLevel;
  provider: ILLMProvider; // Make provider required
}) => {
  const config: MCPilotConfig = {
    providers: {
      default: { model: options.model || "default-model" },
    },
    session: {
      logDirectory: options.logDirectory || "./logs",
      contextSize: options.contextSize || 4096,
      maxQueueSize: options.maxQueueSize || 100,
      defaultProvider: "default",
    },
    logging: {
      level: (options.logLevel?.toString() || "INFO") as
        | "DEBUG"
        | "INFO"
        | "WARN"
        | "ERROR",
    },
    mcp: {
      servers: {},
    },
  };

  // Configure logger with session log level
  const newLogger = createLogger(config.logging.level.toLowerCase());
  Object.assign(logger, newLogger);

  const manager = new SessionManager(config, options.provider);

  manager.createSession();
  return manager;
};

// Resume an existing session
export const resumeSession = async (
  logPath: string,
  options: { provider: ILLMProvider }, // Make provider required
) => {
  const config: MCPilotConfig = {
    providers: {
      default: { model: "default-model" },
    },
    session: {
      logDirectory: "./logs",
      contextSize: 4096,
      maxQueueSize: 100,
      defaultProvider: "default",
    },
    logging: {
      level: "INFO",
    },
    mcp: {
      servers: {},
    },
  };

  // Configure logger with default log level
  const newLogger = createLogger(config.logging.level.toLowerCase());
  Object.assign(logger, newLogger);

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
    logger.error(`MCPilot Error: ${error.message} (${error.code})`);
    if (error.details) {
      logger.error("Details:", error.details);
    }
  } else {
    logger.error("Unexpected error:", error);
  }
};

// Version information
export const VERSION = "0.1.0";
