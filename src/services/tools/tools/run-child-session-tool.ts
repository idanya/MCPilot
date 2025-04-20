/**
 * Run Child Session Tool Implementation
 */

import {
  InternalTool,
  ParameterSchema,
  ToolDocumentation,
  ToolExecutionResult,
} from "../../../interfaces/tools/internal-tool.ts";
import { logger } from "../../logger/index.ts";
import { SessionManager } from "../../session/session-manager.ts";

export class RunChildSessionTool implements InternalTool {
  name = "run_child_session";
  description =
    "Create a new session with a different role. Can be used by both parent and child sessions to create further child sessions.";

  constructor(private sessionManager: SessionManager) {}

  schema: ParameterSchema = {
    type: "object",
    properties: {
      role: {
        type: "string",
        description:
          "The role to use for the child session. Must be one of the available roles in the system.",
      },
      prompt: {
        type: "string",
        description: "The initial message to start the child session with",
      },
    },
    required: ["role", "prompt"],
  };

  async execute(
    sessionId: string,
    parameters: Record<string, any>,
  ): Promise<ToolExecutionResult> {
    try {
      const { role, prompt } = parameters;

      // Create child session
      const childSession = await this.sessionManager.createChildSession(
        sessionId,
        role,
        prompt,
      );

      logger.info(
        `Child session created with ID: ${childSession.id} for parent session ID: ${sessionId}`,
      );

      return {
        success: true,
        content: {
          message: `Child session created with ID: ${childSession.id}. Please wait for a completion message.`,
          shouldSendToModel: false,
          sessionId: childSession.id,
        },
      };
    } catch (error) {
      logger.error("Error creating child session:", error);
      return {
        success: false,
        content: {
          message: "Failed to create child session",
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
          description: "Create a child session with the 'code' role",
          usage: `<use_tool>\n<tool_name>run_child_session</tool_name>\n<parameters>\n<role>code</role>\n<prompt>Implement a function to calculate fibonacci numbers</prompt>\n</parameters>\n</use_tool>`,
        },
      ],
    };
  }
}
