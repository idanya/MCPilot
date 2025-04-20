/**
 * System Prompt Enhancer for MCP integration
 */

import { ToolCatalogBuilder, ToolDocumentation as McpToolDocumentation } from "../mcp/tool-catalog.ts";
import {
  buildToolUsageSection,
  buildToolUseGuidelinesSection,
  formatSection,
  buildFileSystemRestrictionsSection,
  buildFileSystemEnvironmentSection,
} from "./prompts.ts";
import { listDirectoryContents } from "./utils.ts";
import { InternalToolsManager } from "../tools/internal-tools-manager.ts";
import { RoleConfigLoader } from "../config/role-config-loader.ts";
import { ToolDocumentation as InternalToolDocumentation, ToolExample } from "../../interfaces/tools/internal-tool.ts";
import { ToolProperty } from "../mcp/types.ts";

interface PromptSection {
  title: string;
  content: string;
}

export class SystemPromptEnhancer {
  private toolCatalog: ToolCatalogBuilder;
  private basePrompt: string = "";
  private sections: PromptSection[] = [];
  private workingDirectory: string;
  private internalToolsManager?: InternalToolsManager;
  private roleConfigLoader?: RoleConfigLoader;

  constructor(
    toolCatalog: ToolCatalogBuilder, 
    workingDirectory: string,
    internalToolsManager?: InternalToolsManager,
    roleConfigLoader?: RoleConfigLoader
  ) {
    this.toolCatalog = toolCatalog;
    this.workingDirectory = workingDirectory;
    this.internalToolsManager = internalToolsManager;
    this.roleConfigLoader = roleConfigLoader;
  }

  /**
   * Set base system prompt
   */
  public setBasePrompt(prompt: string): void {
    this.basePrompt = prompt;
  }

  /**
   * Add a custom section
   */
  public addSection(section: PromptSection): void {
    this.sections.push(section);
  }

  /**
   * Build system prompt with tool documentation
   */
  public async buildSystemPrompt(isChildSession: boolean = false): Promise<string> {
    const sections: string[] = [this.basePrompt];

    // Add filesystem restrictions and environment
    sections.push(buildFileSystemRestrictionsSection(this.workingDirectory));
    sections.push(
      buildFileSystemEnvironmentSection(
        await listDirectoryContents(this.workingDirectory),
      ),
    );

    // Add custom sections
    for (const section of this.sections) {
      sections.push(formatSection(section.title, section.content));
    }

    // Add session-specific instructions
    if (isChildSession) {
      sections.push(formatSection(
        "Child Session Instructions",
        "You are operating in a child session created by a parent session. " +
        "Complete your assigned task thoroughly and when finished, you MUST use the " +
        "finish_child_session tool to report back to the parent session with a summary " +
        "of your work. The parent session is waiting for your results.\n\n" +
        "You can also create your own child sessions using the run_child_session tool " +
        "if your task requires delegating work to other specialized roles."
      ));
    } else {
      sections.push(formatSection(
        "Session Management",
        "You can create child sessions to handle specialized subtasks using the " +
        "run_child_session tool. Child sessions will execute in parallel and report " +
        "back when complete. This is useful for delegating tasks that require different " +
        "expertise or system prompts than your current role. Child sessions can also " +
        "create their own child sessions if needed for complex tasks."
      ));
    }

    // Add available roles section so the model knows what roles can be used
    const rolesSection = this.buildAvailableRolesSection();
    if (rolesSection) {
      sections.push(rolesSection);
    }

    // Add tool usage section
    sections.push(buildToolUsageSection());
    sections.push(buildToolUseGuidelinesSection());

    // Add internal tools section if available
    const internalToolsSection = this.buildInternalToolsSection();
    if (internalToolsSection) {
      sections.push(internalToolsSection);
    }

    // Add available MCP tools section
    sections.push(this.buildAvailableToolsSection());

    return sections.join("\n\n");
  }

  /**
   * Build available tools section
   */
  private buildAvailableToolsSection(): string {
    const tools = this.toolCatalog.getAllTools();
    if (tools.length === 0) {
      return formatSection(
        "Available Tools",
        "No tools are currently available.",
      );
    }

    const toolDocs = tools
      .map((toolName) => {
        const doc = this.toolCatalog.getToolDocumentation(toolName);
        if (!doc) return "";
        return this.formatMcpToolDocumentation(doc);
      })
      .filter(Boolean);

    return formatSection("Available Tools", toolDocs.join("\n\n"));
  }

  /**
   * Build internal tools section
   */
  private buildInternalToolsSection(): string {
    if (!this.internalToolsManager) {
      return "";
    }
    
    const tools = this.internalToolsManager.getToolsDocumentation();
    if (tools.length === 0) {
      return "";
    }
    
    const toolDocs = tools
      .map(tool => this.formatInternalToolDocumentation(tool))
      .join("\n\n");
    
    return formatSection("Internal Tools", toolDocs);
  }

  /**
   * Build available roles section
   */
  private buildAvailableRolesSection(): string {
    if (!this.roleConfigLoader) {
      return "";
    }
    
    try {
      const rolesList = this.roleConfigLoader.getAllRoles();
      if (rolesList.length === 0) {
        return "";
      }
      
      // Get each role's brief definition to include in the list
      const rolesContent = rolesList.map(roleName => {
        const role = this.roleConfigLoader?.getRole(roleName);
        // Extract first line or sentence of the definition as a brief description
        const briefDescription = role?.definition.split('.')[0] || "No description available";
        return `- **${roleName}**: ${briefDescription}.`;
      }).join("\n\n");
      
      return formatSection("Available Roles",
        "The following roles are available for creating child sessions using the run_child_session tool:\n\n" +
        rolesContent
      );
    } catch (error) {
      // If there's an error getting roles, return empty string
      return "";
    }
  }

  /**
   * Format MCP tool documentation
   */
  private formatMcpToolDocumentation(doc: McpToolDocumentation): string {
    let content = `### ${doc.name}\n\n`;

    // Add description
    if (doc.description) {
      content += `${doc.description}\n\n`;
    }

    // Add parameters
    if (
      doc.schema.properties &&
      Object.keys(doc.schema.properties).length > 0
    ) {
      content += "Parameters:\n\n";
      for (const [name, prop] of Object.entries(doc.schema.properties)) {
        const required = doc.schema.required?.includes(name)
          ? " (required)"
          : "";
        content += `- ${name}${required}: ${prop.description || "No description"}\n`;
      }
      content += "\n";
    }

    // Add usage
    content += "Usage:\n\n```\n";
    content += doc.usage;
    content += "\n```\n\n";

    // Add examples
    if (doc.examples.length > 0) {
      content += "Examples:\n\n```\n";
      content += doc.examples[0]; // Add first example
      content += "\n```";
    }

    return content;
  }

  /**
   * Format internal tool documentation
   */
  private formatInternalToolDocumentation(doc: InternalToolDocumentation): string {
    let content = `### ${doc.name}\n\n`;

    // Add description
    if (doc.description) {
      content += `${doc.description}\n\n`;
    }

    // Add parameters
    if (
      doc.schema.properties &&
      Object.keys(doc.schema.properties).length > 0
    ) {
      content += "Parameters:\n\n";
      for (const [name, prop] of Object.entries(doc.schema.properties)) {
        const required = doc.schema.required?.includes(name)
          ? " (required)"
          : "";
        content += `- ${name}${required}: ${prop.description || "No description"}\n`;
      }
      content += "\n";
    }

    // Add usage example
    content += "Usage:\n\n```\n";
    // For internal tools, use <use_tool> format
    content += `<use_tool>\n<tool_name>${doc.name}</tool_name>\n<parameters>\n`;
    // Add example parameters
    if (doc.schema.properties) {
      for (const [name, prop] of Object.entries(doc.schema.properties)) {
        if (doc.schema.required?.includes(name)) {
          content += `<${name}>Example ${prop.description}</${name}>\n`;
        }
      }
    }
    content += "</parameters>\n</use_tool>";
    content += "\n```\n\n";

    // Add examples
    if (doc.examples && doc.examples.length > 0) {
      content += "Examples:\n\n";
      for (const example of doc.examples) {
        content += `- ${example.description || "Example"}:\n\n\`\`\`\n${example.usage}\n\`\`\`\n\n`;
      }
    }

    return content;
  }

  /**
   * Clear all custom sections
   */
  public clearSections(): void {
    this.sections = [];
  }
}
