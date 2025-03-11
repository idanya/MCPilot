/**
 * Defines the structure of responses from LLM providers and tools
 */

export interface Response {
  id: string;
  type: ResponseType;
  content: ResponseContent;
  metadata: ResponseMetadata;
  timestamp: Date;
}

export enum ResponseType {
  TEXT = "text",
  TOOL_RESULT = "tool_result",
  ERROR = "error",
}

export interface ResponseContent {
  text?: string;
  toolResults?: ToolResult[];
  error?: ResponseError;
}

export interface ToolResult {
  toolName: string;
  status: ToolResultStatus;
  output: any;
  error?: string;
  duration: number;
}

export enum ToolResultStatus {
  SUCCESS = "success",
  FAILURE = "failure",
  TIMEOUT = "timeout",
}

export interface ResponseError {
  code: string;
  message: string;
  details?: any;
}

export interface ResponseMetadata {
  provider?: string;
  model?: string;
  tokens?: {
    prompt: number;
    completion: number;
    total: number;
  };
  custom?: Record<string, any>;
}
