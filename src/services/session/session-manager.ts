/**
 * Session manager implementation
 */

import * as fs from "fs";
import * as path from "path";
import { v4 as uuidv4 } from "uuid";
import {
  Message,
  MessageType,
  ToolCallStatus,
} from "../../interfaces/base/message.ts";
import {
  Response,
  ResponseContent,
  ResponseType,
  ResponseWithSessionMetadata,
} from "../../interfaces/base/response.ts";
import { Session, SessionStatus } from "../../interfaces/base/session.ts";
import { MCPilotConfig, RoleConfig } from "../../interfaces/config/types.ts";
import { ErrorSeverity, MCPilotError } from "../../interfaces/error/types.ts";
import { ILLMProvider } from "../../interfaces/llm/provider.ts";
import {
  findConfigFileSync,
  findNearestMcpilotDirSync,
} from "../config/config-utils.ts";
import { McpServerConfig } from "../config/mcp-schema.ts";
import { RoleConfigLoader } from "../config/role-config-loader.ts";
import { validateRolesConfig } from "../config/role-schema.ts";
import { logger } from "../logger/index.ts";
import { McpHub } from "../mcp/mcp-hub.ts";
import { ToolRequestParser } from "../parser/tool-request-parser.ts";
import { ParsedToolRequest, XmlParser } from "../parser/xml-parser.ts";
import { SystemPromptEnhancer } from "../prompt/prompt-enhancer.ts";
import { ParsedInternalToolRequest } from "../../interfaces/tools/internal-tool.ts";
import { InternalToolsManager } from "../tools/internal-tools-manager.ts";

/**
 * Interface for SessionManager constructor parameters
 */
export interface SessionManagerOptions {
  /** MCPilot configuration */
  config: MCPilotConfig;
  /** LLM provider instance */
  provider: ILLMProvider;
  /** Path to roles configuration file */
  rolesConfigPath?: string;
  /** Working directory for the session */
  workingDirectory?: string;
  /** Whether to auto-approve tool calls */
  autoApproveTools?: boolean;
  /** Path to a specific role file */
  roleFilePath?: string;
}

export class SessionManager {
  #sessions: Record<string, Session> = {};
  private toolRequestParser!: ToolRequestParser;
  private xmlParser!: XmlParser;
  private promptEnhancer!: SystemPromptEnhancer;
  private mcpHub!: McpHub;
  private roleLoader!: RoleConfigLoader;
  private internalToolsManager!: InternalToolsManager;
  private responseListener?: (
    sessionId: string,
    responseContent: ResponseContent,
  ) => Promise<void>;

  constructor(options: SessionManagerOptions) {
    this.config = options.config;
    this.provider = options.provider;
    this.rolesConfigPath = options.rolesConfigPath;
    this.workingDirectory = options.workingDirectory || process.cwd();
    this.autoApproveTools = options.autoApproveTools || false;
    this.roleFilePath = options.roleFilePath;
  }

  private readonly config: MCPilotConfig;
  private readonly provider: ILLMProvider;
  private readonly rolesConfigPath?: string;
  private readonly workingDirectory: string;
  private readonly autoApproveTools: boolean;
  private readonly roleFilePath?: string;

  // PUBLIC METHODS

  /**
   * Initialize session manager components
   */
  private async init(): Promise<void> {
    await this.createMcpHub();
    this.initializeHelpers();
    await this.loadRoleConfiguration();
  }

  /**
   * Create a new session
   */
  public async createSession(role?: string): Promise<Session> {
    const newSession = {
      id: uuidv4(),
      systemPrompt: "",
      messages: [],
      metadata: this.createDefaultMetadata(),
      // New properties for session hierarchy
      childSessionIds: [],
      status: SessionStatus.ACTIVE,
    };

    this.#sessions[newSession.id] = newSession;

    await this.init();

    const roleConfig = await this.getRoleConfig(role);
    if (roleConfig) {
      await this.setupRoleContext(newSession.id, roleConfig, role);
    }

    // Save session and log paths
    const mcpilotDir = this.findMcpilotDir();
    const logsDir = path.join(mcpilotDir, "logs");
    const sessionsDir = path.join(mcpilotDir, "sessions");
    const sessionPath = path.join(sessionsDir, newSession.id);
    const configPath = findConfigFileSync(
      this.workingDirectory,
      ".mcpilot.config.json",
      true,
    );
    const rolesConfigPath = findConfigFileSync(
      this.workingDirectory,
      ".mcpilot.roles.json",
      false,
    );

    logger.info(`Config path: ${configPath}`);
    logger.info(`Roles config path: ${rolesConfigPath}`);
    logger.info(`Logs directory: ${logsDir}`);
    logger.info(`Sessions directory: ${sessionsDir}`);
    logger.info(`Session path: ${sessionPath}`);

    this.saveSessionToFile(newSession.id);
    return newSession;
  }

  /**
   * Create a child session linked to a parent
   */
  public async createChildSession(
    parentId: string,
    role: string,
    initialPrompt: string,
  ): Promise<Session> {
    // Create a new session
    const childSession = await this.createSession(role);

    // Link child to parent
    this.#sessions[childSession.id].parentId = parentId;

    // Add child ID to parent's child list
    this.updateSession(parentId, {
      childSessionIds: [
        ...(this.#sessions[parentId].childSessionIds || []),
        childSession.id,
      ],
    });

    // Update session metadata to reflect hierarchy
    this.updateSessionHierarchy(parentId, childSession.id);

    // Add initial prompt as first user message if provided
    if (initialPrompt) {
      await this.executeMessage(childSession.id, initialPrompt);
    }

    return childSession;
  }

  /**
   * Complete a child session and send results to parent
   */
  public async completeChildSession(
    sessionId: string,
    summary: string,
  ): Promise<void> {
    const session = this.#sessions[sessionId];

    if (!session.parentId) {
      throw new Error("Cannot complete session - not a child session");
    }

    // Update session status
    this.updateSession(sessionId, {
      status: SessionStatus.COMPLETED,
    });

    // Update parent session with child completion
    this.updateChildSessionStatus(
      session.parentId,
      sessionId,
      SessionStatus.COMPLETED,
      summary,
    );

    // Create a message in the parent session with the summary
    await this.executeMessage(session.parentId, {
      id: this.generateMessageId(),
      type: MessageType.CHILD_SESSION_RESULT,
      content: summary,
      timestamp: new Date(),
      metadata: {
        childSessionId: sessionId,
      },
    });
  }

  /**
   * Resume a session from a log file
   */
  public async resumeSession(sessionId: string): Promise<Session> {
    try {
      await this.init();

      let sessionData: Session;

      // First try to load as a session ID
      const mcpilotDir = this.findMcpilotDir();
      const sessionPath = path.join(mcpilotDir, "sessions", sessionId);
      if (fs.existsSync(sessionPath)) {
        const rawData = fs.readFileSync(sessionPath, "utf8");
        sessionData = JSON.parse(rawData);
      } else {
        // Fall back to loading from log file
        sessionData = this.loadSessionFromLog(sessionId);
      }

      this.#sessions[sessionData.id] = sessionData;

      return sessionData;
    } catch (error) {
      throw new MCPilotError(
        "Failed to resume session",
        "RESUME_FAILED",
        ErrorSeverity.HIGH,
        { sessionId, error },
      );
    }
  }

  /**
   * Execute a user message and return a response
   */
  public async executeMessage(
    sessionId: string,
    message: string | Message,
  ): Promise<ResponseWithSessionMetadata> {
    try {
      const newMessage = this.createMessageObject(message);
      this.addMessageToSession(sessionId, newMessage);
      const response = await this.processMessageWithTools(sessionId);

      return {
        ...response,
        sessionMetadata: this.getSession(sessionId).metadata,
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Get the current session
   */
  public getSession(sessionId: string): Session {
    return { ...this.#sessions[sessionId] };
  }

  /**
   * Update the session with new data
   */
  public updateSession(sessionId: string, sessionData: Partial<Session>): void {
    this.#sessions[sessionId] = {
      ...this.#sessions[sessionId],
      ...sessionData,
      metadata: {
        ...this.#sessions[sessionId].metadata,
        ...sessionData.metadata,
      },
    };
    this.saveSessionToFile(sessionId);
  }

  /**
   * Find the mcpilot directory for storing sessions
   */
  private findMcpilotDir(): string {
    const mcpilotDir = findNearestMcpilotDirSync(this.workingDirectory);
    return mcpilotDir || this.workingDirectory;
  }

  /**
   * Save current session to a file
   */
  public saveSessionToFile(sessionId: string): void {
    if (!this.#sessions[sessionId]) return;

    // Find nearest .mcpilot directory or default to local sessions
    const mcpilotDir = this.findMcpilotDir();
    const sessionsDir = path.join(mcpilotDir, "sessions");
    const sessionPath = path.join(sessionsDir, sessionId);

    try {
      // Create sessions directory if it doesn't exist
      if (!fs.existsSync(sessionsDir)) {
        fs.mkdirSync(sessionsDir, { recursive: true });
      }

      // Write session data to file
      fs.writeFileSync(
        sessionPath,
        JSON.stringify(this.#sessions[sessionId], null, 2),
        "utf8",
      );
    } catch (error) {
      logger.error("Failed to save session to file:", error);
      throw new MCPilotError(
        "Failed to save session to file",
        "SESSION_SAVE_FAILED",
        ErrorSeverity.HIGH,
        { error },
      );
    }
  }

  // PRIVATE METHODS

  /**
   * Create the MCP Hub instance
   */
  private async createMcpHub(role?: RoleConfig): Promise<void> {
    // Get all available servers from config
    const allServers = this.config.mcp?.servers || {};

    // Filter servers based on role's availableServers if defined
    let filteredServers = allServers;

    filteredServers = Object.entries(allServers)
      .filter(([serverName]) => role?.availableServers.includes(serverName))
      .reduce(
        (acc, [serverName, serverConfig]) => {
          acc[serverName] = serverConfig;
          return acc;
        },
        {} as Record<string, McpServerConfig>,
      );

    this.mcpHub = new McpHub({
      servers: filteredServers,
      autoApproveTools: this.autoApproveTools,
    });
    await this.mcpHub.initializeMcpServers();
  }

  /**
   * Initialize helper components
   */
  private initializeHelpers(): void {
    this.xmlParser = new XmlParser();
    this.internalToolsManager = new InternalToolsManager(this);
    this.toolRequestParser = new ToolRequestParser(this.mcpHub);
    this.promptEnhancer = new SystemPromptEnhancer(
      this.mcpHub.getToolCatalog(),
      this.workingDirectory,
      this.internalToolsManager,
      this.roleLoader,
    );
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

  /**
   * Create default metadata for a new session
   */
  private createDefaultMetadata() {
    return {
      timestamp: new Date(),
      environment: {
        cwd: this.workingDirectory,
        os: process.platform,
        shell: process.env.SHELL || "",
      },
      sessionHierarchy: {
        childSessions: [],
      },
    };
  }

  /**
   * Get role configuration
   */
  private async getRoleConfig(role?: string): Promise<RoleConfig | undefined> {
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

    // Otherwise use the standard role loading mechanism
    let roleConfig: RoleConfig | undefined;
    if (role) {
      roleConfig = this.roleLoader.getRole(role);
      if (!roleConfig) {
        throw new MCPilotError(
          `Role '${role}' not found`,
          "INVALID_ROLE",
          ErrorSeverity.HIGH,
        );
      }
    }
    return roleConfig;
  }

  /**
   * Set up role-specific context
   */
  private async setupRoleContext(
    sessionId: string,
    roleConfig: RoleConfig,
    roleName?: string,
  ): Promise<void> {
    // Reinitialize MCP hub with role-specific servers
    await this.createMcpHub(roleConfig);
    this.initializeHelpers();

    // Log role information
    logger.info(`Setting up role context: ${roleName || "unknown"}`);

    // Build enhanced system prompt
    if (roleConfig) {
      this.promptEnhancer.setBasePrompt(roleConfig.definition);
      this.promptEnhancer.addSection({
        title: "Role Instructions",
        content: roleConfig.instructions,
      });
    }

    // Determine if this is a child session
    const isChildSession = !!this.#sessions[sessionId].parentId;

    this.updateSession(sessionId, {
      systemPrompt: await this.promptEnhancer.buildSystemPrompt(isChildSession),
      metadata: {
        ...this.#sessions[sessionId].metadata,
        role: roleConfig,
        roleName: roleName,
      },
    });
  }

  /**
   * Create a message object from user input
   */
  private createMessageObject(message: string | Message): Message {
    if (typeof message !== "string") {
      return message;
    }

    return {
      id: this.generateMessageId(),
      type: MessageType.USER,
      content: message,
      timestamp: new Date(),
    };
  }

  /**
   * Add a message to the session
   */
  private addMessageToSession(sessionId: string, message: Message): void {
    this.updateSession(sessionId, {
      messages: [...this.#sessions[sessionId].messages, message],
    });
  }

  /**
   * Update session hierarchy metadata
   */
  private updateSessionHierarchy(parentId: string, childId: string): void {
    // Update parent session metadata
    const parentSession = this.#sessions[parentId];
    const childSession = this.#sessions[childId];

    if (!parentSession.metadata.sessionHierarchy) {
      parentSession.metadata.sessionHierarchy = {
        childSessions: [],
      };
    }

    parentSession.metadata.sessionHierarchy.childSessions!.push({
      id: childId,
      status: SessionStatus.ACTIVE,
    });

    // Update child session metadata
    if (!childSession.metadata.sessionHierarchy) {
      childSession.metadata.sessionHierarchy = {};
    }

    childSession.metadata.sessionHierarchy.parentId = parentId;

    // Save both sessions
    this.saveSessionToFile(parentId);
    this.saveSessionToFile(childId);
  }

  /**
   * Update child session status in parent metadata
   */
  private updateChildSessionStatus(
    parentId: string,
    childId: string,
    status: SessionStatus,
    summary?: string,
  ): void {
    const parentSession = this.#sessions[parentId];

    if (!parentSession?.metadata?.sessionHierarchy?.childSessions) {
      return;
    }

    const childSessions = parentSession.metadata.sessionHierarchy.childSessions;
    const childIndex = childSessions.findIndex((c) => c.id === childId);

    if (childIndex >= 0) {
      childSessions[childIndex] = {
        ...childSessions[childIndex],
        status,
        summary,
      };
    }

    this.saveSessionToFile(parentId);
  }

  /**
   * Load session from a log file
   */
  private loadSessionFromLog(sessionId: string): Session {
    try {
      const mcpilotDir = this.findMcpilotDir();
      const sessionsDir = path.join(mcpilotDir, "sessions");
      const sessionFilePath = path.join(sessionsDir, sessionId);
      this.validateLogFile(sessionFilePath);

      // Initialize session data with default values
      const sessionData: Session = {
        id: "",
        systemPrompt: "",
        messages: [],
        metadata: this.createDefaultMetadata(),
        childSessionIds: [],
        status: SessionStatus.ACTIVE,
      };

      const sessionContent = fs.readFileSync(sessionFilePath, "utf8");

      // Process log entries in order
      this.processSessionData(sessionContent, sessionData);

      if (!sessionData.id) {
        throw new Error("Invalid log file: no session ID found");
      }

      return sessionData;
    } catch (error: unknown) {
      logger.error("Session load error:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      throw new MCPilotError(
        `Failed to parse session log: ${errorMessage}`,
        "LOG_PARSE_FAILED",
        ErrorSeverity.HIGH,
        { error },
      );
    }
  }

  /**
   * Validate that a log file exists and is not empty
   */
  private validateLogFile(logPath: string): void {
    if (!fs.existsSync(logPath)) {
      throw new Error(`Log file not found: ${logPath}`);
    }

    const logContent = fs.readFileSync(logPath, "utf8");
    if (!logContent.trim()) {
      throw new Error("Log file is empty");
    }
  }

  /**
   * Parse content of a log file
   */
  private parseLogContent(logContent: string): any[] {
    return logContent
      .trim()
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch (e: unknown) {
          logger.error("Failed to parse log line:", line);
          const errorMessage = e instanceof Error ? e.message : "Unknown error";
          throw new Error(`Invalid JSON in log file: ${errorMessage}`);
        }
      });
  }

  /**
   * Process a single log entry
   */
  private processSessionData(log: any, sessionData: Session): void {
    if (!log.metadata) return;

    const { sessionId, messages, systemPrompt } = log.metadata;

    if (sessionId) {
      sessionData.id = sessionId;
    }
    if (messages) {
      sessionData.messages = messages;
    }
    if (systemPrompt) {
      sessionData.systemPrompt = systemPrompt;
    }

    // Update metadata
    if (log.metadata.environment || log.metadata.role || log.metadata.custom) {
      sessionData.metadata = {
        ...sessionData.metadata,
        ...(log.metadata.environment && {
          environment: log.metadata.environment,
        }),
        ...(log.metadata.role && { role: log.metadata.role }),
        custom: {
          ...sessionData.metadata.custom,
          ...log.metadata.custom,
        },
      };
    }
  }

  /**
   * Process a message with potential tool requests
   */
  private async processMessageWithTools(sessionId: string): Promise<Response> {
    try {
      logger.debug("Processing message with tools....");
      const response = await this.provider.processMessage(
        this.#sessions[sessionId],
      );

      logger.debug(`Response: ${response.id}`);

      // Check for tool requests in response
      if (!response.content.text) {
        throw new MCPilotError(
          "LLM response missing text content",
          "INVALID_RESPONSE",
          ErrorSeverity.HIGH,
        );
      }

      await this.addAssistantResponseToSession(sessionId, response.content);

      // Parse response for tool requests
      const mcpToolRequests = this.toolRequestParser.parseRequest(
        response.content.text,
      );

      const internalToolRequests = this.xmlParser.parseInternalToolRequests(
        response.content.text,
      );

      // Process MCP tool requests first
      if (mcpToolRequests.length > 0) {
        await this.handleToolRequests(sessionId, mcpToolRequests);
        return response;
      }

      // Then process internal tool requests
      if (internalToolRequests.length > 0) {
        await this.handleInternalToolRequests(sessionId, internalToolRequests);
        return response;
      }

      return response;
    } catch (error) {
      return this.createErrorResponse(
        "PROCESSING_FAILED",
        "Failed to process message",
        error,
      );
    }
  }

  /**
   * Add the assistant's response to the session
   */
  private async addAssistantResponseToSession(
    sessionId: string,
    responseContent: ResponseContent,
  ): Promise<void> {
    this.addMessageToSession(sessionId, {
      id: this.generateMessageId(),
      type: MessageType.ASSISTANT,
      content: responseContent.text || "",
      timestamp: new Date(),
      metadata: {},
    });

    // Call the thinking scope listener if it exists and thinkingScope is provided
    if (this.responseListener) {
      await this.responseListener(sessionId, responseContent);
    }
  }
  
  public setResponseContentListener(
    listener: (
      sessionId: string,
      responseContent: ResponseContent,
    ) => Promise<void>,
  ): void {
    this.responseListener = listener;
  }

  /**
   * Handle tool requests
   */
  private async handleToolRequests(
    sessionId: string,
    toolRequests: ParsedToolRequest[],
  ): Promise<boolean> {
    // If there's a tool request, process only the first one
    if (toolRequests.length > 0) {
      const request = toolRequests[0];
      try {
        const result = await this.mcpHub.callTool(
          request.serverName,
          request.toolName,
          request.arguments,
        );

        logger.debug("Tool call result:", result);

        const toolMessage = this.createToolCallMessage(request, result);
        await this.executeMessage(sessionId, toolMessage);
        return true;
      } catch (error) {
        logger.error("Tool call error:", error);
        throw error;
      }
    }

    return false;
  }

  /**
   * Handle internal tool requests
   */
  private async handleInternalToolRequests(
    sessionId: string,
    toolRequests: ParsedInternalToolRequest[],
  ): Promise<boolean> {
    // If there's a tool request, process only the first one
    if (toolRequests.length > 0) {
      const request = toolRequests[0];
      try {
        const result = await this.internalToolsManager.executeTool(
          sessionId,
          request,
        );

        logger.debug("Internal tool call result:", result);

        if (result.content.shouldSendToModel) {
          const toolMessage = this.createInternalToolCallMessage(
            request,
            result,
          );

          await this.executeMessage(sessionId, toolMessage);
        }

        return true;
      } catch (error) {
        logger.error("Internal tool call error:", error);
        throw error;
      }
    }

    return false;
  }

  /**
   * Create a message representing a tool call
   */
  private createToolCallMessage(
    request: ParsedToolRequest,
    result: any,
  ): Message {
    return {
      id: this.generateMessageId(),
      type: MessageType.USER,
      content: JSON.stringify(result),
      timestamp: new Date(),
      metadata: {
        toolCalls: [
          {
            toolName: request.toolName,
            parameters: request.arguments,
            timestamp: new Date(),
            result: {
              status: result.success
                ? ToolCallStatus.SUCCESS
                : ToolCallStatus.FAILURE,
              output: result.content,
              duration: 0,
            },
          },
        ],
      },
    };
  }

  /**
   * Create a message representing an internal tool call
   */
  private createInternalToolCallMessage(
    request: ParsedInternalToolRequest,
    result: any,
  ): Message {
    return {
      id: this.generateMessageId(),
      type: MessageType.USER,
      content: JSON.stringify(result.content),
      timestamp: new Date(),
      metadata: {
        toolCalls: [
          {
            toolName: request.toolName,
            parameters: request.parameters,
            timestamp: new Date(),
            result: {
              status: result.success
                ? ToolCallStatus.SUCCESS
                : ToolCallStatus.FAILURE,
              output: result.content,
              duration: 0,
            },
          },
        ],
      },
    };
  }

  /**
   * Create an error response
   */
  private createErrorResponse(
    code: string,
    message: string,
    details?: any,
  ): Response {
    return {
      id: this.generateMessageId(),
      type: ResponseType.ERROR,
      content: {
        error: {
          code,
          message,
          details,
        },
      },
      metadata: {},
      timestamp: new Date(),
    };
  }

  /**
   * Handle errors in a consistent way
   */
  private handleError(error: any): MCPilotError {
    if (error instanceof MCPilotError) {
      return error;
    }

    return new MCPilotError(
      "Session error",
      "SESSION_ERROR",
      ErrorSeverity.HIGH,
      { originalError: error },
    );
  }

  /**
   * Generate a unique message ID
   */
  private generateMessageId(): string {
    return `msg_${uuidv4()}`;
  }
}
