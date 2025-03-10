import { describe, expect, test, beforeEach, afterEach, jest } from '@jest/globals';
import { McpHub } from '../../services/mcp/McpHub';
import { McpServerConfig } from '../../services/config/mcp-schema';

describe('McpHub Integration', () => {
    let mcpHub: McpHub;
    const defaultTestConfig: Record<string, McpServerConfig> = {
        'test-server': {
            command: 'test-command',
            type: 'stdio',
            disabled: false,
            timeout: 60,
            alwaysAllow: []
        }
    };

    beforeEach(() => {
        mcpHub = new McpHub(defaultTestConfig);
    });

    afterEach(async () => {
        await mcpHub.dispose();
        jest.clearAllMocks();
    });

    describe('Server Management', () => {
        test('should initialize servers from config', async () => {
            const testConfig: Record<string, McpServerConfig> = {
                'test-server': {
                    command: 'test-command',
                    args: ['--test'],
                    env: { 'TEST_ENV': 'value' },
                    type: 'stdio',
                    disabled: false,
                    timeout: 60,
                    alwaysAllow: []
                }
            };

            await mcpHub.updateServerConnections(testConfig);

            const servers = mcpHub.getAllServers();
            expect(servers).toHaveLength(1);
            expect(servers[0].name).toBe('test-server');
            expect(servers[0].status).toBe('connected');
        });

        test('should handle server reconnection', async () => {
            const testConfig: Record<string, McpServerConfig> = {
                'test-server': {
                    command: 'test-command',
                    type: 'stdio',
                    disabled: false,
                    timeout: 60,
                    alwaysAllow: []
                }
            };

            await mcpHub.updateServerConnections(testConfig);

            // Simulate reconnection
            await mcpHub.restartConnection('test-server');

            const server = mcpHub.getAllServers().find(s => s.name === 'test-server');
            expect(server).toBeDefined();
            expect(server?.status).toBe('connected');
        });
    });

    describe('Tool Management', () => {
        test('should handle tool execution', async () => {
            const testConfig: Record<string, McpServerConfig> = {
                'test-server': {
                    command: 'test-command',
                    type: 'stdio',
                    disabled: false,
                    timeout: 60,
                    alwaysAllow: ['test-tool']
                }
            };

            await mcpHub.updateServerConnections(testConfig);

            // Execute tool
            const result = await mcpHub.callTool('test-server', 'test-tool', {
                param1: 'test'
            });

            expect(result.isError).toBe(false);
            expect(result.content).toHaveLength(1);
            expect(result.content[0]).toEqual({
                type: 'text',
                text: 'Test result'
            });
        });
    });

    describe('Resource Management', () => {
        test('should handle resource access', async () => {
            const testConfig: Record<string, McpServerConfig> = {
                'test-server': {
                    command: 'test-command',
                    type: 'stdio',
                    disabled: false,
                    timeout: 60,
                    alwaysAllow: []
                }
            };

            await mcpHub.updateServerConnections(testConfig);

            // Read resource
            const result = await mcpHub.readResource('test-server', 'test://resource');

            expect(result.contents).toHaveLength(1);
            expect(result.contents[0]).toEqual({
                uri: 'test://resource',
                mimeType: 'text/plain',
                text: 'Test content'
            });
        });
    });

    describe('Error Handling', () => {
        test('should handle connection failures', async () => {
            const testConfig: Record<string, McpServerConfig> = {
                'test-server': {
                    command: 'invalid-command',
                    type: 'stdio',
                    disabled: false,
                    timeout: 60,
                    alwaysAllow: []
                }
            };

            await mcpHub.updateServerConnections(testConfig);

            const server = mcpHub.getAllServers().find(s => s.name === 'test-server');
            expect(server?.status).toBe('disconnected');
            expect(server?.error).toBeDefined();
        });

        test('should handle disabled servers', async () => {
            const testConfig: Record<string, McpServerConfig> = {
                'test-server': {
                    command: 'test-command',
                    type: 'stdio',
                    disabled: true,
                    timeout: 60,
                    alwaysAllow: []
                }
            };

            await mcpHub.updateServerConnections(testConfig);

            await expect(
                mcpHub.callTool('test-server', 'test-tool', {})
            ).rejects.toThrow('Server "test-server" is disabled');
        });
    });
});