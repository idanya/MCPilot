/**
 * Core MCP entities and types
 */

import { McpServerConfig } from "../config/mcp-schema.ts";

export interface McpHubConfig {
  servers: Record<string, McpServerConfig>;
  autoApproveTools?: boolean;
}

export interface McpConnection {
  id: string;
  name: string;
  status: ConnectionStatus;
  lastActive: Date;
  config: McpConfigOrPath;
  tools: McpTool[];
  resources: McpResource[];
}

export type McpConfigOrPath = McpConfig | string;

export interface McpConfig {
  name: string;
  version: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  timeout?: number;
  type: "stdio" | "http";
  enabled: boolean;
}

export interface McpTool {
  name: string;
  description?: string;
  inputSchema: ToolSchema;
  outputSchema?: ToolSchema;
  examples?: ToolExample[];
  metadata?: Record<string, any>;
  alwaysAllow?: boolean;
}

export interface ToolSchema {
  type: string;
  required?: string[];
  properties?: Record<string, ToolProperty>;
  items?: ToolSchemaItems;
  additionalProperties?: boolean;
  [key: string]: unknown; // Allow additional properties for schema compatibility
}

export interface ToolProperty {
  type: string;
  description?: string;
  default?: any;
  enum?: any[];
  minimum?: number;
  maximum?: number;
  pattern?: string;
}

export interface ToolSchemaItems {
  type: string;
  properties?: Record<string, ToolProperty>;
}

export interface ToolExample {
  description: string;
  input: Record<string, any>;
  output: any;
}

export interface McpResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  tags?: string[];
}

export interface McpResourceTemplate {
  uriTemplate: string;
  name: string;
  description?: string;
  mimeType?: string;
  tags?: string[];
}

export interface ToolRequest {
  name: string;
  arguments: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface ToolResponse {
  success: boolean;
  content?: ToolResponseContent[];
  error?: ToolError;
  metadata?: Record<string, any>;
}

export interface ToolResponseContent {
  type: string;
  text?: string;
  mimeType?: string;
  data?: string;
  resource?: {
    uri: string;
    content: string;
    mimeType?: string;
  };
}

export interface ToolError {
  code: string;
  message: string;
  details?: any;
}

export interface ResourceRequest {
  uri: string;
  metadata?: Record<string, any>;
}

export interface ResourceResponse {
  contents: ExtendedResourceContent[];
  metadata?: Record<string, any>;
}

export interface ResourceContent {
  uri: string;
  text?: string;
  mimeType?: string;
}

export interface ExtendedResourceContent extends ResourceContent {
  blob?: string;
}

export type ConnectionStatus =
  | "connected"
  | "disconnected"
  | "connecting"
  | "error"
  | "reconnecting";

// Additional types needed for McpHub
export type McpResourceResponse = ResourceResponse;

export interface McpServer {
  name: string;
  version?: string;
  capabilities?: {
    tools?: Record<string, ToolSchema>;
    resources?: Record<string, McpResourceTemplate>;
  };
  config: McpConfigOrPath;
  status: ConnectionStatus;
  error?: string;
  tools?: McpTool[];
  resources?: McpResource[];
  resourceTemplates?: McpResourceTemplate[];
  disabled?: boolean;
}

export interface McpResourceContent {
  uri: string;
  mimeType?: string;
  text?: string | unknown;
  blob?: string | unknown;
}

export type McpToolOutput =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string }
  | { type: "resource"; resource: McpResourceContent };

export interface McpToolCallResponse {
  success?: boolean; // Optional since not always provided
  content: McpToolOutput[];
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  isError?: boolean;
}
