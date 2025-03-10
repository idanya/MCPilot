/**
 * System Prompt Enhancer for MCP integration
 */

import { ToolCatalogBuilder, ToolDocumentation } from "../mcp/tool-catalog";

export interface PromptSection {
  title: string;
  content: string;
}

export class SystemPromptEnhancer {
  private toolCatalog: ToolCatalogBuilder;
  private basePrompt: string = "";
  private sections: PromptSection[] = [];

  constructor(toolCatalog: ToolCatalogBuilder) {
    this.toolCatalog = toolCatalog;
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
  public buildSystemPrompt(): string {
    const sections: string[] = [this.basePrompt];

    // Add custom sections
    for (const section of this.sections) {
      sections.push(this.formatSection(section.title, section.content));
    }

    // Add tool usage section
    sections.push(this.buildToolUsageSection());
    sections.push(this.buildToolUseGuidelinesSection());

    // Add available tools section
    sections.push(this.buildAvailableToolsSection());

    return sections.join("\n\n");
  }

  /**
   * Format a section with title
   */
  private formatSection(title: string, content: string): string {
    return `## ${title}\n\n${content}`;
  }

  private buildToolUseGuidelinesSection(): string {
    return `# Tool Use Guidelines
  
  1. In <thinking> tags, assess what information you already have and what information you need to proceed with the task.
  2. Choose the most appropriate tool based on the task and the tool descriptions provided. Assess if you need additional information to proceed, and which of the available tools would be most effective for gathering this information. For example using the list_files tool is more effective than running a command like \`ls\` in the terminal. It's critical that you think about each available tool and use the one that best fits the current step in the task.
  3. If multiple actions are needed, use one tool at a time per message to accomplish the task iteratively, with each tool use being informed by the result of the previous tool use. Do not assume the outcome of any tool use. Each step must be informed by the previous step's result.
  4. Formulate your tool use using the XML format specified for each tool.
  5. After each tool use, the user will respond with the result of that tool use. This result will provide you with the necessary information to continue your task or make further decisions. This response may include:
    - Information about whether the tool succeeded or failed, along with any reasons for failure.
    - Linter errors that may have arisen due to the changes you made, which you'll need to address.
    - New terminal output in reaction to the changes, which you may need to consider or act upon.
    - Any other relevant feedback or information related to the tool use.
  6. ALWAYS wait for user confirmation after each tool use before proceeding. Never assume the success of a tool use without explicit confirmation of the result from the user.
  
  It is crucial to proceed step-by-step, waiting for the user's message after each tool use before moving forward with the task. This approach allows you to:
  1. Confirm the success of each step before proceeding.
  2. Address any issues or errors that arise immediately.
  3. Adapt your approach based on new information or unexpected results.
  4. Ensure that each action builds correctly on the previous ones.
  
  By waiting for and carefully considering the user's response after each tool use, you can react accordingly and make informed decisions about how to proceed with the task. This iterative process helps ensure the overall success and accuracy of your work.`;
  }
  /**
   * Build the tool usage instruction section
   */
  private buildToolUsageSection(): string {
    const content = `Tools are invoked using XML-style tags. Each tool call should be formatted as:

<tool_name>
<parameter1_name>value1</parameter1_name>
<parameter2_name>value2</parameter2_name>
</tool_name>

Only a single tool can be called in a single response. Parameters marked as (required) must be included.
The following response will include the tool's output or any error messages.
When executing a tool, make sure the tool execution data in the only data in the response. wait for the tool to finish executing before sending the next tool request. 


Example:
<read_file>
<path>example.txt</path>
</read_file>`;

    return this.formatSection("Tool Usage Instructions", content);
  }

  /**
   * Build available tools section
   */
  private buildAvailableToolsSection(): string {
    const tools = this.toolCatalog.getAllTools();
    if (tools.length === 0) {
      return this.formatSection(
        "Available Tools",
        "No tools are currently available."
      );
    }

    const toolDocs = tools
      .map((toolName) => {
        const doc = this.toolCatalog.getToolDocumentation(toolName);
        if (!doc) return "";
        return this.formatToolDocumentation(doc);
      })
      .filter(Boolean);

    return this.formatSection("Available Tools", toolDocs.join("\n\n"));
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
   * Add a server's tools to the documentation
   */
  public addServerTools(serverName: string): void {
    const tools = this.toolCatalog.getServerTools(serverName);
    if (tools.length > 0) {
      this.addSection({
        title: `${serverName} Tools`,
        content:
          `The following tools are available from ${serverName}:\n\n` +
          tools.map((tool) => `- ${tool}`).join("\n"),
      });
    }
  }

  /**
   * Add examples section
   */
  public addExamplesSection(): void {
    const examples = this.getAllToolExamples();
    if (examples.length > 0) {
      this.addSection({
        title: "Tool Examples",
        content: examples.join("\n\n"),
      });
    }
  }

  /**
   * Get all tool examples
   */
  private getAllToolExamples(): string[] {
    const examples: string[] = [];
    for (const toolName of this.toolCatalog.getAllTools()) {
      const doc = this.toolCatalog.getToolDocumentation(toolName);
      if (doc?.examples && doc.examples.length > 0) {
        examples.push(
          `${doc.name} Example:\n\`\`\`\n${doc.examples[0]}\n\`\`\``
        );
      }
    }
    return examples;
  }

  /**
   * Clear all custom sections
   */
  public clearSections(): void {
    this.sections = [];
  }
}
