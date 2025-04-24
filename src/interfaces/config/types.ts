/**
 * Configuration type definitions
 */

import { LogLevel } from "../base/session.ts";
import {
  OpenAIConfig,
  AnthropicConfig,
} from "../../providers/provider-config.ts";
import { McpServerConfig } from "../../services/config/mcp-schema.ts";

export type LogLevelStrings = keyof typeof LogLevel;

export interface RoleConfig {  
  definition: string;
  instructions: string;
  availableServers: string[];
}

export interface RolesConfig {
  roles: {
    [key: string]: RoleConfig;
  };
  defaultRole?: string;
}

export interface MCPilotConfig {
  providers: {
    openai?: Omit<OpenAIConfig, "name" | "modelName"> & {
      model: string;
    };
    anthropic?: Omit<AnthropicConfig, "name" | "modelName"> & {
      model: string;
    };
    [key: string]:
      | {
          model: string;
          [key: string]: any;
        }
      | undefined;
  };
  session: {
    logDirectory?: string;
    contextSize?: number;
    maxQueueSize?: number;
    defaultProvider: string;
  };
  logging: {
    level: LogLevelStrings;
  };
  mcp?: {
    servers?: Record<string, McpServerConfig>;
  };
}

export interface ConfigValidationResult {
  isValid: boolean;
  errors: ConfigValidationError[];
}

export interface ConfigValidationError {
  path: string[];
  message: string;
  value?: any;
}

export const DEFAULT_CONFIG: MCPilotConfig = {
  providers: {
    openai: {
      model: "gpt-4",
    },
  },
  session: {
    logDirectory: "./sessions",
    contextSize: 4096,
    maxQueueSize: 100,
    defaultProvider: "openai",
  },
  logging: {
    level: "INFO",
  },
};

export interface ConfigLoaderOptions {
  configPath?: string;
  env?: NodeJS.ProcessEnv;
  overrides?: Partial<MCPilotConfig>;
}

export interface EnvironmentMapping {
  [envVar: string]: {
    path: string[];
    transform?: (value: string) => any;
  };
}

// Default environment variable mappings
export const DEFAULT_ENV_MAPPINGS: EnvironmentMapping = {
  OPENAI_API_KEY: {
    path: ["providers", "openai", "apiKey"],
  },
  OPENAI_MODEL: {
    path: ["providers", "openai", "model"],
  },
  ANTHROPIC_API_KEY: {
    path: ["providers", "anthropic", "apiKey"],
  },
  ANTHROPIC_MODEL: {
    path: ["providers", "anthropic", "model"],
  },
  MCPILOT_LOG_LEVEL: {
    path: ["logging", "level"],
    transform: (value: string) => value.toUpperCase(),
  },
  MCPILOT_CONTEXT_SIZE: {
    path: ["session", "contextSize"],
    transform: (value: string) => parseInt(value, 10),
  },
};
