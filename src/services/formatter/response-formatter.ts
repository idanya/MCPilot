import { ContentHandler } from "./content-handler";
import { ErrorFormatter } from "./error-formatter";

export interface ResponseMetadata {
  timestamp: string;
  traceId?: string;
  contextId?: string;
  contentType: string;
  encoding?: string;
  size?: number;
}

export interface FormattedResponse<T = unknown> {
  data: T;
  metadata: ResponseMetadata;
  error?: {
    message: string;
    code: string;
    details?: any;
    stack?: string;
  };
}

export class ResponseFormatter {
  private contentHandler: ContentHandler;
  private errorFormatter: ErrorFormatter;

  constructor() {
    this.contentHandler = new ContentHandler();
    this.errorFormatter = new ErrorFormatter();
  }

  public async format<T>(
    content: T,
    context?: { traceId?: string; contextId?: string }
  ): Promise<FormattedResponse<string | T>> {
    const metadata = this.createMetadata(content, context);

    try {
      if (typeof content === "string") {
        return {
          data: content,
          metadata,
        };
      }

      const processedContent = await this.contentHandler.process(content);
      return {
        data: processedContent,
        metadata,
      };
    } catch (error) {
      return {
        data: content as any,
        metadata,
        error: this.errorFormatter.format(error),
      };
    }
  }

  public async formatError(
    error: Error,
    context?: { traceId?: string; contextId?: string }
  ): Promise<FormattedResponse<null>> {
    const metadata = this.createMetadata(null, context);
    return {
      data: null,
      metadata,
      error: this.errorFormatter.format(error),
    };
  }

  private createMetadata(
    content: any,
    context?: { traceId?: string; contextId?: string }
  ): ResponseMetadata {
    return {
      timestamp: new Date().toISOString(),
      traceId: context?.traceId,
      contextId: context?.contextId,
      contentType: this.contentHandler.detectContentType(content),
      size: this.calculateSize(content),
      encoding: "utf-8",
    };
  }

  private calculateSize(content: any): number {
    if (content === null || content === undefined) {
      return 0;
    }

    if (typeof content === "string") {
      return new TextEncoder().encode(content).length;
    }

    if (Buffer.isBuffer(content)) {
      return content.length;
    }

    if (typeof content === "object") {
      return new TextEncoder().encode(JSON.stringify(content)).length;
    }

    return new TextEncoder().encode(String(content)).length;
  }
}
