import { ErrorFormatter } from '../../services/formatter/error-formatter';

describe('ErrorFormatter', () => {
  let formatter: ErrorFormatter;

  beforeEach(() => {
    formatter = new ErrorFormatter();
  });

  describe('format', () => {
    it('should format basic Error correctly', () => {
      const error = new Error('Test error');
      const result = formatter.format(error);

      expect(result.message).toBe('Test error');
      expect(result.code).toBe('INTERNAL_ERROR');
      expect(result.stack).toBeDefined();
      expect(result.details).toBeUndefined();
    });

    it('should format TypeError correctly', () => {
      const error = new TypeError('Type error test');
      const result = formatter.format(error);

      expect(result.message).toBe('Type error test');
      expect(result.code).toBe('TYPE_ERROR');
      expect(result.stack).toBeDefined();
    });

    it('should format ReferenceError correctly', () => {
      const error = new ReferenceError('Reference error test');
      const result = formatter.format(error);

      expect(result.message).toBe('Reference error test');
      expect(result.code).toBe('REFERENCE_ERROR');
      expect(result.stack).toBeDefined();
    });

    it('should format SyntaxError correctly', () => {
      const error = new SyntaxError('Syntax error test');
      const result = formatter.format(error);

      expect(result.message).toBe('Syntax error test');
      expect(result.code).toBe('SYNTAX_ERROR');
      expect(result.stack).toBeDefined();
    });

    it('should handle error with custom code', () => {
      const error = new Error('Custom error');
      (error as any).code = 'CUSTOM_ERROR';
      const result = formatter.format(error);

      expect(result.message).toBe('Custom error');
      expect(result.code).toBe('CUSTOM_ERROR');
    });

    it('should handle error with additional properties', () => {
      const error = new Error('Error with details');
      (error as any).statusCode = 404;
      (error as any).context = { user: 'test' };
      
      const result = formatter.format(error);

      expect(result.details).toBeDefined();
      expect(result.details).toEqual({
        statusCode: 404,
        context: { user: 'test' }
      });
    });

    it('should handle non-Error objects', () => {
      const obj = { message: 'Custom error object', status: 500 };
      const result = formatter.format(obj);

      expect(result.message).toBe('Custom error object');
      expect(result.code).toBe('UNKNOWN_ERROR');
      expect(result.details).toEqual({ status: 500 });
    });

    it('should handle null input', () => {
      const result = formatter.format(null);

      expect(result.message).toBe('Null error received');
      expect(result.code).toBe('UNKNOWN_ERROR');
    });

    it('should handle undefined input', () => {
      const result = formatter.format(undefined);

      expect(result.message).toBe('Undefined error received');
      expect(result.code).toBe('UNKNOWN_ERROR');
    });

    it('should handle string input', () => {
      const result = formatter.format('Error string');

      expect(result.message).toBe('Error string');
      expect(result.code).toBe('UNKNOWN_ERROR');
    });

    it('should format stack trace correctly', () => {
      const error = new Error('Stack test');
      const result = formatter.format(error);

      expect(result.stack).toBeDefined();
      expect(result.stack).not.toContain('Stack test');
      expect(result.stack).toContain('at ');
    });
  });
});