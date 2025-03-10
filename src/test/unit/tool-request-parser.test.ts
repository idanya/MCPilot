import { ToolRequestParser, ToolRequestError } from '../../services/parser/tool-request-parser';
import { McpHub } from '../../services/mcp/McpHub';
import { ToolCatalogBuilder } from '../../services/mcp/tool-catalog';
import { McpServer } from '../../entities/mcp';

// Mock McpHub and dependencies
jest.mock('../../services/mcp/McpHub');
const MockMcpHub = McpHub as jest.MockedClass<typeof McpHub>;

describe('ToolRequestParser', () => {
  let parser: ToolRequestParser;
  let mockHub: jest.Mocked<McpHub>;
  let mockCatalog: jest.Mocked<ToolCatalogBuilder>;

  beforeEach(() => {
    // Reset mocks
    MockMcpHub.mockClear();

    // Create mock catalog
    mockCatalog = {
      getToolDocumentation: jest.fn(),
      registerServerTools: jest.fn(),
      getAllTools: jest.fn(),
      getServerTools: jest.fn(),
      isToolAvailable: jest.fn(),
      getCatalog: jest.fn(),
      clear: jest.fn()
    } as unknown as jest.Mocked<ToolCatalogBuilder>;

    // Create mock hub
    mockHub = {
      getToolCatalog: jest.fn().mockReturnValue(mockCatalog),
      getServers: jest.fn(),
      callTool: jest.fn()
    } as unknown as jest.Mocked<McpHub>;

    // Create parser instance
    parser = new ToolRequestParser(mockHub);
  });

  describe('parseRequest', () => {
    it('should successfully parse valid tool request', async () => {
      // Setup mock tool documentation
      mockCatalog.getToolDocumentation.mockReturnValue({
        name: 'test_tool',
        description: 'Test tool',
        usage: '',
        examples: [],
        schema: {
          type: 'object',
          properties: {
            param1: { type: 'string' }
          },
          required: ['param1']
        }
      });

      const request = `
        <test_tool>
          <param1>test value</param1>
        </test_tool>
      `;

      const result = await parser.parseRequest(request);
      
      expect(result).toHaveLength(1);
      expect(result[0].toolName).toBe('test_tool');
      expect(result[0].parameters).toHaveProperty('param1', 'test value');
    });

    it('should throw error for unknown tool', async () => {
      mockCatalog.getToolDocumentation.mockReturnValue(undefined);

      const request = `
        <unknown_tool>
          <param1>test</param1>
        </unknown_tool>
      `;

      await expect(parser.parseRequest(request)).rejects.toThrow(ToolRequestError);
      await expect(parser.parseRequest(request)).rejects.toHaveProperty('code', 'UNKNOWN_TOOL');
    });

    it('should throw error for invalid parameters', async () => {
      mockCatalog.getToolDocumentation.mockReturnValue({
        name: 'test_tool',
        description: 'Test tool',
        usage: '',
        examples: [],
        schema: {
          type: 'object',
          properties: {
            param1: { type: 'number' }
          },
          required: ['param1']
        }
      });

      const request = `
        <test_tool>
          <param1>not a number</param1>
        </test_tool>
      `;

      await expect(parser.parseRequest(request)).rejects.toThrow(ToolRequestError);
      await expect(parser.parseRequest(request)).rejects.toHaveProperty('code', 'VALIDATION_ERROR');
    });
  });

  describe('routeRequest', () => {
    const mockServers: McpServer[] = [
      {
        name: 'server1',
        status: 'connected',
        disabled: false,
        tools: [],
        resources: [],
        resourceTemplates: [],
        config: {
          name: 'server1',
          version: '1.0.0',
          command: 'test',
          args: [],
          type: 'stdio',
          enabled: true
        }
      },
      {
        name: 'server2',
        status: 'connected',
        disabled: false,
        tools: [],
        resources: [],
        resourceTemplates: [],
        config: {
          name: 'server2',
          version: '1.0.0',
          command: 'test',
          args: [],
          type: 'stdio',
          enabled: true
        }
      }
    ];

    beforeEach(() => {
      mockHub.getServers.mockReturnValue(mockServers);
      mockHub.callTool.mockResolvedValue({ content: [], isError: false, success: true });
    });

    it('should route request using round robin strategy', async () => {
      const request = {
        toolName: 'test_tool',
        parameters: { param1: 'test' },
        raw: ''
      };

      // First request should go to server1
      const result1 = await parser.routeRequest(request);
      expect(result1.serverName).toBe('server1');

      // Second request should go to server2
      const result2 = await parser.routeRequest(request);
      expect(result2.serverName).toBe('server2');

      // Third request should go back to server1
      const result3 = await parser.routeRequest(request);
      expect(result3.serverName).toBe('server1');
    });

    it('should handle server health checks', async () => {
      // Simulate slow response from server1
      mockHub.callTool.mockImplementation(async (serverName) => {
        if (serverName === 'server1') {
          await new Promise(resolve => setTimeout(resolve, 1100)); // Simulate slow response
        }
        return { content: [], isError: false, success: true };
      });

      // Wait for health checks to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Get server health
      const health = parser.getServerHealth();
      
      expect(health.get('server1')?.status).toBe('degraded');
      expect(health.get('server2')?.status).toBe('healthy');
    });

    it('should throw error when no healthy servers available', async () => {
      // Simulate all servers being unhealthy
      mockHub.callTool.mockRejectedValue(new Error('Server error'));

      // Wait for health checks to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      const request = {
        toolName: 'test_tool',
        parameters: { param1: 'test' },
        raw: ''
      };

      await expect(parser.routeRequest(request)).rejects.toThrow(ToolRequestError);
      await expect(parser.routeRequest(request)).rejects.toHaveProperty('code', 'NO_SERVERS');
    });
  });

  describe('routing strategies', () => {
    beforeEach(() => {
      mockHub.getServers.mockReturnValue([
        {
          name: 'server1',
          status: 'connected',
          disabled: false,
          tools: [],
          resources: [],
          resourceTemplates: [],
          config: {
            name: 'server1',
            version: '1.0.0',
            command: 'test',
            args: [],
            type: 'stdio',
            enabled: true
          }
        },
        {
          name: 'server2',
          status: 'connected',
          disabled: false,
          tools: [],
          resources: [],
          resourceTemplates: [],
          config: {
            name: 'server2',
            version: '1.0.0',
            command: 'test',
            args: [],
            type: 'stdio',
            enabled: true
          }
        }
      ]);
    });

    it('should use least loaded strategy', async () => {
      // Set routing strategy to least loaded
      parser.setRoutingStrategy({ type: 'leastLoaded', timeout: 30000 });

      // Simulate server1 being more loaded than server2
      const health = new Map([
        ['server1', { name: 'server1', status: 'healthy' as const, lastCheck: new Date(), responseTime: 500 }],
        ['server2', { name: 'server2', status: 'healthy' as const, lastCheck: new Date(), responseTime: 100 }]
      ]);

      // @ts-ignore - accessing private property for testing
      parser.serverHealth = health;

      const request = {
        toolName: 'test_tool',
        parameters: { param1: 'test' },
        raw: ''
      };

      const result = await parser.routeRequest(request);
      expect(result.serverName).toBe('server2'); // Should choose server with lower response time
    });

    it('should use fastest response strategy', async () => {
      // Set routing strategy to fastest response
      parser.setRoutingStrategy({ type: 'fastestResponse', timeout: 30000 });

      // Simulate server2 being faster than server1
      const health = new Map([
        ['server1', { name: 'server1', status: 'healthy' as const, lastCheck: new Date(), responseTime: 200 }],
        ['server2', { name: 'server2', status: 'healthy' as const, lastCheck: new Date(), responseTime: 50 }]
      ]);

      // @ts-ignore - accessing private property for testing
      parser.serverHealth = health;

      const request = {
        toolName: 'test_tool',
        parameters: { param1: 'test' },
        raw: ''
      };

      const result = await parser.routeRequest(request);
      expect(result.serverName).toBe('server2'); // Should choose fastest server
    });
  });
});