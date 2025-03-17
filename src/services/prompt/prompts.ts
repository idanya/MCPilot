export function formatSection(title: string, content: string): string {
  return `## ${title}\n\n${content}`;
}

export function buildToolUseGuidelinesSection(): string {
  return `# Tool Use Guidelines

1. In <thinking> tags, assess what information you already have and what information you need to proceed with the task.
2. Choose the most appropriate tool based on the task and the tool descriptions provided. Assess if you need additional information to proceed, and which of the available tools would be most effective for gathering this information. For example using the list_files tool is more effective than running a command like \`ls\` in the terminal. It's critical that you think about each available tool and use the one that best fits the current step in the task.
3. If multiple actions are needed, use one tool at a time per message to accomplish the task iteratively, with each tool use being informed by the result of the previous tool use. Do not assume the outcome of any tool use. Each step must be informed by the previous step's result.
4. Formulate your tool use using the XML format specified for each tool.
5. After each tool use, the user will respond with the result of that tool use. This result will provide you with the necessary information to continue your task or make further decisions. This response may include:
  - Information about whether the tool succeeded or failed, along with any reasons for failure.  
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

export function buildFileSystemRestrictionsSection(
  targetDirectory: string,
): string {
  return `# Filesystem Restrictions

You are STRICTLY confined to operating within this directory: ${targetDirectory}

- You cannot read, write, or access any files outside of this directory
- You CAN access files in subdirectories of this directory
- No matter what the user asks, you MUST NOT attempt to access files outside this directory
- If asked to access files outside this directory, explain that you are restricted to ${targetDirectory}
- This is a security measure that CANNOT be bypassed
- When accessing files in the workspace, you must provide the full path to the file

This restriction applies to all file operations including:
- Reading files
- Writing files
- Creating new files
- Searching files
- Listing files`;
}

export function buildFileSystemEnvironmentSection(files: string[]): string {
  return formatSection(
    "Current Working Directory Files (relative to workspace root)",
    files.map((file) => `- ${file}`).join("\n"),
  );
}

export function buildToolUsageSection(): string {
  const content = `Tools are invoked using XML-style tags. For MCP tools, format the request as:

<use_mcp_tool>
<server_name>Target server that will execute the tool</server_name>
<tool_name>Name of the tool to execute</tool_name>
<arguments>
<parameterName>parameterValue</parameterName>
<anotherParam>123</anotherParam>
</arguments>
</use_mcp_tool>

For regular tools, format as:

<tool_name>
<parameter1_name>value1</parameter1_name>
<parameter2_name>value2</parameter2_name>
</tool_name>

Only a single tool can be called in a single response. Parameters marked as (required) must be included.
For MCP tools, all parameters must be specified in valid JSON format within the arguments tag.
The following response will include the tool's output or any error messages.
When executing a tool, make sure the tool execution data is the only data in the response. Wait for the tool to finish executing before sending the next tool request.

Examples:

MCP tool:
<use_mcp_tool>
<server_name>weather-server</server_name>
<tool_name>get_forecast</tool_name>
<arguments>
<city>San Francisco</city>
<days>5</days>
</arguments>
</use_mcp_tool>

Regular tool:
<read_file>
<path>example.txt</path>
</read_file>`;

  return formatSection("Tool Usage Instructions", content);
}
