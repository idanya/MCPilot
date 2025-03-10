/**
 * Tool catalog builder for MCP integration
 */

import { McpConfig, McpTool, ToolSchema, ToolExample } from "../../entities/mcp";

export interface ToolDocumentation {
  name: string;
  description: string;
  usage: string;
  examples: string[];
  schema: ToolSchema;
}

export interface ToolCatalog {
  tools: Record<string, ToolDocumentation>;
  servers: Record<string, string[]>; // server -> tool names mapping
}

export class ToolCatalogBuilder {
  private catalog: ToolCatalog = {
    tools: {},
    servers: {}
  };

  /**
   * Register tools from a server
   */
  public registerServerTools(serverName: string, tools: McpTool[]): void {
    this.catalog.servers[serverName] = tools.map(tool => tool.name);
    
    for (const tool of tools) {
      if (!this.catalog.tools[tool.name]) {
        this.catalog.tools[tool.name] = this.buildToolDocumentation(tool);
      }
    }
  }

  /**
   * Build tool documentation in XML format
   */
  private buildToolDocumentation(tool: McpTool): ToolDocumentation {
    const examples = this.buildExamples(tool);
    const usage = this.buildUsage(tool);

    return {
      name: tool.name,
      description: tool.description || '',
      usage,
      examples,
      schema: tool.inputSchema
    };
  }

  /**
   * Build XML-style usage documentation
   */
  private buildUsage(tool: McpTool): string {
    const paramLines = Object.entries(tool.inputSchema.properties || {})
      .map(([name, prop]) => {
        const required = tool.inputSchema.required?.includes(name) ? ' (required)' : ' (optional)';
        return `<${name}>${prop.description || `${name} value`}</${name}>${required}`;
      })
      .join('\n');

    return `<${tool.name}>\n${paramLines}\n</${tool.name}>`;
  }

  /**
   * Build example usages from tool examples
   */
  private buildExamples(tool: McpTool): string[] {
    const examples: string[] = [];

    // Add default example if no examples provided
    if (!tool.examples || tool.examples.length === 0) {
      const defaultExample = this.buildDefaultExample(tool);
      if (defaultExample) {
        examples.push(defaultExample);
      }
      return examples;
    }

    // Build examples from provided tool examples
    for (const example of tool.examples) {
      const xmlExample = this.buildExampleXml(tool.name, example);
      examples.push(xmlExample);
    }

    return examples;
  }

  /**
   * Build default example from schema
   */
  private buildDefaultExample(tool: McpTool): string | null {
    if (!tool.inputSchema.properties) return null;

    const params = Object.entries(tool.inputSchema.properties)
      .map(([name, prop]) => {
        let value = this.getDefaultValue(prop);
        return `<${name}>${value}</${name}>`;
      })
      .join('\n');

    return `<${tool.name}>\n${params}\n</${tool.name}>`;
  }

  /**
   * Build XML example from tool example
   */
  private buildExampleXml(toolName: string, example: ToolExample): string {
    const params = Object.entries(example.input)
      .map(([name, value]) => `<${name}>${value}</${name}>`)
      .join('\n');

    const description = example.description ? `// ${example.description}\n` : '';
    return `${description}<${toolName}>\n${params}\n</${toolName}>`;
  }

  /**
   * Get default value for schema property
   */
  private getDefaultValue(prop: any): string {
    if (prop.default !== undefined) return String(prop.default);
    
    switch (prop.type) {
      case 'string':
        return prop.example || 'example_string';
      case 'number':
        return prop.example || '0';
      case 'boolean':
        return prop.example || 'false';
      case 'array':
        return prop.example || '[]';
      case 'object':
        return prop.example || '{}';
      default:
        return 'value';
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
      servers: {}
    };
  }
}