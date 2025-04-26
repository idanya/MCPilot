/**
 * Role manager for handling role configuration and context setup
 */

import * as fs from "fs";
import { RoleConfig } from "../../interfaces/config/types.ts";
import { ErrorSeverity, MCPilotError } from "../../interfaces/error/types.ts";
import { McpServerConfig } from "../config/mcp-schema.ts";
import { RoleConfigLoader } from "../config/role-config-loader.ts";
import { validateRolesConfig } from "../config/role-schema.ts";
import { McpHub } from "../mcp/mcp-hub.ts";
import { ToolCatalogBuilder } from "../mcp/tool-catalog.ts";
import { SystemPromptEnhancer } from "../prompt/prompt-enhancer.ts";

export interface RoleManagerOptions {
  /** Path to roles configuration file */
  rolesConfigPath?: string;
  /** Working directory for the session */
  workingDirectory: string;
  /** Path to a specific role file */
  roleFilePath?: string;
  /** MCP servers configuration */
  mcpServers: Record<string, McpServerConfig>;
  /** Whether to auto-approve tools */
  autoApproveTools: boolean;
}

export class RoleManager {
  private roleLoader!: RoleConfigLoader;
  private mcpHub!: McpHub;
  private promptEnhancer!: SystemPromptEnhancer;

  private readonly rolesConfigPath?: string;
  private readonly workingDirectory: string;
  private readonly roleFilePath?: string;
  private readonly mcpServers: Record<string, McpServerConfig>;
  private readonly autoApproveTools: boolean;

  constructor(options: RoleManagerOptions) {
    this.rolesConfigPath = options.rolesConfigPath;
    this.workingDirectory = options.workingDirectory;
    this.roleFilePath = options.roleFilePath;
    this.mcpServers = options.mcpServers;
    this.autoApproveTools = options.autoApproveTools;
  }

  /**
   * Initialize the role manager
   */
  public async initialize(): Promise<void> {
    await this.createMcpHub();
    await this.loadRoleConfiguration();

    this.promptEnhancer = new SystemPromptEnhancer(
      this.mcpHub.getToolCatalog(),
      this.workingDirectory,      
      this.roleLoader,
    );
  }

  /**
   * Get the MCP Hub instance
   */
  public getMcpHub(): McpHub {
    return this.mcpHub;
  }

  /**
   * Get the tool catalog
   */
  public getToolCatalog(): ToolCatalogBuilder {
    return this.mcpHub.getToolCatalog();
  }

  /**
   * Get the prompt enhancer
   */
  public getPromptEnhancer(): SystemPromptEnhancer {
    return this.promptEnhancer;
  }

  /**
   * Get role configuration
   */
  public async getRoleConfig(role: string): Promise<RoleConfig> {
    // If roleFilePath is specified, load the role from that file directly
    if (this.roleFilePath) {
      try {
        const fileContent = fs.readFileSync(this.roleFilePath, "utf8");
        const fileConfig = JSON.parse(fileContent);

        // We expect this file to contain a single role configuration
        const validationResult = validateRolesConfig({
          roles: { single_role: fileConfig },
          defaultRole: "single_role",
        });

        if (!validationResult.success) {
          throw new MCPilotError(
            "Invalid role configuration in file",
            "ROLE_CONFIG_FILE_ERROR",
            ErrorSeverity.HIGH,
            { errors: validationResult.error.issues },
          );
        }

        return fileConfig;
      } catch (error) {
        if (error instanceof MCPilotError) throw error;
        throw new MCPilotError(
          "Failed to load role from file",
          "ROLE_FILE_ERROR",
          ErrorSeverity.HIGH,
          { filePath: this.roleFilePath, error },
        );
      }
    }

    return this.roleLoader.getRole(role);
  }

  /**
   * Set up role-specific context
   */
  public async generateRoleSystemPrompt(
    roleConfig: RoleConfig,
    isChildSession: boolean = false,
  ): Promise<string> {
    // Reinitialize MCP hub with role-specific servers
    await this.createMcpHub(roleConfig);

    // Build enhanced system prompt
    if (roleConfig) {
      this.promptEnhancer.setBasePrompt(roleConfig.definition);
      this.promptEnhancer.addSection({
        title: "Role Instructions",
        content: roleConfig.instructions,
      });
    }

    // Build and return the system prompt
    return await this.promptEnhancer.buildSystemPrompt(isChildSession);
  }

  /**
   * Create the MCP Hub instance
   */
  private async createMcpHub(role?: RoleConfig): Promise<void> {
    // Get all available servers from config
    const allServers = this.mcpServers || {};

    // Filter servers based on role's availableServers if defined
    let filteredServers = allServers;

    if (role?.availableServers) {
      filteredServers = Object.entries(allServers)
        .filter(([serverName]) => role.availableServers.includes(serverName))
        .reduce(
          (acc, [serverName, serverConfig]) => {
            acc[serverName] = serverConfig;
            return acc;
          },
          {} as Record<string, McpServerConfig>,
        );
    }

    this.mcpHub = new McpHub({
      servers: filteredServers,
      autoApproveTools: this.autoApproveTools,
    });
    await this.mcpHub.initializeMcpServers();
  }

  /**
   * Load role configuration
   */
  private async loadRoleConfiguration(): Promise<void> {
    this.roleLoader = new RoleConfigLoader({
      configPath: this.rolesConfigPath,
    });

    await this.roleLoader.load();
  }
}
