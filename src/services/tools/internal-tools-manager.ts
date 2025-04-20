/**
 * Internal Tools Manager for handling internal tool requests
 */

import {
  InternalTool,
  ParsedInternalToolRequest,
  ToolDocumentation,
  ToolExecutionResult,
} from "../../interfaces/tools/internal-tool.ts";
import { FinishChildSessionTool } from "./tools/finish-child-session-tool.ts";
import { RunChildSessionTool } from "./tools/run-child-session-tool.ts";

export class InternalToolsManager {
  private tools: Map<string, InternalTool> = new Map();

  constructor(private sessionManager: any) {
    this.registerDefaultTools();
  }

  // Register default internal tools
  private registerDefaultTools(): void {
    this.registerTool(
      "run_child_session",
      new RunChildSessionTool(this.sessionManager),
    );
    this.registerTool(
      "finish_child_session",
      new FinishChildSessionTool(this.sessionManager),
    );
  }

  // Register a new tool
  public registerTool(name: string, tool: InternalTool): void {
    this.tools.set(name, tool);
  }

  // Execute a tool request
  public async executeTool(
    sessionId: string,
    request: ParsedInternalToolRequest,
  ): Promise<ToolExecutionResult> {
    const tool = this.tools.get(request.toolName);

    if (!tool) {
      throw new Error(`Unknown internal tool: ${request.toolName}`);
    }

    return await tool.execute(sessionId, request.parameters);
  }

  // Get tool documentation for system prompts
  public getToolsDocumentation(): ToolDocumentation[] {
    const docs: ToolDocumentation[] = [];

    for (const tool of this.tools.values()) {
      docs.push(tool.getDocumentation());
    }

    return docs;
  }
}
