/**
 * Defines the interfaces for MCP tool management and execution
 */

export interface ITool {
  name: string;
  description: string;
  execute(params: Record<string, any>): Promise<ToolResponse>;
  getSchema(): ToolSchema;
}

export interface ToolSchema {
  name: string;
  description: string;
  version: string;
  inputSchema: InputSchema;
  outputSchema: OutputSchema;
  examples: ToolExample[];
}

export interface InputSchema {
  type: "object";
  required: string[];
  properties: Record<string, InputProperty>;
}

export interface InputProperty {
  type: string;
  description: string;
  default?: any;
  enum?: any[];
  minimum?: number;
  maximum?: number;
  pattern?: string;
}

export interface OutputSchema {
  type: string;
  properties?: Record<string, OutputProperty>;
  items?: OutputSchemaItems;
}

export interface OutputProperty {
  type: string;
  description: string;
}

export interface OutputSchemaItems {
  type: string;
  properties?: Record<string, OutputProperty>;
}

export interface ToolExample {
  description: string;
  input: Record<string, any>;
  output: any;
}

export interface ToolResponse {
  success: boolean;
  data?: any;
  error?: ToolError;
  metadata: ToolResponseMetadata;
}

export interface ToolError {
  code: string;
  message: string;
  details?: any;
}

export interface ToolResponseMetadata {
  duration: number;
  timestamp: Date;
  resourceUsage?: ResourceUsage;
}

export interface ResourceUsage {
  cpu?: number;
  memory?: number;
  network?: NetworkUsage;
}

export interface NetworkUsage {
  bytesIn: number;
  bytesOut: number;
}

export interface IToolRegistry {
  registerTool(tool: ITool): void;
  unregisterTool(name: string): void;
  getTool(name: string): ITool | undefined;
  getAllTools(): ITool[];
}

export interface IToolLoader {
  loadTool(path: string): Promise<ITool>;
  unloadTool(name: string): Promise<void>;
  refresh(): Promise<void>;
  getLoadedTools(): ITool[];
}

export interface ISchemaManager {
  addSchema(schema: ToolSchema): void;

  getSchema(toolName: string): ToolSchema | undefined;
  updateSchema(schema: ToolSchema): void;
}

export interface IToolExecutor {
  execute(tool: ITool, params: Record<string, any>): Promise<ToolResponse>;

  getExecutionStats(): ExecutionStats;
}

export interface ExecutionStats {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageDuration: number;
  resourceUsage: ResourceUsage;
}
