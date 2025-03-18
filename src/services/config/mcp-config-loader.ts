/**
 * MCP configuration loader service
 */

import * as fs from "fs/promises";
import * as path from "path";
import { McpConfig, validateMcpConfig } from "./mcp-schema.ts";

export class McpConfigLoader {
  private configPath: string;
  private config: McpConfig | null = null;

  constructor(configPath: string) {
    this.configPath = configPath;
  }

  /**
   * Load and validate MCP configuration from file
   */
  public async loadConfig(): Promise<McpConfig> {
    try {
      // Ensure the config file exists
      await fs.access(this.configPath);

      // Read and parse config file
      const content = await fs.readFile(this.configPath, "utf-8");
      const parsedContent = JSON.parse(content);

      // Validate configuration
      const result = validateMcpConfig(parsedContent);

      if (!result.success) {
        throw new Error(`Invalid MCP configuration: ${result.error.message}`);
      }

      this.config = result.data;
      return this.config;
    } catch (error) {
      if (error instanceof Error) {
        // If file doesn't exist, create with default config
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          const defaultConfig: McpConfig = {
            mcpServers: {},
          };
          await this.saveConfig(defaultConfig);
          return defaultConfig;
        }
        throw new Error(`Failed to load MCP configuration: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Save MCP configuration to file
   */
  public async saveConfig(config: McpConfig): Promise<void> {
    try {
      // Validate configuration before saving
      const result = validateMcpConfig(config);
      if (!result.success) {
        throw new Error(`Invalid MCP configuration: ${result.error.message}`);
      }

      // Create directory if it doesn't exist
      const dir = path.dirname(this.configPath);
      await fs.mkdir(dir, { recursive: true });

      // Write config to file
      await fs.writeFile(this.configPath, JSON.stringify(config, null, 2));

      this.config = config;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to save MCP configuration: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Get configuration for a specific server
   */
  public getServerConfig(serverName: string) {
    if (!this.config) {
      throw new Error("Configuration not loaded");
    }
    return this.config.mcpServers[serverName];
  }

  /**
   * Update configuration for a specific server
   */
  public async updateServerConfig(
    serverName: string,
    config: McpConfig["mcpServers"][string],
  ): Promise<void> {
    if (!this.config) {
      throw new Error("Configuration not loaded");
    }

    this.config.mcpServers[serverName] = config;
    await this.saveConfig(this.config);
  }

  /**
   * Remove a server from configuration
   */
  public async removeServer(serverName: string): Promise<void> {
    if (!this.config) {
      throw new Error("Configuration not loaded");
    }

    if (this.config.mcpServers[serverName]) {
      delete this.config.mcpServers[serverName];
      await this.saveConfig(this.config);
    }
  }

  /**
   * Get all configured server names
   */
  public getServerNames(): string[] {
    if (!this.config) {
      throw new Error("Configuration not loaded");
    }
    return Object.keys(this.config.mcpServers);
  }

  /**
   * Check if a server exists in configuration
   */
  public hasServer(serverName: string): boolean {
    if (!this.config) {
      throw new Error("Configuration not loaded");
    }
    return serverName in this.config.mcpServers;
  }
}
