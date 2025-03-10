import { ResponseFormatter } from "../../services/formatter/response-formatter";

describe("ResponseFormatter", () => {
  let formatter: ResponseFormatter;

  beforeEach(() => {
    formatter = new ResponseFormatter();
  });

  describe("format", () => {
    it("should format text content correctly", async () => {
      const content = "test content";
      const result = await formatter.format(content);

      expect(result.data).toBe(content);
      expect(result.metadata.contentType).toBe("text");
      expect(result.metadata.timestamp).toBeDefined();
      expect(result.error).toBeUndefined();
    });

    it("should format JSON content correctly", async () => {
      const content = { key: "value" };
      const result = await formatter.format(content);

      expect(result.data).toEqual(content);
      expect(result.metadata.contentType).toBe("json");
      expect(result.error).toBeUndefined();
    });

    it("should format binary content correctly", async () => {
      const content = Buffer.from("test binary content");
      const result = await formatter.format(content);

      expect(Buffer.isBuffer(result.data)).toBe(true);
      expect(result.data.toString()).toBe("test binary content");
      expect(result.metadata.contentType).toBe("binary");
      expect(result.error).toBeUndefined();
    });

    it("should include context in metadata when provided", async () => {
      const content = "test";
      const context = {
        traceId: "trace-123",
        contextId: "context-456",
      };

      const result = await formatter.format(content, context);

      expect(result.metadata.traceId).toBe(context.traceId);
      expect(result.metadata.contextId).toBe(context.contextId);
    });

    it("should handle null content", async () => {
      const result = await formatter.format(null);

      expect(result.data).toBeNull();
      expect(result.metadata.contentType).toBe("unknown");
      expect(result.error).toBeUndefined();
    });
  });

  describe("formatError", () => {
    it("should format error correctly", async () => {
      const error = new Error("Test error");
      const result = await formatter.formatError(error);

      expect(result.data).toBeNull();
      expect(result.error).toBeDefined();
      expect(result.error?.message).toBe("Test error");
      expect(result.error?.code).toBe("INTERNAL_ERROR");
      expect(result.error?.stack).toBeDefined();
    });

    it("should include context in error response metadata", async () => {
      const error = new Error("Test error");
      const context = {
        traceId: "trace-123",
        contextId: "context-456",
      };

      const result = await formatter.formatError(error, context);

      expect(result.metadata.traceId).toBe(context.traceId);
      expect(result.metadata.contextId).toBe(context.contextId);
    });

    it("should format TypeError with correct error code", async () => {
      const error = new TypeError("Type error test");
      const result = await formatter.formatError(error);

      expect(result.error?.code).toBe("TYPE_ERROR");
    });
  });
});
