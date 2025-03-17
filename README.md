# MCPilot

A general-purpose system that executes tasks using MCP tooling through prompt-based interactions with LLMs.

## Features

- Multi-provider LLM support (OpenAI, Anthropic, Local models)
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
- `--auto-approve-tools` - Automatically approve MCP tool calls

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
    },
    "local": {  // Optional local model configuration
      "model": "llama2",
      "modelPath": "/path/to/model",
      "quantization": "q4_0",
      "contextSize": 4096,
      "threads": 4
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
        "enabled": true,
        "timeout": 3600,
        "type": "stdio"
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
        "enabled": true
      },
      "gitlab": {
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-gitlab"],
        "env": {
          "GITLAB_TOKEN": "your-token",
          "GITLAB_URL": "https://gitlab.com/api/v4"
        }
      }
    }
  }
}
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Testing

```bash
# Run all tests
npm test

# Run specific test suite
npm test -- --testPathPattern=session

# Run with coverage
npm test -- --coverage
```

## License

ISC License

## Credits

Built with:
- TypeScript
- Node.js
- Model Context Protocol