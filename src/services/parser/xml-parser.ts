/**
 * XML-style tool request parser
 */

import { logger } from "../logger/index.ts";
import { ParsedInternalToolRequest } from "../../interfaces/tools/internal-tool.ts";

export interface XmlNode {
  tag: string;
  content: string | XmlNode[];
}

export interface ParsedToolRequest {
  toolName: string;
  serverName: string;
  arguments: Record<string, any>;
  raw: string;
}

export class XmlParser {
  /**
   * Parse XML-style tool requests from text
   */
  public parseToolRequests(text: string): ParsedToolRequest[] {
    const requests: ParsedToolRequest[] = [];
    // Pattern specifically matches use_mcp_tool tags
    const pattern = /(<use_mcp_tool>[\s\S]*?<\/use_mcp_tool>)/g;
    let match;

    while ((match = pattern.exec(text)) !== null) {
      const [, fullMatch] = match;
      try {
        const request = this.parseToolRequest(fullMatch);
        requests.push(request);
      } catch (error) {
        if (error instanceof XmlParseError) {
          logger.warn(`Skipping invalid tool request: ${error.message}`);
        } else {
          throw error;
        }
      }
    }

    return requests;
  }

  /**
   * Parse XML-style internal tool requests from text
   */
  public parseInternalToolRequests(text: string): ParsedInternalToolRequest[] {
    const requests: ParsedInternalToolRequest[] = [];
    const pattern = /(<use_tool>[\s\S]*?<\/use_tool>)/g;
    let match;

    while ((match = pattern.exec(text)) !== null) {
      const [, fullMatch] = match;
      try {
        const request = this.parseInternalToolRequest(fullMatch);
        requests.push(request);
      } catch (error) {
        if (error instanceof XmlParseError) {
          logger.warn(
            `Skipping invalid internal tool request: ${error.message}`,
          );
        } else {
          throw error;
        }
      }
    }

    return requests;
  }

  /**
   * Parse single tool request
   */
  private parseToolRequest(text: string): ParsedToolRequest {
    const toolMatch = /<use_mcp_tool>([\s\S]*?)<\/use_mcp_tool>/g.exec(text);
    if (!toolMatch) {
      throw new XmlParseError("Invalid tool request format");
    }

    const [, content] = toolMatch;
    const params = this.parseParameters(content);

    // Validate required parameters
    if (!params.server_name) {
      throw new XmlParseError("Missing server_name in tool request");
    }
    if (!params.tool_name) {
      throw new XmlParseError("Missing tool_name in tool request");
    }
    if (!params.arguments) {
      throw new XmlParseError("Missing arguments in tool request");
    }

    // Parse arguments as JSON if it's a string
    let toolArguments: Record<string, any>;
    if (typeof params.arguments === "string") {
      try {
        toolArguments = JSON.parse(params.arguments);
      } catch {
        throw new XmlParseError("Invalid JSON in tool arguments");
      }
    } else {
      toolArguments = params.arguments;
    }

    const request: ParsedToolRequest = {
      toolName: params.tool_name,
      serverName: params.server_name,
      arguments: toolArguments,
      raw: text,
    };

    this.validateToolRequest(request);
    return request;
  }

  /**
   * Parse single internal tool request
   */
  private parseInternalToolRequest(text: string): ParsedInternalToolRequest {
    const toolMatch = /<use_tool>([\s\S]*?)<\/use_tool>/g.exec(text);
    if (!toolMatch) {
      throw new XmlParseError("Invalid internal tool request format");
    }

    const [, content] = toolMatch;
    const params = this.parseParameters(content);

    // Validate required parameters
    if (!params.tool_name) {
      throw new XmlParseError("Missing tool_name in internal tool request");
    }
    if (!params.parameters) {
      throw new XmlParseError("Missing parameters in internal tool request");
    }

    const request: ParsedInternalToolRequest = {
      toolName: params.tool_name,
      parameters: params.parameters,
      raw: text,
    };

    return request;
  }

  /**
   * Parse parameters from tool content, supporting nested structures
   */
  private parseParameters(content: string): Record<string, any> {
    const parameters: Record<string, any> = {};
    const pattern = /<([^>]+)>([\s\S]*?)<\/\1>/g;
    let match;

    while ((match = pattern.exec(content)) !== null) {
      const [, paramName, paramValue] = match;

      // Check if this might be an array of items
      if (
        this.hasNestedTags(paramValue) &&
        this.containsOnlyItemTags(paramValue)
      ) {
        // Parse as array of items
        parameters[paramName] = this.parseArrayItems(paramValue);
      }
      // Try to parse nested parameters
      else if (this.hasNestedTags(paramValue)) {
        try {
          parameters[paramName] = this.parseParameters(paramValue);
        } catch {
          // If nested parsing fails, store as string
          parameters[paramName] = this.normalizeValue(paramValue);
        }
      } else {
        parameters[paramName] = this.normalizeValue(paramValue);
      }
    }

    return parameters;
  }

  /**
   * Check if content contains only <item> tags at the top level
   */
  private containsOnlyItemTags(content: string): boolean {
    const trimmed = content.trim();
    // Quick check if it might contain item tags
    if (!trimmed.includes("<item>")) return false;

    // Use a regex to match top-level tags only
    // This pattern matches opening tags that are not inside other tags
    const topLevelTagPattern = /<([^>/]+)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/g;
    const topLevelTags: string[] = [];
    let tagMatch;

    while ((tagMatch = topLevelTagPattern.exec(trimmed)) !== null) {
      const tagName = tagMatch[1];
      topLevelTags.push(tagName);
    }

    // Check if all top-level tags are "item" tags
    return (
      topLevelTags.length > 0 && topLevelTags.every((tag) => tag === "item")
    );
  }

  /**
   * Parse array items from content
   */
  private parseArrayItems(content: string): any[] {
    const items: any[] = [];
    // Use a more robust pattern that can handle nested tags within item elements
    const itemPattern = /<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/g;
    let itemMatch;

    while ((itemMatch = itemPattern.exec(content)) !== null) {
      const [, itemValue] = itemMatch;

      // Check if item has nested structure
      if (this.hasNestedTags(itemValue)) {
        try {
          const nestedParams = this.parseParameters(itemValue);
          // If parsing succeeded, add the object to the array
          items.push(nestedParams);
        } catch (error) {
          // If nested parsing fails, store as string
          items.push(this.normalizeValue(itemValue));
        }
      } else {
        items.push(this.normalizeValue(itemValue));
      }
    }

    return items;
  }

  /**
   * Normalize parameter value by inferring type
   */
  private normalizeValue(value: string): any {
    const trimmed = value.trim();

    // Handle empty values
    if (!trimmed) return "";

    // Handle boolean values
    if (trimmed.toLowerCase() === "true") return true;
    if (trimmed.toLowerCase() === "false") return false;

    // Handle numeric values
    // if (!isNaN(Number(trimmed)) && trimmed !== "") {
    //   return Number(trimmed);
    // }

    // Handle JSON objects/arrays
    try {
      if (
        (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
        (trimmed.startsWith("[") && trimmed.endsWith("]"))
      ) {
        return JSON.parse(trimmed);
      }
    } catch {
      // If JSON parsing fails, return as string
    }

    return trimmed;
  }

  /**
   * Check if content has nested XML tags
   */
  private hasNestedTags(content: string): boolean {
    const tagPattern = /<([^>]+)>([\s\S]*?)<\/\1>/g;
    return tagPattern.test(content.trim());
  }

  /**
   * Validate tool name format
   */
  private isValidToolName(name: string): boolean {
    // Tool names should be lowercase with underscores
    return /^[a-z][a-z0-9_]*$/.test(name);
  }

  /**
   * Validate tool request format
   */
  public validateToolRequest(request: ParsedToolRequest): void {
    if (!request.toolName) {
      throw new XmlParseError("Missing tool name");
    }

    if (!request.serverName) {
      throw new XmlParseError("Missing server_name in tool request");
    }

    if (!request.arguments || typeof request.arguments !== "object") {
      throw new XmlParseError("Invalid or missing arguments in tool request");
    }

    // Validate server name format (allowing hyphen for server names)
    if (!/^[a-z][a-z0-9-]*$/.test(request.serverName)) {
      throw new XmlParseError(
        `Invalid server name format: ${request.serverName}`,
      );
    }

    // Validate tool name format
    if (!this.isValidToolName(request.toolName)) {
      throw new XmlParseError(`Invalid tool name format: ${request.toolName}`);
    }
  }
}

export class XmlParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "XmlParseError";
  }
}
