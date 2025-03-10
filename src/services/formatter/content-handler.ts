export type ContentType = 'text' | 'json' | 'binary' | 'unknown';

export interface ContentTransformer {
  transform(content: any): Promise<any>;
  supports(content: any): boolean;
}

export class ContentHandler {
  private transformers: ContentTransformer[] = [];

  constructor() {
    // Register default transformers
    this.registerTransformer(new JsonTransformer());
    this.registerTransformer(new BinaryTransformer());
    this.registerTransformer(new TextTransformer());
  }

  public registerTransformer(transformer: ContentTransformer): void {
    this.transformers.push(transformer);
  }

  public async process(content: any): Promise<any> {
    if (content === null || content === undefined) {
      return content;
    }

    const transformer = this.transformers.find(t => t.supports(content));
    if (transformer) {
      return await transformer.transform(content);
    }

    return content;
  }

  public detectContentType(content: any): ContentType {
    if (content === null || content === undefined) {
      return 'unknown';
    }

    if (Buffer.isBuffer(content)) {
      return 'binary';
    }

    if (typeof content === 'object') {
      return 'json';
    }

    return 'text';
  }
}

class JsonTransformer implements ContentTransformer {
  supports(content: any): boolean {
    return typeof content === 'object' && !Buffer.isBuffer(content);
  }

  async transform(content: any): Promise<string> {
    try {
      return JSON.stringify(content);
    } catch (error: unknown) {
      if (error instanceof Error) {
        throw new Error(`Failed to transform JSON content: ${error.message}`);
      }
      throw new Error('Failed to transform JSON content: Unknown error');
    }
  }
}

class BinaryTransformer implements ContentTransformer {
  supports(content: any): boolean {
    return Buffer.isBuffer(content);
  }

  async transform(content: Buffer): Promise<string> {
    try {
      return content.toString('base64');
    } catch (error: unknown) {
      if (error instanceof Error) {
        throw new Error(`Failed to transform binary content: ${error.message}`);
      }
      throw new Error('Failed to transform binary content: Unknown error');
    }
  }
}

class TextTransformer implements ContentTransformer {
  supports(content: any): boolean {
    return typeof content === 'string' || 
           typeof content === 'number' || 
           typeof content === 'boolean';
  }

  async transform(content: any): Promise<string> {
    try {
      return String(content);
    } catch (error: unknown) {
      if (error instanceof Error) {
        throw new Error(`Failed to transform text content: ${error.message}`);
      }
      throw new Error('Failed to transform text content: Unknown error');
    }
  }
}