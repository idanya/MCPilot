/**
 * Session storage implementation
 */

import * as fs from "fs";
import * as path from "path";
import { Session, SessionStatus } from "../../interfaces/base/session.ts";
import { logger } from "../logger/index.ts";
import { MCPilotError } from "../../interfaces/error/types.ts";
import { ErrorSeverity } from "../../interfaces/error/types.ts";
import { findNearestMcpilotDirSync } from "../config/config-utils.ts";

export class SessionStorage {
  private workingDirectory: string;

  constructor(workingDirectory: string) {
    this.workingDirectory = workingDirectory;
  }

  /**
   * Find the mcpilot directory for storing sessions
   */
  public findMcpilotDir(): string {
    const mcpilotDir = findNearestMcpilotDirSync(this.workingDirectory);
    return mcpilotDir || this.workingDirectory;
  }

  /**
   * Save session to a file
   */
  public saveSessionToFile(session: Session): void {
    if (!session) return;

    // Find nearest .mcpilot directory or default to local sessions
    const mcpilotDir = this.findMcpilotDir();
    const sessionsDir = path.join(mcpilotDir, "sessions");
    const sessionPath = path.join(sessionsDir, session.id);

    try {
      // Create sessions directory if it doesn't exist
      if (!fs.existsSync(sessionsDir)) {
        fs.mkdirSync(sessionsDir, { recursive: true });
      }

      // Write session data to file
      fs.writeFileSync(
        sessionPath,
        JSON.stringify(session, null, 2),
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

  /**
   * Load session from a log file
   */
  public loadSessionFromLog(sessionId: string, createDefaultMetadata: () => any): Session {
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
        metadata: createDefaultMetadata(),
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

  // Removed duplicate processSessionData method
}