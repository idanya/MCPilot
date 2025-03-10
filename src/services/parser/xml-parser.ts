/**
 * XML-style tool request parser
 */

export interface XmlNode {
  tag: string;
  content: string | XmlNode[];
}

export interface ParsedToolRequest {
  toolName: string;
  parameters: Record<string, any>; // Changed to any to support nested structures
  raw: string;
}

export class XmlParser {
  /**
   * Parse XML-style tool requests from text
   */
  public parseToolRequests(text: string): ParsedToolRequest[] {
    const requests: ParsedToolRequest[] = [];
    // Modified pattern to be more strict about what constitutes a tool request
    const pattern = /(?:^|\s)(<([a-z][a-z0-9_]*?)>[\s\S]*?<\/\2>)(?:\s|$)/gm;
    let match;

    while ((match = pattern.exec(text)) !== null) {
      const [, fullMatch] = match;
      try {
        const request = this.parseToolRequest(fullMatch);
        requests.push(request);
      } catch (error) {
        if (error instanceof XmlParseError) {
          console.warn(`Skipping invalid tool request: ${error.message}`);
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
    const toolMatch = /<([^>]+)>([\s\S]*?)<\/\1>/g.exec(text);
    if (!toolMatch) {
      throw new XmlParseError("Invalid tool request format");
    }

    const [, toolName, content] = toolMatch;
    if (!this.isValidToolName(toolName)) {
      throw new XmlParseError(`Invalid tool name: ${toolName}`);
    }

    const parameters = this.parseParameters(content);
    const request = {
      toolName,
      parameters,
      raw: text,
    };

    this.validateToolRequest(request);
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

      // Try to parse nested parameters
      if (this.hasNestedTags(paramValue)) {
        try {
          parameters[paramName] = this.parseParameters(paramValue);
        } catch (error) {
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
    if (!isNaN(Number(trimmed)) && trimmed !== "") {
      return Number(trimmed);
    }

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

    if (!this.isValidToolName(request.toolName)) {
      throw new XmlParseError(`Invalid tool name format: ${request.toolName}`);
    }

    if (!request.parameters || Object.keys(request.parameters).length === 0) {
      throw new XmlParseError("No parameters found in tool request");
    }

    // Validate parameter names
    for (const paramName of Object.keys(request.parameters)) {
      if (!/^[a-z][a-z0-9_]*$/.test(paramName)) {
        throw new XmlParseError(`Invalid parameter name: ${paramName}`);
      }
    }
  }

  /**
   * Format tool request as XML
   */
  public formatToolRequest(
    toolName: string,
    parameters: Record<string, any>
  ): string {
    const formatValue = (value: any): string => {
      if (value === null || value === undefined) return "";
      if (typeof value === "object") {
        return (
          "\n" +
          Object.entries(value)
            .map(([k, v]) => `<${k}>${formatValue(v)}</${k}>`)
            .join("\n") +
          "\n"
        );
      }
      return String(value);
    };

    const paramXml = Object.entries(parameters)
      .map(([name, value]) => `<${name}>${formatValue(value)}</${name}>`)
      .join("\n");

    return `<${toolName}>\n${paramXml}\n</${toolName}>`;
  }
}

export class XmlParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "XmlParseError";
  }
}
