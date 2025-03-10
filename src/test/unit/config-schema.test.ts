/**
 * Unit tests for configuration schema
 */

import { describe, it, expect } from '@jest/globals';
import { configSchema, validateConfig, validateProviderConfig } from '../../services/config/config-schema';
import { LogLevel } from '../../interfaces/base/session';

describe('Configuration Schema', () => {
    describe('validateConfig', () => {
        it('should validate a complete valid configuration', () => {
            const validConfig = {
                providers: {
                    openai: {
                        apiKey: 'test-key',
                        model: 'gpt-4'
                    }
                },
                session: {
                    contextSize: 4096,
                    maxQueueSize: 100
                },
                logging: {
                    level: LogLevel.INFO,
                    format: 'json'
                }
            };

            const result = validateConfig(validConfig);
            expect(result.success).toBe(true);
        });

        it('should require logging level and format', () => {
            const invalidConfig = {
                providers: {},
                session: {},
                logging: {}
            };

            const result = validateConfig(invalidConfig);
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues).toEqual(
                    expect.arrayContaining([
                        expect.objectContaining({ path: ['logging', 'level'] }),
                        expect.objectContaining({ path: ['logging', 'format'] })
                    ])
                );
            }
        });

        it('should validate provider configurations', () => {
            const configWithInvalidProvider = {
                providers: {
                    openai: {
                        // Missing required model
                        apiKey: 'test-key'
                    }
                },
                session: {},
                logging: {
                    level: LogLevel.INFO,
                    format: 'json'
                }
            };

            const result = validateConfig(configWithInvalidProvider);
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues).toEqual(
                    expect.arrayContaining([
                        expect.objectContaining({ path: ['providers', 'openai', 'model'] })
                    ])
                );
            }
        });

        it('should allow custom provider configurations', () => {
            const configWithCustomProvider = {
                providers: {
                    custom: {
                        model: 'custom-model',
                        customSetting: 'value'
                    }
                },
                session: {},
                logging: {
                    level: LogLevel.INFO,
                    format: 'json'
                }
            };

            const result = validateConfig(configWithCustomProvider);
            expect(result.success).toBe(true);
        });

        it('should validate log size format', () => {
            const validSizes = ['10mb', '1gb', '500kb', '2MB', '1GB'];
            const invalidSizes = ['10m', '1g', '500x', '2M', 'invalid'];

            validSizes.forEach(size => {
                const config = {
                    providers: {},
                    session: {},
                    logging: {
                        level: LogLevel.INFO,
                        format: 'json',
                        maxSize: size
                    }
                };
                const result = validateConfig(config);
                expect(result.success).toBe(true);
            });

            invalidSizes.forEach(size => {
                const config = {
                    providers: {},
                    session: {},
                    logging: {
                        level: LogLevel.INFO,
                        format: 'json',
                        maxSize: size
                    }
                };
                const result = validateConfig(config);
                expect(result.success).toBe(false);
            });
        });
    });

    describe('validateProviderConfig', () => {
        it('should validate OpenAI provider configuration', () => {
            const validConfig = {
                apiKey: 'test-key',
                model: 'gpt-4',
                maxRetries: 3
            };

            const result = validateProviderConfig('openai', validConfig);
            expect(result.success).toBe(true);
        });

        it('should validate Anthropic provider configuration', () => {
            const validConfig = {
                apiKey: 'test-key',
                model: 'claude-2',
                maxTokensToSample: 1000,
                stopSequences: ['Human:', 'Assistant:']
            };

            const result = validateProviderConfig('anthropic', validConfig);
            expect(result.success).toBe(true);
        });

        it('should validate local provider configuration', () => {
            const validConfig = {
                model: 'llama-2',
                modelPath: '/path/to/model',
                quantization: 'q4_0',
                contextSize: 4096,
                threads: 4
            };

            const result = validateProviderConfig('local', validConfig);
            expect(result.success).toBe(true);
        });

        it('should allow unknown provider types with minimal validation', () => {
            const validConfig = {
                model: 'custom-model',
                customSetting: 'value'
            };

            const result = validateProviderConfig('custom', validConfig);
            expect(result.success).toBe(true);
        });

        it('should require model for unknown provider types', () => {
            const invalidConfig = {
                customSetting: 'value'
            };

            const result = validateProviderConfig('custom', invalidConfig);
            expect(result.success).toBe(false);
        });
    });
});