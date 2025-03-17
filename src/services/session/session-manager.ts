/**
 * Session manager implementation
 */

import * as fs from "fs";
import * as path from "path";
import { Context, DeepPartial } from "../../interfaces/base/context.ts";
import {
  Message,
  MessageType,
  ToolCallStatus,
} from "../../interfaces/base/message.ts";
import { Response, ResponseType } from "../../interfaces/base/response.ts";
import {
  IContextManager,
  ISessionManager,
  Session,
} from "../../interfaces/base/session.ts";
import { SessionState } from "../../interfaces/base/state.ts";
import { MCPilotConfig, RoleConfig } from "../../interfaces/config/types.ts";
import { ErrorSeverity, MCPilotError } from "../../interfaces/error/types.ts";
import { ILLMProvider } from "../../interfaces/llm/provider.ts";
import { RoleConfigLoader } from "../config/role-config-loader.ts";
import { McpHub } from "../mcp/mcp-hub.ts";
import { ToolRequestParser } from "../parser/tool-request-parser.ts";
import { SystemPromptEnhancer } from "../prompt/prompt-enhancer.ts";
import { ContextManager } from "./context-manager.ts";
import { ParsedToolRequest } from "../parser/xml-parser.ts";

export class SessionManager implements ISessionManager {
  private currentSession: Session | null = null;
  private toolRequestParser!: ToolRequestParser;
  private promptEnhancer!: SystemPromptEnhancer;
  private mcpHub!: McpHub;
  private roleLoader!: RoleConfigLoader;
  private currentRoleName?: string;
  private currentRole?: RoleConfig;
  private contextManager: IContextManager = new ContextManager();

  constructor(
    private readonly config: MCPilotConfig,
    private readonly provider: ILLMProvider,
    private readonly rolesConfigPath?: string,
    private readonly initialRoleName?: string,
    private readonly workingDirectory: string = process.cwd(),
    private readonly autoApproveTools: boolean = false,
  ) {
    this.currentRoleName = initialRoleName;
  }

  // PUBLIC METHODS

  /**
   * Initialize session manager components
   */
  public async init(): Promise<void> {
    await this.createMcpHub();
    this.initializeHelpers();
    await this.loadRoleConfiguration();
    await this.setupInitialContext();
  }

  /**
   * Get the message history for the current session
   */
  public getMessageHistory(): Message[] {
    this.ensureActiveSession();
    return this.currentSession!.context.messages;
  }

  /**
   * Get the size of the message queue
   */
  public getQueueSize(): number {
    throw new Error("Method not implemented.");
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

    const sessionId = this.generateSessionId();
    this.currentSession = {
      id: sessionId,
      context: this.contextManager.getContext(),
      state: SessionState.READY,
    };

    return this.currentSession;
  }

  /**
   * Resume a session from a log file
   */
  public async resumeSession(logPath: string): Promise<Session> {
    if (!logPath) {
      throw new MCPilotError(
        "Log path is required",
        "INVALID_LOG_PATH",
        ErrorSeverity.HIGH,
      );
    }

    try {
      await this.init();

      const sessionData = this.loadSessionFromLog(logPath);

      this.currentSession = {
        id: sessionData.id,
        context: sessionData.context,
        state: SessionState.INITIALIZING,
      };

      this.contextManager.updateContext(sessionData.context);
      this.currentSession.state = SessionState.READY;

      return this.currentSession;
    } catch (error) {
      throw new MCPilotError(
        "Failed to resume session",
        "RESUME_FAILED",
        ErrorSeverity.HIGH,
        { logPath, error },
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
      await this.initializeRoleIfNeeded();

      this.addMessageToContext(newMessage);
      const response = await this.processMessageWithTools();

      this.currentSession!.state = SessionState.READY;
      return response;
    } catch (error) {
      this.currentSession!.state = SessionState.ERROR;
      throw this.handleError(error);
    }
  }

  /**
   * Get the current context
   */
  public getContext(): Context {
    return this.contextManager.getContext();
  }

  /**
   * Update the context with new data
   */
  public updateContext(context: Partial<Context>): void {
    this.contextManager.mergeContext(context);
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
   * Set up the initial context
   */
  private async setupInitialContext(): Promise<void> {
    const initialContext: Partial<Context> = {
      systemPrompt: "",
      messages: [],
      tools: [],
      metadata: {
        sessionId: "",
        timestamp: new Date(),
        environment: {
          cwd: this.workingDirectory,
          os: process.platform,
          shell: process.env.SHELL || "",
        },
      },
    };

    if (this.initialRoleName) {
      await this.setupRoleContext(initialContext);
    }

    this.contextManager.mergeContext(initialContext);
  }

  /**
   * Set up role-specific context
   */
  private async setupRoleContext(
    initialContext: Partial<Context>,
  ): Promise<void> {
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
    initialContext.systemPrompt = await this.promptEnhancer.buildSystemPrompt();

    if (initialContext.metadata) {
      initialContext.metadata.role = {
        name: this.initialRoleName!,
        ...roleConfig,
      };
    }
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
   * Initialize role if not already set
   */
  private async initializeRoleIfNeeded(): Promise<void> {
    if (this.contextManager.getContext().messages.length === 0) {
      if (this.currentRoleName && this.currentRole) {
        await this.setRole(this.currentRoleName, this.currentRole);
      }
    }
  }

  /**
   * Add a message to the context
   */
  private addMessageToContext(message: Message): void {
    const context = this.contextManager.getContext();
    context.messages.push(message);
    this.contextManager.updateContext(context);
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
      const sessionData = this.initializeSessionData();

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
      console.error("Session load error:", error);
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
          console.error("Failed to parse log line:", line);
          const errorMessage = e instanceof Error ? e.message : "Unknown error";
          throw new Error(`Invalid JSON in log file: ${errorMessage}`);
        }
      });
  }

  /**
   * Initialize session data with defaults
   */
  private initializeSessionData(): Session & { history: Message[] } {
    return {
      id: "",
      context: this.contextManager.getContext(),
      state: SessionState.INITIALIZING,
      history: [] as Message[],
    };
  }

  /**
   * Process a single log entry
   */
  private processLogEntry(
    log: any,
    sessionData: Session & { history: Message[] },
    logPath: string,
  ): void {
    if (!log.metadata) return;

    const { sessionId, context, state, message } = log.metadata;

    if (sessionId) {
      sessionData.id = sessionId;
    }
    if (context) {
      sessionData.context = {
        ...sessionData.context,
        ...context,
        metadata: {
          ...context.metadata,
          custom: {
            ...context.metadata?.custom,
            sessionFilename: path.basename(logPath || ""),
          },
        },
      };
    }
    if (state) {
      sessionData.state = state;
    }
    if (message && typeof message === "object") {
      sessionData.history.push(message);
    }
  }

  /**
   * Ensure session filename is in metadata
   */
  private ensureSessionFilename(sessionData: Session, logPath: string): void {
    if (!sessionData.context.metadata.custom?.sessionFilename) {
      sessionData.context.metadata.custom = {
        ...sessionData.context.metadata.custom,
        sessionFilename: path.basename(logPath),
      };
    }
  }

  /**
   * Set a role for the current session
   */
  private async setRole(name: string, roleConfig: RoleConfig): Promise<void> {
    try {
      const context: DeepPartial<Context> = {
        metadata: {
          role: {
            name,
            ...roleConfig,
          },
        },
      };

      this.contextManager.mergeContext(context);
    } catch (error) {
      throw new MCPilotError(
        "Failed to set role",
        "ROLE_SET_ERROR",
        ErrorSeverity.HIGH,
        { error },
      );
    }
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
      const context = this.contextManager.getContext();

      console.log("Processing message with tools....");
      let response = await this.provider.processMessage(context);
      console.log("Response: ", response.id);

      // Check for tool requests in response
      if (!response.content.text) {
        throw new MCPilotError(
          "LLM response missing text content",
          "INVALID_RESPONSE",
          ErrorSeverity.HIGH,
        );
      }

      this.addAssistantResponseToContext(response.content.text);

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
   * Add the assistant's response to the context
   */
  private addAssistantResponseToContext(responseText: string): void {
    const context = this.contextManager.getContext();
    this.contextManager.mergeContext({
      messages: [
        ...context.messages,
        {
          id: this.generateMessageId(),
          type: MessageType.ASSISTANT,
          content: responseText,
          timestamp: new Date(),
          metadata: {},
        },
      ],
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
      console.log("Error processing message with tools: ", error);
      await this.executeMessage(
        `Error processing message with tools: ${error}`,
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

        console.log("Tool call result: ", result);

        const toolMessage = this.createToolCallMessage(request, result);
        await this.executeMessage(toolMessage.content);
      } catch (error) {
        console.error("Tool call error:", error);
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
   * Generate a unique session ID
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate a unique message ID
   */
  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
