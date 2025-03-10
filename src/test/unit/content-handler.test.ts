import { ContentHandler } from '../../services/formatter/content-handler';

describe('ContentHandler', () => {
  let handler: ContentHandler;

  beforeEach(() => {
    handler = new ContentHandler();
  });

  describe('detectContentType', () => {
    it('should detect text content', () => {
      expect(handler.detectContentType('test string')).toBe('text');
      expect(handler.detectContentType(123)).toBe('text');
      expect(handler.detectContentType(true)).toBe('text');
    });

    it('should detect binary content', () => {
      const buffer = Buffer.from('test binary');
      expect(handler.detectContentType(buffer)).toBe('binary');
    });

    it('should detect JSON content', () => {
      expect(handler.detectContentType({ key: 'value' })).toBe('json');
      expect(handler.detectContentType([])).toBe('json');
    });

    it('should handle null and undefined', () => {
      expect(handler.detectContentType(null)).toBe('unknown');
      expect(handler.detectContentType(undefined)).toBe('unknown');
    });
  });

  describe('process', () => {
    it('should process text content', async () => {
      const result = await handler.process('test string');
      expect(result).toBe('test string');
    });

    it('should process number as text', async () => {
      const result = await handler.process(123);
      expect(result).toBe('123');
    });

    it('should process boolean as text', async () => {
      const result = await handler.process(true);
      expect(result).toBe('true');
    });

    it('should process JSON content', async () => {
      const data = { key: 'value', nested: { test: true } };
      const result = await handler.process(data);
      expect(result).toBe(JSON.stringify(data));
    });

    it('should process binary content', async () => {
      const buffer = Buffer.from('test binary');
      const result = await handler.process(buffer);
      expect(result).toBe(buffer.toString('base64'));
    });

    it('should handle null and undefined', async () => {
      expect(await handler.process(null)).toBeNull();
      expect(await handler.process(undefined)).toBeUndefined();
    });

    it('should handle empty objects', async () => {
      const result = await handler.process({});
      expect(result).toBe('{}');
    });

    it('should throw error for invalid JSON', async () => {
      const circular: any = { };
      circular.self = circular;

      await expect(handler.process(circular)).rejects.toThrow('Failed to transform JSON content');
    });
  });

  describe('custom transformers', () => {
    it('should allow registering custom transformers', async () => {
      const customTransformer = {
        supports: (content: any) => typeof content === 'number',
        transform: async (content: number) => `Number: ${content}`
      };

      handler.registerTransformer(customTransformer);
      const result = await handler.process(42);
      expect(result).toBe('Number: 42');
    });

    it('should prioritize custom transformers over default ones', async () => {
      const customTransformer = {
        supports: (content: any) => typeof content === 'string',
        transform: async (content: string) => content.toUpperCase()
      };

      handler.registerTransformer(customTransformer);
      const result = await handler.process('test');
      expect(result).toBe('TEST');
    });
  });
});