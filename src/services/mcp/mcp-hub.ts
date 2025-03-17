import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createInterface } from "readline";
import {
  CallToolResultSchema,
  ListResourcesResultSchema,
  ListResourceTemplatesResultSchema,
  ListToolsResultSchema,
  ReadResourceResultSchema,
} from "@modelcontextprotocol/sdk/types.js";

import {
  ExtendedResourceContent,
  McpHubConfig,
  McpResource,
  McpResourceResponse,
  McpResourceTemplate,
  McpServer,
  McpTool,
  McpToolCallResponse,
  McpToolOutput,
  ToolProperty,
} from "./types.ts";
import { McpServerConfig, validateServerState } from "../config/mcp-schema.ts";
import { ToolCatalogBuilder } from "./tool-catalog.ts";
import { logger } from "../logger/index.ts";

interface ConnectionError extends Error {
  code: string;
  details?: any;
}

type McpConnection = {
  server: McpServer;
  client: Client;
  transport: StdioClientTransport;
};

export class McpHub {
  private connections: McpConnection[] = [];
  private toolCatalog: ToolCatalogBuilder;
  private isConnecting: boolean = false;
  private mcpServers: Record<string, McpServerConfig>;

  private autoApproveTools: boolean = false;

  constructor(config: McpHubConfig) {
    this.mcpServers = config.servers;
    this.autoApproveTools = config.autoApproveTools || false;
    this.toolCatalog = new ToolCatalogBuilder();
  }

  /**
   * Get the tool catalog
   */
  public getToolCatalog(): ToolCatalogBuilder {
    return this.toolCatalog;
  }

  /**
   * Get all enabled MCP servers
   */
  public getServers(): McpServer[] {
    return this.connections
      .filter((conn) => !conn.server.disabled)
      .map((conn) => conn.server);
  }

  /**
   * Get all MCP servers regardless of enabled state
   */
  public getAllServers(): McpServer[] {
    return this.connections.map((conn) => conn.server);
  }

  /**
   * Initialize MCP servers from configuration
   */
  public async initializeMcpServers(): Promise<void> {
    try {
      await this.updateServerConnections(this.mcpServers);
    } catch (error) {
      const connectionError: ConnectionError = new Error(
        "Failed to initialize MCP servers"
      ) as ConnectionError;
      connectionError.code = "INIT_FAILED";
      connectionError.details = error;
      throw connectionError;
    }
  }

  /**
   * Connect to an MCP server
   */
  private async connectToServer(
    name: string,
    config: McpServerConfig
  ): Promise<void> {
    // Remove existing connection if it exists
    await this.deleteConnection(name);

    try {
      const client = new Client(
        {
          name: "MCPilot",
          version: "1.0.0",
        },
        {
          capabilities: {},
        }
      );

      const transport = new StdioClientTransport({
        command: config.command,
        args: config.args,
        env: {
          ...config.env,
          ...(process.env.PATH ? { PATH: process.env.PATH } : {}),
        },
        stderr: "pipe",
      });

      // Set up error handling
      transport.onerror = async (error) => {
        logger.error(`Transport error for ${name}:`, error);
        await this.handleTransportError(name, error);
      };

      transport.onclose = async () => {
        logger.error(`Transport closed for ${name}`);
        await this.handleTransportClose(name);
      };

      // Create initial server state
      const serverState: McpServer = {
        name,
        version: "1.0.0",
        config: {
          name,
          version: "1.0.0",
          command: config.command,
          args: config.args || [],
          env: config.env,
          timeout: config.timeout,
          type: config.type || "stdio",
          enabled: !config.disabled,
        },
        status: "connecting",
        disabled: config.disabled || false,
        tools: [],
        resources: [],
        resourceTemplates: [],
      };

      // Validate server state
      const validationResult = validateServerState(serverState);
      if (!validationResult.success) {
        throw new Error(
          `Invalid server state: ${validationResult.error.message}`
        );
      }

      // Create and store connection
      const connection: McpConnection = {
        server: serverState,
        client,
        transport,
      };
      this.connections.push(connection);

      // Handle stderr output
      await this.setupStderrHandling(transport, name);

      // Connect and initialize
      await transport.start();
      transport.start = async () => {}; // Prevent double start
      await client.connect(transport);

      // Update server state
      connection.server.status = "connected";
      connection.server.error = "";

      // Fetch initial capabilities
      await this.fetchServerCapabilities(name);
    } catch (error) {
      await this.handleConnectionError(name, error);
      throw error;
    }
  }

  /**
   * Set up stderr handling for transport
   */
  private async setupStderrHandling(
    transport: StdioClientTransport,
    serverName: string
  ): Promise<void> {
    const stderrStream = transport.stderr;
    if (!stderrStream) {
      return;
    }

    stderrStream.on("data", async (data: Buffer) => {
      await this.handleStderrOutput(serverName, data.toString());
    });
  }

  /**
   * Handle transport errors
   */
  private async handleTransportError(
    serverName: string,
    error: Error
  ): Promise<void> {
    const connection = this.findConnection(serverName);
    if (connection) {
      connection.server.status = "disconnected";
      await this.appendErrorMessage(connection, error.message);
      await this.notifyServerChanges();
    }
  }

  /**
   * Handle transport close
   */
  private async handleTransportClose(serverName: string): Promise<void> {
    const connection = this.findConnection(serverName);
    if (connection) {
      connection.server.status = "disconnected";
      await this.notifyServerChanges();
    }
  }

  /**
   * Handle stderr output
   */
  private async handleStderrOutput(
    serverName: string,
    output: string
  ): Promise<void> {
    const connection = this.findConnection(serverName);
    if (!connection) return;

    await this.appendErrorMessage(connection, output);
    if (connection.server.status === "disconnected") {
      await this.notifyServerChanges();
    }
  }

  /**
   * Handle connection errors
   */
  private async handleConnectionError(
    serverName: string,
    error: unknown
  ): Promise<void> {
    const connection = this.findConnection(serverName);
    if (!connection) return;

    connection.server.status = "disconnected";
    await this.appendErrorMessage(
      connection,
      error instanceof Error ? error.message : String(error)
    );
  }

  /**
   * Find connection by server name
   */
  private findConnection(serverName: string): McpConnection | undefined {
    return this.connections.find((conn) => conn.server.name === serverName);
  }

  /**
   * Append error message to server state
   */
  private async appendErrorMessage(
    connection: McpConnection,
    message: string
  ): Promise<void> {
    connection.server.error = connection.server.error
      ? `${connection.server.error}\n${message}`
      : message;
  }

  /**
   * Notify of server changes
   */
  private async notifyServerChanges(): Promise<void> {
    try {
      const serverOrder = Object.keys(this.mcpServers);
      this.connections.sort((a, b) => {
        const aIndex = serverOrder.indexOf(a.server.name);
        const bIndex = serverOrder.indexOf(b.server.name);
        return aIndex - bIndex;
      });
    } catch (error) {
      logger.error("Failed to notify server changes:", error);
    }
  }

  /**
   * Update server connections based on configuration
   */
  public async updateServerConnections(
    servers: Record<string, McpServerConfig>
  ): Promise<void> {
    this.isConnecting = true;

    try {
      // Remove deleted servers
      const currentNames = new Set(
        this.connections.map((conn) => conn.server.name)
      );
      const newNames = new Set(Object.keys(servers));

      for (const name of currentNames) {
        if (!newNames.has(name)) {
          await this.deleteConnection(name);
        }
      }

      // Add or update servers
      for (const [name, config] of Object.entries(servers)) {
        await this.updateSingleServer(name, config);
      }
    } finally {
      this.isConnecting = false;
      await this.notifyServerChanges();
    }
  }

  /**
   * Update a single server connection
   */
  private async updateSingleServer(
    name: string,
    config: McpServerConfig
  ): Promise<void> {
    const current = this.findConnection(name);
    const currentConfig = current?.server.config;

    if (!current || this.hasConfigChanged(currentConfig, config)) {
      try {
        await this.connectToServer(name, config);
      } catch (error) {
        logger.error(
          `Failed to ${current ? "update" : "create"} server ${name}:`,
          error
        );
      }
    }
  }

  /**
   * Check if server configuration has changed
   */
  private hasConfigChanged(
    currentConfig: string | Record<string, any> | undefined,
    newConfig: McpServerConfig
  ): boolean {
    if (!currentConfig) return true;
    const parsedConfig =
      typeof currentConfig === "string"
        ? JSON.parse(currentConfig)
        : currentConfig;
    return !Object.entries(newConfig).every(
      ([key, value]) => parsedConfig[key] === value
    );
  }

  /**
   * Delete server connection
   */
  private async deleteConnection(name: string): Promise<void> {
    const connection = this.findConnection(name);
    if (!connection) {
      return;
    }

    try {
      await connection.transport.close();
      await connection.client.close();
    } catch (error) {
      logger.error(`Failed to close transport for ${name}:`, error);
    }

    this.connections = this.connections.filter(
      (conn) => conn.server.name !== name
    );
  }

  /**
   * Fetch server capabilities (tools and resources)
   */
  private async fetchServerCapabilities(serverName: string): Promise<void> {
    const connection = this.findConnection(serverName);
    if (!connection) return;

    try {
      const tools = await this.fetchToolsList(serverName);
      connection.server.tools = tools;
      this.toolCatalog.registerServerTools(serverName, tools);

      // const resources = await this.fetchResourcesList(serverName);
      // connection.server.resources = resources;

      // const templates = await this.fetchResourceTemplatesList(serverName);
      // connection.server.resourceTemplates = templates;
    } catch (error) {
      logger.error(`Failed to fetch capabilities for ${serverName}:`, error);
      throw error;
    }
  }

  /**
   * Fetch list of available tools from server
   */
  private async fetchToolsList(serverName: string): Promise<McpTool[]> {
    const connection = this.findConnection(serverName);
    if (!connection) return [];

    try {
      const response = await connection.client.request(
        { method: "tools/list" },
        ListToolsResultSchema
      );

      const alwaysAllowConfig = this.mcpServers[serverName]?.alwaysAllow || [];

      return (response?.tools || []).map((tool): McpTool => {
        if (!tool.name) {
          throw new Error(`Tool missing required name property`);
        }

        return {
          name: tool.name,
          description: tool.description || "",
          inputSchema: {
            type: tool.inputSchema?.type || "object",
            properties: (tool.inputSchema?.properties || {}) as Record<
              string,
              ToolProperty
            >,
            required: (tool.inputSchema?.required || []) as string[],
            additionalProperties: tool.inputSchema?.additionalProperties as
              | boolean
              | undefined,
          },
          alwaysAllow: alwaysAllowConfig.includes(tool.name),
        };
      });
    } catch (error) {
      logger.error(`Failed to fetch tools for ${serverName}:`, error);
      return [];
    }
  }

  /**
   * Fetch list of available resources from server
   */
  private async fetchResourcesList(serverName: string): Promise<McpResource[]> {
    const connection = this.findConnection(serverName);
    if (!connection) return [];

    try {
      const response = await connection.client.request(
        { method: "resources/list" },
        ListResourcesResultSchema
      );

      return (response?.resources || []).map((resource): McpResource => {
        if (!resource.uri || !resource.name) {
          throw new Error(`Resource missing required properties`);
        }

        return {
          uri: resource.uri,
          name: resource.name,
          description: resource.description,
          mimeType: resource.mimeType,
          tags: (resource.tags || []) as string[],
        };
      });
    } catch (error) {
      logger.error(`Failed to fetch resources for ${serverName}:`, error);
      return [];
    }
  }

  /**
   * Fetch list of available resource templates from server
   */
  private async fetchResourceTemplatesList(
    serverName: string
  ): Promise<McpResourceTemplate[]> {
    const connection = this.findConnection(serverName);
    if (!connection) return [];

    try {
      const response = await connection.client.request(
        { method: "resources/templates/list" },
        ListResourceTemplatesResultSchema
      );

      return (response?.resourceTemplates || []).map(
        (template): McpResourceTemplate => {
          if (!template.uriTemplate || !template.name) {
            throw new Error(`Resource template missing required properties`);
          }

          return {
            uriTemplate: template.uriTemplate,
            name: template.name,
            description: template.description,
            mimeType: template.mimeType,
            tags: (template.tags || []) as string[],
          };
        }
      );
    } catch (error) {
      logger.error(
        `Failed to fetch resource templates for ${serverName}:`,
        error
      );
      return [];
    }
  }

  /**
   * Read a resource from server
   */
  public async readResource(
    serverName: string,
    uri: string
  ): Promise<McpResourceResponse> {
    const connection = this.findConnection(serverName);
    if (!connection) {
      throw new Error(`No connection found for server: ${serverName}`);
    }
    if (connection.server.disabled) {
      throw new Error(`Server "${serverName}" is disabled`);
    }

    const response = await connection.client.request(
      {
        method: "resources/read",
        params: { uri },
      },
      ReadResourceResultSchema
    );

    return {
      contents: (response.contents || []).map(
        (content): ExtendedResourceContent => ({
          uri: content.uri,
          mimeType: content.mimeType as string | undefined,
          text: content.text as string | undefined,
          blob: content.blob as string | undefined,
        })
      ),
    };
  }

  /**
   * Call a tool on server
   */
  public async callTool(
    serverName: string,
    toolName: string,
    toolArguments?: Record<string, unknown>
  ): Promise<McpToolCallResponse> {
    const connection = this.findConnection(serverName);
    if (!connection) {
      throw new Error(
        `No connection found for server: ${serverName}. Please make sure to use MCP servers available under 'Connected MCP Servers'.`
      );
    }
    if (connection.server.disabled) {
      throw new Error(`Server "${serverName}" is disabled and cannot be used`);
    }

    if (toolName !== "tools/list" && !this.autoApproveTools) {
      // Add user confirmation
      const readline = createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const answer = await new Promise<string>((resolve) => {
        readline.question(
          `Do you want to run tool '${toolName}' on server '${serverName}'? (Y/N) `,
          resolve
        );
      });
      readline.close();

      if (answer.toLowerCase() !== "y") {
        process.exit(0);
      }
    }

    logger.info(`Calling tool '${toolName}' on server '${serverName}'...`);

    const config = connection.server.config;
    const timeout =
      typeof config === "string" ? 60000 : (config.timeout || 60) * 1000;

    const response = await connection.client.request(
      {
        method: "tools/call",
        params: {
          name: toolName,
          arguments: toolArguments,
        },
      },
      CallToolResultSchema,
      { timeout }
    );

    return {
      content: (response.content || []).reduce<McpToolOutput[]>((acc, item) => {
        if (!item || typeof item.type !== "string") {
          return acc;
        }

        if (item.type === "text" && typeof item.text === "string") {
          acc.push({ type: "text", text: item.text });
        } else if (
          item.type === "image" &&
          typeof item.data === "string" &&
          typeof item.mimeType === "string"
        ) {
          acc.push({
            type: "image",
            data: item.data,
            mimeType: item.mimeType,
          });
        } else if (
          item.type === "resource" &&
          item.resource &&
          typeof item.resource.uri === "string"
        ) {
          acc.push({
            type: "resource",
            resource: {
              uri: item.resource.uri,
              mimeType: item.resource.mimeType as string | undefined,
              text: item.resource.text as string | undefined,
              blob: item.resource.blob as string | undefined,
            },
          });
        }

        return acc;
      }, []),
      isError: Boolean(response.isError),
      success: !response.isError,
    };
  }

  /**
   * Restart a server connection
   */
  public async restartConnection(serverName: string): Promise<void> {
    this.isConnecting = true;

    try {
      const connection = this.findConnection(serverName);
      if (!connection) return;

      connection.server.status = "connecting";
      connection.server.error = "";
      await this.notifyServerChanges();

      await this.deleteConnection(serverName);

      const config =
        typeof connection.server.config === "string"
          ? JSON.parse(connection.server.config)
          : connection.server.config;

      await this.connectToServer(serverName, config);
    } catch (error) {
      logger.error(`Failed to restart connection for ${serverName}:`, error);
      throw error;
    } finally {
      this.isConnecting = false;
      await this.notifyServerChanges();
    }
  }

  /**
   * Clean up resources
   */
  public async dispose(): Promise<void> {
    for (const connection of this.connections) {
      await this.deleteConnection(connection.server.name);
    }
    this.connections = [];
    this.toolCatalog.clear();
  }
}
