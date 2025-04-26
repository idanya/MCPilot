/**
 * Session manager implementation
 */

import * as fs from "fs";
import * as path from "path";
import { v4 as uuidv4 } from "uuid";
import { Message } from "../../interfaces/base/message.ts";
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
import { findConfigFileSync } from "../config/config-utils.ts";
import { logger } from "../logger/index.ts";

import { ToolHandler } from "../tools/tool-handler.ts";
import { MessageManager } from "./message-manager.ts";
import { SessionHierarchyManager } from "./session-hierarchy.ts";
import { SessionStorage } from "./session-storage.ts";

/**
 * Interface for SessionManager constructor parameters
 */
export interface SessionManagerOptions {
  /** MCPilot configuration */
  config: MCPilotConfig;
  /** LLM provider instance */
  provider: ILLMProvider;
  /** Working directory for the session */
  workingDirectory?: string;
  /** Whether to auto-approve tool calls */
  autoApproveTools?: boolean;
  toolHandler: ToolHandler;
}

export class SessionManager {
  #sessions: Record<string, Session> = {};

  private toolHandler: ToolHandler;
  private sessionStorage!: SessionStorage;
  private sessionHierarchyManager!: SessionHierarchyManager;
  private messageManager!: MessageManager;

  private initialized = false;

  constructor(options: SessionManagerOptions) {
    this.config = options.config;
    this.provider = options.provider;
    this.toolHandler = options.toolHandler;
    this.workingDirectory = options.workingDirectory || process.cwd();
  }

  private readonly config: MCPilotConfig;
  private readonly provider: ILLMProvider;

  private readonly workingDirectory: string;

  // PUBLIC METHODS

  /**
   * Initialize session manager components
   */
  private async init(): Promise<void> {
    if (this.initialized) return;

    this.initializeHelpers();
    this.initialized = true;
  }

  /**
   * Create a new session
   */
  public async createSession(systemPrompt: string): Promise<Session> {
    const newSession = {
      id: uuidv4(),
      systemPrompt,
      messages: [],
      metadata: this.createDefaultMetadata(),
      // New properties for session hierarchy
      childSessionIds: [],
      status: SessionStatus.ACTIVE,
    };

    this.#sessions[newSession.id] = newSession;

    await this.init();

    // Save session and log paths
    const mcpilotDir = this.sessionStorage.findMcpilotDir();
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

    this.sessionStorage.saveSessionToFile(newSession);
    return newSession;
  }

  /**
   * Resume a session from a log file
   */
  public async resumeSession(sessionId: string): Promise<Session> {
    try {
      await this.init();

      let sessionData: Session;

      // First try to load as a session ID
      const mcpilotDir = this.sessionStorage.findMcpilotDir();
      const sessionPath = path.join(mcpilotDir, "sessions", sessionId);
      if (fs.existsSync(sessionPath)) {
        const rawData = fs.readFileSync(sessionPath, "utf8");
        sessionData = JSON.parse(rawData);
      } else {
        // Fall back to loading from log file
        sessionData = this.sessionStorage.loadSessionFromLog(sessionId, () =>
          this.createDefaultMetadata(),
        );
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
      const newMessage = this.messageManager.createMessageObject(message);
      this.messageManager.addMessageToSession(
        sessionId,
        newMessage,
        this.#sessions[sessionId].messages,
      );
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
    this.sessionStorage.saveSessionToFile(this.#sessions[sessionId]);
  }

  /**
   * Initialize helper components
   */
  private initializeHelpers(): void {
    this.sessionStorage = new SessionStorage(this.workingDirectory);

    this.messageManager = new MessageManager({
      updateSession: (sessionId, sessionData) =>
        this.updateSession(sessionId, sessionData),
    });

    // ToolHandler will be initialized after RoleManager is initialized
    this.sessionHierarchyManager = new SessionHierarchyManager({
      getSession: (sessionId) => this.getSession(sessionId),
      updateSession: (sessionId, sessionData) =>
        this.updateSession(sessionId, sessionData),
      executeMessage: (sessionId, message) =>
        this.executeMessage(sessionId, message),
      sessionStorage: this.sessionStorage,
      generateMessageId: () => this.messageManager.generateMessageId(),
    });
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
   * Process a message with potential tool requests
   */
  private async processMessageWithTools(sessionId: string): Promise<Response> {
    try {
      logger.debug("Processing message with tools....");
      const response = await this.provider.processMessage(
        this.#sessions[sessionId],
      );

      // Check for tool requests in response
      if (!response.content.text) {
        throw new MCPilotError(
          "LLM response missing text content",
          "INVALID_RESPONSE",
          ErrorSeverity.HIGH,
        );
      }

      await this.messageManager.addAssistantResponseToSession(
        sessionId,
        response.content,
        this.#sessions[sessionId].messages,
      );

      // Process tool requests if any
      if (response.content.text) {
        await this.toolHandler.processToolRequests(
          sessionId,
          response.content.text,
          (sid, message) => this.executeMessage(sid, message),
        );
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
   * Set a listener for response content
   */
  public setResponseContentListener(
    listener: (
      sessionId: string,
      responseContent: ResponseContent,
    ) => Promise<void>,
  ): void {
    this.messageManager.setResponseContentListener(listener);
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
      id: this.messageManager.generateMessageId(),
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
}
