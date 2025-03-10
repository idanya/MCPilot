/**
 * Session service exports
 */

export { SessionManager } from "./session-manager.js";
export { ContextManager } from "./context-manager.js";
export { LogManager } from "./log-manager.js";
export { MessageQueue } from "./message-queue.js";

// Re-export types from interfaces for convenience
export type {
  ISessionManager,
  IContextManager,
  ILogManager,
  Session,
  ContextData,
} from "../../interfaces/base/session.js";

export { LogLevel } from "../../interfaces/base/session.js";

export type { SessionState } from "../../interfaces/base/state.js";

export type {
  Message,
  MessageType,
  MessageMetadata,
  ToolCall,
  ToolCallResult,
  ToolCallStatus,
  IMessageFormatter,
  MessageFormat,
} from "../../interfaces/base/message.js";

export type {
  Context,
  ToolContext,
  ToolParameter,
  ToolExample,
  ContextMetadata,
} from "../../interfaces/base/context.js";

export type {
  Response,
  ResponseType,
  ResponseContent,
  ToolResult,
  ToolResultStatus,
  ResponseError,
  ResponseMetadata,
} from "../../interfaces/base/response.js";
