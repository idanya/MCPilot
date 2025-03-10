import { describe, expect, test, beforeEach } from '@jest/globals';
import { ToolCatalogBuilder } from '../../services/mcp/tool-catalog';
import { McpTool } from '../../entities/mcp';

describe('ToolCatalogBuilder', () => {
    let catalogBuilder: ToolCatalogBuilder;

    beforeEach(() => {
        catalogBuilder = new ToolCatalogBuilder();
    });

    describe('Tool Registration', () => {
        test('should register tools from server', () => {
            const tools: McpTool[] = [
                {
                    name: 'test-tool',
                    description: 'A test tool',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            param1: {
                                type: 'string',
                                description: 'Test parameter'
                            }
                        },
                        required: ['param1']
                    }
                }
            ];

            catalogBuilder.registerServerTools('test-server', tools);

            expect(catalogBuilder.getServerTools('test-server')).toEqual(['test-tool']);
            expect(catalogBuilder.getAllTools()).toEqual(['test-tool']);
            expect(catalogBuilder.isToolAvailable('test-server', 'test-tool')).toBe(true);
        });

        test('should handle tools with examples', () => {
            const tools: McpTool[] = [
                {
                    name: 'example-tool',
                    description: 'Tool with examples',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            param1: {
                                type: 'string',
                                description: 'Example parameter'
                            }
                        }
                    },
                    examples: [
                        {
                            description: 'Basic example',
                            input: { param1: 'test-value' },
                            output: 'test-output'
                        }
                    ]
                }
            ];

            catalogBuilder.registerServerTools('test-server', tools);
            const doc = catalogBuilder.getToolDocumentation('example-tool');

            expect(doc).toBeDefined();
            expect(doc?.examples).toHaveLength(1);
            expect(doc?.examples[0]).toContain('Basic example');
            expect(doc?.examples[0]).toContain('<param1>test-value</param1>');
        });

        test('should generate default example when no examples provided', () => {
            const tools: McpTool[] = [
                {
                    name: 'no-example-tool',
                    description: 'Tool without examples',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            param1: {
                                type: 'string',
                                description: 'Parameter 1'
                            },
                            param2: {
                                type: 'number',
                                description: 'Parameter 2'
                            }
                        }
                    }
                }
            ];

            catalogBuilder.registerServerTools('test-server', tools);
            const doc = catalogBuilder.getToolDocumentation('no-example-tool');

            expect(doc).toBeDefined();
            expect(doc?.examples).toHaveLength(1);
            expect(doc?.examples[0]).toContain('<param1>example_string</param1>');
            expect(doc?.examples[0]).toContain('<param2>0</param2>');
        });
    });

    describe('Tool Documentation', () => {
        test('should generate usage documentation', () => {
            const tools: McpTool[] = [
                {
                    name: 'doc-tool',
                    description: 'Tool for testing documentation',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            required_param: {
                                type: 'string',
                                description: 'Required parameter'
                            },
                            optional_param: {
                                type: 'number',
                                description: 'Optional parameter'
                            }
                        },
                        required: ['required_param']
                    }
                }
            ];

            catalogBuilder.registerServerTools('test-server', tools);
            const doc = catalogBuilder.getToolDocumentation('doc-tool');

            expect(doc).toBeDefined();
            expect(doc?.usage).toContain('<doc-tool>');
            expect(doc?.usage).toContain('<required_param>');
            expect(doc?.usage).toContain('(required)');
            expect(doc?.usage).toContain('<optional_param>');
            expect(doc?.usage).toContain('(optional)');
        });

        test('should handle missing descriptions', () => {
            const tools: McpTool[] = [
                {
                    name: 'minimal-tool',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            param: {
                                type: 'string'
                            }
                        }
                    }
                }
            ];

            catalogBuilder.registerServerTools('test-server', tools);
            const doc = catalogBuilder.getToolDocumentation('minimal-tool');

            expect(doc).toBeDefined();
            expect(doc?.description).toBe('');
            expect(doc?.usage).toContain('<param>param value</param>');
        });
    });

    describe('Catalog Management', () => {
        test('should clear catalog', () => {
            const tools: McpTool[] = [
                {
                    name: 'test-tool',
                    inputSchema: {
                        type: 'object',
                        properties: {}
                    }
                }
            ];

            catalogBuilder.registerServerTools('test-server', tools);
            expect(catalogBuilder.getAllTools()).toHaveLength(1);

            catalogBuilder.clear();
            expect(catalogBuilder.getAllTools()).toHaveLength(0);
            expect(catalogBuilder.getServerTools('test-server')).toHaveLength(0);
        });

        test('should handle multiple servers with same tool', () => {
            const tool: McpTool = {
                name: 'shared-tool',
                inputSchema: {
                    type: 'object',
                    properties: {}
                }
            };

            catalogBuilder.registerServerTools('server1', [tool]);
            catalogBuilder.registerServerTools('server2', [tool]);

            expect(catalogBuilder.getAllTools()).toHaveLength(1);
            expect(catalogBuilder.isToolAvailable('server1', 'shared-tool')).toBe(true);
            expect(catalogBuilder.isToolAvailable('server2', 'shared-tool')).toBe(true);
        });
    });
});