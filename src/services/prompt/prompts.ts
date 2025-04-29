export function formatSection(title: string, content: string): string {
  return `## ${title}\n\n${content}`;
}

export function buildToolUseGuidelinesSection(): string {
  return `# Tool Use Guidelines

1.	When you need to interact with the user or want the user to see any output, you must use <user_interaction> tags.
	2.	You must wait for the user’s response after using a <user_interaction> tag.
	3.	You cannot use more than one <user_interaction> tag per message.
	4.	Any content outside of <user_interaction> tags is invisible to the user. Do not place any meaningful information outside of these tags.
	5.	Choose the most appropriate tool based on the task and tool descriptions provided. Think carefully about which tool fits best at each step. Example: prefer using list_files instead of terminal commands like ls.
	6.	You can use only one tool per message.
If multiple tool actions are needed, perform them one at a time, each in a separate message after receiving the user’s response.
	7.	Formulate your tool usage in the XML format specified for each tool.
	8.	When using an MCP tool, it must be the last thing in the message. No other content should follow after an MCP tool use.
	9.	After each tool use, wait for the user’s confirmation before proceeding. Never assume a tool’s success — always rely on the user’s explicit feedback.
The user’s response may include:
	•	Confirmation of success or failure, with reasons if applicable.
	•	New output or information to consider.
	•	Any other relevant feedback.

Always proceed step-by-step, waiting for the user after each action. This ensures:
	•	Each step is correctly completed before moving forward.
	•	Immediate handling of any errors or unexpected results.
	•	Continuous adjustment based on real feedback.
	•	Maximum accuracy and reliability.
  
  `;
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
