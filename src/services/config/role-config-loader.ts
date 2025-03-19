/**
 * Role configuration loader service with schema validation
 */

import * as fs from "fs";
import * as path from "path";
import { RoleConfig, RolesConfig } from "../../interfaces/config/types.ts";
import { ErrorSeverity, MCPilotError } from "../../interfaces/error/types.ts";
import { validateRolesConfig } from "./role-schema.ts";
import { findConfigFileSync } from "./config-utils.ts";

interface RoleConfigLoaderOptions {
  configPath?: string;
}

export class RoleConfigLoader {
  private config: RolesConfig;
  private readonly options: RoleConfigLoaderOptions;
  private static DEFAULT_CONFIG_NAME = ".mcpilot.roles.json";

  constructor(options: RoleConfigLoaderOptions = {}) {
    this.options = options;
    this.config = { roles: {} };
  }

  public load(): RolesConfig {
    try {
      let configPath: string | null = null;

      if (this.options.configPath) {
        // If config path is specified, verify it exists
        if (!fs.existsSync(this.options.configPath)) {
          throw new MCPilotError(
            "Specified role configuration file not found",
            "ROLE_CONFIG_NOT_FOUND",
            ErrorSeverity.HIGH,
            { configPath: this.options.configPath },
          );
        }
        configPath = this.options.configPath;
      } else {
        // Search for the file in .mcpilot directories up the hierarchy
        configPath = findConfigFileSync(
          process.cwd(),
          RoleConfigLoader.DEFAULT_CONFIG_NAME,
          false,
        );
      }

      // Load the config if a file was found
      if (configPath) {
        this.loadFromFile(configPath);
      }

      return this.config;
    } catch (error) {
      if (error instanceof MCPilotError) {
        throw error;
      }
      throw new MCPilotError(
        "Failed to load role configuration",
        "ROLE_CONFIG_LOAD_ERROR",
        ErrorSeverity.HIGH,
        { error },
      );
    }
  }

  public getRole(name: string): RoleConfig | undefined {
    return this.config.roles[name];
  }

  public getDefaultRole(): string | undefined {
    return this.config.defaultRole;
  }

  public getAllRoles(): string[] {
    return Object.keys(this.config.roles);
  }

  private loadFromFile(filePath: string): void {
    try {
      const resolvedPath = path.resolve(filePath);
      const fileContent = fs.readFileSync(resolvedPath, "utf8");

      const fileConfig = JSON.parse(fileContent);

      // Validate file configuration
      const validationResult = validateRolesConfig(fileConfig);
      if (!validationResult.success) {
        throw new MCPilotError(
          "Invalid role configuration file",
          "ROLE_CONFIG_FILE_ERROR",
          ErrorSeverity.HIGH,
          {
            filePath,
            errors: validationResult.error.issues,
          },
        );
      }

      this.config = fileConfig;
    } catch (error) {
      if (error instanceof MCPilotError) {
        throw error;
      }
      throw new MCPilotError(
        "Failed to load role config file",
        "ROLE_CONFIG_FILE_ERROR",
        ErrorSeverity.HIGH,
        { filePath, error },
      );
    }
  }
}
