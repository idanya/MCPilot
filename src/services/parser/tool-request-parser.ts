import { McpHub } from "../mcp/mcp-hub.ts";
import { ParameterValidator } from "./parameter-validator.ts";
import { ParsedToolRequest, XmlParser } from "./xml-parser.ts";

interface ServerHealth {
  name: string;
  status: "healthy" | "degraded" | "unhealthy";
  lastCheck: Date;
  responseTime: number;
}

interface RoutingStrategy {
  type: "roundRobin" | "leastLoaded" | "fastestResponse";
  timeout: number;
}

export class ToolRequestParser {
  private xmlParser: XmlParser;
  private paramValidator: ParameterValidator;
  private mcpHub: McpHub;
  private serverHealth: Map<string, ServerHealth>;
  private lastUsedServer: number;
  private routingStrategy: RoutingStrategy;

  constructor(mcpHub: McpHub) {
    this.xmlParser = new XmlParser();
    this.paramValidator = new ParameterValidator();
    this.mcpHub = mcpHub;
    this.serverHealth = new Map();
    this.lastUsedServer = -1;
    this.routingStrategy = {
      type: "roundRobin",
      timeout: 30000, // 30 second default timeout
    };

    // Start health checking
    this.initializeHealthChecks();
  }

  /**
   * Parse and validate a tool request
   */
  public async parseRequest(input: string): Promise<ParsedToolRequest[]> {
    try {
      // Parse XML requests
      const requests = this.xmlParser.parseToolRequests(input);

      // Validate each request
      for (const request of requests) {
        await this.validateRequest(request);
      }

      return requests;
    } catch (error: unknown) {
      throw new ToolRequestError("Failed to parse request", {
        code: "PARSE_ERROR",
        cause: error instanceof Error ? error : new Error(String(error)),
      });
    }
  }

  /**
   * Validate a parsed tool request
   */
  private async validateRequest(request: ParsedToolRequest): Promise<void> {
    // Get tool schema from catalog
    const toolCatalog = this.mcpHub.getToolCatalog();
    const toolInfo = toolCatalog.getToolDocumentation(request.toolName);

    if (!toolInfo) {
      throw new ToolRequestError(`Unknown tool: ${request.toolName}`, {
        code: "UNKNOWN_TOOL",
      });
    }

    // Validate the converted arguments
    const result = this.paramValidator.validate(
      request.arguments,
      toolInfo.schema,
    );

    if (!result.isValid) {
      throw new ToolRequestError("Invalid parameters", {
        code: "VALIDATION_ERROR",
        details: result.errors,
      });
    }
  }

  /**
   * Initialize server health checking
   */
  private initializeHealthChecks(): void {
    // Initial health check
    this.checkAllServersHealth();

    // Schedule periodic health checks
    setInterval(() => {
      this.checkAllServersHealth();
    }, 30000); // Check every 30 seconds
  }

  /**
   * Check health of all servers
   */
  private async checkAllServersHealth(): Promise<void> {
    const servers = this.mcpHub.getServers();

    for (const server of servers) {
      try {
        const startTime = Date.now();

        // Ping server by listing tools
        await this.mcpHub.callTool(server.name, "tools/list");

        const responseTime = Date.now() - startTime;

        this.serverHealth.set(server.name, {
          name: server.name,
          status: responseTime < 1000 ? "healthy" : "degraded",
          lastCheck: new Date(),
          responseTime,
        });
      } catch {
        this.serverHealth.set(server.name, {
          name: server.name,
          status: "unhealthy",
          lastCheck: new Date(),
          responseTime: Infinity,
        });
      }
    }
  }

  /**
   * Update routing strategy
   */
  public setRoutingStrategy(strategy: RoutingStrategy): void {
    this.routingStrategy = strategy;
  }

  /**
   * Get current server health status
   */
  public getServerHealth(): Map<string, ServerHealth> {
    return new Map(this.serverHealth);
  }
}

export class ToolRequestError extends Error {
  code: string;
  details?: any;

  constructor(
    message: string,
    options: {
      code: string;
      cause?: Error;
      details?: any;
    },
  ) {
    super(message);
    if (options.cause) {
      Object.defineProperty(this, "cause", {
        value: options.cause,
        writable: true,
        configurable: true,
      });
    }
    this.name = "ToolRequestError";
    this.code = options.code;
    this.details = options.details;
  }
}
