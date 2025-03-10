import { describe, expect, test, beforeEach } from '@jest/globals';
import { SystemPromptEnhancer } from '../../services/prompt/prompt-enhancer';
import { ToolCatalogBuilder } from '../../services/mcp/tool-catalog';
import { McpTool } from '../../entities/mcp';

describe('SystemPromptEnhancer', () => {
    let enhancer: SystemPromptEnhancer;
    let catalog: ToolCatalogBuilder;

    beforeEach(() => {
        catalog = new ToolCatalogBuilder();
        enhancer = new SystemPromptEnhancer(catalog);
        enhancer.setBasePrompt('Base system instructions');
    });

    describe('Basic Prompt Building', () => {
        test('should include base prompt', () => {
            const prompt = enhancer.buildSystemPrompt();
            expect(prompt).toContain('Base system instructions');
        });

        test('should add custom sections', () => {
            enhancer.addSection({
                title: 'Custom Section',
                content: 'Custom content'
            });

            const prompt = enhancer.buildSystemPrompt();
            expect(prompt).toContain('## Custom Section');
            expect(prompt).toContain('Custom content');
        });

        test('should clear sections', () => {
            enhancer.addSection({
                title: 'Test Section',
                content: 'Test content'
            });
            enhancer.clearSections();

            const prompt = enhancer.buildSystemPrompt();
            expect(prompt).not.toContain('Test Section');
            expect(prompt).not.toContain('Test content');
        });
    });

    describe('Tool Documentation', () => {
        const testTool: McpTool = {
            name: 'test-tool',
            description: 'A test tool',
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
            },
            examples: [
                {
                    description: 'Basic example',
                    input: { required_param: 'test' },
                    output: 'test output'
                }
            ]
        };

        beforeEach(() => {
            catalog.registerServerTools('test-server', [testTool]);
        });

        test('should include tool usage instructions', () => {
            const prompt = enhancer.buildSystemPrompt();
            expect(prompt).toContain('Tool Usage Instructions');
            expect(prompt).toContain('XML-style tags');
            expect(prompt).toContain('<tool_name>');
            expect(prompt).toContain('<parameter1_name>');
        });

        test('should document available tools', () => {
            const prompt = enhancer.buildSystemPrompt();
            expect(prompt).toContain('### test-tool');
            expect(prompt).toContain('A test tool');
            expect(prompt).toContain('required_param (required)');
            expect(prompt).toContain('optional_param');
        });

        test('should include tool examples', () => {
            enhancer.addExamplesSection();
            const prompt = enhancer.buildSystemPrompt();
            expect(prompt).toContain('Tool Examples');
            expect(prompt).toContain('test-tool Example:');
        });

        test('should handle tools without examples', () => {
            const simpleTool: McpTool = {
                name: 'simple-tool',
                description: 'Simple tool',
                inputSchema: {
                    type: 'object',
                    properties: {}
                }
            };

            catalog.registerServerTools('test-server', [simpleTool]);
            const prompt = enhancer.buildSystemPrompt();
            expect(prompt).toContain('simple-tool');
            expect(prompt).toContain('Simple tool');
        });
    });

    describe('Server Integration', () => {
        test('should add server-specific tools section', () => {
            const serverTool: McpTool = {
                name: 'server-tool',
                description: 'Server specific tool',
                inputSchema: {
                    type: 'object',
                    properties: {}
                }
            };

            catalog.registerServerTools('test-server', [serverTool]);
            enhancer.addServerTools('test-server');

            const prompt = enhancer.buildSystemPrompt();
            expect(prompt).toContain('test-server Tools');
            expect(prompt).toContain('server-tool');
        });

        test('should handle multiple servers', () => {
            const tool1: McpTool = {
                name: 'tool1',
                inputSchema: {
                    type: 'object',
                    properties: {}
                }
            };

            const tool2: McpTool = {
                name: 'tool2',
                inputSchema: {
                    type: 'object',
                    properties: {}
                }
            };

            catalog.registerServerTools('server1', [tool1]);
            catalog.registerServerTools('server2', [tool2]);
            
            enhancer.addServerTools('server1');
            enhancer.addServerTools('server2');

            const prompt = enhancer.buildSystemPrompt();
            expect(prompt).toContain('server1 Tools');
            expect(prompt).toContain('server2 Tools');
            expect(prompt).toContain('tool1');
            expect(prompt).toContain('tool2');
        });
    });

    describe('Error Handling', () => {
        test('should handle no available tools', () => {
            const prompt = enhancer.buildSystemPrompt();
            expect(prompt).toContain('No tools are currently available');
        });

        test('should handle missing tool documentation', () => {
            const incompleteTool: McpTool = {
                name: 'incomplete-tool',
                inputSchema: {
                    type: 'object',
                    properties: {}
                }
            };

            catalog.registerServerTools('test-server', [incompleteTool]);
            const prompt = enhancer.buildSystemPrompt();
            expect(prompt).toContain('incomplete-tool');
            expect(prompt).not.toContain('undefined');
        });
    });
});