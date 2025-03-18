# MCPilot

A general-purpose system that executes tasks using MCP tooling through prompt-based interactions with LLMs.

## Features

- Multi-provider LLM support (OpenAI, Anthropic)
- Role-based interactions with customizable behaviors
- Robust session management with context preservation
- MCP (Model Context Protocol) server integration
- Comprehensive logging and configuration
- Interactive CLI interface

## Installation

```bash
npm install mcpilot
```

## Quick Start

### Programmatic Usage

```javascript
import { createSession, createProviderFactory, ProviderType } from 'mcpilot';

// Create a provider factory and get a provider instance
const factory = createProviderFactory();
const provider = factory.create(ProviderType.OPENAI, {
  name: 'openai',
  modelName: 'gpt-4',
  apiKey: process.env.OPENAI_API_KEY
});

// Initialize the provider
await provider.initialize();

// Create a new session with the provider
const session = await createSession({
  model: 'gpt-4',
  provider: provider, // Provider is now required
  logLevel: 'info'
});

// Execute a message
const response = await session.executeMessage("Create a React component for a user profile");

// Process the response
console.log(response.content.text);
```

### CLI Usage

Start a new session:
```bash
# Basic usage with instruction
mcpilot start "Create a new React component"

# Using a specific model
mcpilot start -m gpt-4 "Optimize this function"

# Load instructions from file
mcpilot start -i instructions.txt

# Use a specific role
mcpilot start -r architect "Design a new API"

# Custom config and roles
mcpilot start -c custom-config.json --roles-config custom-roles.json "Task description"

# Set working directory
mcpilot start -w /path/to/project "Create a component for this project"

# Auto-approve MCP tool calls
mcpilot start --auto-approve-tools "Generate code with MCP tools"
```

Resume a previous session:
```bash
mcpilot resume ./sessions/session_123.log "Continue the previous task"
```

### CLI Options

- `-m, --model <name>` - Specify the model to use
- `-l, --log-level <level>` - Set log level (debug|info|warn|error)
- `-c, --config <path>` - Path to config file (default: .mcpilot.config.json)
- `-r, --role <name>` - Role to use for the session
- `--roles-config <path>` - Path to roles config (default: .mcpilot-roles.json)
- `-w, --working-directory <path>` - Working directory for the session
- `-i, --instructions-file <path>` - Load instructions from a file
- `--auto-approve-tools` - Automatically approve MCP tool calls without prompting

## Configuration

### Main Configuration (.mcpilot.config.json)

```json
{
  "providers": {
    "openai": {
      "model": "gpt-4",
      "temperature": 0.7,
      "maxTokens": 2048,
      "apiKey": "your-api-key"  // Optional, can use env var
    },
    "anthropic": {
      "model": "claude-3-sonnet",
      "temperature": 1,
      "maxTokens": 4096,
      "apiKey": "your-api-key"  // Optional, can use env var
    }
  },
  "session": {
    "logDirectory": "./sessions",
    "contextSize": 4096,
    "maxQueueSize": 100,
    "defaultProvider": "openai"
  },
  "logging": {
    "level": "info",
    "format": "json",
    "file": "./logs/system.log",
    "maxFiles": 5,
    "maxSize": "10mb"
  },
  "mcp": {
    "servers": {
      "server-name": {
        "command": "command-to-run",
        "args": ["arg1", "arg2"],
        "env": {
          "ENV_VAR": "value"
        },
        "disabled": false,
        "timeout": 3600,
        "type": "stdio",
        "alwaysAllow": ["tool-name-to-auto-approve"]
      }
    }
  }
}
```

### Roles Configuration (.mcpilot-roles.json)

Define different personalities and behaviors for the AI:

```json
{
  "roles": {
    "developer": {
      "definition": "You are an expert software developer focused on writing clean, maintainable code.",
      "instructions": "Focus on code quality, documentation, and testing."
    },
    "architect": {
      "definition": "You are a software architect responsible for high-level system design.",
      "instructions": "Emphasize system design, scalability, and maintainability."
    },
    "reviewer": {
      "definition": "You are a code reviewer focused on maintaining code quality.",
      "instructions": "Look for potential bugs, design issues, and coding standards."
    }
  },
  "defaultRole": "developer"
}
```

## MCP Integration

MCPilot supports the Model Context Protocol (MCP) for tool integration. Configure MCP servers in the main config file under the `mcp.servers` section:

```json
{
  "mcp": {
    "servers": {
      "filesystem": {
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-filesystem", "${PWD}"],
        "disabled": false,
        "alwaysAllow": ["list_files", "read_file"]
      },
      "gitlab": {
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-gitlab"],
        "env": {
          "GITLAB_TOKEN": "your-token",
          "GITLAB_URL": "https://gitlab.com/api/v4"
        },
        "alwaysAllow": []
      }
    }
  }
}
```

### Auto-approving MCP Tools

You can configure specific tools to be auto-approved for each server using the `alwaysAllow` array in the server configuration. This is useful for tools that are frequently used and don't require user confirmation each time.

Alternatively, you can use the `--auto-approve-tools` CLI flag to auto-approve all tool calls for a session.

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Acknowledgments

This project is heavily inspired by these great tools:
- [Roo Code](https://github.com/RooVetGit/Roo-Code)
- [Codename Goose](https://block.github.io/goose/)
