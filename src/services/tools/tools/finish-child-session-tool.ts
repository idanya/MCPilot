/**
 * Finish Child Session Tool Implementation
 */

import {
  InternalTool,
  ParameterSchema,
  ToolDocumentation,
  ToolExecutionResult,
} from "../../../interfaces/tools/internal-tool.ts";
import { logger } from "../../logger/index.ts";

export class FinishChildSessionTool implements InternalTool {
  name = "finish_child_session";
  description = "Complete the current child session and report back to parent";

  constructor(private sessionManager: any) {}

  schema: ParameterSchema = {
    type: "object",
    properties: {
      summary: {
        type: "string",
        description: "Summary of the work completed in the child session",
      },
    },
    required: ["summary"],
  };

  async execute(
    sessionId: string,
    parameters: Record<string, any>,
  ): Promise<ToolExecutionResult> {
    try {
      const { summary } = parameters;

      // Current session must be a child session
      const session = this.sessionManager.getSession(sessionId);
      if (!session.parentId) {
        throw new Error(
          "This is not a child session. Cannot use finish_child_session",
        );
      }

      // Complete the child session
      await this.sessionManager.completeChildSession(sessionId, summary);

      return {
        success: true,
        content: {
          message: "Child session completed successfully",
          shouldSendToModel: true,
          parentId: session.parentId,
        },
      };
    } catch (error) {
      logger.error("Error completing child session:", error);
      return {
        success: false,
        content: {
          message: "Failed to complete child session",
          shouldSendToModel: false,
        },
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  getDocumentation(): ToolDocumentation {
    return {
      name: this.name,
      description: this.description,
      schema: this.schema,
      examples: [
        {
          description: "Complete a child session with a summary",
          usage: `<use_tool>\n<tool_name>finish_child_session</tool_name>\n<parameters>\n<summary>Implemented the fibonacci function using dynamic programming for efficiency</summary>\n</parameters>\n</use_tool>`,
        },
      ],
    };
  }
}
