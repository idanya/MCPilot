interface ErrorDetails {
  message: string;
  code: string;
  details?: any;
  stack?: string;
}

export class ErrorFormatter {
  public format(error: unknown): ErrorDetails {
    if (error instanceof Error) {
      return this.formatError(error);
    }

    // Handle non-Error objects
    return {
      message: this.getErrorMessage(error),
      code: 'UNKNOWN_ERROR',
      details: this.getErrorDetails(error),
    };
  }

  private formatError(error: Error): ErrorDetails {
    return {
      message: error.message || 'An unknown error occurred',
      code: this.detectErrorCode(error),
      stack: this.formatStackTrace(error),
      details: this.extractErrorDetails(error),
    };
  }

  private detectErrorCode(error: Error): string {
    // Check for common error types
    if (error instanceof TypeError) return 'TYPE_ERROR';
    if (error instanceof ReferenceError) return 'REFERENCE_ERROR';
    if (error instanceof SyntaxError) return 'SYNTAX_ERROR';
    if ('code' in error && typeof (error as any).code === 'string') {
      return (error as any).code;
    }

    // Default error code
    return 'INTERNAL_ERROR';
  }

  private formatStackTrace(error: Error): string | undefined {
    if (!error.stack) return undefined;

    // Remove the first line if it contains the error message
    const stackLines = error.stack.split('\n');
    if (stackLines[0].includes(error.message)) {
      stackLines.shift();
    }

    // Clean and format the stack trace
    return stackLines
      .map(line => line.trim())
      .filter(line => line.startsWith('at '))
      .join('\n');
  }

  private extractErrorDetails(error: Error): any {
    const details: Record<string, any> = {};

    // Extract additional properties from the error object
    Object.getOwnPropertyNames(error).forEach(prop => {
      if (prop !== 'message' && prop !== 'stack' && prop !== 'name') {
        details[prop] = (error as any)[prop];
      }
    });

    return Object.keys(details).length > 0 ? details : undefined;
  }

  private getErrorMessage(error: unknown): string {
    if (error === null) return 'Null error received';
    if (error === undefined) return 'Undefined error received';
    if (typeof error === 'string') return error;
    if (typeof error === 'object') {
      if ('message' in error && typeof (error as any).message === 'string') {
        return (error as any).message;
      }
      return JSON.stringify(error);
    }
    return String(error);
  }

  private getErrorDetails(error: unknown): any {
    if (error === null || error === undefined) return undefined;
    if (typeof error === 'object') {
      const details: Record<string, any> = {};
      Object.entries(error as object).forEach(([key, value]) => {
        if (key !== 'message' && key !== 'stack') {
          details[key] = value;
        }
      });
      return Object.keys(details).length > 0 ? details : undefined;
    }
    return undefined;
  }
}
