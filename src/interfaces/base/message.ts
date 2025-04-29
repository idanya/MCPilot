/**
 * Core message interfaces defining the structure of messages flowing through the system
 */

export interface Message {
  id: string;
  type: MessageType;
  content: string;
  timestamp: Date;
  metadata?: MessageMetadata;
}

export enum MessageType { 
  USER = "user",
  ASSISTANT = "assistant",
  SYSTEM = "system",
  TOOL_CALL = "tool_call",
  TOOL_RESULT = "tool_result",
  CHILD_SESSION_RESULT = "child_session_result" // New type
}

export interface MessageMetadata {
  toolCalls?: ToolCall[];
  tokens?: number;
  provider?: string;
  model?: string;
  custom?: Record<string, any>;
  childSessionId?: string; // New field for child session results
}

export interface ToolCall {
  toolName: string;
  parameters: Record<string, any>;
  timestamp: Date;
  result?: ToolCallResult;
}

export interface ToolCallResult {
  status: ToolCallStatus;
  output?: any;
  error?: string;
  duration: number;
}

export enum ToolCallStatus {
  SUCCESS = "success",
  FAILURE = "failure",
  TIMEOUT = "timeout",
  PENDING = "pending",
}

export interface IMessageFormatter {
  format(message: Message, format: MessageFormat): string;
  addTemplate(name: string, template: string): void;
  validate(message: Message): boolean;
  getSupportedFormats(): MessageFormat[];
}

export enum MessageFormat {
  TEXT = "text",
  JSON = "json",
  MARKDOWN = "markdown",
  HTML = "html",
}
