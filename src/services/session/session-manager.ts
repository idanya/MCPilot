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
import { Response, ResponseType } from "../../interfaces/base/response.ts";
import { Session } from "../../interfaces/base/session.ts";
import { SessionState } from "../../interfaces/base/state.ts";
import { MCPilotConfig, RoleConfig } from "../../interfaces/config/types.ts";
import { ErrorSeverity, MCPilotError } from "../../interfaces/error/types.ts";
import { ILLMProvider } from "../../interfaces/llm/provider.ts";
import { RoleConfigLoader } from "../config/role-config-loader.ts";
import { McpHub } from "../mcp/mcp-hub.ts";
import { ToolRequestParser } from "../parser/tool-request-parser.ts";
import { SystemPromptEnhancer } from "../prompt/prompt-enhancer.ts";
import { ParsedToolRequest } from "../parser/xml-parser.ts";
import { logger } from "../logger/index.ts";

export class SessionManager {
  private currentSession: Session | null = null;
  private toolRequestParser!: ToolRequestParser;
  private promptEnhancer!: SystemPromptEnhancer;
  private mcpHub!: McpHub;
  private roleLoader!: RoleConfigLoader;
  private currentRole?: RoleConfig;

  constructor(
    private readonly config: MCPilotConfig,
    private readonly provider: ILLMProvider,
    private readonly rolesConfigPath?: string,
    private readonly initialRoleName?: string,
    private readonly workingDirectory: string = process.cwd(),
    private readonly autoApproveTools: boolean = false,
  ) {}

  // PUBLIC METHODS

  /**
   * Initialize session manager components
   */
  public async init(): Promise<void> {
    await this.createMcpHub();
    this.initializeHelpers();
    await this.loadRoleConfiguration();
  }

  /**
   * Get the message history for the current session
   */
  public getMessageHistory(): Message[] {
    this.ensureActiveSession();
    return this.currentSession!.messages;
  }

  /**
   * Create a new session
   */
  public async createSession(): Promise<Session> {
    if (this.currentSession) {
      throw new MCPilotError(
        "Session already exists",
        "SESSION_EXISTS",
        ErrorSeverity.HIGH,
      );
    }

    await this.init();

    this.currentSession = {
      id: uuidv4(),
      state: SessionState.INITIALIZING,
      systemPrompt: "",
      messages: [],
      metadata: this.createDefaultMetadata(),
    };

    await this.setupInitialSession();

    this.currentSession.state = SessionState.READY;
    this.saveSessionToFile();
    return this.currentSession;
  }

  /**
   * Resume a session from a log file
   */
  public async resumeSession(pathOrId: string): Promise<Session> {
    if (!pathOrId) {
      throw new MCPilotError(
        "Session path or ID is required",
        "INVALID_PATH_OR_ID",
        ErrorSeverity.HIGH,
      );
    }

    try {
      await this.init();

      let sessionData: Session;

      // First try to load as a session ID
      const sessionPath = path.join(process.cwd(), "sessions", pathOrId);
      if (fs.existsSync(sessionPath)) {
        const rawData = fs.readFileSync(sessionPath, "utf8");
        sessionData = JSON.parse(rawData);
      } else {
        // Fall back to loading from log file
        sessionData = this.loadSessionFromLog(pathOrId);
      }

      this.currentSession = sessionData;
      this.currentSession.state = SessionState.READY;

      return this.currentSession;
    } catch (error) {
      throw new MCPilotError(
        "Failed to resume session",
        "RESUME_FAILED",
        ErrorSeverity.HIGH,
        { pathOrId, error },
      );
    }
  }

  /**
   * Execute a user message and return a response
   */
  public async executeMessage(message: string | Message): Promise<Response> {
    this.ensureActiveSession();

    try {
      this.currentSession!.state = SessionState.PROCESSING;

      const newMessage = this.createMessageObject(message);
      this.addMessageToSession(newMessage);
      const response = await this.processMessageWithTools();

      this.currentSession!.state = SessionState.READY;
      return response;
    } catch (error) {
      this.currentSession!.state = SessionState.ERROR;
      throw this.handleError(error);
    }
  }

  /**
   * Get the current session
   */
  public getSession(): Session {
    this.ensureActiveSession();
    return { ...this.currentSession! };
  }

  /**
   * Update the session with new data
   */
  public updateSession(sessionData: Partial<Session>): void {
    this.ensureActiveSession();
    this.currentSession = {
      ...this.currentSession!,
      ...sessionData,
      metadata: {
        ...this.currentSession!.metadata,
        ...sessionData.metadata,
      },
    };
    this.saveSessionToFile();
  }

  /**
   * Save current session to a file
   */
  private saveSessionToFile(): void {
    if (!this.currentSession) return;

    const sessionsDir = path.join(process.cwd(), "sessions");
    const sessionPath = path.join(sessionsDir, this.currentSession.id);

    try {
      // Create sessions directory if it doesn't exist
      if (!fs.existsSync(sessionsDir)) {
        fs.mkdirSync(sessionsDir, { recursive: true });
      }

      // Write session data to file
      fs.writeFileSync(
        sessionPath,
        JSON.stringify(this.currentSession, null, 2),
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
  private async createMcpHub(): Promise<void> {
    this.mcpHub = new McpHub({
      servers: this.config.mcp?.servers || {},
      autoApproveTools: this.autoApproveTools,
    });
    await this.mcpHub.initializeMcpServers();
  }

  /**
   * Initialize helper components
   */
  private initializeHelpers(): void {
    this.toolRequestParser = new ToolRequestParser(this.mcpHub);
    this.promptEnhancer = new SystemPromptEnhancer(
      this.mcpHub.getToolCatalog(),
      this.workingDirectory,
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
    };
  }

  /**
   * Set up the initial session
   */
  private async setupInitialSession(): Promise<void> {
    if (this.initialRoleName) {
      await this.setupRoleContext();
    }
  }

  /**
   * Set up role-specific context
   */
  private async setupRoleContext(): Promise<void> {
    const roleConfig = this.roleLoader.getRole(this.initialRoleName!);
    if (!roleConfig) {
      throw new MCPilotError(
        `Role '${this.initialRoleName}' not found`,
        "INVALID_ROLE",
        ErrorSeverity.HIGH,
      );
    }
    this.currentRole = roleConfig;

    // Build enhanced system prompt
    this.promptEnhancer.setBasePrompt(roleConfig.definition);
    this.promptEnhancer.addSection({
      title: "Role Instructions",
      content: roleConfig.instructions,
    });

    this.updateSession({
      systemPrompt: await this.promptEnhancer.buildSystemPrompt(),
      metadata: {
        ...this.currentSession!.metadata,
        role: {
          name: this.initialRoleName!,
          definition: roleConfig.definition,
          instructions: roleConfig.instructions,
        },
      },
    });
  }

  /**
   * Ensure there is an active session
   */
  private ensureActiveSession(): void {
    if (!this.currentSession) {
      throw new MCPilotError(
        "No active session",
        "NO_SESSION",
        ErrorSeverity.HIGH,
      );
    }
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
      metadata: this.currentRole
        ? {
            custom: {
              role: {
                definition: this.currentRole.definition,
                instructions: this.currentRole.instructions,
              },
            },
          }
        : undefined,
    };
  }

  /**
   * Add a message to the session
   */
  private addMessageToSession(message: Message): void {
    this.updateSession({
      messages: [...this.currentSession!.messages, message],
    });
  }

  /**
   * Load session from a log file
   */
  private loadSessionFromLog(logPath: string): Session {
    try {
      this.validateLogFile(logPath);
      const logContent = fs.readFileSync(logPath, "utf8");
      const logs = this.parseLogContent(logContent);

      // Initialize session data with default values
      const sessionData: Session = {
        id: "",
        state: SessionState.INITIALIZING,
        systemPrompt: "",
        messages: [],
        metadata: this.createDefaultMetadata(),
      };

      // Process log entries in order
      for (const log of logs) {
        this.processLogEntry(log, sessionData, logPath);
      }

      if (!sessionData.id) {
        throw new Error("Invalid log file: no session ID found");
      }

      // Ensure we have the session filename in metadata
      this.ensureSessionFilename(sessionData, logPath);

      return sessionData;
    } catch (error: unknown) {
      logger.error("Session load error:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      throw new MCPilotError(
        `Failed to parse session log: ${errorMessage}`,
        "LOG_PARSE_FAILED",
        ErrorSeverity.HIGH,
        { logPath, error },
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
  private processLogEntry(
    log: any,
    sessionData: Session,
    logPath: string,
  ): void {
    if (!log.metadata) return;

    const { sessionId, messages, state, systemPrompt } = log.metadata;

    if (sessionId) {
      sessionData.id = sessionId;
    }
    if (messages) {
      sessionData.messages = messages;
    }
    if (state) {
      sessionData.state = state;
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
          sessionFilename: path.basename(logPath),
        },
      };
    }
  }

  /**
   * Ensure session filename is in metadata
   */
  private ensureSessionFilename(sessionData: Session, logPath: string): void {
    if (!sessionData.metadata.custom) {
      sessionData.metadata.custom = {};
    }
    sessionData.metadata.custom.sessionFilename = path.basename(logPath);
  }

  /**
   * Process a message with potential tool requests
   */
  private async processMessageWithTools(): Promise<Response> {
    if (!this.provider) {
      return this.createErrorResponse(
        "NO_PROVIDER",
        "No LLM provider configured",
      );
    }

    try {
      logger.debug("Processing message with tools....");
      let response = await this.provider.processMessage(this.currentSession!);
      logger.debug("Response:", response.id);

      // Check for tool requests in response
      if (!response.content.text) {
        throw new MCPilotError(
          "LLM response missing text content",
          "INVALID_RESPONSE",
          ErrorSeverity.HIGH,
        );
      }

      this.addAssistantResponseToSession(response.content.text);

      const toolRequests = await this.parseToolRequests(response.content.text);
      await this.handleToolRequests(toolRequests);

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
  private addAssistantResponseToSession(responseText: string): void {
    this.addMessageToSession({
      id: this.generateMessageId(),
      type: MessageType.ASSISTANT,
      content: responseText,
      timestamp: new Date(),
      metadata: {},
    });
  }

  /**
   * Parse tool requests from a response
   */
  private async parseToolRequests(
    responseText: string,
  ): Promise<ParsedToolRequest[]> {
    try {
      return await this.toolRequestParser.parseRequest(responseText);
    } catch (error) {
      logger.error("Error processing message with tools:", error);
      await this.executeMessage(
        `Error processing message with tools: ${JSON.stringify(error)}`,
      );
      return [];
    }
  }

  /**
   * Handle tool requests
   */
  private async handleToolRequests(
    toolRequests: ParsedToolRequest[],
  ): Promise<void> {
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
        await this.executeMessage(toolMessage.content);
      } catch (error) {
        logger.error("Tool call error:", error);
        throw error;
      }
    }
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
