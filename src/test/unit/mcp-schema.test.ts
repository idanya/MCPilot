import { describe, expect, test } from '@jest/globals';
import { validateMcpConfig, validateServerConfig, validateServerState } from '../../services/config/mcp-schema';

describe('MCP Schema Validation', () => {
    describe('validateMcpConfig', () => {
        test('should validate valid configuration', () => {
            const validConfig = {
                mcpServers: {
                    'test-server': {
                        command: 'test-command',
                        args: ['--test'],
                        env: { 'TEST_ENV': 'value' },
                        disabled: false,
                        timeout: 30,
                        alwaysAllow: ['tool1'],
                        type: 'stdio'
                    }
                }
            };

            const result = validateMcpConfig(validConfig);
            expect(result.success).toBe(true);
        });

        test('should reject invalid configuration', () => {
            const invalidConfig = {
                mcpServers: {
                    'test-server': {
                        // Missing required 'command' field
                        args: ['--test']
                    }
                }
            };

            const result = validateMcpConfig(invalidConfig);
            expect(result.success).toBe(false);
        });

        test('should validate empty server list', () => {
            const emptyConfig = {
                mcpServers: {}
            };

            const result = validateMcpConfig(emptyConfig);
            expect(result.success).toBe(true);
        });
    });

    describe('validateServerConfig', () => {
        test('should validate minimal server config', () => {
            const minimalConfig = {
                command: 'test-command',
                type: 'stdio',
                disabled: false,
                timeout: 60,
                alwaysAllow: []
            };

            const result = validateServerConfig(minimalConfig);
            expect(result.success).toBe(true);
        });

        test('should validate full server config', () => {
            const fullConfig = {
                command: 'test-command',
                args: ['--test'],
                env: { 'TEST_ENV': 'value' },
                disabled: false,
                timeout: 30,
                alwaysAllow: ['tool1'],
                type: 'stdio'
            };

            const result = validateServerConfig(fullConfig);
            expect(result.success).toBe(true);
        });

        test('should use default values', () => {
            const minimalConfig = {
                command: 'test-command'
            };

            const result = validateServerConfig(minimalConfig);
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data).toEqual({
                    command: 'test-command',
                    type: 'stdio',
                    disabled: false,
                    timeout: 60,
                    alwaysAllow: []
                });
            }
        });

        test('should reject invalid timeout', () => {
            const invalidConfig = {
                command: 'test-command',
                timeout: 3601 // Exceeds maximum
            };

            const result = validateServerConfig(invalidConfig);
            expect(result.success).toBe(false);
        });
    });

    describe('validateServerState', () => {
        test('should validate connected server state', () => {
            const connectedState = {
                name: 'test-server',
                config: JSON.stringify({
                    command: 'test-command',
                    type: 'stdio'
                }),
                status: 'connected',
                disabled: false,
                tools: [
                    {
                        name: 'test-tool',
                        description: 'Test tool',
                        inputSchema: {
                            type: 'object',
                            properties: {},
                            required: []
                        }
                    }
                ]
            };

            const result = validateServerState(connectedState);
            expect(result.success).toBe(true);
        });

        test('should validate disconnected server state', () => {
            const disconnectedState = {
                name: 'test-server',
                config: {
                    command: 'test-command',
                    type: 'stdio'
                },
                status: 'disconnected',
                error: 'Connection failed'
            };

            const result = validateServerState(disconnectedState);
            expect(result.success).toBe(true);
        });

        test('should reject invalid status', () => {
            const invalidState = {
                name: 'test-server',
                config: {},
                status: 'invalid-status'
            };

            const result = validateServerState(invalidState);
            expect(result.success).toBe(false);
        });
    });
});