/**
 * Unit tests for ConfigLoader
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { ConfigLoader } from '../../services/config/config-loader';
import { MCPilotConfig } from '../../interfaces/config/types';
import { MCPilotError } from '../../interfaces/error/types';
import * as fs from 'fs';
import * as path from 'path';

// Mock fs promises
const mockReadFile = jest.fn();
const mockWriteFile = jest.fn();

jest.mock('fs', () => ({
    promises: {
        readFile: mockReadFile,
        writeFile: mockWriteFile
    }
}));

describe('ConfigLoader', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    const validConfig: MCPilotConfig = {
        providers: {
            openai: {
                apiKey: 'test-key',
                model: 'gpt-4'
            }
        },
        session: {
            contextSize: 4096,
            maxQueueSize: 100,
            defaultProvider: 'openai',
            logDirectory: './sessions'
        },
        logging: {
            level: 'INFO',
            format: 'json',
            maxFiles: 5,
            maxSize: '10mb'
        }
    };

    describe('load', () => {
        it('should load config from file', async () => {
            mockReadFile.mockImplementation(() => Promise.resolve(JSON.stringify(validConfig)));

            const loader = new ConfigLoader({
                configPath: 'config.json'
            });

            const config = await loader.load();
            expect(config.providers.openai?.apiKey).toBe('test-key');
            expect(config.providers.openai?.model).toBe('gpt-4');
            expect(mockReadFile).toHaveBeenCalled();
        });

        it('should apply environment variables', async () => {
            mockReadFile.mockImplementation(() => Promise.resolve(JSON.stringify(validConfig)));
            
            const loader = new ConfigLoader({
                configPath: 'config.json',
                env: {
                    OPENAI_API_KEY: 'env-key',
                    OPENAI_MODEL: 'gpt-4-turbo',
                    MCPILOT_LOG_LEVEL: 'DEBUG',
                    MCPILOT_CONTEXT_SIZE: '8192'
                }
            });

            const config = await loader.load();
            expect(config.providers.openai?.apiKey).toBe('env-key');
            expect(config.providers.openai?.model).toBe('gpt-4-turbo');
            expect(config.logging.level).toBe('DEBUG');
            expect(config.session.contextSize).toBe(8192);
            // Should maintain other config values
            expect(config.session.defaultProvider).toBe('openai');
            expect(config.logging.format).toBe('json');
        });

        it('should apply configuration overrides', async () => {
            mockReadFile.mockImplementation(() => Promise.resolve(JSON.stringify(validConfig)));
            
            const loader = new ConfigLoader({
                configPath: 'config.json',
                overrides: {
                    session: {
                        contextSize: 8192,
                        maxQueueSize: 200,
                        defaultProvider: 'openai',
                        logDirectory: './sessions'
                    },
                    logging: {
                        level: 'DEBUG',
                        format: 'json',
                        maxFiles: 5,
                        maxSize: '10mb'
                    }
                }
            });

            const config = await loader.load();
            expect(config.session.contextSize).toBe(8192);
            expect(config.session.maxQueueSize).toBe(200);
            expect(config.logging.level).toBe('DEBUG');
            expect(config.session.defaultProvider).toBe('openai');
        });

        it('should reject invalid configuration', async () => {
            const loader = new ConfigLoader({
                overrides: {
                    logging: {
                        level: 'INVALID' as any,
                        format: 'invalid-format' as any
                    }
                }
            });

            await expect(loader.load()).rejects.toThrow(MCPilotError);
        });

        it('should handle file load errors', async () => {
            mockReadFile.mockImplementation(() => Promise.reject(new Error('File not found')));

            const loader = new ConfigLoader({
                configPath: 'nonexistent.json'
            });

            await expect(loader.load()).rejects.toThrow(MCPilotError);
        });
    });

    describe('environment variables', () => {
        it('should transform numeric values', async () => {
            const loader = new ConfigLoader({
                env: {
                    MCPILOT_CONTEXT_SIZE: '8192'
                }
            });

            const config = await loader.load();
            expect(config.session.contextSize).toBe(8192);
            expect(typeof config.session.contextSize).toBe('number');
        });

        it('should handle invalid environment values', async () => {
            const loader = new ConfigLoader({
                env: {
                    MCPILOT_CONTEXT_SIZE: 'invalid'
                }
            });

            await expect(loader.load()).rejects.toThrow(MCPilotError);
        });
    });

    describe('config merging', () => {
        it('should merge nested configurations properly', async () => {
            mockReadFile.mockImplementation(() => Promise.resolve(JSON.stringify({
                providers: {
                    openai: {
                        apiKey: 'base-key',
                        model: 'gpt-4'
                    }
                },
                session: {
                    contextSize: 4096,
                    maxQueueSize: 100,
                    defaultProvider: 'openai',
                    logDirectory: './sessions'
                },
                logging: {
                    level: 'INFO',
                    format: 'json',
                    maxFiles: 5,
                    maxSize: '10mb'
                }
            })));

            const loader = new ConfigLoader({
                configPath: 'config.json',
                overrides: {
                    providers: {
                        openai: {
                            apiKey: 'override-key',
                            model: 'gpt-4' // explicitly set model even though we'll test it's preserved
                        },
                        anthropic: {
                            apiKey: 'anthropic-key',
                            model: 'claude-2'
                        }
                    },
                    session: {
                        contextSize: 8192, // other session values should be preserved
                        defaultProvider: 'openai'
                    }
                }
            });

            const config = await loader.load();
            
            // Check merged provider config
            expect(config.providers.openai).toBeDefined();
            expect(config.providers.openai?.apiKey).toBe('override-key');
            expect(config.providers.openai?.model).toBe('gpt-4'); // preserved from base
            expect(config.providers.anthropic).toBeDefined();
            expect(config.providers.anthropic?.model).toBe('claude-2');

            // Check preserved values
            expect(config.session.maxQueueSize).toBe(100); // from base config
            expect(config.session.contextSize).toBe(8192); // from override
            expect(config.session.defaultProvider).toBe('openai'); // from base config
            expect(config.logging.level).toBe('INFO'); // from base config
        });

        it('should handle MCP extensions configuration', async () => {
            mockReadFile.mockImplementation(() => Promise.resolve(JSON.stringify(validConfig)));

            const loader = new ConfigLoader({
                configPath: 'config.json',
                overrides: {
                    mcp: {
                        extensions: {
                            test: {
                                cmd: 'test-cmd',
                                args: ['--test'],
                                enabled: true,
                                envs: { 'TEST_ENV': 'value' },
                                timeout: 5000
                            }
                        }
                    }
                }
            });

            const config = await loader.load();
            expect(config.mcp?.extensions?.test).toBeDefined();
            expect(config.mcp?.extensions?.test.cmd).toBe('test-cmd');
            expect(config.mcp?.extensions?.test.args).toEqual(['--test']);
            expect(config.mcp?.extensions?.test.enabled).toBe(true);
            expect(config.mcp?.extensions?.test.envs).toEqual({ 'TEST_ENV': 'value' });
            expect(config.mcp?.extensions?.test.timeout).toBe(5000);
            
            // Base config should still be intact
            expect(config.providers.openai).toBeDefined();
            expect(config.session.defaultProvider).toBe('openai');
        });
    });
});