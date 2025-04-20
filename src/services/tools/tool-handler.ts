/**
 * Tool handler implementation
 */

import { logger } from "../logger/index.ts";
import { McpHub } from "../mcp/mcp-hub.ts";
import { ToolRequestParser } from "../parser/tool-request-parser.ts";
import { ParsedToolRequest, XmlParser } from "../parser/xml-parser.ts";
import { Message, MessageType, ToolCallStatus } from "../../interfaces/base/message.ts";
import { ParsedInternalToolRequest } from "../../interfaces/tools/internal-tool.ts";
import { InternalToolsManager } from "./internal-tools-manager.ts";
import { v4 as uuidv4 } from "uuid";

export interface ToolHandlerOptions {
  mcpHub: McpHub;
  internalToolsManager: InternalToolsManager;
}

export class ToolHandler {
  private toolRequestParser: ToolRequestParser;
  private xmlParser: XmlParser;
  private mcpHub: McpHub;
  private internalToolsManager: InternalToolsManager;

  constructor(options: ToolHandlerOptions) {
    this.mcpHub = options.mcpHub;
    this.internalToolsManager = options.internalToolsManager;
    this.xmlParser = new XmlParser();
    this.toolRequestParser = new ToolRequestParser(this.mcpHub);
  }

  /**
   * Parse response for tool requests and handle them
   */
  public async processToolRequests(
    sessionId: string,
    responseText: string,
    executeMessage: (sessionId: string, message: Message) => Promise<any>
  ): Promise<boolean> {
    // Parse response for tool requests
    const mcpToolRequests = this.toolRequestParser.parseRequest(responseText);
    const internalToolRequests = this.xmlParser.parseInternalToolRequests(responseText);

    // Process MCP tool requests first
    if (mcpToolRequests.length > 0) {
      await this.handleToolRequests(sessionId, mcpToolRequests, executeMessage);
      return true;
    }

    // Then process internal tool requests
    if (internalToolRequests.length > 0) {
      await this.handleInternalToolRequests(sessionId, internalToolRequests, executeMessage);
      return true;
    }

    return false;
  }

  /**
   * Handle tool requests
   */
  private async handleToolRequests(
    sessionId: string,
    toolRequests: ParsedToolRequest[],
    executeMessage: (sessionId: string, message: Message) => Promise<any>
  ): Promise<boolean> {
    // If there's a tool request, process only the first one
    if (toolRequests.length > 0) {
      const request = toolRequests[0];
      try {
        const result = await this.mcpHub.callTool(
          request.serverName,
          request.toolName,
          request.arguments,
        );

        logger.debug("Tool call result:", result);

        const toolMessage = this.createToolCallMessage(request, result);
        await executeMessage(sessionId, toolMessage);
        return true;
      } catch (error) {
        logger.error("Tool call error:", error);
        throw error;
      }
    }

    return false;
  }

  /**
   * Handle internal tool requests
   */
  private async handleInternalToolRequests(
    sessionId: string,
    toolRequests: ParsedInternalToolRequest[],
    executeMessage: (sessionId: string, message: Message) => Promise<any>
  ): Promise<boolean> {
    // If there's a tool request, process only the first one
    if (toolRequests.length > 0) {
      const request = toolRequests[0];
      try {
        const result = await this.internalToolsManager.executeTool(
          sessionId,
          request,
        );

        logger.debug("Internal tool call result:", result);

        if (result.content.shouldSendToModel) {
          const toolMessage = this.createInternalToolCallMessage(
            request,
            result,
          );

          await executeMessage(sessionId, toolMessage);
        }

        return true;
      } catch (error) {
        logger.error("Internal tool call error:", error);
        throw error;
      }
    }

    return false;
  }

  /**
   * Create a message representing a tool call
   */
  private createToolCallMessage(
    request: ParsedToolRequest,
    result: any,
  ): Message {
    return {
      id: this.generateMessageId(),
      type: MessageType.USER,
      content: JSON.stringify(result),
      timestamp: new Date(),
      metadata: {
        toolCalls: [
          {
            toolName: request.toolName,
            parameters: request.arguments,
            timestamp: new Date(),
            result: {
              status: result.success
                ? ToolCallStatus.SUCCESS
                : ToolCallStatus.FAILURE,
              output: result.content,
              duration: 0,
            },
          },
        ],
      },
    };
  }

  /**
   * Create a message representing an internal tool call
   */
  private createInternalToolCallMessage(
    request: ParsedInternalToolRequest,
    result: any,
  ): Message {
    return {
      id: this.generateMessageId(),
      type: MessageType.USER,
      content: JSON.stringify(result.content),
      timestamp: new Date(),
      metadata: {
        toolCalls: [
          {
            toolName: request.toolName,
            parameters: request.parameters,
            timestamp: new Date(),
            result: {
              status: result.success
                ? ToolCallStatus.SUCCESS
                : ToolCallStatus.FAILURE,
              output: result.content,
              duration: 0,
            },
          },
        ],
      },
    };
  }

  /**
   * Generate a unique message ID
   */
  private generateMessageId(): string {
    return `msg_${uuidv4()}`;
  }
}