/**
 * Session manager implementation
 */

import * as fs from "fs";
import * as path from "path";
import { Context, DeepPartial } from "../../interfaces/base/context";
import {
  Message,
  MessageType,
  ToolCallStatus,
} from "../../interfaces/base/message";
import { Response, ResponseType } from "../../interfaces/base/response";
import {
  IContextManager,
  ISessionManager,
  Session,
} from "../../interfaces/base/session";
import { SessionState } from "../../interfaces/base/state";
import { MCPilotConfig, RoleConfig } from "../../interfaces/config/types";
import { ErrorSeverity, MCPilotError } from "../../interfaces/error/types";
import { ILLMProvider } from "../../interfaces/llm/provider";
import { RoleConfigLoader } from "../config/role-config-loader";
import { McpHub } from "../mcp/mcp-hub";
import { ToolRequestParser } from "../parser/tool-request-parser";
import { SystemPromptEnhancer } from "../prompt/prompt-enhancer";
import { ContextManager } from "./context-manager";
import { McpServerConfig } from "../config/mcp-schema";

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
  ) {
    this.provider = provider;
    this.currentRoleName = initialRoleName;
    this.initialRoleName = initialRoleName;
  }

  async #createMcpHub(): Promise<void> {
    this.mcpHub = new McpHub(this.config.mcp?.servers || {});
    await this.mcpHub.initializeMcpServers();
  }

  public async init(): Promise<void> {
    await this.#createMcpHub();

    this.toolRequestParser = new ToolRequestParser(this.mcpHub);
    this.promptEnhancer = new SystemPromptEnhancer(
      this.mcpHub.getToolCatalog(),
    );

    await this.#loadRoleConfiguration(); // Load roles on initialization

    const initialContext: Partial<Context> = {
      systemPrompt: "",
      messages: [], // This will now store Message objects instead of strings
      tools: [],
      metadata: {
        sessionId: "",
        timestamp: new Date(),
        environment: {
          cwd: process.cwd(),
          os: process.platform,
          shell: process.env.SHELL || "",
        },
      },
    };

    // Initialize role if provided
    if (this.initialRoleName) {
      const roleConfig = this.roleLoader.getRole(this.initialRoleName);
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
      initialContext.systemPrompt = this.promptEnhancer.buildSystemPrompt();

      if (initialContext.metadata) {
        initialContext.metadata.role = {
          name: this.initialRoleName,
          ...roleConfig,
        };
      }
    }

    this.contextManager.mergeContext(initialContext);
  }

  async #loadRoleConfiguration() {
    this.roleLoader = new RoleConfigLoader({
      configPath: this.rolesConfigPath,
    });

    await this.roleLoader.load();
  }

  getMessageHistory(): Message[] {
    if (!this.currentSession) {
      throw new MCPilotError(
        "No active session",
        "NO_SESSION",
        ErrorSeverity.HIGH,
      );
    }
    return this.currentSession.context.messages;
  }

  getQueueSize(): number {
    throw new Error("Method not implemented.");
  }

  public async createSession(): Promise<Session> {
    if (this.currentSession) {
      throw new MCPilotError(
        "Session already exists",
        "SESSION_EXISTS",
        ErrorSeverity.HIGH,
      );
    }

    // Initialize components before creating session
    await this.init();

    const sessionId = this.#generateSessionId();
    this.currentSession = {
      id: sessionId,
      context: this.contextManager.getContext(),
      state: SessionState.READY,
    };

    return this.currentSession;
  }

  public async resumeSession(logPath: string): Promise<Session> {
    if (!logPath) {
      throw new MCPilotError(
        "Log path is required",
        "INVALID_LOG_PATH",
        ErrorSeverity.HIGH,
      );
    }

    try {
      // Initialize components before restoring session
      await this.init();

      const sessionData = this.loadSessionFromLog(logPath);

      this.currentSession = {
        id: sessionData.id,
        context: sessionData.context,
        state: SessionState.INITIALIZING,
      };

      // Restore context and state
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

  public async executeMessage(message: string): Promise<Response> {
    if (!this.currentSession) {
      throw new MCPilotError(
        "No active session",
        "NO_SESSION",
        ErrorSeverity.HIGH,
      );
    }

    try {
      this.currentSession.state = SessionState.PROCESSING;

      const newMessage: Message = {
        id: this.#generateMessageId(),
        type: MessageType.USER,
        content: message,
        timestamp: new Date(),
        metadata: this.currentRole
          ? {
              custom: {
                role: {
                  definition: this.currentRole.definition,
                  instructions: this.currentRole.instructions,
                  constraints: this.currentRole.constraints,
                },
              },
            }
          : undefined,
      };

      // Enforce role constraints if they exist
      if (this.currentRole?.constraints) {
        const context = this.contextManager.getContext();
        if (
          this.currentRole.constraints.maxContextSize &&
          context.messages.length >= this.currentRole.constraints.maxContextSize
        ) {
          throw new MCPilotError(
            "Maximum context size exceeded for current role",
            "CONTEXT_SIZE_EXCEEDED",
            ErrorSeverity.HIGH,
          );
        }
      }

      // Initialize role if not already set
      if (this.contextManager.getContext().messages.length === 0) {
        if (this.currentRoleName && this.currentRole) {
          await this.setRole(this.currentRoleName, this.currentRole);
        }
      }

      // Update context with new message
      const context = this.contextManager.getContext();
      context.messages.push(newMessage);
      this.contextManager.updateContext(context);

      // Process message with tool request parsing
      const response = await this.processMessageWithTools(newMessage);

      this.currentSession.state = SessionState.READY;
      return response;
    } catch (error) {
      this.currentSession.state = SessionState.ERROR;
      throw this.handleError(error);
    }
  }

  private loadSessionFromLog(logPath: string): Session {
    try {
      if (!fs.existsSync(logPath)) {
        throw new Error(`Log file not found: ${logPath}`);
      }

      const logContent = fs.readFileSync(logPath, "utf8");
      if (!logContent.trim()) {
        throw new Error("Log file is empty");
      }

      const logs = logContent
        .trim()
        .split("\n")
        .filter((line) => line.trim())
        .map((line) => {
          try {
            return JSON.parse(line);
          } catch (e: unknown) {
            console.error("Failed to parse log line:", line);
            const errorMessage =
              e instanceof Error ? e.message : "Unknown error";
            throw new Error(`Invalid JSON in log file: ${errorMessage}`);
          }
        });

      // Initialize session data with default values
      const sessionData = {
        id: "",
        context: this.contextManager.getContext(),
        state: SessionState.INITIALIZING,
        history: [] as Message[],
      };

      // Process log entries in order
      for (const log of logs) {
        if (!log.metadata) continue;

        const { sessionId, context, state, message, logPath } = log.metadata;

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

      if (!sessionData.id) {
        throw new Error("Invalid log file: no session ID found");
      }

      // Ensure we have the session filename in metadata
      if (!sessionData.context.metadata.custom?.sessionFilename) {
        sessionData.context.metadata.custom = {
          ...sessionData.context.metadata.custom,
          sessionFilename: path.basename(logPath),
        };
      }

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

  private async processMessageWithTools(message: Message): Promise<Response> {
    if (!this.provider) {
      return {
        id: this.#generateMessageId(),
        type: ResponseType.ERROR,
        content: {
          error: {
            code: "NO_PROVIDER",
            message: "No LLM provider configured",
          },
        },
        metadata: {},
        timestamp: new Date(),
      };
    }

    try {
      const context = this.contextManager.getContext();

      console.log("Processing message with tools: ", message.content);
      let response = await this.provider.processMessage(context);
      console.log("Response: ", response);

      // Check for tool requests in response
      if (!response.content.text) {
        throw new MCPilotError(
          "LLM response missing text content",
          "INVALID_RESPONSE",
          ErrorSeverity.HIGH,
        );
      }

      this.contextManager.mergeContext({
        messages: [
          ...context.messages,
          {
            id: this.#generateMessageId(),
            type: MessageType.ASSISTANT,
            content: response.content.text,
            timestamp: new Date(),
            metadata: {},
          },
        ],
      });

      const toolRequests = await this.toolRequestParser.parseRequest(
        response.content.text,
      );

      // If there's a tool request, process only the first one
      if (toolRequests.length > 0) {
        const request = toolRequests[0];
        try {
          const { serverName, timeout } =
            await this.toolRequestParser.routeRequest(request);
          const result = await this.mcpHub.callTool(
            serverName,
            request.toolName,
            request.parameters,
          );

          // Create tool message for the LLM
          const toolMessage = {
            id: this.#generateMessageId(),
            type: MessageType.TOOL,
            content: JSON.stringify(result),
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

          await this.executeMessage(toolMessage.content);

          // response = await this.provider.processMessage({
          //   ...context,
          //   messages: [...context.messages, toolMessage],
          // });
        } catch (error) {
          throw error;
        }
      }

      return response;
    } catch (error) {
      const errorResponse: Response = {
        id: this.#generateMessageId(),
        type: ResponseType.ERROR,
        content: {
          error: {
            code: "PROCESSING_FAILED",
            message: "Failed to process message",
            details: error,
          },
        },
        metadata: {},
        timestamp: new Date(),
      };

      return errorResponse;
    }
  }

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

  #generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  #generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  public getContext(): Context {
    return this.contextManager.getContext();
  }

  public updateContext(context: Partial<Context>): void {
    this.contextManager.mergeContext(context);
  }
}
