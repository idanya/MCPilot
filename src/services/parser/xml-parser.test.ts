/**
 * Tests for XML parser
 */

import { XmlParser } from "./xml-parser";
import "@jest/globals";

describe("XmlParser", () => {
  let parser: XmlParser;

  beforeEach(() => {
    parser = new XmlParser();
  });

  describe("parseToolRequests", () => {
    it("should parse a basic tool request", () => {
      const xml = `<use_mcp_tool>
<server_name>test-server</server_name>
<tool_name>test_tool</tool_name>
<arguments>
<param1>value1</param1>
<param2>value2</param2>
</arguments>
</use_mcp_tool>`;

      const result = parser.parseToolRequests(xml);

      expect(result).toHaveLength(1);
      expect(result[0].serverName).toBe("test-server");
      expect(result[0].toolName).toBe("test_tool");
      expect(result[0].arguments).toEqual({
        param1: "value1",
        param2: "value2",
      });
    });

    it("should parse a tool request with array arguments", () => {
      const xml = `<use_mcp_tool>
<server_name>test-server</server_name>
<tool_name>test_tool</tool_name>
<arguments>
<param1>value1</param1>
<array_param>
  <item>item1</item>
  <item>item2</item>
  <item>item3</item>
</array_param>
</arguments>
</use_mcp_tool>`;

      const result = parser.parseToolRequests(xml);

      expect(result).toHaveLength(1);
      expect(result[0].serverName).toBe("test-server");
      expect(result[0].toolName).toBe("test_tool");
      expect(result[0].arguments).toEqual({
        param1: "value1",
        array_param: ["item1", "item2", "item3"],
      });
    });

    it("should parse a tool request with nested array items", () => {
      const xml = `<use_mcp_tool>
<server_name>test-server</server_name>
<tool_name>test_tool</tool_name>
<arguments>
<complex_array>
  <item>
    <name>Item 1</name>
    <value>100</value>
  </item>
  <item>
    <name>Item 2</name>
    <value>200</value>
  </item>
</complex_array>
</arguments>
</use_mcp_tool>`;

      const result = parser.parseToolRequests(xml);

      expect(result).toHaveLength(1);
      expect(result[0].serverName).toBe("test-server");
      expect(result[0].toolName).toBe("test_tool");
      expect(result[0].arguments.complex_array).toHaveLength(2);
      expect(result[0].arguments.complex_array[0]).toEqual({
        name: "Item 1",
        value: "100",
      });
      expect(result[0].arguments.complex_array[1]).toEqual({
        name: "Item 2",
        value: "200",
      });
    });

    it("should parse multiple tool requests", () => {
      const xml = `First request:
<use_mcp_tool>
<server_name>server1</server_name>
<tool_name>tool1</tool_name>
<arguments>
<param>value</param>
</arguments>
</use_mcp_tool>

Second request:
<use_mcp_tool>
<server_name>server2</server_name>
<tool_name>tool2</tool_name>
<arguments>
<array_param>
  <item>item1</item>
  <item>item2</item>
</array_param>
</arguments>
</use_mcp_tool>`;

      const result = parser.parseToolRequests(xml);

      expect(result).toHaveLength(2);

      expect(result[0].serverName).toBe("server1");
      expect(result[0].toolName).toBe("tool1");
      expect(result[0].arguments).toEqual({
        param: "value",
      });

      expect(result[1].serverName).toBe("server2");
      expect(result[1].toolName).toBe("tool2");
      expect(result[1].arguments).toEqual({
        array_param: ["item1", "item2"],
      });
    });
  });
});
