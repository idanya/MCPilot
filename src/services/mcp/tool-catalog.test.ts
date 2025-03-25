/**
 * Tests for Tool Catalog
 */

import "@jest/globals";
import { ToolCatalogBuilder } from "./tool-catalog";
import { McpTool } from "./types";

describe("ToolCatalogBuilder", () => {
  let catalogBuilder: ToolCatalogBuilder;

  beforeEach(() => {
    catalogBuilder = new ToolCatalogBuilder();
  });

  describe("buildExampleXml", () => {
    it("should correctly format array items with object values", () => {
      // Create a tool with an example that has an array of objects
      const tool: McpTool = {
        name: "test_tool",
        description: "Test tool with array of objects",
        inputSchema: {
          type: "object",
          properties: {
            complex_array: {
              type: "array",
              description: "Array of complex items",
            },
          },
        },
        examples: [
          {
            description: "Example with array of objects",
            input: {
              complex_array: [
                { name: "Item 1", value: 100 },
                { name: "Item 2", value: 200 },
              ],
            },
            output: {},
          },
        ],
      };

      // Register the tool
      catalogBuilder.registerServerTools("test-server", [tool]);

      // Get the tool documentation
      const documentation = catalogBuilder.getToolDocumentation("test_tool");
      expect(documentation).toBeDefined();

      // Check that the example XML contains properly formatted array items
      const example = documentation!.examples[0];

      // The example should contain properly nested XML for the array items
      expect(example).toContain("<complex_array>");
      expect(example).toContain("<item>");
      expect(example).toContain("<name>Item 1</name>");
      expect(example).toContain("<value>100</value>");
      expect(example).toContain("<name>Item 2</name>");
      expect(example).toContain("<value>200</value>");

      // Verify the structure matches what the XML parser expects
      const expectedStructure = `<complex_array>
  <item>
    <name>Item 1</name>
    <value>100</value>
  </item>
  <item>
    <name>Item 2</name>
    <value>200</value>
  </item>
</complex_array>`;

      expect(example).toContain(expectedStructure);
    });
  });

  describe("buildDefaultExample", () => {
    it("should correctly format default examples for array of objects", () => {
      // Create a tool with a schema that has an array of objects but no examples
      const tool: McpTool = {
        name: "test_tool_no_examples",
        description: "Test tool with array of objects schema but no examples",
        inputSchema: {
          type: "object",
          properties: {
            complex_array: {
              type: "array",
              description: "Array of complex items",
            },
          },
        },
      };

      // Register the tool
      catalogBuilder.registerServerTools("test-server", [tool]);

      // Get the tool documentation
      const documentation = catalogBuilder.getToolDocumentation(
        "test_tool_no_examples",
      );
      expect(documentation).toBeDefined();

      // Check that the default example XML contains properly formatted array items
      const example = documentation!.examples[0];

      // The example should contain properly nested XML for the array items
      expect(example).toContain("<complex_array>");

      // Since we don't have specific object structure in the schema,
      // we just check that it contains an item tag
      expect(example).toContain("<item>");
    });
  });
});
