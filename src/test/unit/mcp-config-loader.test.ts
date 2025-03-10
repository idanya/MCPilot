import { describe, expect, test, beforeEach, afterEach, jest } from '@jest/globals';
import * as fs from 'fs/promises';
import * as path from 'path';
import { McpConfigLoader } from '../../services/config/mcp-config-loader';
import { McpConfig } from '../../services/config/mcp-schema';

jest.mock('fs/promises');
const mockedFs = jest.mocked(fs);

describe('McpConfigLoader', () => {
    const testConfigPath = '/test/config/mcp-config.json';
    let configLoader: McpConfigLoader;

    beforeEach(() => {
        configLoader = new McpConfigLoader(testConfigPath);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('loadConfig', () => {
        test('should load and validate valid configuration', async () => {
            const validConfig: McpConfig = {
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

            mockedFs.access.mockResolvedValue();
            mockedFs.readFile.mockResolvedValue(JSON.stringify(validConfig));

            const config = await configLoader.loadConfig();
            expect(config).toEqual(validConfig);
        });

        test('should create default config if file does not exist', async () => {
            const error = new Error('File not found');
            (error as NodeJS.ErrnoException).code = 'ENOENT';
            mockedFs.access.mockRejectedValue(error);

            const expectedDefaultConfig: McpConfig = {
                mcpServers: {}
            };

            const config = await configLoader.loadConfig();
            expect(config).toEqual(expectedDefaultConfig);
            expect(mockedFs.writeFile).toHaveBeenCalledWith(
                testConfigPath,
                JSON.stringify(expectedDefaultConfig, null, 2)
            );
        });

        test('should throw error for invalid configuration', async () => {
            const invalidConfig = {
                mcpServers: {
                    'test-server': {
                        // Missing required 'command' field
                        args: ['--test'],
                        type: 'stdio',
                        disabled: false,
                        timeout: 60,
                        alwaysAllow: []
                    }
                }
            };

            mockedFs.access.mockResolvedValue();
            mockedFs.readFile.mockResolvedValue(JSON.stringify(invalidConfig));

            await expect(configLoader.loadConfig()).rejects.toThrow('Invalid MCP configuration');
        });
    });

    describe('saveConfig', () => {
        test('should save valid configuration', async () => {
            const validConfig: McpConfig = {
                mcpServers: {
                    'test-server': {
                        command: 'test-command',
                        type: 'stdio',
                        disabled: false,
                        timeout: 60,
                        alwaysAllow: []
                    }
                }
            };

            await configLoader.saveConfig(validConfig);

            expect(mockedFs.mkdir).toHaveBeenCalledWith(
                path.dirname(testConfigPath),
                { recursive: true }
            );
            expect(mockedFs.writeFile).toHaveBeenCalledWith(
                testConfigPath,
                JSON.stringify(validConfig, null, 2)
            );
        });

        test('should reject invalid configuration', async () => {
            const invalidConfig = {
                mcpServers: {
                    'test-server': {
                        // Missing required 'command' field
                        type: 'stdio'
                    }
                }
            };

            // @ts-expect-error Testing invalid config
            await expect(configLoader.saveConfig(invalidConfig)).rejects.toThrow('Invalid MCP configuration');
            expect(mockedFs.writeFile).not.toHaveBeenCalled();
        });
    });

    describe('server operations', () => {
        const testConfig: McpConfig = {
            mcpServers: {
                'test-server': {
                    command: 'test-command',
                    type: 'stdio',
                    disabled: false,
                    timeout: 60,
                    alwaysAllow: []
                }
            }
        };

        beforeEach(async () => {
            mockedFs.access.mockResolvedValue();
            mockedFs.readFile.mockResolvedValue(JSON.stringify(testConfig));
            await configLoader.loadConfig();
        });

        test('should get server config', () => {
            const serverConfig = configLoader.getServerConfig('test-server');
            expect(serverConfig).toEqual(testConfig.mcpServers['test-server']);
        });

        test('should update server config', async () => {
            const updatedConfig = {
                command: 'new-command',
                args: ['--new'],
                type: 'stdio' as const,
                disabled: false,
                timeout: 60,
                alwaysAllow: []
            };

            await configLoader.updateServerConfig('test-server', updatedConfig);
            expect(configLoader.getServerConfig('test-server')).toEqual(updatedConfig);
        });

        test('should remove server', async () => {
            await configLoader.removeServer('test-server');
            expect(configLoader.hasServer('test-server')).toBeFalsy();
        });

        test('should get server names', () => {
            const names = configLoader.getServerNames();
            expect(names).toEqual(['test-server']);
        });

        test('should check server existence', () => {
            expect(configLoader.hasServer('test-server')).toBeTruthy();
            expect(configLoader.hasServer('non-existent')).toBeFalsy();
        });
    });
});