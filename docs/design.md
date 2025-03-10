
# Abstract
This agent is designed as a general-purpose system that executes tasks using MCP tooling exclusively through prompt-based interactions, without relying on special API features like tool_use.

At the start of each session, all available tools—along with their descriptions and parameters—are provided based on user intent. The agent receives structured instructions on how to use these tools and responds with a predefined JSON format when tool execution is required. Multiple tools can be invoked in a single request, ensuring efficient task execution.

All tool logic is managed by MCPs, while the agent itself operates through a general interface that abstracts the connection to the underlying LLM. This interface supports multiple LLMs (both remote and local) in a modular, plugin-based architecture.  

The agent includes a CLI interface for initiating and interacting with LLM sessions. Each session logs all messages in JSON format, allowing for session restoration using the log file path to fully reconstruct the context.


# Initial prompt sections

## Static
A folder with initial prompts will be defined, each file in the folder is a section in the initial prompt. The file name is the section title, the content is the actual text under the section title in the prompt. 

### Rules
There will be a RULES section in the initial prompt that will guide the LLM about the base rules of what it can and can't do. also what it must not do even if asked. 

## Dynamic
Dynamic sections for initial prompt can contain environment information, current directory files listing, OS, time and more... this will be generated up on session start depending on the running environment. 

### MCP
MCPs are configurable by the agent config file. MCP config format:
```
extensions: // the extensions container
  gitlab: // the extension name
    cmd: npx // the command to run
    args: // args to be sent to the command
    - -y
    - '@modelcontextprotocol/server-gitlab'    
    enabled: false 
    envs: // environment variables
      GITLAB_PERSONAL_ACCESS_TOKEN: ***
    name: gitlab
    timeout: null
    type: stdio
```

Enabled MCPs are sent in the first message prompt when a session begins. 
The initial prompt will contain a section with all MCPs and their functions.
For all tools (if there are any), the prompt will have a section called "tool use" that explains the agent how it can activate the tools.
example format for running a tool function:
```
<tool_name>
<parameter1_name>value1</parameter1_name>
<parameter2_name>value2</parameter2_name>
</tool_name>
```
Multiple tools can be activated in a single message from the LLM.
Example for running the read_file tool: 
```
<read_file>
<path>src/main.js</path>
</read_file>
```

Right after the explanations, there will be a "tools" section defining the llm with the available tools. For example:
```
## read_file

Description: Request to read the contents of a file at the specified path. Use this when you need to examine the contents of an existing file you do not know the contents of, for example to analyze code, review text files, or extract information from configuration files. The output includes line numbers prefixed to each line (e.g. \\\"1 | const x = 1\\\"), making it easier to reference specific lines when creating diffs or discussing code. Automatically extracts raw text from PDF and DOCX files. May not be suitable for other types of binary files, as it returns the raw content as a string.

Parameters:

- path: (required) The path of the file to read (relative to the current working directory /path to dir)

Usage:

<read_file>
<path>File path here</path>
</read_file>


Example: Requesting to read frontend-config.json

<read_file>
<path>frontend-config.json</path>
</read_file>
```

All the tools definitions and examples are a product from the list of tools each available MCP server provides. 


# logging

Each message when received and when sent, is saved to a log file under /sessions directory with a unique random id in JSON format. The log should reflect the context of the session / thread. a session can be resumed by providing the log file. upon resume, the entire log JSON will be set as the messages in the new thread context and a new message will be appended by the user

# LLM interface
[Interface](https://github.com/RooVetGit/Roo-Code/blob/main/src/api/providers/base-provider.ts)
[Providers from roo](https://github.com/RooVetGit/Roo-Code/tree/main/src/api/providers)

# MCP provider

The MpcHub used by roo - extracted and used [McpHub](https://github.com/RooVetGit/Roo-Code/blob/main/src/services/mcp/McpHub.ts)




