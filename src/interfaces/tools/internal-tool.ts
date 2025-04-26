/**
 * Interfaces for internal tools
 */

export interface InternalTool {
  name: string;
  description: string;
  schema: ParameterSchema;
  execute(sessionId: string, parameters: Record<string, any>): Promise<ToolExecutionResult>;
  getDocumentation(): ToolDocumentation;
}

export interface ToolExecutionResultContent {
  message: string;
  shouldSendToModel: boolean;
  [key: string]: any;
}

export interface ToolExecutionResult {
  success: boolean;
  content: ToolExecutionResultContent;
  error?: Error;
}

export interface ToolDocumentation {
  name: string;
  description: string;
  schema: ParameterSchema;
  examples: ToolExample[];
}

export interface ToolExample {
  description: string;
  usage: string;
  result?: string;
}

export interface ParameterSchema {
  type: string;
  properties: Record<string, {
    type: string;
    description: string;
  }>;
  required?: string[];
}

export interface ParsedInternalToolRequest {
  toolName: string;
  parameters: Record<string, any>;
  raw: string;
}