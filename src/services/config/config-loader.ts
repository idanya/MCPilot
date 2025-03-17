/**
 * Configuration loader service with schema validation
 */

import * as fs from "fs";
import * as path from "path";
import {
  ConfigLoaderOptions,
  DEFAULT_CONFIG,
  DEFAULT_ENV_MAPPINGS,
  MCPilotConfig,
} from "../../interfaces/config/types.ts";
import { ErrorSeverity, MCPilotError } from "../../interfaces/error/types.ts";
import { validateConfig } from "./config-schema.ts";

export class ConfigLoader {
  private config: MCPilotConfig;
  private readonly options: ConfigLoaderOptions;

  constructor(options: ConfigLoaderOptions = {}) {
    this.options = options;
    this.config = { ...DEFAULT_CONFIG };
  }

  public async load(): Promise<MCPilotConfig> {
    try {
      // Handle configuration file loading
      if (this.options.configPath) {
        // If config path is specified, use it directly and throw error if not found
        await this.loadFromFile(this.options.configPath);
      } else {
        // If no config path specified, search for .mcpilot.config.json recursively
        try {
          const configPath = await this.findConfigFile(process.cwd());
          await this.loadFromFile(configPath);
        } catch (error) {
          if (
            error instanceof MCPilotError &&
            error.code === "CONFIG_NOT_FOUND"
          ) {
            throw error; // Re-throw config not found error
          }
          throw new MCPilotError(
            "Failed to load configuration",
            "CONFIG_LOAD_ERROR",
            ErrorSeverity.CRITICAL,
            { error },
          );
        }
      }

      // Apply environment variables
      if (this.options.env) {
        this.loadFromEnvironment(this.options.env);
      }

      // Apply overrides
      if (this.options.overrides) {
        this.mergeConfig(this.options.overrides);
      }

      // Validate final configuration
      const validationResult = validateConfig(this.config);
      if (!validationResult.success) {
        throw new MCPilotError(
          "Invalid configuration",
          "CONFIG_VALIDATION_ERROR",
          ErrorSeverity.HIGH,
          { errors: validationResult.error.issues },
        );
      }

      return this.config;
    } catch (error) {
      if (error instanceof MCPilotError) {
        throw error;
      }
      throw new MCPilotError(
        "Failed to load configuration",
        "CONFIG_LOAD_ERROR",
        ErrorSeverity.CRITICAL,
        { error },
      );
    }
  }

  private async findConfigFile(startDir: string): Promise<string> {
    const configName = ".mcpilot.config.json";
    let currentDir = startDir;

    while (true) {
      const configPath = path.join(currentDir, configName);
      try {
        await fs.promises.access(configPath);
        return configPath;
      } catch {
        const parentDir = path.dirname(currentDir);
        if (parentDir === currentDir) {
          // Reached root directory
          throw new MCPilotError(
            "Configuration file not found",
            "CONFIG_NOT_FOUND",
            ErrorSeverity.HIGH,
            { searchedPaths: [startDir] },
          );
        }
        currentDir = parentDir;
      }
    }
  }

  private async loadFromFile(filePath: string): Promise<void> {
    try {
      const resolvedPath = path.resolve(filePath);

      try {
        await fs.promises.access(resolvedPath);
      } catch {
        throw new MCPilotError(
          "Configuration file not found",
          "CONFIG_NOT_FOUND",
          ErrorSeverity.HIGH,
          { filePath: resolvedPath },
        );
      }

      const fileContent = await fs.promises.readFile(resolvedPath, "utf8");

      let fileConfig: Partial<MCPilotConfig>;
      if (filePath.endsWith(".json")) {
        fileConfig = JSON.parse(fileContent);
      } else {
        // Assume it's a JS/TS module
        fileConfig = require(resolvedPath);
      }

      // Validate file configuration before merging
      const validationResult = validateConfig(fileConfig);
      if (!validationResult.success) {
        throw new MCPilotError(
          "Invalid configuration file",
          "CONFIG_FILE_ERROR",
          ErrorSeverity.HIGH,
          {
            filePath,
            errors: validationResult.error.issues,
          },
        );
      }

      this.mergeConfig(fileConfig);
    } catch (error) {
      throw new MCPilotError(
        "Failed to load config file",
        "CONFIG_FILE_ERROR",
        ErrorSeverity.HIGH,
        { filePath, error },
      );
    }
  }

  private loadFromEnvironment(env: NodeJS.ProcessEnv): void {
    for (const [envVar, mapping] of Object.entries(DEFAULT_ENV_MAPPINGS)) {
      const value = env[envVar];
      if (value) {
        const transformedValue = mapping.transform
          ? mapping.transform(value)
          : value;
        this.setConfigValue(mapping.path, transformedValue);
      }
    }
  }

  private replaceEnvVars(obj: any): any {
    if (typeof obj === "string") {
      const envVarMatch = obj.match(/^\${([^}]+)}$/);
      if (envVarMatch) {
        const envVar = envVarMatch[1];
        return process.env[envVar] || obj;
      }
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.replaceEnvVars(item));
    }

    if (obj && typeof obj === "object") {
      const result: any = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this.replaceEnvVars(value);
      }
      return result;
    }

    return obj;
  }

  private mergeConfig(source: Partial<MCPilotConfig>): void {
    if (!source) return;

    // Process environment variables in the source config
    source = this.replaceEnvVars(source);

    // Merge providers
    if (source.providers) {
      this.config.providers = {
        ...this.config.providers,
        ...source.providers,
      };
    }

    // Merge session settings
    if (source.session) {
      this.config.session = {
        ...this.config.session,
        ...source.session,
      };
    }

    // Merge logging settings
    if (source.logging) {
      this.config.logging = {
        ...this.config.logging,
        ...source.logging,
      };
    }

    // Merge MCP settings
    if (source.mcp) {
      this.config.mcp = this.config.mcp || {};
      if (source.mcp.servers) {
        this.config.mcp.servers = {
          ...this.config.mcp.servers,
          ...source.mcp.servers,
        };
      }
    }
  }

  private setConfigValue(path: string[], value: any): void {
    let current = this.config as any;
    const lastIndex = path.length - 1;

    for (let i = 0; i < lastIndex; i++) {
      const key = path[i];
      if (!(key in current)) {
        current[key] = {};
      }
      current = current[key];
    }

    current[path[lastIndex]] = value;
  }
}
