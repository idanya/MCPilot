/**
 * System Prompt Enhancer for MCP integration
 */

import { ToolCatalogBuilder, ToolDocumentation } from "../mcp/tool-catalog";
import {
  buildToolUsageSection,
  buildToolUseGuidelinesSection,
  formatSection,
  buildFileSystemRestrictionsSection,
  buildFileSystemEnvironmentSection,
} from "./prompts";
import { listDirectoryContents } from "./utils";

interface PromptSection {
  title: string;
  content: string;
}

export class SystemPromptEnhancer {
  private toolCatalog: ToolCatalogBuilder;
  private basePrompt: string = "";
  private sections: PromptSection[] = [];
  private workingDirectory: string;

  constructor(toolCatalog: ToolCatalogBuilder, workingDirectory: string) {
    this.toolCatalog = toolCatalog;
    this.workingDirectory = workingDirectory;
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
  public async buildSystemPrompt(): Promise<string> {
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

    // Add tool usage section
    sections.push(buildToolUsageSection());
    sections.push(buildToolUseGuidelinesSection());

    // Add available tools section
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
        return this.formatToolDocumentation(doc);
      })
      .filter(Boolean);

    return formatSection("Available Tools", toolDocs.join("\n\n"));
  }

  /**
   * Format tool documentation
   */
  private formatToolDocumentation(doc: ToolDocumentation): string {
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
   * Clear all custom sections
   */
  public clearSections(): void {
    this.sections = [];
  }
}
