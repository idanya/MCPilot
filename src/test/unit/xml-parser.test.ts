import { describe, expect, test } from '@jest/globals';
import { XmlParser, XmlParseError } from '../../services/parser/xml-parser';

describe('XmlParser', () => {
    let parser: XmlParser;

    beforeEach(() => {
        parser = new XmlParser();
    });

    describe('Tool Request Parsing', () => {
        test('should parse single tool request', () => {
            const input = `<read_file>
                <path>test.txt</path>
            </read_file>`;

            const requests = parser.parseToolRequests(input);
            expect(requests).toHaveLength(1);
            expect(requests[0]).toEqual({
                toolName: 'read_file',
                parameters: {
                    path: 'test.txt'
                },
                raw: input
            });
        });

        test('should parse multiple tool requests', () => {
            const input = `
                <tool1>
                    <param1>value1</param1>
                </tool1>
                <tool2>
                    <param2>value2</param2>
                </tool2>
            `;

            const requests = parser.parseToolRequests(input);
            expect(requests).toHaveLength(2);
            expect(requests[0].toolName).toBe('tool1');
            expect(requests[1].toolName).toBe('tool2');
        });

        test('should properly parse nested parameters', () => {
            const input = `<complex_tool>
                <config>
                    <key1>value1</key1>
                    <key2>value2</key2>
                    <nested>
                        <inner1>test</inner1>
                        <inner2>123</inner2>
                    </nested>
                </config>
                <simple>value</simple>
            </complex_tool>`;

            const requests = parser.parseToolRequests(input);
            expect(requests).toHaveLength(1);
            expect(requests[0].parameters).toEqual({
                config: {
                    key1: 'value1',
                    key2: 'value2',
                    nested: {
                        inner1: 'test',
                        inner2: 123
                    }
                },
                simple: 'value'
            });
        });

        test('should ignore non-tool XML content', () => {
            const input = `Some text
                <tool>
                    <param>value</param>
                </tool>
                More text`;

            const requests = parser.parseToolRequests(input);
            expect(requests).toHaveLength(1);
            expect(requests[0].toolName).toBe('tool');
        });
    });

    describe('Parameter Parsing', () => {
        test('should parse parameters with whitespace', () => {
            const input = `<tool>
                <param1>
                    value with spaces
                </param1>
            </tool>`;

            const requests = parser.parseToolRequests(input);
            expect(requests[0].parameters.param1).toBe('value with spaces');
        });

        test('should handle empty parameters', () => {
            const input = `<tool>
                <param1></param1>
                <param2>value2</param2>
            </tool>`;

            const requests = parser.parseToolRequests(input);
            expect(requests[0].parameters).toEqual({
                param1: '',
                param2: 'value2'
            });
        });

        test('should preserve parameter order', () => {
            const input = `<tool>
                <param1>first</param1>
                <param2>second</param2>
                <param3>third</param3>
            </tool>`;

            const requests = parser.parseToolRequests(input);
            const params = Object.keys(requests[0].parameters);
            expect(params).toEqual(['param1', 'param2', 'param3']);
        });

        test('should infer parameter types', () => {
            const input = `<tool>
                <string>hello</string>
                <number>123</number>
                <float>123.45</float>
                <bool_true>true</bool_true>
                <bool_false>false</bool_false>
                <json_obj>{"key": "value"}</json_obj>
                <json_arr>[1,2,3]</json_arr>
                <empty></empty>
            </tool>`;

            const requests = parser.parseToolRequests(input);
            const params = requests[0].parameters;
            
            expect(typeof params.string).toBe('string');
            expect(typeof params.number).toBe('number');
            expect(typeof params.float).toBe('number');
            expect(typeof params.bool_true).toBe('boolean');
            expect(typeof params.bool_false).toBe('boolean');
            expect(typeof params.json_obj).toBe('object');
            expect(Array.isArray(params.json_arr)).toBe(true);
            expect(params.empty).toBe('');

            expect(params.number).toBe(123);
            expect(params.float).toBe(123.45);
            expect(params.bool_true).toBe(true);
            expect(params.bool_false).toBe(false);
            expect(params.json_obj).toEqual({key: 'value'});
            expect(params.json_arr).toEqual([1,2,3]);
        });
    });

    describe('Validation', () => {
        test('should validate tool request format', () => {
            const validRequest = {
                toolName: 'test_tool',
                parameters: { param: 'value' },
                raw: '<test_tool><param>value</param></test_tool>'
            };

            expect(() => parser.validateToolRequest(validRequest)).not.toThrow();
        });

        test('should throw on missing tool name', () => {
            const invalidRequest = {
                toolName: '',
                parameters: { param: 'value' },
                raw: '<><param>value</param></>'
            };

            expect(() => parser.validateToolRequest(invalidRequest))
                .toThrow(XmlParseError);
        });

        test('should throw on invalid tool name format', () => {
            const invalidRequest = {
                toolName: 'TestTool',
                parameters: { param: 'value' },
                raw: '<TestTool><param>value</param></TestTool>'
            };

            expect(() => parser.validateToolRequest(invalidRequest))
                .toThrow(XmlParseError);
        });

        test('should throw on missing parameters', () => {
            const invalidRequest = {
                toolName: 'test',
                parameters: {},
                raw: '<test></test>'
            };

            expect(() => parser.validateToolRequest(invalidRequest))
                .toThrow(XmlParseError);
        });

        test('should throw on invalid parameter names', () => {
            const invalidRequest = {
                toolName: 'test',
                parameters: { 'Invalid-Name': 'value' },
                raw: '<test><Invalid-Name>value</Invalid-Name></test>'
            };

            expect(() => parser.validateToolRequest(invalidRequest))
                .toThrow(XmlParseError);
        });
    });

    describe('Formatting', () => {
        test('should format tool request', () => {
            const formatted = parser.formatToolRequest('test_tool', {
                param1: 'value1',
                param2: 'value2'
            });

            expect(formatted).toBe(
                '<test_tool>\n<param1>value1</param1>\n<param2>value2</param2>\n</test_tool>'
            );
        });

        test('should format nested parameters', () => {
            const formatted = parser.formatToolRequest('test_tool', {
                config: {
                    key1: 'value1',
                    nested: {
                        inner: 'value2'
                    }
                },
                simple: 'value3'
            });

            const parsed = parser.parseToolRequests(formatted);
            expect(parsed[0].parameters).toEqual({
                config: {
                    key1: 'value1',
                    nested: {
                        inner: 'value2'
                    }
                },
                simple: 'value3'
            });
        });

        test('should handle special characters in values', () => {
            const formatted = parser.formatToolRequest('tool', {
                param: 'value with <xml> chars'
            });

            const requests = parser.parseToolRequests(formatted);
            expect(requests[0].parameters.param).toBe('value with <xml> chars');
        });

        test('should format different value types', () => {
            const formatted = parser.formatToolRequest('tool', {
                string: 'text',
                number: 123,
                boolean: true,
                object: { key: 'value' },
                array: [1, 2, 3],
                null: null
            });

            const parsed = parser.parseToolRequests(formatted);
            expect(parsed[0].parameters).toEqual({
                string: 'text',
                number: 123,
                boolean: true,
                object: { key: 'value' },
                array: [1, 2, 3],
                null: ''
            });
        });
    });

    describe('Error Handling', () => {
        test('should handle malformed XML', () => {
            const input = `<tool>
                <param>value
                </tool>`;

            const requests = parser.parseToolRequests(input);
            expect(requests).toHaveLength(0);
        });

        test('should handle mismatched tags', () => {
            const input = `<tool1>
                <param>value</param>
                </tool2>`;

            const requests = parser.parseToolRequests(input);
            expect(requests).toHaveLength(0);
        });

        test('should handle unclosed tags', () => {
            const input = `<tool>
                <param>value`;

            const requests = parser.parseToolRequests(input);
            expect(requests).toHaveLength(0);
        });

        test('should handle malformed nested parameters', () => {
            const input = `<tool>
                <config>
                    <key1>value1</key1>
                    <nested>
                        <inner1>test
                    </nested>
                </config>
            </tool>`;

            const requests = parser.parseToolRequests(input);
            expect(requests).toHaveLength(0);
        });

        test('should skip invalid tool requests while processing valid ones', () => {
            const input = `
                <valid_tool>
                    <param>value</param>
                </valid_tool>
                <invalid>
                    <param>value
                </invalid>
                <another_valid>
                    <param>value</param>
                </another_valid>
            `;

            const requests = parser.parseToolRequests(input);
            expect(requests).toHaveLength(2);
            expect(requests[0].toolName).toBe('valid_tool');
            expect(requests[1].toolName).toBe('another_valid');
        });
    });
});