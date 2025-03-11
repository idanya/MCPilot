/**
 * Tool catalog builder for MCP integration
 */

import { McpTool, ToolExample, ToolSchema } from "./types";

export interface ToolDocumentation {
  serverName: string;
  name: string;
  description: string;
  usage: string;
  examples: string[];
  schema: ToolSchema;
}

interface ToolCatalog {
  tools: Record<string, ToolDocumentation>;
  servers: Record<string, string[]>; // server -> tool names mapping
}

export class ToolCatalogBuilder {
  private catalog: ToolCatalog = {
    tools: {},
    servers: {},
  };

  /**
   * Register tools from a server
   */
  public registerServerTools(serverName: string, tools: McpTool[]): void {
    this.catalog.servers[serverName] = tools.map((tool) => tool.name);

    for (const tool of tools) {
      if (!this.catalog.tools[tool.name]) {
        this.catalog.tools[tool.name] = this.buildToolDocumentation(
          serverName,
          tool,
        );
      }
    }
  }

  /**
   * Build tool documentation in XML format
   */
  private buildToolDocumentation(
    serverName: string,
    tool: McpTool,
  ): ToolDocumentation {
    const examples = this.buildExamples(serverName, tool);
    const usage = this.buildUsage(serverName, tool);

    return {
      serverName,
      name: tool.name,
      description: tool.description || "",
      usage,
      examples,
      schema: tool.inputSchema,
    };
  }

  /**
   * Build usage documentation with MCP format
   */
  private buildUsage(serverName: string, tool: McpTool): string {
    const args: Record<string, string> = {};
    Object.entries(tool.inputSchema.properties || {}).forEach(
      ([name, prop]) => {
        args[name] = prop.description || `${name} value`;
      },
    );

    return `<use_mcp_tool>
<server_name>${serverName}</server_name>
<tool_name>${tool.name}</tool_name>
<arguments>
${JSON.stringify(args, null, 2)}
</arguments>
</use_mcp_tool>`;
  }

  /**
   * Build example usages from tool examples
   */
  private buildExamples(serverName: string, tool: McpTool): string[] {
    const examples: string[] = [];

    // Add default example if no examples provided
    if (!tool.examples || tool.examples.length === 0) {
      const defaultExample = this.buildDefaultExample(serverName, tool);
      if (defaultExample) {
        examples.push(defaultExample);
      }
      return examples;
    }

    // Build examples from provided tool examples
    for (const example of tool.examples) {
      const xmlExample = this.buildExampleXml(serverName, tool.name, example);
      examples.push(xmlExample);
    }

    return examples;
  }

  /**
   * Build default example with MCP format
   */
  private buildDefaultExample(
    serverName: string,
    tool: McpTool,
  ): string | null {
    if (!tool.inputSchema.properties) return null;

    const args: Record<string, any> = {};
    Object.entries(tool.inputSchema.properties).forEach(([name, prop]) => {
      args[name] = this.getDefaultValue(prop);
    });

    return `<use_mcp_tool>
<server_name>${serverName}</server_name>
<tool_name>${tool.name}</tool_name>
<arguments>
${JSON.stringify(args, null, 2)}
</arguments>
</use_mcp_tool>`;
  }

  /**
   * Build MCP example from tool example
   */
  private buildExampleXml(
    serverName: string,
    toolName: string,
    example: ToolExample,
  ): string {
    const description = example.description
      ? `// ${example.description}\n`
      : "";

    return `${description}<use_mcp_tool>
<server_name>${serverName}</server_name>
<tool_name>${toolName}</tool_name>
<arguments>
${JSON.stringify(example.input, null, 2)}
</arguments>
</use_mcp_tool>`;
  }

  /**
   * Get default value for schema property
   */
  private getDefaultValue(prop: any): string {
    if (prop.default !== undefined) return String(prop.default);

    switch (prop.type) {
      case "string":
        return prop.example || "example_string";
      case "number":
        return prop.example || "0";
      case "boolean":
        return prop.example || "false";
      case "array":
        return prop.example || "[]";
      case "object":
        return prop.example || "{}";
      default:
        return "value";
    }
  }

  /**
   * Get tool documentation
   */
  public getToolDocumentation(toolName: string): ToolDocumentation | undefined {
    return this.catalog.tools[toolName];
  }

  /**
   * Get all available tools
   */
  public getAllTools(): string[] {
    return Object.keys(this.catalog.tools);
  }

  /**
   * Get tools available on a server
   */
  public getServerTools(serverName: string): string[] {
    return this.catalog.servers[serverName] || [];
  }

  /**
   * Check if tool is available on server
   */
  public isToolAvailable(serverName: string, toolName: string): boolean {
    return this.getServerTools(serverName).includes(toolName);
  }

  /**
   * Get complete catalog
   */
  public getCatalog(): ToolCatalog {
    return this.catalog;
  }

  /**
   * Clear catalog
   */
  public clear(): void {
    this.catalog = {
      tools: {},
      servers: {},
    };
  }
}
